"""One-shot Google Places catalog sync for Malaysia destinations.

Never called from itinerary generate — admin/seed only.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from pymongo.errors import DuplicateKeyError

from database.models import Destination, DestinationCategory
from integration.external_api import GooglePlacesClient
from integration.repositories import (
    DestinationCategoryRepository,
    DestinationRepository,
)
from services.destination_ai_service import (
    DEFAULT_CATEGORIES,
    MALAYSIA_STATES,
    _in_malaysia,
    normalize_destination_name,
)
from services.destination_image_service import DestinationImageService
from services.malaysia_state import infer_malaysia_state

logger = logging.getLogger(__name__)

# Pro Text/Nearby Search: one request per (region, type). No pagination.
PLACE_TYPES: list[tuple[str, str]] = [
    ("tourist_attraction", "culture"),
    ("park", "nature"),
    ("museum", "heritage"),
    ("shopping_mall", "shopping"),
]

TYPE_LABELS: dict[str, str] = {
    "tourist_attraction": "tourist attractions",
    "park": "parks",
    "museum": "museums",
    "shopping_mall": "shopping malls",
}

# Extra hubs Text Search on the state capital would miss.
TOURISM_HUBS: list[dict[str, Any]] = [
    {
        "name": "Langkawi",
        "state": "Kedah",
        "latitude": 6.3566,
        "longitude": 99.7783,
        "radius_m": 25000.0,
    },
    {
        "name": "Cameron Highlands",
        "state": "Pahang",
        "latitude": 4.4721,
        "longitude": 101.3801,
        "radius_m": 20000.0,
    },
    {
        "name": "Genting Highlands",
        "state": "Pahang",
        "latitude": 3.4236,
        "longitude": 101.7931,
        "radius_m": 15000.0,
    },
    {
        "name": "Tioman",
        "state": "Pahang",
        "latitude": 2.7906,
        "longitude": 104.1698,
        "radius_m": 20000.0,
    },
    {
        "name": "Tawau",
        "state": "Sabah",
        "latitude": 4.2444,
        "longitude": 117.8912,
        "radius_m": 30000.0,
    },
    {
        "name": "Sandakan",
        "state": "Sabah",
        "latitude": 5.8402,
        "longitude": 118.1179,
        "radius_m": 25000.0,
    },
    {
        "name": "Miri",
        "state": "Sarawak",
        "latitude": 4.3995,
        "longitude": 113.9914,
        "radius_m": 25000.0,
    },
    {
        "name": "Sibu",
        "state": "Sarawak",
        "latitude": 2.2873,
        "longitude": 111.8300,
        "radius_m": 20000.0,
    },
]

_REQUEST_PAUSE_S = 0.12


class DestinationPlacesService:
    """Pull Places once into MongoDB; itinerary selection reads the catalog."""

    def __init__(
        self,
        category_repository: DestinationCategoryRepository | None = None,
        destination_repository: DestinationRepository | None = None,
        places_client: GooglePlacesClient | None = None,
        image_service: DestinationImageService | None = None,
    ) -> None:
        self._categories = category_repository or DestinationCategoryRepository()
        self._destinations = destination_repository or DestinationRepository()
        self._places = places_client or GooglePlacesClient()
        self._images = image_service or DestinationImageService()

    async def sync_from_places(self, *, fetch_images: bool = True) -> dict[str, int]:
        """Search Malaysia by state/hub/type and upsert destinations."""
        if not self._places.available:
            raise ValueError(
                "GOOGLE_MAPS_API_KEY is required and Places API (New) "
                "must be enabled on the Google Cloud project"
            )

        slug_to_category = await self._ensure_categories()
        default_category_id = slug_to_category["culture"]["id"]

        seen_place_ids: set[str] = set()
        seen_names: set[str] = set()
        upserted = 0
        skipped = 0

        for state in MALAYSIA_STATES:
            for included_type, category_slug in PLACE_TYPES:
                label = TYPE_LABELS[included_type]
                query = f"{label} in {state}, Malaysia"
                places = await asyncio.to_thread(
                    self._places.text_search,
                    text_query=query,
                    included_type=included_type,
                )
                category_id = slug_to_category.get(category_slug, {}).get(
                    "id",
                    default_category_id,
                )
                written, ignored = await self._upsert_batch(
                    places,
                    state=state,
                    category_id=category_id,
                    seen_place_ids=seen_place_ids,
                    seen_names=seen_names,
                    fetch_images=fetch_images,
                )
                upserted += written
                skipped += ignored
                await asyncio.sleep(_REQUEST_PAUSE_S)

        for hub in TOURISM_HUBS:
            for included_type, category_slug in PLACE_TYPES:
                places = await asyncio.to_thread(
                    self._places.nearby_search,
                    latitude=float(hub["latitude"]),
                    longitude=float(hub["longitude"]),
                    included_type=included_type,
                    radius_m=float(hub["radius_m"]),
                )
                category_id = slug_to_category.get(category_slug, {}).get(
                    "id",
                    default_category_id,
                )
                written, ignored = await self._upsert_batch(
                    places,
                    state=str(hub["state"]),
                    category_id=category_id,
                    seen_place_ids=seen_place_ids,
                    seen_names=seen_names,
                    fetch_images=fetch_images,
                )
                upserted += written
                skipped += ignored
                await asyncio.sleep(_REQUEST_PAUSE_S)

        if upserted == 0:
            logger.warning(
                "Places sync wrote 0 destinations after %s requests — "
                "enable Places API (New) on the Google Cloud project",
                self._places.request_count,
            )
        logger.info(
            "Places catalog sync complete — requests=%s upserted=%s skipped=%s",
            self._places.request_count,
            upserted,
            skipped,
        )
        return {
            "places_requests": self._places.request_count,
            "destinations_upserted": upserted,
            "destinations_skipped": skipped,
        }

    async def _ensure_categories(self) -> dict[str, dict]:
        ensured: list[dict] = []
        for item in DEFAULT_CATEGORIES:
            category = DestinationCategory(
                name=item["name"],
                slug=item["slug"],
                description=item["description"],
            )
            ensured.append(await self._categories.ensure_category(category))
        return {cat["slug"]: cat for cat in ensured}

    async def _upsert_batch(
        self,
        places: list[dict[str, Any]],
        *,
        state: str,
        category_id: str,
        seen_place_ids: set[str],
        seen_names: set[str],
        fetch_images: bool,
    ) -> tuple[int, int]:
        written = 0
        skipped = 0
        now = datetime.now(timezone.utc)
        for place in places:
            place_id = str(place.get("place_id") or "").strip()
            name = str(place.get("destination_name") or "").strip()
            latitude = place.get("latitude")
            longitude = place.get("longitude")
            if not name or not _in_malaysia(latitude, longitude):
                skipped += 1
                continue
            if place_id and place_id in seen_place_ids:
                skipped += 1
                continue
            normalized = normalize_destination_name(name)
            if not normalized or normalized in seen_names:
                skipped += 1
                continue

            existing = None
            if place_id:
                existing = await self._destinations.get_by_place_id(place_id)
            if existing is None:
                existing = await self._destinations.get_by_normalized_name(
                    normalized
                )

            if existing:
                normalized = (
                    existing.get("name_normalized") or normalized
                )
                name = existing.get("destination_name") or name
                description = existing.get("description") or ""
                images = list(existing.get("images") or [])
                operating_hours = existing.get("operating_hours") or ""
                category_id_use = existing.get("category_id") or category_id
                location = (
                    existing.get("location")
                    or place.get("location")
                    or ""
                )
                source = existing.get("source") or "places"
            else:
                description = ""
                images = []
                operating_hours = ""
                category_id_use = category_id
                location = place.get("location") or ""
                source = "places"

            need_description = DestinationImageService.is_template_description(
                description
            )
            # Descriptions come from Gemini on detail/backfill — not Wikipedia.
            images = DestinationImageService.real_images(images)
            if need_description:
                description = ""

            resolved_state = (
                infer_malaysia_state(location, latitude, longitude) or state
            )

            destination = Destination(
                destination_name=name,
                name_normalized=normalized,
                description=description,
                category_id=category_id_use,
                state=resolved_state,
                location=location,
                latitude=float(latitude),
                longitude=float(longitude),
                operating_hours=operating_hours,
                images=images,
                source=source,
                place_id=place_id or None,
                fetched_at=now,
                is_active=True,
            )
            try:
                await self._destinations.upsert_by_name(destination)
            except DuplicateKeyError:
                logger.warning("Duplicate place skipped name=%s", name)
                skipped += 1
                continue
            if place_id:
                seen_place_ids.add(place_id)
            seen_names.add(normalized)
            written += 1
        return written, skipped
