"""Google Maps Directions + Geocoding client (credit-conscious)."""

from __future__ import annotations

import asyncio
import html
import logging
import os
import re
import time
from typing import Any

import requests

from integration.external_api.geo import decode_polyline, estimate_route, split_polyline_by_waypoints

logger = logging.getLogger(__name__)

DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_MAX_WAYPOINTS = 25
_TRANSIT_FILTER = "bus|subway|tram"
_HTML_TAG = re.compile(r"<[^>]+>")
_MODE_SPEEDS_KMH = {
    "driving": 50.0,
    "walking": 4.5,
    "bicycling": 15.0,
    "transit": 35.0,
}
_RAIL_VEHICLES = {
    "SUBWAY",
    "METRO_RAIL",
    "TRAM",
    "RAIL",
    "HEAVY_RAIL",
    "COMMUTER_RAIL",
    "MONORAIL",
    "HIGH_SPEED_TRAIN",
}
_UNAVAILABLE_LEG: dict[str, Any] = {
    "distance_km": 0.0,
    "duration_min": 0,
    "is_estimated": True,
    "unavailable": True,
    "path": [],
    "steps": [],
}
_GeocodeHit = tuple[float | None, float | None, str | None]
_GEOCODE_MISS: _GeocodeHit = (None, None, None)


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
        self._geocode_cache: dict[str, _GeocodeHit] = {}

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

        Driving/walking: one Directions request (chunked at 25 waypoints).
        Transit: one request per consecutive pair (waypoints are unsupported).
        Failed lookups are cached so they are not retried.
        """
        if len(points) < 2:
            return []

        cache_key = self._points_key(points, mode)
        cached = self._route_cache.get(cache_key)
        if cached is not None:
            return cached

        if mode == "transit":
            legs = self._transit_legs(points)
            self._route_cache[cache_key] = legs
            return legs

        legs: list[dict[str, Any]] = []
        cursor = 0
        speed = _MODE_SPEEDS_KMH.get(mode, _MODE_SPEEDS_KMH["driving"])
        while cursor < len(points) - 1:
            chunk = points[cursor : cursor + _MAX_WAYPOINTS + 2]
            if len(chunk) < 2:
                break
            chunk_legs = self._directions_chunk(chunk, mode=mode)
            if chunk_legs is None:
                for i in range(cursor, len(points) - 1):
                    estimated = estimate_route(
                        points[i], points[i + 1], speed_kmh=speed
                    )
                    legs.append(estimated)
                    # Cache the miss so a later pair call does not re-hit Google.
                    pair_key = self._points_key(
                        [points[i], points[i + 1]], mode
                    )
                    self._route_cache.setdefault(pair_key, [estimated])
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
        hit = legs[0]
        if hit.get("is_estimated") or hit.get("unavailable"):
            return None
        return hit

    def _transit_legs(
        self, points: list[tuple[float, float]]
    ) -> list[dict[str, Any]]:
        """One cached transit call per consecutive pair — no waypoints."""
        legs: list[dict[str, Any]] = []
        for index in range(len(points) - 1):
            pair = [points[index], points[index + 1]]
            pair_key = self._points_key(pair, "transit")
            cached = self._route_cache.get(pair_key)
            if cached is not None:
                legs.append(cached[0] if cached else dict(_UNAVAILABLE_LEG))
                continue
            chunk = self._directions_chunk(pair, mode="transit")
            if not chunk:
                miss = dict(_UNAVAILABLE_LEG)
                self._route_cache[pair_key] = [miss]
                legs.append(miss)
                continue
            self._route_cache[pair_key] = chunk
            legs.append(chunk[0])
        return legs

    async def geocode(self, query: str) -> _GeocodeHit:
        """Return (lat, lng, formatted_address) for a query, or miss on failure."""
        if not query.strip():
            return _GEOCODE_MISS
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
            latitude, longitude, _formatted = await self.geocode(query)
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
        if mode == "transit":
            params["departure_time"] = str(int(time.time()))
            params["transit_mode"] = _TRANSIT_FILTER
        elif len(points) > 2:
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

        overview = decode_polyline(
            (payload["routes"][0].get("overview_polyline") or {}).get("points")
            or ""
        )
        overview_chunks = (
            split_polyline_by_waypoints(overview, points)
            if len(overview) >= 2
            else []
        )

        result: list[dict[str, Any]] = []
        for index, leg in enumerate(api_legs):
            distance_m = float((leg.get("distance") or {}).get("value") or 0)
            duration_s = float((leg.get("duration") or {}).get("value") or 0)
            path = self._leg_path(leg)
            if len(path) < 3 and index < len(overview_chunks):
                overview_path = overview_chunks[index]
                if len(overview_path) >= 2:
                    path = overview_path
            if distance_m <= 0:
                return None
            row: dict[str, Any] = {
                "distance_km": round(distance_m / 1000.0, 2),
                "duration_min": max(1, int(round(duration_s / 60.0))),
                "is_estimated": False,
                "path": path,
                "steps": self._parse_leg_steps(leg, route_mode=mode),
            }
            if mode == "transit":
                row["transit_kind"] = self._transit_kind(leg)
            result.append(row)
        return result

    def _geocode_sync(self, query: str) -> _GeocodeHit:
        cache_key = query.strip().lower()
        if cache_key in self._geocode_cache:
            return self._geocode_cache[cache_key]

        if not self.available:
            self._geocode_cache[cache_key] = _GEOCODE_MISS
            return _GEOCODE_MISS

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
            self._geocode_cache[cache_key] = _GEOCODE_MISS
            return _GEOCODE_MISS

        status = payload.get("status")
        results = payload.get("results") or []
        if status != "OK" or not results:
            logger.warning(
                "Google Geocoding status=%s query=%s", status, query
            )
            self._geocode_cache[cache_key] = _GEOCODE_MISS
            return _GEOCODE_MISS

        hit = results[0]
        location = (hit.get("geometry") or {}).get("location") or {}
        try:
            lat = float(location["lat"])
            lng = float(location["lng"])
        except (KeyError, TypeError, ValueError):
            logger.warning("Google Geocoding returned invalid coords for %s", query)
            self._geocode_cache[cache_key] = _GEOCODE_MISS
            return _GEOCODE_MISS

        formatted = str(hit.get("formatted_address") or "").strip() or None
        coords: _GeocodeHit = (lat, lng, formatted)
        self._geocode_cache[cache_key] = coords
        return coords

    @staticmethod
    def _plain_instruction(raw: str) -> str:
        text = _HTML_TAG.sub(" ", html.unescape(raw or ""))
        return re.sub(r"\s+", " ", text).strip()

    @classmethod
    def _parse_leg_steps(
        cls, leg: dict[str, Any], *, route_mode: str
    ) -> list[dict[str, Any]]:
        parsed: list[dict[str, Any]] = []
        for step in leg.get("steps") or []:
            if not isinstance(step, dict):
                continue
            nested = step.get("steps") or []
            instruction = cls._plain_instruction(
                str(step.get("html_instructions") or "")
            )
            if (
                route_mode in {"driving", "walking"}
                and isinstance(nested, list)
                and nested
                and not instruction
            ):
                for child in nested:
                    if not isinstance(child, dict):
                        continue
                    row = cls._parse_one_step(child, route_mode=route_mode)
                    if row:
                        parsed.append(row)
                continue
            row = cls._parse_one_step(step, route_mode=route_mode)
            if row:
                parsed.append(row)
        return parsed

    @classmethod
    def _parse_one_step(
        cls, step: dict[str, Any], *, route_mode: str
    ) -> dict[str, Any] | None:
        travel = str(step.get("travel_mode") or "").upper()
        distance_m = float((step.get("distance") or {}).get("value") or 0)
        duration_s = float((step.get("duration") or {}).get("value") or 0)
        instruction = cls._plain_instruction(str(step.get("html_instructions") or ""))
        duration_min = max(0, int(round(duration_s / 60.0)))

        if travel == "TRANSIT":
            details = step.get("transit_details") or {}
            line = details.get("line") or {}
            vehicle = line.get("vehicle") or {}
            agencies = line.get("agencies") or []
            agency = ""
            if agencies and isinstance(agencies[0], dict):
                agency = str(agencies[0].get("name") or "").strip()
            vtype = str(vehicle.get("type") or "").upper()
            name = str(line.get("name") or "").strip()
            short_name = str(line.get("short_name") or "").strip()
            display = name or short_name
            if name and short_name and short_name.lower() not in name.lower():
                display = f"{name} ({short_name})"
            from_stop = str(
                (details.get("departure_stop") or {}).get("name") or ""
            ).strip()
            to_stop = str((details.get("arrival_stop") or {}).get("name") or "").strip()
            num_stops = details.get("num_stops")
            rail = vtype in _RAIL_VEHICLES
            return {
                "kind": "transit",
                "instruction": instruction or display,
                "line": display,
                "agency": agency,
                "vehicle": "train" if rail else "bus",
                "vehicle_type": vtype,
                "from_stop": from_stop,
                "to_stop": to_stop,
                "num_stops": int(num_stops) if num_stops is not None else None,
                "distance_m": int(round(distance_m)),
                "duration_min": max(1, duration_min) if duration_s else 1,
            }

        kind = "walk"
        if route_mode == "driving" and travel != "WALKING":
            kind = "drive"
        elif route_mode == "walking" or travel == "WALKING":
            kind = "walk"
        elif route_mode != "transit":
            kind = "drive"

        maneuver = str(step.get("maneuver") or "").strip() or None
        if not instruction and not distance_m:
            return None
        return {
            "kind": kind,
            "instruction": instruction,
            "maneuver": maneuver,
            "distance_m": int(round(distance_m)),
            "duration_min": duration_min,
        }

    @staticmethod
    def _transit_kind(leg: dict[str, Any]) -> str:
        """Return 'train' when rail distance dominates, otherwise 'bus'."""
        rail_m = 0.0
        bus_m = 0.0
        for step in leg.get("steps") or []:
            if str(step.get("travel_mode") or "").upper() != "TRANSIT":
                continue
            distance_m = float((step.get("distance") or {}).get("value") or 0)
            vehicle = (
                ((step.get("transit_details") or {}).get("line") or {}).get(
                    "vehicle"
                )
                or {}
            )
            vtype = str(vehicle.get("type") or "").upper()
            if vtype in _RAIL_VEHICLES:
                rail_m += distance_m
            else:
                bus_m += distance_m
        if rail_m > bus_m:
            return "train"
        return "bus"

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
        if mode == "transit":
            return (mode, _TRANSIT_FILTER, rounded)
        return (mode, rounded)
