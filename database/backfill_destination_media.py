"""Backfill destination images (Google Images via CSE) and geocodes."""

import asyncio
import logging
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "business_logic"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

from database.models import Destination  # noqa: E402
from integration.external_api import NominatimClient  # noqa: E402
from integration.repositories import DestinationRepository  # noqa: E402
from services.destination_ai_service import (  # noqa: E402
    _in_malaysia,
    normalize_destination_name,
)
from services.destination_image_service import DestinationImageService  # noqa: E402

logger = logging.getLogger(__name__)


async def main() -> None:
    repo = DestinationRepository()
    await repo.ensure_indexes()

    geocoder = NominatimClient()
    images = DestinationImageService()

    destinations = await repo.list_destinations(active_only=True, limit=500)
    updated = 0

    for item in destinations:
        name = item["destination_name"]
        state = item.get("state") or ""
        location = item.get("location") or ""

        latitude = item.get("latitude")
        longitude = item.get("longitude")
        if not _in_malaysia(latitude, longitude):
            latitude, longitude = await geocoder.geocode_destination(
                name=name,
                location=location,
                state=state,
            )

        photo_urls = await images.fetch_images(name, state)

        destination = Destination(
            destination_name=name,
            name_normalized=item.get("name_normalized")
            or normalize_destination_name(name),
            description=item.get("description") or "",
            category_id=item.get("category_id") or "",
            state=state,
            location=location,
            latitude=latitude,
            longitude=longitude,
            operating_hours=item.get("operating_hours") or "",
            images=photo_urls,
            source=item.get("source") or "gemini",
            is_active=bool(item.get("is_active", True)),
        )
        await repo.upsert_by_name(destination)
        updated += 1
        logger.info(
            "Backfilled %s — coords=%s images=%s",
            name,
            bool(_in_malaysia(latitude, longitude)),
            len(photo_urls),
        )

    print(f"Backfill complete — updated={updated}")


if __name__ == "__main__":
    asyncio.run(main())
