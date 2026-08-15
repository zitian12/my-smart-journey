"""Optional media maintenance for destinations.

Default: clear legacy Twin Towers fallback images and template descriptions
(no network). Use --with-wiki only to optionally enrich from Wikipedia.

    python database/backfill_places_media.py
    python database/backfill_places_media.py --with-wiki
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

from integration.repositories import DestinationRepository  # noqa: E402
from services.destination_media_backfill_service import (  # noqa: E402
    DestinationMediaBackfillService,
)


async def main(
    *,
    source: str | None,
    concurrency: int,
    with_wiki: bool,
) -> None:
    repo = DestinationRepository()
    await repo.ensure_indexes()

    service = DestinationMediaBackfillService(destination_repository=repo)
    result = await service.backfill(
        source=source,
        concurrency=concurrency,
        with_wiki=with_wiki,
    )
    mode = "wiki" if with_wiki else "clear-templates"
    print(
        f"Media backfill complete ({mode}) — "
        f"scanned={result['scanned']} "
        f"updated={result['updated']} "
        f"descriptions={result['descriptions_set']} "
        f"images={result['images_set']} "
        f"skipped={result['skipped']}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Clear template descriptions / fake fallback images. "
            "Optional --with-wiki for Wikipedia enrichment."
        )
    )
    parser.add_argument(
        "--source",
        default="places",
        help='Filter by source (default: places). Use "all" for every row.',
    )
    parser.add_argument(
        "--with-wiki",
        action="store_true",
        help="Also try Wikipedia extracts/images (slow).",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="Wikipedia concurrency when using --with-wiki (default: 2).",
    )
    args = parser.parse_args()
    source = None if args.source.strip().lower() == "all" else args.source.strip()
    asyncio.run(
        main(
            source=source,
            concurrency=max(1, args.concurrency),
            with_wiki=args.with_wiki,
        )
    )
