"""SerpApi Google Images client for destination photos."""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

SEARCH_URL = "https://serpapi.com/search.json"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


class SerpApiImageClient:
    """Fetches destination photos via SerpApi Google Images API."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key.strip()
        self._rate_limited = False

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def fetch_images(
        self,
        destination_name: str,
        state: str = "",
        *,
        count: int = 2,
    ) -> list[str]:
        """Return image URLs for a Malaysia destination from Google Images."""
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
            part for part in (destination_name, state, "Malaysia") if part
        ).strip()
        params: dict[str, Any] = {
            "engine": "google_images",
            "q": query,
            "api_key": self._api_key,
            "hl": "en",
            "gl": "my",
            "google_domain": "google.com",
        }

        try:
            response = requests.get(
                SEARCH_URL,
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=30,
            )
            if response.status_code == 429:
                self._rate_limited = True
                logger.warning("SerpApi rate-limited; skipping further image lookups")
                return []
            response.raise_for_status()
            payload = response.json()
        except Exception:
            logger.warning("SerpApi image search failed for query=%s", query)
            return []

        if payload.get("error"):
            logger.warning(
                "SerpApi error for query=%s: %s",
                query,
                payload.get("error"),
            )
            return []

        candidates: list[str] = []
        for item in payload.get("images_results") or []:
            # Prefer Google-hosted thumbnails first — originals often hotlink-block in browsers.
            for key in ("thumbnail", "original", "link"):
                link = str(item.get(key) or "").strip()
                if link and self._is_http_url(link) and link not in candidates:
                    candidates.append(link)

        # Stable hosts first
        candidates.sort(key=self._host_priority)

        urls: list[str] = []
        for link in candidates:
            if self._is_reachable_image(link):
                urls.append(link)
            if len(urls) >= count:
                break

        if urls:
            logger.info(
                "SerpApi images found for %s — count=%s",
                destination_name,
                len(urls),
            )
        else:
            logger.warning("No usable SerpApi images for %s", destination_name)
        return urls

    def _is_reachable_image(self, url: str) -> bool:
        """Reject hotlink-blocked / non-image URLs before saving."""
        try:
            response = requests.get(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "image/*,*/*",
                    # Simulate browser embed so hotlink protection is detected.
                    "Referer": "http://localhost:5173/",
                },
                timeout=12,
                stream=True,
                allow_redirects=True,
            )
            if response.status_code != 200:
                response.close()
                return False
            content_type = (response.headers.get("content-type") or "").lower()
            response.close()
            return content_type.startswith("image/")
        except Exception:
            return False

    @staticmethod
    def _host_priority(url: str) -> tuple[int, str]:
        host = urlparse(url).netloc.lower()
        if "gstatic.com" in host or "googleusercontent.com" in host:
            return (0, host)
        if "wikimedia.org" in host or "wikipedia.org" in host:
            return (1, host)
        if "unsplash.com" in host:
            return (2, host)
        return (3, host)

    @staticmethod
    def _is_http_url(url: str) -> bool:
        parsed = urlparse(url)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
