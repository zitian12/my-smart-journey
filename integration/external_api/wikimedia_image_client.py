"""Wikipedia / Wikimedia summary lookup for destination photos and extracts."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)

USER_AGENT = (
    "MySmartJourney/1.0 (travel itinerary app; "
    "https://github.com/local-dev; contact@example.com)"
)
SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
SEARCH_URL = "https://en.wikipedia.org/w/api.php"
_EXTRACT_MAX_CHARS = 400


class WikimediaImageClient:
    """Resolves place photos and short descriptions via Wikipedia summaries."""

    def __init__(self, *, cooldown_seconds: float = 60.0) -> None:
        self._rate_limited_until = 0.0
        self._cooldown_seconds = cooldown_seconds

    @property
    def rate_limited(self) -> bool:
        return time.monotonic() < self._rate_limited_until

    def seconds_until_ready(self) -> float:
        return max(0.0, self._rate_limited_until - time.monotonic())

    def clear_rate_limit(self) -> None:
        self._rate_limited_until = 0.0

    def _mark_rate_limited(self) -> None:
        self._rate_limited_until = time.monotonic() + self._cooldown_seconds
        logger.warning(
            "Wikipedia rate-limited; cooling down %.0fs",
            self._cooldown_seconds,
        )

    async def fetch_summary(
        self,
        destination_name: str,
        state: str = "",
    ) -> dict[str, Any]:
        """Return description + images from one Wikipedia summary lookup."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._fetch_summary_sync,
            destination_name,
            state,
        )

    async def fetch_images(self, destination_name: str, state: str = "") -> list[str]:
        """Return up to two image URLs for a Malaysia destination."""
        summary = await self.fetch_summary(destination_name, state)
        return list(summary.get("images") or [])

    def _fetch_summary_sync(
        self,
        destination_name: str,
        state: str,
    ) -> dict[str, Any]:
        empty = {"description": "", "images": []}
        if self.rate_limited:
            wait_s = self.seconds_until_ready() + 1.0
            logger.info("Wikipedia cooling down — waiting %.0fs", wait_s)
            time.sleep(wait_s)
            self.clear_rate_limit()

        titles = [
            destination_name,
            f"{destination_name}, Malaysia",
            f"{destination_name} ({state})" if state else "",
        ]
        titles = [title for title in titles if title]

        for index, title in enumerate(titles):
            summary = self._summary_payload(title)
            if self.rate_limited:
                wait_s = self.seconds_until_ready() + 1.0
                logger.info("Wikipedia 429 — waiting %.0fs then retry", wait_s)
                time.sleep(wait_s)
                self.clear_rate_limit()
                summary = self._summary_payload(title)
            if summary["description"] or summary["images"]:
                return summary
            if index < len(titles) - 1:
                time.sleep(0.2)

        search_title = self._search_title(f"{destination_name} Malaysia")
        if self.rate_limited:
            wait_s = self.seconds_until_ready() + 1.0
            time.sleep(wait_s)
            self.clear_rate_limit()
            search_title = self._search_title(f"{destination_name} Malaysia")
        if search_title:
            time.sleep(0.2)
            summary = self._summary_payload(search_title)
            if summary["description"] or summary["images"]:
                return summary

        logger.warning("No Wikipedia summary found for %s", destination_name)
        return empty

    def _summary_payload(self, title: str) -> dict[str, Any]:
        url = SUMMARY_URL.format(title=quote(title.replace(" ", "_"), safe="()_,%"))
        try:
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=20,
            )
            if response.status_code == 404:
                return {"description": "", "images": []}
            if response.status_code == 429:
                self._mark_rate_limited()
                return {"description": "", "images": []}
            response.raise_for_status()
            data = response.json()
        except Exception:
            logger.warning("Wikipedia summary failed for title=%s", title)
            return {"description": "", "images": []}

        if data.get("type") == "disambiguation":
            return {"description": "", "images": []}

        extract = str(data.get("extract") or "").strip()
        if len(extract) > _EXTRACT_MAX_CHARS:
            clipped = extract[:_EXTRACT_MAX_CHARS].rsplit(" ", 1)[0].rstrip(" ,;:")
            extract = f"{clipped}…"

        images: list[str] = []
        original = (data.get("originalimage") or {}).get("source")
        thumb = (data.get("thumbnail") or {}).get("source")
        if original:
            images.append(original)
        if thumb and thumb not in images:
            images.append(thumb)

        return {
            "description": extract,
            "images": images[:2],
        }

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
                self._mark_rate_limited()
                return None
            response.raise_for_status()
            results = response.json().get("query", {}).get("search", [])
        except Exception:
            logger.warning("Wikipedia search failed for query=%s", query)
            return None

        if not results:
            return None
        return results[0].get("title")
