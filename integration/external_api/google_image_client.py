"""Google Custom Search image client (official Google Images search API)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

SEARCH_URL = "https://www.googleapis.com/customsearch/v1"
USER_AGENT = "MySmartJourney/1.0 (destination-images; educational project)"


class GoogleImageClient:
    """Fetches destination photos via Google Programmable Search (image mode)."""

    def __init__(self, api_key: str, cx: str) -> None:
        self._api_key = api_key.strip()
        self._cx = cx.strip()
        self._rate_limited = False

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._cx)

    async def fetch_images(
        self,
        destination_name: str,
        state: str = "",
        *,
        count: int = 2,
    ) -> list[str]:
        """Return image URLs for a Malaysia destination from Google Images search."""
        if not self.is_configured or self._rate_limited:
            return []

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._fetch_images_sync,
            destination_name,
            state,
            count,
        )

    def _fetch_images_sync(
        self,
        destination_name: str,
        state: str,
        count: int,
    ) -> list[str]:
        query = " ".join(
            part for part in (destination_name, state, "Malaysia travel") if part
        ).strip()
        params: dict[str, Any] = {
            "key": self._api_key,
            "cx": self._cx,
            "q": query,
            "searchType": "image",
            "num": min(max(count, 1), 5),
            "safe": "active",
            "imgType": "photo",
            "imgSize": "large",
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
                logger.warning("Google CSE rate-limited; skipping further image lookups")
                return []
            response.raise_for_status()
            payload = response.json()
        except Exception:
            logger.warning("Google image search failed for query=%s", query)
            return []

        urls: list[str] = []
        for item in payload.get("items") or []:
            link = str(item.get("link") or "").strip()
            if not link or not self._is_http_url(link):
                continue
            if link not in urls:
                urls.append(link)
            if len(urls) >= count:
                break

        if urls:
            logger.info("Google images found for %s — count=%s", destination_name, len(urls))
        else:
            logger.warning("No Google images found for %s", destination_name)
        return urls

    @staticmethod
    def _is_http_url(url: str) -> bool:
        parsed = urlparse(url)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
