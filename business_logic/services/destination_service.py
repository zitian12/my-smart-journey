"""Public destination query service with Gemini descriptions + Places photos."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from config import GEMINI_API_KEY, GEMINI_MODEL
from integration.external_api import GeminiClient, GooglePlacesClient
from integration.repositories import (
    DestinationCategoryRepository,
    DestinationRepository,
)
from services.destination_image_service import DestinationImageService
from services.destination_place_id_resolve import find_sibling

logger = logging.getLogger(__name__)


class DestinationService:
    """Read-side destination and category queries for the public API."""

    def __init__(
        self,
        destination_repository: DestinationRepository | None = None,
        category_repository: DestinationCategoryRepository | None = None,
        places_client: GooglePlacesClient | None = None,
        gemini_client: GeminiClient | None = None,
    ) -> None:
        self._destinations = destination_repository or DestinationRepository()
        self._categories = category_repository or DestinationCategoryRepository()
        self._places = places_client or GooglePlacesClient()
        self._gemini = gemini_client
        if self._gemini is None and GEMINI_API_KEY:
            try:
                self._gemini = GeminiClient(api_key=GEMINI_API_KEY, model=GEMINI_MODEL)
            except Exception:
                logger.exception("Failed to init GeminiClient")
                self._gemini = None

    async def list_categories(self) -> list[dict]:
        """Return active destination categories."""
        return await self._categories.list_active()

    async def list_destinations(
        self,
        *,
        name: str | None = None,
        state: str | None = None,
        category: str | None = None,
        page: int = 1,
        page_size: int = 28,
    ) -> dict:
        """Return one page of destinations: featured first, then photos, then name."""
        page = max(1, int(page))
        page_size = max(1, min(100, int(page_size)))
        category_id = None
        category_lookup = await self._category_lookup()

        if category:
            matched = category_lookup.get(category.lower()) or category_lookup.get(
                category
            )
            if matched is None:
                by_id = await self._categories.get_by_id(category)
                if by_id is None:
                    return {
                        "items": [],
                        "total": 0,
                        "page": page,
                        "page_size": page_size,
                    }
                category_id = by_id["id"]
            else:
                category_id = matched["id"]

        total = await self._destinations.count_destinations(
            name=name,
            state=state,
            category_id=category_id,
        )
        skip = (page - 1) * page_size
        destinations = await self._destinations.list_destinations(
            name=name,
            state=state,
            category_id=category_id,
            skip=skip,
            limit=page_size,
            explore_order=True,
        )
        items = [self._enrich(dest, category_lookup) for dest in destinations]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def list_states(self) -> list[str]:
        """Return distinct active destination states for filters."""
        return await self._destinations.list_distinct_states()

    async def get_destination(self, destination_id: str) -> dict | None:
        """Return a destination; fill Gemini description and Places photo if needed."""
        return await self.enrich_destination_public(destination_id)

    async def enrich_destination_public(self, destination_id: str) -> dict | None:
        """Enrich then attach category fields for API responses."""
        destination = await self.enrich_destination(destination_id)
        if destination is None:
            return None
        category_lookup = await self._category_lookup()
        return self._enrich(destination, category_lookup)

    async def enrich_destination(self, destination_id: str) -> dict | None:
        """Load destination; Gemini description on empty + Places photo when missing."""
        destination = await self._destinations.get_by_id(destination_id)
        if destination is None or not destination.get("is_active", True):
            return None
        destination = await self.ensure_description(destination)
        return await self._maybe_enrich_places_photo(destination)

    async def ensure_description(self, destination: dict) -> dict:
        """Fill missing description with Gemini only (detail-page on-demand)."""
        has_body = not DestinationImageService.is_template_description(
            destination.get("description")
        )
        if has_body:
            return destination
        return await self.ensure_gemini_description(destination)

    async def ensure_gemini_description(
        self,
        destination: dict,
        *,
        force: bool = False,
    ) -> dict:
        """Generate and cache a Gemini description when missing or forced."""
        source = str(destination.get("description_source") or "").strip().lower()
        has_body = not DestinationImageService.is_template_description(
            destination.get("description")
        )
        if not force and source == "gemini" and has_body:
            return destination
        if not force and has_body:
            # Do not overwrite existing Wikipedia/legacy text unless forced.
            return destination

        normalized = destination.get("name_normalized") or ""
        if not normalized or self._gemini is None:
            return destination
        if GeminiClient.is_rate_limited():
            logger.warning(
                "Skip Gemini description — rate limited name=%s",
                destination.get("destination_name"),
            )
            return destination

        category_lookup = await self._category_lookup()
        category = category_lookup.get(destination.get("category_id") or "")
        category_slug = category["slug"] if category else ""

        try:
            description = await asyncio.to_thread(
                self._gemini.generate_place_description,
                name=str(destination.get("destination_name") or ""),
                state=str(destination.get("state") or ""),
                category_slug=category_slug,
            )
        except Exception:
            logger.exception(
                "Gemini description failed for %s",
                destination.get("destination_name"),
            )
            return destination

        description = (description or "").strip()
        if not description:
            return destination

        await self._destinations.update_media_fields(
            name_normalized=normalized,
            description=description,
            description_source="gemini",
        )
        refreshed = await self._destinations.get_by_id(destination["id"])
        logger.info(
            "Cached Gemini description for %s",
            destination.get("destination_name"),
        )
        return refreshed or destination

    async def _maybe_enrich_places_photo(self, destination: dict) -> dict:
        """Fetch Places photo only — never Places editorialSummary."""
        need_images = DestinationImageService.is_fallback_images(
            destination.get("images")
        )
        if not need_images:
            return destination
        if destination.get("media_enriched_at"):
            logger.info(
                "Skip Places photo (already attempted) name=%s",
                destination.get("destination_name"),
            )
            return destination

        destination = await self._ensure_place_id_or_copy_media(destination)
        need_images = DestinationImageService.is_fallback_images(
            destination.get("images")
        )
        if not need_images:
            return destination
        if destination.get("media_enriched_at"):
            return destination

        place_id = str(destination.get("place_id") or "").strip()
        if not place_id or not self._places.available:
            return destination

        normalized = destination.get("name_normalized") or ""
        if not normalized:
            return destination

        enrichment = await asyncio.to_thread(
            self._places.get_place_enrichment,
            place_id,
            include_summary=False,
        )
        image_url = enrichment.get("image_url")
        photo_name = enrichment.get("photo_name")
        new_images = [str(image_url)] if image_url else None

        await self._destinations.update_media_fields(
            name_normalized=normalized,
            images=new_images,
            photo_name=str(photo_name) if photo_name and new_images else None,
            mark_media_enriched=True,
            media_enriched_at=datetime.now(timezone.utc),
        )
        refreshed = await self._destinations.get_by_id(destination["id"])
        logger.info(
            "Cached Places photo for %s — image=%s",
            destination.get("destination_name"),
            bool(new_images),
        )
        return refreshed or destination

    async def _ensure_place_id_or_copy_media(self, destination: dict) -> dict:
        """Resolve missing place_id via local sibling, else one Text Search."""
        place_id = str(destination.get("place_id") or "").strip()
        if place_id:
            return destination

        normalized = destination.get("name_normalized") or ""
        if not normalized:
            return destination

        catalog = await self._destinations.list_destinations(
            active_only=True,
            limit=2000,
        )
        sibling = find_sibling(destination, catalog)
        if sibling is not None:
            copied = await self._copy_media_from_sibling(destination, sibling)
            if copied is not None:
                return copied
            sibling_pid = str(sibling.get("place_id") or "").strip()
            if sibling_pid:
                patched = dict(destination)
                patched["place_id"] = sibling_pid
                return patched

        if not self._places.available:
            await self._destinations.update_media_fields(
                name_normalized=normalized,
                mark_media_enriched=True,
            )
            refreshed = await self._destinations.get_by_id(destination["id"])
            return refreshed or destination

        name = str(destination.get("destination_name") or "").strip()
        state = str(destination.get("state") or "").strip()
        query = ", ".join(part for part in (name, state, "Malaysia") if part)
        found_id = await asyncio.to_thread(
            self._places.find_place_id,
            text_query=query,
        )
        if not found_id:
            logger.info("Text Search found no place_id for %s", name)
            await self._destinations.update_media_fields(
                name_normalized=normalized,
                mark_media_enriched=True,
            )
            refreshed = await self._destinations.get_by_id(destination["id"])
            return refreshed or destination

        owner = await self._destinations.get_by_place_id(found_id)
        if owner is not None and str(owner.get("id")) != str(destination.get("id")):
            copied = await self._copy_media_from_sibling(destination, owner)
            if copied is not None:
                return copied
            patched = dict(destination)
            patched["place_id"] = found_id
            return patched

        try:
            await self._destinations.update_media_fields(
                name_normalized=normalized,
                place_id=found_id,
            )
        except DuplicateKeyError:
            owner = await self._destinations.get_by_place_id(found_id)
            if owner is not None:
                copied = await self._copy_media_from_sibling(destination, owner)
                if copied is not None:
                    return copied
                patched = dict(destination)
                patched["place_id"] = found_id
                return patched
            await self._destinations.update_media_fields(
                name_normalized=normalized,
                mark_media_enriched=True,
            )
            refreshed = await self._destinations.get_by_id(destination["id"])
            return refreshed or destination

        refreshed = await self._destinations.get_by_id(destination["id"])
        logger.info("Resolved place_id via Text Search for %s", name)
        return refreshed or destination

    async def _copy_media_from_sibling(
        self,
        destination: dict,
        sibling: dict,
    ) -> dict | None:
        """Copy Places photos only (descriptions come from Gemini)."""
        normalized = destination.get("name_normalized") or ""
        if not normalized:
            return None

        sibling_images = DestinationImageService.real_images(sibling.get("images"))
        need_images = DestinationImageService.is_fallback_images(
            destination.get("images")
        )
        if not need_images or not sibling_images:
            return None

        photo_name = (
            str(sibling.get("photo_name")) if sibling.get("photo_name") else None
        )
        await self._destinations.update_media_fields(
            name_normalized=normalized,
            images=sibling_images,
            photo_name=photo_name,
            mark_media_enriched=True,
            media_enriched_at=datetime.now(timezone.utc),
        )
        refreshed = await self._destinations.get_by_id(destination["id"])
        logger.info(
            "Copied photo from sibling %s -> %s images=%s",
            sibling.get("destination_name"),
            destination.get("destination_name"),
            len(sibling_images),
        )
        return refreshed or destination

    async def _category_lookup(self) -> dict[str, dict]:
        categories = await self._categories.list_active()
        lookup: dict[str, dict] = {}
        for category in categories:
            lookup[category["id"]] = category
            lookup[category["slug"]] = category
            lookup[category["slug"].lower()] = category
        return lookup

    @staticmethod
    def _enrich(destination: dict, category_lookup: dict[str, dict]) -> dict:
        category = category_lookup.get(destination.get("category_id") or "")
        enriched = dict(destination)
        enriched["category_name"] = category["name"] if category else None
        enriched["category_slug"] = category["slug"] if category else None
        enriched["is_featured"] = bool(destination.get("is_featured", False))
        enriched["images"] = DestinationImageService.real_images(
            destination.get("images")
        )
        if DestinationImageService.is_template_description(
            enriched.get("description")
        ):
            enriched["description"] = ""
        return enriched
