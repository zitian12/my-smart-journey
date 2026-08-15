"""Google Maps Directions + Geocoding client (credit-conscious)."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any

import requests

from integration.external_api.geo import decode_polyline, estimate_route

logger = logging.getLogger(__name__)

DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_MAX_WAYPOINTS = 25


class GoogleMapsClient:
    """Server-side Directions (waypoints) and Malaysia-scoped Geocoding."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        timeout: float = 15.0,
    ) -> None:
        self._api_key = (api_key or os.getenv("GOOGLE_MAPS_API_KEY") or "").strip()
        self._timeout = timeout
        self._route_cache: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
        self._geocode_cache: dict[str, tuple[float | None, float | None]] = {}

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    def route_waypoints(
        self,
        points: list[tuple[float, float]],
        *,
        mode: str = "driving",
    ) -> list[dict[str, Any]]:
        """Return one dict per consecutive pair: distance_km, duration_min, path.

        Uses a single Directions request (chunked at 25 waypoints). Falls back
        to haversine estimates for any chunk that fails.
        """
        if len(points) < 2:
            return []

        cache_key = self._points_key(points, mode)
        cached = self._route_cache.get(cache_key)
        if cached is not None:
            return cached

        legs: list[dict[str, Any]] = []
        cursor = 0
        while cursor < len(points) - 1:
            chunk = points[cursor : cursor + _MAX_WAYPOINTS + 2]
            if len(chunk) < 2:
                break
            chunk_legs = self._directions_chunk(chunk, mode=mode)
            if chunk_legs is None:
                for i in range(cursor, len(points) - 1):
                    legs.append(estimate_route(points[i], points[i + 1]))
                break
            legs.extend(chunk_legs)
            cursor += len(chunk) - 1

        self._route_cache[cache_key] = legs
        return legs

    def route_pair(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        mode: str = "driving",
    ) -> dict[str, Any] | None:
        """Single A→B Directions call. Returns None on failure (caller estimates)."""
        legs = self.route_waypoints([a, b], mode=mode)
        if not legs:
            return None
        if legs[0].get("is_estimated"):
            return None
        return legs[0]

    async def geocode(self, query: str) -> tuple[float | None, float | None]:
        """Return (latitude, longitude) for a query, or (None, None) on failure."""
        if not query.strip():
            return None, None
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._geocode_sync, query)

    async def geocode_destination(
        self,
        *,
        name: str,
        location: str = "",
        state: str = "",
    ) -> tuple[float | None, float | None]:
        """Try a few Malaysia-focused queries; stop at the first hit."""
        short_name = re.sub(r"\s*\([^)]*\)\s*", " ", name).strip()
        short_name = re.sub(r"\s+", " ", short_name)

        candidates = [
            ", ".join(part for part in (name, location, state, "Malaysia") if part),
            ", ".join(part for part in (name, state, "Malaysia") if part),
            f"{name}, Malaysia",
        ]
        if short_name and short_name.lower() != name.strip().lower():
            candidates.append(f"{short_name}, Malaysia")

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

    def _directions_chunk(
        self,
        points: list[tuple[float, float]],
        *,
        mode: str,
    ) -> list[dict[str, Any]] | None:
        if not self.available:
            return None

        origin = self._fmt(points[0])
        destination = self._fmt(points[-1])
        params: dict[str, str] = {
            "origin": origin,
            "destination": destination,
            "mode": mode,
            "region": "my",
            "key": self._api_key,
        }
        if len(points) > 2:
            params["waypoints"] = "|".join(self._fmt(p) for p in points[1:-1])

        try:
            response = requests.get(
                DIRECTIONS_URL, params=params, timeout=self._timeout
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            logger.warning("Google Directions request failed: %s", exc)
            return None

        status = payload.get("status")
        if status != "OK" or not payload.get("routes"):
            logger.warning("Google Directions status=%s", status)
            return None

        api_legs = payload["routes"][0].get("legs") or []
        if len(api_legs) != len(points) - 1:
            logger.warning(
                "Google Directions leg count mismatch: got %s expected %s",
                len(api_legs),
                len(points) - 1,
            )
            return None

        result: list[dict[str, Any]] = []
        for leg in api_legs:
            distance_m = float((leg.get("distance") or {}).get("value") or 0)
            duration_s = float((leg.get("duration") or {}).get("value") or 0)
            path = self._leg_path(leg)
            if distance_m <= 0:
                return None
            result.append(
                {
                    "distance_km": round(distance_m / 1000.0, 2),
                    "duration_min": max(1, int(round(duration_s / 60.0))),
                    "is_estimated": False,
                    "path": path,
                }
            )
        return result

    def _geocode_sync(self, query: str) -> tuple[float | None, float | None]:
        cache_key = query.strip().lower()
        if cache_key in self._geocode_cache:
            return self._geocode_cache[cache_key]

        if not self.available:
            self._geocode_cache[cache_key] = (None, None)
            return None, None

        params = {
            "address": query,
            "region": "my",
            "components": "country:MY",
            "key": self._api_key,
        }
        try:
            response = requests.get(
                GEOCODE_URL, params=params, timeout=self._timeout
            )
            response.raise_for_status()
            payload = response.json()
        except Exception:
            logger.exception("Google Geocoding failed for query=%s", query)
            self._geocode_cache[cache_key] = (None, None)
            return None, None

        status = payload.get("status")
        results = payload.get("results") or []
        if status != "OK" or not results:
            logger.warning(
                "Google Geocoding status=%s query=%s", status, query
            )
            self._geocode_cache[cache_key] = (None, None)
            return None, None

        location = (results[0].get("geometry") or {}).get("location") or {}
        try:
            lat = float(location["lat"])
            lng = float(location["lng"])
        except (KeyError, TypeError, ValueError):
            logger.warning("Google Geocoding returned invalid coords for %s", query)
            self._geocode_cache[cache_key] = (None, None)
            return None, None

        coords = (lat, lng)
        self._geocode_cache[cache_key] = coords
        return coords

    @staticmethod
    def _leg_path(leg: dict[str, Any]) -> list[list[float]]:
        path: list[list[float]] = []
        for step in leg.get("steps") or []:
            encoded = (step.get("polyline") or {}).get("points") or ""
            decoded = decode_polyline(encoded)
            if path and decoded:
                decoded = decoded[1:]
            path.extend(decoded)
        if len(path) >= 2:
            return path
        start = leg.get("start_location") or {}
        end = leg.get("end_location") or {}
        try:
            return [
                [float(start["lat"]), float(start["lng"])],
                [float(end["lat"]), float(end["lng"])],
            ]
        except (KeyError, TypeError, ValueError):
            return []

    @staticmethod
    def _fmt(point: tuple[float, float]) -> str:
        return f"{point[0]},{point[1]}"

    @staticmethod
    def _points_key(
        points: list[tuple[float, float]], mode: str
    ) -> tuple[Any, ...]:
        rounded = tuple((round(lat, 5), round(lng, 5)) for lat, lng in points)
        return (mode, rounded)
