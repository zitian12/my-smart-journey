"""Backfill / clear destination media.

Default path clears fake Unsplash images and template descriptions (no network).
Optional --with-wiki enriches from Wikipedia only (never writes templates).
Real Places editorialSummary + photos are loaded on-demand via DestinationService.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from integration.external_api.wikimedia_image_client import WikimediaImageClient
from integration.repositories import DestinationRepository
from services.destination_ai_service import normalize_destination_name
from services.destination_image_service import DestinationImageService

logger = logging.getLogger(__name__)

_DEFAULT_CONCURRENCY = 2
_REQUEST_GAP_S = 0.35


class DestinationMediaBackfillService:
    """Clear fake media, or optionally enrich via Wikipedia."""

    def __init__(
        self,
        destination_repository: DestinationRepository | None = None,
        image_service: DestinationImageService | None = None,
        wiki_client: WikimediaImageClient | None = None,
    ) -> None:
        self._destinations = destination_repository or DestinationRepository()
        self._wiki = wiki_client or WikimediaImageClient(cooldown_seconds=45.0)
        self._images = image_service or DestinationImageService(
            wiki_client=self._wiki,
        )

    async def backfill(
        self,
        *,
        source: str | None = "places",
        concurrency: int = _DEFAULT_CONCURRENCY,
        limit: int = 1500,
        with_wiki: bool = False,
    ) -> dict[str, int]:
        if with_wiki:
            return await self._backfill_with_wiki(
                source=source,
                concurrency=concurrency,
                limit=limit,
            )
        return await self._clear_fake_media(source=source, limit=limit)

    async def _clear_fake_media(
        self,
        *,
        source: str | None,
        limit: int,
    ) -> dict[str, int]:
        rows = await self._destinations.list_destinations(
            source=source,
            active_only=True,
            limit=limit,
        )
        updated = 0
        descriptions_set = 0
        images_set = 0

        for item in rows:
            name = str(item.get("destination_name") or "").strip()
            if not name:
                continue
            normalized = (
                item.get("name_normalized") or normalize_destination_name(name)
            )
            images = list(item.get("images") or [])
            real_images = DestinationImageService.real_images(images)
            description = str(item.get("description") or "").strip()
            is_template = DestinationImageService.is_template_description(
                description
            ) and bool(description)

            images_changed = real_images != images
            if not images_changed and not is_template:
                continue

            await self._destinations.update_media_fields(
                name_normalized=normalized,
                images=real_images if images_changed else None,
                clear_description=is_template,
            )
            updated += 1
            if is_template:
                descriptions_set += 1
            if images_changed:
                images_set += 1

        logger.info(
            "Cleared fake media — scanned=%s updated=%s desc=%s images=%s",
            len(rows),
            updated,
            descriptions_set,
            images_set,
        )
        return {
            "scanned": len(rows),
            "updated": updated,
            "descriptions_set": descriptions_set,
            "images_set": images_set,
            "skipped": len(rows) - updated,
        }

    async def _backfill_with_wiki(
        self,
        *,
        source: str | None,
        concurrency: int,
        limit: int,
    ) -> dict[str, int]:
        rows = await self._destinations.list_destinations(
            source=source,
            active_only=True,
            limit=limit,
        )
        targets = [
            row
            for row in rows
            if DestinationImageService.is_template_description(row.get("description"))
            or DestinationImageService.is_fallback_images(row.get("images"))
        ]
        logger.info(
            "Wiki backfill — candidates=%s of %s",
            len(targets),
            len(rows),
        )
        if not targets:
            return {
                "scanned": len(rows),
                "updated": 0,
                "descriptions_set": 0,
                "images_set": 0,
                "skipped": 0,
            }

        semaphore = asyncio.Semaphore(max(1, concurrency))
        counters = {
            "updated": 0,
            "descriptions_set": 0,
            "images_set": 0,
            "skipped": 0,
        }
        lock = asyncio.Lock()

        async def worker(item: dict[str, Any]) -> None:
            async with semaphore:
                while self._wiki.rate_limited:
                    await asyncio.sleep(2.0)
                result = await self._enrich_one_with_wiki(item)
                await asyncio.sleep(_REQUEST_GAP_S)
                async with lock:
                    if result is None:
                        counters["skipped"] += 1
                        return
                    counters["updated"] += 1
                    counters["descriptions_set"] += result["description"]
                    counters["images_set"] += result["images"]

        await asyncio.gather(*(worker(item) for item in targets))
        return {
            "scanned": len(rows),
            "updated": counters["updated"],
            "descriptions_set": counters["descriptions_set"],
            "images_set": counters["images_set"],
            "skipped": counters["skipped"],
        }

    async def _enrich_one_with_wiki(
        self,
        item: dict[str, Any],
    ) -> dict[str, int] | None:
        name = str(item.get("destination_name") or "").strip()
        if not name:
            return None
        state = str(item.get("state") or "")
        normalized = (
            item.get("name_normalized") or normalize_destination_name(name)
        )
        need_description = DestinationImageService.is_template_description(
            item.get("description")
        )
        need_images = DestinationImageService.is_fallback_images(item.get("images"))

        if self._wiki.rate_limited:
            wait_s = self._wiki.seconds_until_ready()
            if wait_s > 0:
                await asyncio.sleep(min(wait_s + 0.5, 60.0))

        wiki_description = ""
        wiki_images: list[str] = []
        if not self._wiki.rate_limited:
            summary = await self._images.fetch_wiki_summary(name, state)
            wiki_description = str(summary.get("description") or "").strip()
            wiki_images = list(summary.get("images") or [])

        description = None
        new_images = None
        description_changed = 0
        images_changed = 0

        if need_description and wiki_description:
            description = wiki_description
            description_changed = 1
        elif need_description and str(item.get("description") or "").strip():
            # Clear template; leave empty for on-demand Places enrichment.
            description = ""
            description_changed = 1

        if need_images and wiki_images:
            new_images = wiki_images
            images_changed = 1
        elif need_images:
            real = DestinationImageService.real_images(item.get("images"))
            if real != list(item.get("images") or []):
                new_images = real
                images_changed = 1

        if description_changed == 0 and images_changed == 0:
            return None

        await self._destinations.update_media_fields(
            name_normalized=normalized,
            description=description,
            images=new_images,
            clear_description=description == "",
        )
        return {
            "description": description_changed,
            "images": images_changed,
        }
