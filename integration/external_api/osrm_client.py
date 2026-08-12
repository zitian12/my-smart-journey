"""OSRM routing client (public demo server or self-hosted)."""

from __future__ import annotations

import logging
import math
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org"


class OsrmClient:
    """Driving/walking route lookups via OSRM HTTP API."""

    def __init__(self, base_url: str | None = None, *, timeout: float = 12.0) -> None:
        self._base_url = (base_url or os.getenv("OSRM_BASE_URL") or DEFAULT_OSRM_BASE_URL).rstrip(
            "/"
        )
        self._timeout = timeout

    def route(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        profile: str = "driving",
    ) -> dict[str, Any] | None:
        """Return {distance_km, duration_min, geometry?} or None on failure.

        Coordinates are (lat, lng).
        """
        lat1, lng1 = a
        lat2, lng2 = b
        url = (
            f"{self._base_url}/route/v1/{profile}/"
            f"{lng1},{lat1};{lng2},{lat2}"
        )
        params = {"overview": "false", "alternatives": "false"}
        try:
            response = requests.get(url, params=params, timeout=self._timeout)
            response.raise_for_status()
            payload = response.json()
            if payload.get("code") != "Ok" or not payload.get("routes"):
                return None
            route = payload["routes"][0]
            return {
                "distance_km": round(float(route["distance"]) / 1000.0, 2),
                "duration_min": max(1, int(round(float(route["duration"]) / 60.0))),
                "is_estimated": False,
            }
        except Exception as exc:
            logger.warning("OSRM route failed: %s", exc)
            return None

    def estimate_haversine(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        speed_kmh: float = 50.0,
    ) -> dict[str, Any]:
        """Fallback straight-line estimate when OSRM is unavailable."""
        distance_km = self.haversine_km(a, b)
        duration_min = max(1, int(round((distance_km / max(speed_kmh, 1.0)) * 60.0)))
        return {
            "distance_km": round(distance_km, 2),
            "duration_min": duration_min,
            "is_estimated": True,
        }

    @staticmethod
    def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
        lat1, lng1 = a
        lat2, lng2 = b
        r = 6371.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lng2 - lng1)
        h = (
            math.sin(dp / 2) ** 2
            + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        )
        return 2 * r * math.asin(math.sqrt(h))

