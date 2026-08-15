"""Prefetch Places photos/descriptions for featured Malaysia destinations.

Picks one best Mongo match per curated name (cap ~60 Places calls).
Cached in Mongo until cleared.

    python database/seed_featured_destination_media.py
"""

from __future__ import annotations

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

from integration.repositories import DestinationRepository  # noqa: E402
from services.destination_service import DestinationService  # noqa: E402
from services.featured_destinations import FEATURED_DESTINATION_NAMES  # noqa: E402

logger = logging.getLogger(__name__)

MAX_FEATURED = 60


def _best_match(rows: list[dict], fragment: str) -> dict | None:
    needle = fragment.casefold().strip()
    if not needle:
        return None
    exact: list[dict] = []
    starts: list[dict] = []
    contains: list[dict] = []
    for row in rows:
        name = str(row.get("destination_name") or "").strip()
        lower = name.casefold()
        if lower == needle:
            exact.append(row)
        elif lower.startswith(needle):
            starts.append(row)
        elif needle in lower:
            contains.append(row)
    pool = exact or starts or contains
    if not pool:
        return None
    # Prefer rows that already have a place_id and shorter names (less noisy).
    pool.sort(
        key=lambda item: (
            0 if item.get("place_id") else 1,
            len(str(item.get("destination_name") or "")),
        )
    )
    return pool[0]


async def main() -> None:
    repo = DestinationRepository()
    await repo.ensure_indexes()
    service = DestinationService(destination_repository=repo)

    rows = await repo.list_destinations(active_only=True, limit=2000)
    selected: list[dict] = []
    seen_ids: set[str] = set()

    for fragment in FEATURED_DESTINATION_NAMES:
        if len(selected) >= MAX_FEATURED:
            break
        match = _best_match(rows, fragment)
        if match is None:
            logger.info("No match for featured fragment=%s", fragment)
            continue
        dest_id = str(match.get("id") or "")
        if not dest_id or dest_id in seen_ids:
            continue
        seen_ids.add(dest_id)
        selected.append(match)

    logger.info("Featured selected=%s of catalog=%s", len(selected), len(rows))

    marked = 0
    enriched = 0
    skipped = 0

    for item in selected:
        dest_id = item.get("id")
        if not dest_id:
            continue
        name_normalized = item.get("name_normalized") or ""
        if name_normalized and not item.get("is_featured"):
            await repo.update_media_fields(
                name_normalized=name_normalized,
                is_featured=True,
            )
            marked += 1

        result = await service.enrich_destination(str(dest_id))
        if result is None:
            skipped += 1
            continue
        enriched += 1
        logger.info(
            "Featured enriched — %s images=%s",
            result.get("destination_name"),
            len(result.get("images") or []),
        )
        await asyncio.sleep(0.15)

    print(
        "Featured seed complete — "
        f"selected={len(selected)} marked={marked} "
        f"enriched={enriched} skipped={skipped}"
    )


if __name__ == "__main__":
    asyncio.run(main())
