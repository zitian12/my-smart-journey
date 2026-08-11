"""Seed Malaysia destinations via the Gemini AI sync workflow."""

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
from services.destination_ai_service import DestinationAiService  # noqa: E402


async def main() -> None:
    category_repo = DestinationCategoryRepository()
    destination_repo = DestinationRepository()
    await category_repo.ensure_indexes()
    await destination_repo.ensure_indexes()

    service = DestinationAiService(
        category_repository=category_repo,
        destination_repository=destination_repo,
    )
    result = await service.sync_destinations(
        count_per_state=6,
        deactivate_missing=False,
    )
    print(
        "Sync complete — "
        f"categories={result['categories_ensured']} "
        f"upserted={result['destinations_upserted']} "
        f"deactivated={result['destinations_deactivated']}"
    )


if __name__ == "__main__":
    asyncio.run(main())
