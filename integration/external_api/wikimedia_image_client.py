"""Wikipedia / Wikimedia image lookup for real destination photos."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)

USER_AGENT = "MySmartJourney/1.0 (destination-images; educational project)"
SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
SEARCH_URL = "https://en.wikipedia.org/w/api.php"


class WikimediaImageClient:
    """Resolves real place photos via Wikipedia page summaries."""

    def __init__(self) -> None:
        self._rate_limited = False

    async def fetch_images(self, destination_name: str, state: str = "") -> list[str]:
        """Return up to two image URLs for a Malaysia destination."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._fetch_images_sync,
            destination_name,
            state,
        )

    def _fetch_images_sync(self, destination_name: str, state: str) -> list[str]:
        if self._rate_limited:
            return []

        titles = [
            destination_name,
            f"{destination_name}, Malaysia",
            f"{destination_name} ({state})" if state else "",
        ]
        titles = [title for title in titles if title]

        for title in titles:
            images = self._summary_images(title)
            if self._rate_limited:
                return []
            if images:
                return images
            time.sleep(0.5)

        search_title = self._search_title(f"{destination_name} Malaysia")
        if self._rate_limited:
            return []
        if search_title:
            time.sleep(0.5)
            images = self._summary_images(search_title)
            if images:
                return images

        logger.warning("No Wikipedia images found for %s", destination_name)
        return []

    def _summary_images(self, title: str) -> list[str]:
        url = SUMMARY_URL.format(title=quote(title.replace(" ", "_"), safe="()_,%"))
        try:
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=20,
            )
            if response.status_code == 404:
                return []
            if response.status_code == 429:
                self._rate_limited = True
                logger.warning("Wikipedia rate-limited; skipping further image lookups")
                return []
            response.raise_for_status()
            data = response.json()
        except Exception:
            logger.warning("Wikipedia summary failed for title=%s", title)
            return []

        if data.get("type") == "disambiguation":
            return []

        images: list[str] = []
        original = (data.get("originalimage") or {}).get("source")
        thumb = (data.get("thumbnail") or {}).get("source")
        if original:
            images.append(original)
        if thumb and thumb not in images:
            images.append(thumb)
        return images[:2]

    def _search_title(self, query: str) -> str | None:
        params: dict[str, Any] = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": 1,
            "format": "json",
        }
        try:
            response = requests.get(
                SEARCH_URL,
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=20,
            )
            if response.status_code == 429:
                self._rate_limited = True
                logger.warning("Wikipedia rate-limited; skipping further image lookups")
                return None
            response.raise_for_status()
            results = response.json().get("query", {}).get("search", [])
        except Exception:
            logger.warning("Wikipedia search failed for query=%s", query)
            return None

        if not results:
            return None
        return results[0].get("title")
