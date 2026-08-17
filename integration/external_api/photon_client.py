"""OSM Photon address suggestions — no Google quota."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

PHOTON_URL = "https://photon.komoot.io/api/"
_USER_AGENT = "my-smart-journey/1.0"
_MY_BBOX = "99.6,0.85,119.3,7.52"
_MY_BIAS = (3.139, 101.6869)
_MIN_LAT, _MAX_LAT = 0.85, 7.52
_MIN_LNG, _MAX_LNG = 99.6, 119.3


class PhotonClient:
    """Malaysia-scoped Photon autocomplete with an in-process cache."""

    def __init__(self, *, timeout: float = 8.0, limit: int = 5) -> None:
        self._timeout = timeout
        self._limit = limit
        self._cache: dict[str, list[dict[str, Any]]] = {}

    async def suggest(self, query: str) -> list[dict[str, Any]]:
        key = " ".join(query.strip().lower().split())
        if len(key) < 3:
            return []
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(None, self._suggest_sync, key)
        self._cache[key] = results
        return results

    def _suggest_sync(self, query: str) -> list[dict[str, Any]]:
        params = {
            "q": query,
            "limit": str(max(self._limit, 8)),
            "lang": "en",
            "lat": str(_MY_BIAS[0]),
            "lon": str(_MY_BIAS[1]),
            "bbox": _MY_BBOX,
        }
        try:
            response = requests.get(
                PHOTON_URL,
                params=params,
                timeout=self._timeout,
                headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
        except Exception:
            logger.exception("Photon suggest failed for query=%s", query)
            return []

        seen: set[tuple[float, float]] = set()
        results: list[dict[str, Any]] = []
        for feature in payload.get("features") or []:
            parsed = self._parse_feature(feature)
            if parsed is None:
                continue
            coord_key = (
                round(parsed["latitude"], 5),
                round(parsed["longitude"], 5),
            )
            if coord_key in seen:
                continue
            seen.add(coord_key)
            results.append(parsed)
            if len(results) >= self._limit:
                break
        return results

    @staticmethod
    def _parse_feature(feature: dict[str, Any]) -> dict[str, Any] | None:
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if len(coords) < 2:
            return None
        try:
            lng = float(coords[0])
            lat = float(coords[1])
        except (TypeError, ValueError):
            return None
        if not (_MIN_LAT <= lat <= _MAX_LAT and _MIN_LNG <= lng <= _MAX_LNG):
            return None

        props = feature.get("properties") or {}
        if not PhotonClient._is_malaysia(props):
            return None

        name = str(
            props.get("name")
            or props.get("street")
            or props.get("housenumber")
            or ""
        ).strip()
        city = str(
            props.get("city")
            or props.get("district")
            or props.get("locality")
            or ""
        ).strip()
        state = str(props.get("state") or props.get("county") or "").strip()
        subtitle = " · ".join(part for part in (city, state) if part)
        if not name:
            name = subtitle or "Place"
        if name.lower() == subtitle.lower():
            subtitle = str(props.get("osm_value") or "Address").replace("_", " ")
        return {
            "name": name,
            "latitude": lat,
            "longitude": lng,
            "subtitle": subtitle,
        }

    @staticmethod
    def _is_malaysia(props: dict[str, Any]) -> bool:
        code = str(props.get("countrycode") or "").upper()
        country = str(props.get("country") or "").lower()
        if code == "MY" or "malaysia" in country:
            return True
        # Some Photon hits omit country when bbox-constrained.
        return not code and not country
