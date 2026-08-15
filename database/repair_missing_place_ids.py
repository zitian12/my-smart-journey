"""Copy Places photos onto Gemini rows that lack place_id (0 Google calls).

    python database/repair_missing_place_ids.py
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "business_logic"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

from integration.repositories import DestinationRepository  # noqa: E402
from services.destination_image_service import DestinationImageService  # noqa: E402
from services.destination_place_id_resolve import find_sibling  # noqa: E402

logger = logging.getLogger(__name__)


async def main() -> None:
    repo = DestinationRepository()
    await repo.ensure_indexes()
    rows = await repo.list_destinations(active_only=True, limit=5000)
    orphans = [row for row in rows if not str(row.get("place_id") or "").strip()]
    candidates = [row for row in rows if str(row.get("place_id") or "").strip()]

    copied = 0
    matched_no_media = 0
    unmatched = 0

    for orphan in orphans:
        sibling = find_sibling(orphan, candidates)
        if sibling is None:
            unmatched += 1
            logger.info("No sibling for %s", orphan.get("destination_name"))
            continue

        normalized = orphan.get("name_normalized") or ""
        if not normalized:
            unmatched += 1
            continue

        sibling_images = DestinationImageService.real_images(sibling.get("images"))
        need_description = DestinationImageService.is_template_description(
            orphan.get("description")
        )
        need_images = DestinationImageService.is_fallback_images(orphan.get("images"))

        new_description = None
        sibling_desc = str(sibling.get("description") or "").strip()
        if (
            need_description
            and sibling_desc
            and not DestinationImageService.is_template_description(sibling_desc)
        ):
            new_description = sibling_desc

        new_images = sibling_images if need_images and sibling_images else None
        photo_name = None
        if new_images and sibling.get("photo_name"):
            photo_name = str(sibling.get("photo_name"))

        if new_description is None and new_images is None:
            matched_no_media += 1
            logger.info(
                "Sibling found but no media to copy — %s => %s",
                orphan.get("destination_name"),
                sibling.get("destination_name"),
            )
            continue

        await repo.update_media_fields(
            name_normalized=normalized,
            description=new_description,
            images=new_images,
            photo_name=photo_name,
            mark_media_enriched=True,
            media_enriched_at=datetime.now(timezone.utc),
        )
        copied += 1
        logger.info(
            "Copied media — %s <= %s images=%s",
            orphan.get("destination_name"),
            sibling.get("destination_name"),
            len(new_images or []),
        )

    print(
        "Repair complete — "
        f"orphans={len(orphans)} copied={copied} "
        f"matched_no_media={matched_no_media} unmatched={unmatched}"
    )


if __name__ == "__main__":
    asyncio.run(main())
