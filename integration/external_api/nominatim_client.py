"""Nominatim (OpenStreetMap) geocoding client for Malaysia places."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import requests

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "MySmartJourney/1.0 (destination-sync; educational project)"


class NominatimClient:
    """Geocodes place queries to latitude/longitude with polite rate limiting."""

    def __init__(self, *, delay_seconds: float = 1.1) -> None:
        self._delay_seconds = delay_seconds

    async def geocode(self, query: str) -> tuple[float | None, float | None]:
        """Return (latitude, longitude) for a query, or (None, None) on failure."""
        if not query.strip():
            return None, None

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, self._geocode_sync, query)
        await asyncio.sleep(self._delay_seconds)
        return result

    async def geocode_destination(
        self,
        *,
        name: str,
        location: str = "",
        state: str = "",
    ) -> tuple[float | None, float | None]:
        """Try several Malaysia-focused query shapes until one succeeds."""
        short_name = re.sub(r"\s*\([^)]*\)\s*", " ", name).strip()
        short_name = re.sub(r"\s+", " ", short_name)

        candidates = [
            ", ".join(part for part in (name, location, state, "Malaysia") if part),
            ", ".join(part for part in (name, state, "Malaysia") if part),
            f"{name}, Malaysia",
            name,
            ", ".join(part for part in (short_name, state, "Malaysia") if part),
            f"{short_name}, Malaysia",
            short_name,
        ]

        seen: set[str] = set()
        for query in candidates:
            normalized = " ".join(query.split()).strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)

            latitude, longitude = await self.geocode(query)
            if latitude is not None and longitude is not None:
                return latitude, longitude

        return None, None

    def _geocode_sync(self, query: str) -> tuple[float | None, float | None]:
        params: dict[str, Any] = {
            "q": query,
            "format": "json",
            "limit": 1,
            "countrycodes": "my",
        }
        headers = {"User-Agent": USER_AGENT}

        try:
            response = requests.get(
                NOMINATIM_URL,
                params=params,
                headers=headers,
                timeout=20,
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            logger.exception("Nominatim geocode failed for query=%s", query)
            return None, None

        if not data:
            logger.warning("Nominatim returned no results for query=%s", query)
            return None, None

        try:
            lat = float(data[0]["lat"])
            lng = float(data[0]["lon"])
        except (KeyError, TypeError, ValueError):
            logger.warning("Nominatim returned invalid coords for query=%s", query)
            return None, None

        return lat, lng
