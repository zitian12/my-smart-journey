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
        # After a 429, skip further ORS calls in this process until restart/new client.
        self._rate_limited = False

    @property
    def available(self) -> bool:
        return bool(self._api_key) and not self._rate_limited

    def route(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        profile: str = "driving-car",
        geometry: bool = False,
    ) -> dict[str, Any] | None:
        """Return {distance_km, duration_min, path?} or None. Coords are (lat, lng)."""
        if not self.available:
            return None

        # GeoJSON endpoint gives road coordinates; JSON is enough for metrics only.
        suffix = "/geojson" if geometry else ""
        url = f"{self._base_url}/v2/directions/{profile}{suffix}"
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
            if response.status_code == 429:
                self._mark_rate_limited("route")
                return None
            response.raise_for_status()
            payload = response.json()
            path: list[list[float]] = []

            routes = payload.get("routes") or []
            if routes:
                summary = routes[0].get("summary") or {}
                distance_m = float(summary.get("distance") or 0)
                duration_s = float(summary.get("duration") or 0)
            else:
                features = payload.get("features") or []
                if not features:
                    return None
                props = features[0].get("properties") or {}
                summary = props.get("summary") or {}
                distance_m = float(summary.get("distance") or 0)
                duration_s = float(summary.get("duration") or 0)
                if geometry:
                    coords = (features[0].get("geometry") or {}).get("coordinates") or []
                    path = [[float(lat), float(lng)] for lng, lat in coords]

            if distance_m <= 0:
                return None
            result: dict[str, Any] = {
                "distance_km": round(distance_m / 1000.0, 2),
                "duration_min": max(1, int(round(duration_s / 60.0))),
                "is_estimated": False,
            }
            if geometry and path:
                result["path"] = path
            return result
        except Exception as exc:
            if self._is_rate_limit_error(exc):
                self._mark_rate_limited("route")
            else:
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
            if response.status_code == 429:
                self._mark_rate_limited("matrix")
                return None
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
            if self._is_rate_limit_error(exc):
                self._mark_rate_limited("matrix")
            else:
                logger.warning("ORS matrix failed: %s", exc)
            return None

    def _mark_rate_limited(self, op: str) -> None:
        if not self._rate_limited:
            logger.warning(
                "ORS %s hit rate limit (429); falling back to OSRM/estimate "
                "for the rest of this process",
                op,
            )
        self._rate_limited = True

    @staticmethod
    def _is_rate_limit_error(exc: Exception) -> bool:
        message = str(exc)
        if "429" in message or "Too Many Requests" in message:
            return True
        response = getattr(exc, "response", None)
        return getattr(response, "status_code", None) == 429
