"""Fix destination.state from stored address/coordinates. No Places or Gemini calls.

    python database/repair_destination_states.py
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
from services.malaysia_state import infer_malaysia_state  # noqa: E402

logger = logging.getLogger(__name__)


async def main() -> None:
    repo = DestinationRepository()
    await repo.ensure_indexes()
    rows = await repo.list_destinations(active_only=True, limit=5000)

    updated = 0
    unchanged = 0
    unresolved = 0
    examples: list[str] = []

    for row in rows:
        normalized = str(row.get("name_normalized") or "").strip()
        name = str(row.get("destination_name") or normalized)
        current = str(row.get("state") or "").strip()
        inferred = infer_malaysia_state(
            row.get("location") or "",
            row.get("latitude"),
            row.get("longitude"),
        )
        if not inferred:
            unresolved += 1
            logger.info("Unresolved state — %s (was %s)", name, current or "empty")
            continue
        if inferred == current:
            unchanged += 1
            continue
        if not normalized:
            unresolved += 1
            continue
        await repo.update_state(name_normalized=normalized, state=inferred)
        updated += 1
        line = f"{name}: {current or 'empty'} -> {inferred}"
        if len(examples) < 25:
            examples.append(line)
        logger.info("Updated state — %s", line)

    print(
        "State repair complete — "
        f"scanned={len(rows)} updated={updated} "
        f"unchanged={unchanged} unresolved={unresolved}"
    )
    if examples:
        print("Sample changes:")
        for line in examples:
            print(f"  {line}")


if __name__ == "__main__":
    asyncio.run(main())
