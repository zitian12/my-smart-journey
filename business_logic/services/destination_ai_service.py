"""AI workflow: fetch Malaysia destinations via Gemini and upsert into MongoDB.

AI model: Gemini (configured via GEMINI_MODEL, default gemini-3.5-flash-lite).
"""

from __future__ import annotations

import logging
import re

from config import GEMINI_API_KEY, GEMINI_MODEL
from database.models import Destination, DestinationCategory
from integration.external_api import GeminiClient, NominatimClient
from integration.repositories import (
    DestinationCategoryRepository,
    DestinationRepository,
)
from services.destination_image_service import (
    DestinationImageService,
)

logger = logging.getLogger(__name__)

DEFAULT_CATEGORIES: list[dict[str, str]] = [
    {
        "slug": "nature",
        "name": "Nature",
        "description": "Parks, islands, highlands, and outdoor landscapes.",
    },
    {
        "slug": "culture",
        "name": "Culture",
        "description": "Festivals, local life, arts, and cultural districts.",
    },
    {
        "slug": "heritage",
        "name": "Heritage",
        "description": "Historic towns, monuments, and UNESCO-linked sites.",
    },
    {
        "slug": "adventure",
        "name": "Adventure",
        "description": "Diving, hiking, theme parks, and adrenaline activities.",
    },
    {
        "slug": "shopping",
        "name": "Shopping",
        "description": "Markets, malls, and famous retail destinations.",
    },
]

# All Malaysian states + federal territories
MALAYSIA_STATES: list[str] = [
    "Johor",
    "Kedah",
    "Kelantan",
    "Melaka",
    "Negeri Sembilan",
    "Pahang",
    "Penang",
    "Perak",
    "Perlis",
    "Sabah",
    "Sarawak",
    "Selangor",
    "Terengganu",
    "Kuala Lumpur",
    "Labuan",
    "Putrajaya",
]

# Rough bounding box for Malaysia (peninsular + East Malaysia)
_MALAYSIA_LAT = (0.8, 7.6)
_MALAYSIA_LNG = (99.5, 119.4)


def normalize_destination_name(name: str) -> str:
    """Normalize a destination name for idempotent upserts."""
    cleaned = re.sub(r"\s+", " ", name.strip().lower())
    return cleaned


def _in_malaysia(latitude: float | None, longitude: float | None) -> bool:
    if latitude is None or longitude is None:
        return False
    return (
        _MALAYSIA_LAT[0] <= latitude <= _MALAYSIA_LAT[1]
        and _MALAYSIA_LNG[0] <= longitude <= _MALAYSIA_LNG[1]
    )


class DestinationAiService:
    """Orchestrates Gemini generation, geocoding, and destination persistence."""

    def __init__(
        self,
        category_repository: DestinationCategoryRepository | None = None,
        destination_repository: DestinationRepository | None = None,
        gemini_client: GeminiClient | None = None,
        nominatim_client: NominatimClient | None = None,
        image_service: DestinationImageService | None = None,
    ) -> None:
        self._categories = category_repository or DestinationCategoryRepository()
        self._destinations = destination_repository or DestinationRepository()
        self._gemini = gemini_client or GeminiClient(
            api_key=GEMINI_API_KEY,
            model=GEMINI_MODEL,
        )
        self._geocoder = nominatim_client or NominatimClient()
        self._images = image_service or DestinationImageService()

    async def ensure_default_categories(self) -> list[dict]:
        """Ensure the fixed Malaysia destination categories exist."""
        ensured: list[dict] = []
        for item in DEFAULT_CATEGORIES:
            category = DestinationCategory(
                name=item["name"],
                slug=item["slug"],
                description=item["description"],
            )
            ensured.append(await self._categories.ensure_category(category))
        return ensured

    async def sync_destinations(
        self,
        *,
        count_per_state: int = 6,
        deactivate_missing: bool = True,
    ) -> dict[str, int]:
        """Generate destinations for every Malaysian state and upsert them."""
        if count_per_state < 5:
            count_per_state = 5
        if count_per_state > 8:
            count_per_state = 8

        categories = await self.ensure_default_categories()
        slug_to_category = {cat["slug"]: cat for cat in categories}
        default_category_id = slug_to_category["culture"]["id"]

        synced_names: set[str] = set()
        upserted = 0

        for state in MALAYSIA_STATES:
            existing = await self._destinations.list_destinations(
                state=state,
                active_only=True,
                limit=50,
            )
            if len(existing) >= count_per_state:
                logger.info(
                    "Skipping state=%s — already has %s destinations",
                    state,
                    len(existing),
                )
                for item in existing:
                    normalized = item.get("name_normalized") or normalize_destination_name(
                        item.get("destination_name") or ""
                    )
                    if normalized:
                        synced_names.add(normalized)
                continue

            needed = count_per_state
            logger.info(
                "Syncing destinations for state=%s count=%s (existing=%s)",
                state,
                needed,
                len(existing),
            )
            raw_items = self._gemini.generate_destinations_for_state(
                state=state,
                count=needed,
            )

            for item in existing:
                normalized = item.get("name_normalized") or normalize_destination_name(
                    item.get("destination_name") or ""
                )
                if normalized:
                    synced_names.add(normalized)

            for item in raw_items:
                name = item["destination_name"]
                normalized = normalize_destination_name(name)
                if not normalized or normalized in synced_names:
                    continue

                location = item.get("location") or ""
                category_slug = item.get("category_slug") or "culture"
                category_id = slug_to_category.get(category_slug, {}).get(
                    "id",
                    default_category_id,
                )

                latitude, longitude = await self._geocoder.geocode_destination(
                    name=name,
                    location=location,
                    state=state,
                )
                if not _in_malaysia(latitude, longitude):
                    fallback_lat = item.get("latitude")
                    fallback_lng = item.get("longitude")
                    if _in_malaysia(fallback_lat, fallback_lng):
                        latitude, longitude = fallback_lat, fallback_lng
                        logger.info(
                            "Using Gemini coordinates for %s (%.5f, %.5f)",
                            name,
                            latitude,
                            longitude,
                        )
                    else:
                        latitude, longitude = None, None
                        logger.warning("No valid coordinates for %s", name)

                images = await self._images.fetch_images(
                    item.get("image_query") or name,
                    state,
                )

                destination = Destination(
                    destination_name=name,
                    name_normalized=normalized,
                    description=item.get("description") or "",
                    category_id=category_id,
                    state=state,
                    location=location,
                    latitude=latitude,
                    longitude=longitude,
                    operating_hours=item.get("operating_hours") or "",
                    images=images,
                    source="gemini",
                    is_active=True,
                )
                await self._destinations.upsert_by_name(destination)
                synced_names.add(normalized)
                upserted += 1

        deactivated = 0
        if deactivate_missing:
            deactivated = await self._destinations.deactivate_missing(synced_names)

        logger.info(
            "Destination sync complete — states=%s upserted=%s deactivated=%s",
            len(MALAYSIA_STATES),
            upserted,
            deactivated,
        )
        return {
            "categories_ensured": len(categories),
            "destinations_upserted": upserted,
            "destinations_deactivated": deactivated,
        }
