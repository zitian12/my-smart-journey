"""Backfill destination descriptions with Gemini (not Google Places).

Rewrites active destinations that are not yet description_source=gemini.
Resume-safe: already-gemini rows are skipped unless --force.

    python database/backfill_gemini_descriptions.py
    python database/backfill_gemini_descriptions.py --force
    python database/backfill_gemini_descriptions.py --limit 50
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

from integration.external_api.gemini_client import GeminiClient  # noqa: E402
from integration.repositories import DestinationRepository  # noqa: E402
from services.destination_image_service import DestinationImageService  # noqa: E402
from services.destination_service import DestinationService  # noqa: E402

logger = logging.getLogger(__name__)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill Gemini descriptions")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rewrite even when description_source is already gemini",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max number of destinations to process (0 = all)",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=4.5,
        help="Seconds between Gemini calls (free tier ~15 RPM => 4s+)",
    )
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()
    repo = DestinationRepository()
    await repo.ensure_indexes()
    service = DestinationService(destination_repository=repo)

    if service._gemini is None:
        print("GEMINI_API_KEY missing — abort")
        return

    rows = await repo.list_destinations(active_only=True, limit=5000)
    pending: list[dict] = []
    for row in rows:
        source = str(row.get("description_source") or "").strip().lower()
        has_body = not DestinationImageService.is_template_description(
            row.get("description")
        )
        if args.force:
            pending.append(row)
        elif source != "gemini" or not has_body:
            pending.append(row)

    if args.limit > 0:
        pending = pending[: args.limit]

    logger.info(
        "Gemini description backfill — total=%s pending=%s force=%s sleep=%s",
        len(rows),
        len(pending),
        args.force,
        args.sleep,
    )

    written = 0
    skipped = 0
    failed = 0

    for index, row in enumerate(pending, start=1):
        # Wait out free-tier cooldown instead of aborting the whole run.
        while GeminiClient.is_rate_limited():
            wait_s = 5.0
            logger.warning("Waiting %.0fs for Gemini cooldown…", wait_s)
            await asyncio.sleep(wait_s)

        name = row.get("destination_name")
        try:
            result = await service.ensure_gemini_description(row, force=args.force)
            source = str(result.get("description_source") or "").strip().lower()
            if source == "gemini" and result.get("description"):
                # If still unchanged non-gemini, treat as skip
                if (
                    not args.force
                    and str(row.get("description_source") or "").lower() == "gemini"
                    and (row.get("description") or "") == (result.get("description") or "")
                ):
                    skipped += 1
                else:
                    written += 1
                logger.info("[%s/%s] OK %s", index, len(pending), name)
            else:
                if GeminiClient.is_rate_limited():
                    logger.warning(
                        "[%s/%s] rate-limited on %s — will wait and continue",
                        index,
                        len(pending),
                        name,
                    )
                    # Re-queue current item by retrying once after cooldown.
                    while GeminiClient.is_rate_limited():
                        await asyncio.sleep(5.0)
                    GeminiClient.clear_rate_limit()
                    result = await service.ensure_gemini_description(
                        row, force=args.force
                    )
                    source = str(result.get("description_source") or "").strip().lower()
                    if source == "gemini" and result.get("description"):
                        written += 1
                        logger.info("[%s/%s] OK(retry) %s", index, len(pending), name)
                    else:
                        skipped += 1
                        logger.info("[%s/%s] skip %s", index, len(pending), name)
                else:
                    skipped += 1
                    logger.info("[%s/%s] skip %s", index, len(pending), name)
        except Exception:
            failed += 1
            logger.exception("[%s/%s] fail %s", index, len(pending), name)

        await asyncio.sleep(max(0.0, args.sleep))

    print(
        "Gemini description backfill complete — "
        f"pending={len(pending)} written={written} "
        f"skipped={skipped} failed={failed}"
    )


if __name__ == "__main__":
    asyncio.run(main())
