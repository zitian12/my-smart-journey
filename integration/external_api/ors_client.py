"""OpenRouteService directions + matrix client."""

from __future__ import annotations

import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

DEFAULT_ORS_BASE_URL = "https://api.openrouteservice.org"


class OrsClient:
    """Preferred road routing via OpenRouteService when an API key is set."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        *,
        timeout: float = 15.0,
    ) -> None:
        self._api_key = (api_key or os.getenv("ORS_API_KEY") or "").strip()
        self._base_url = (
            base_url or os.getenv("ORS_BASE_URL") or DEFAULT_ORS_BASE_URL
        ).rstrip("/")
        self._timeout = timeout

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    def route(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        profile: str = "driving-car",
    ) -> dict[str, Any] | None:
        """Return {distance_km, duration_min} or None. Coords are (lat, lng)."""
        if not self.available:
            return None

        url = f"{self._base_url}/v2/directions/{profile}"
        body = {
            "coordinates": [[a[1], a[0]], [b[1], b[0]]],
        }
        headers = {
            "Authorization": self._api_key,
            "Content-Type": "application/json",
        }
        try:
            response = requests.post(
                url, json=body, headers=headers, timeout=self._timeout
            )
            response.raise_for_status()
            payload = response.json()
            routes = payload.get("routes") or []
            if not routes:
                # GeoJSON style
                features = payload.get("features") or []
                if not features:
                    return None
                summary = (features[0].get("properties") or {}).get("summary") or {}
                distance_m = float(summary.get("distance") or 0)
                duration_s = float(summary.get("duration") or 0)
            else:
                summary = routes[0].get("summary") or {}
                distance_m = float(summary.get("distance") or 0)
                duration_s = float(summary.get("duration") or 0)
            if distance_m <= 0:
                return None
            return {
                "distance_km": round(distance_m / 1000.0, 2),
                "duration_min": max(1, int(round(duration_s / 60.0))),
                "is_estimated": False,
            }
        except Exception as exc:
            logger.warning("ORS route failed: %s", exc)
            return None

    def matrix(
        self,
        points: list[tuple[float, float]],
        *,
        profile: str = "driving-car",
    ) -> list[list[float]] | None:
        """Return NxN duration matrix in minutes, or None. Coords are (lat, lng)."""
        if not self.available or len(points) < 2:
            return None

        url = f"{self._base_url}/v2/matrix/{profile}"
        body = {
            "locations": [[lng, lat] for lat, lng in points],
            "metrics": ["duration"],
            "units": "m",
        }
        headers = {
            "Authorization": self._api_key,
            "Content-Type": "application/json",
        }
        try:
            response = requests.post(
                url, json=body, headers=headers, timeout=self._timeout
            )
            response.raise_for_status()
            payload = response.json()
            durations = payload.get("durations")
            if not durations:
                return None
            return [
                [max(0.0, float(cell or 0) / 60.0) for cell in row]
                for row in durations
            ]
        except Exception as exc:
            logger.warning("ORS matrix failed: %s", exc)
            return None
