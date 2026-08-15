"""One-shot / monthly Malaysia destination import via Google Places.

Does not run during itinerary generation. Re-run about every 30 days
if you need Places coordinates to stay within Google caching terms.

Usage (repo root):
    python database/seed_places_destinations.py
    python database/seed_places_destinations.py --skip-images
"""

from __future__ import annotations

import argparse
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

from integration.repositories import (  # noqa: E402
    DestinationCategoryRepository,
    DestinationRepository,
)
from services.destination_places_service import (  # noqa: E402
    DestinationPlacesService,
)


async def main(*, fetch_images: bool) -> None:
    category_repo = DestinationCategoryRepository()
    destination_repo = DestinationRepository()
    await category_repo.ensure_indexes()
    await destination_repo.ensure_indexes()

    service = DestinationPlacesService(
        category_repository=category_repo,
        destination_repository=destination_repo,
    )
    result = await service.sync_from_places(fetch_images=fetch_images)
    print(
        "Places sync complete — "
        f"requests={result['places_requests']} "
        f"upserted={result['destinations_upserted']} "
        f"skipped={result['destinations_skipped']}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Import Malaysia destinations from Google Places once."
    )
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Skip Wikipedia image lookup (faster; coords still stored).",
    )
    args = parser.parse_args()
    asyncio.run(main(fetch_images=not args.skip_images))
