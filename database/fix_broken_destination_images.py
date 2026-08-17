"""Re-fetch images only for destinations whose current URLs are broken (403/etc)."""

import asyncio
import logging
import sys
from pathlib import Path

import requests

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "business_logic"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

from database.models import Destination  # noqa: E402
from integration.repositories import DestinationRepository  # noqa: E402
from services.destination_ai_service import normalize_destination_name  # noqa: E402
from services.destination_image_service import DestinationImageService  # noqa: E402

logger = logging.getLogger(__name__)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def image_is_broken(url: str) -> bool:
    if not url:
        return True
    try:
        response = requests.get(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "image/*,*/*",
                "Referer": "http://localhost:5173/",
            },
            timeout=12,
            stream=True,
            allow_redirects=True,
        )
        ok = response.status_code == 200 and (
            response.headers.get("content-type") or ""
        ).lower().startswith("image/")
        response.close()
        return not ok
    except Exception:
        return True


async def main() -> None:
    repo = DestinationRepository()
    images = DestinationImageService()
    destinations = await repo.list_destinations(active_only=True, limit=500)

    fixed = 0
    skipped = 0

    for item in destinations:
        current = item.get("images") or []
        primary = current[0] if current else ""
        if not image_is_broken(primary):
            skipped += 1
            continue

        name = item["destination_name"]
        state = item.get("state") or ""
        logger.info("Broken image for %s — re-fetching", name)
        photo_urls = await images.fetch_images(name, state)

        destination = Destination(
            destination_name=name,
            name_normalized=item.get("name_normalized")
            or normalize_destination_name(name),
            description=item.get("description") or "",
            category_id=item.get("category_id") or "",
            state=state,
            location=item.get("location") or "",
            latitude=item.get("latitude"),
            longitude=item.get("longitude"),
            operating_hours=item.get("operating_hours") or "",
            images=photo_urls,
            source=item.get("source") or "gemini",
            is_active=bool(item.get("is_active", True)),
        )
        await repo.upsert_by_name(destination)
        fixed += 1
        logger.info("Fixed %s — images=%s", name, len(photo_urls))

    print(f"Broken-image fix complete — fixed={fixed} skipped_ok={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
