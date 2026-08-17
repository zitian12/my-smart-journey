"""OSM OSRM road/foot geometry — no Google quota."""

from __future__ import annotations

import logging
from typing import Any

import requests

from integration.external_api.geo import split_polyline_by_waypoints

logger = logging.getLogger(__name__)

OSRM_BASE = "https://router.project-osrm.org/route/v1"
_PROFILES = {
    "driving": "driving",
    "walking": "foot",
    "foot": "foot",
}
_USER_AGENT = "my-smart-journey/1.0"
_MIN_LAT, _MAX_LAT = 0.85, 7.52
_MIN_LNG, _MAX_LNG = 99.6, 119.3


class OsrmClient:
    """Malaysia-scoped OSRM route geometry with an in-process cache."""

    def __init__(self, *, timeout: float = 12.0) -> None:
        self._timeout = timeout
        self._cache: dict[tuple[Any, ...], list[dict[str, Any]]] = {}

    def route_waypoints(
        self,
        points: list[tuple[float, float]],
        *,
        mode: str = "driving",
        include_steps: bool = False,
    ) -> list[dict[str, Any]]:
        """One OSRM request for the full waypoint list. Empty on failure."""
        profile = _PROFILES.get(mode)
        if not profile or len(points) < 2:
            return []
        if any(not self._in_malaysia(lat, lng) for lat, lng in points):
            return []

        cache_key = (
            profile,
            include_steps,
            tuple((round(lat, 5), round(lng, 5)) for lat, lng in points),
        )
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        legs = self._route_sync(
            points, profile=profile, include_steps=include_steps
        )
        self._cache[cache_key] = legs
        return legs

    def _route_sync(
        self,
        points: list[tuple[float, float]],
        *,
        profile: str,
        include_steps: bool = False,
    ) -> list[dict[str, Any]]:
        coords = ";".join(f"{lng},{lat}" for lat, lng in points)
        try:
            response = requests.get(
                f"{OSRM_BASE}/{profile}/{coords}",
                params={
                    "overview": "full",
                    "geometries": "geojson",
                    "steps": "true" if include_steps else "false",
                },
                timeout=self._timeout,
                headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            logger.warning("OSRM route failed: %s", exc)
            return []

        if payload.get("code") != "Ok":
            logger.warning("OSRM status=%s", payload.get("code"))
            return []
        routes = payload.get("routes") or []
        if not routes:
            return []

        route = routes[0]
        api_legs = route.get("legs") or []
        if len(api_legs) != len(points) - 1:
            logger.warning(
                "OSRM leg count mismatch: got %s expected %s",
                len(api_legs),
                len(points) - 1,
            )
            return []

        line = self._geojson_line(route.get("geometry"))
        chunks = split_polyline_by_waypoints(line, points) if line else []

        result: list[dict[str, Any]] = []
        for index, api_leg in enumerate(api_legs):
            distance_m = float(api_leg.get("distance") or 0)
            duration_s = float(api_leg.get("duration") or 0)
            path = chunks[index] if index < len(chunks) else []
            if len(path) < 2:
                a = points[index]
                b = points[index + 1]
                path = [[a[0], a[1]], [b[0], b[1]]]
            if distance_m <= 0:
                return []
            row: dict[str, Any] = {
                "distance_km": round(distance_m / 1000.0, 2),
                "duration_min": max(1, int(round(duration_s / 60.0))),
                "is_estimated": False,
                "path": path,
            }
            if include_steps:
                row["steps"] = self._parse_leg_steps(
                    api_leg, kind="walk" if profile == "foot" else "drive"
                )
            result.append(row)
        return result

    @classmethod
    def _parse_leg_steps(
        cls, api_leg: dict[str, Any], *, kind: str
    ) -> list[dict[str, Any]]:
        parsed: list[dict[str, Any]] = []
        for step in api_leg.get("steps") or []:
            if not isinstance(step, dict):
                continue
            maneuver = step.get("maneuver") or {}
            mtype = str(maneuver.get("type") or "").strip()
            modifier = str(maneuver.get("modifier") or "").strip()
            road = str(step.get("name") or "").strip()
            instruction = cls._osrm_instruction(mtype, modifier, road)
            distance_m = float(step.get("distance") or 0)
            duration_s = float(step.get("duration") or 0)
            if not instruction and distance_m <= 0:
                continue
            parsed.append(
                {
                    "kind": kind,
                    "instruction": instruction,
                    "maneuver": "-".join(part for part in (mtype, modifier) if part)
                    or None,
                    "distance_m": int(round(distance_m)),
                    "duration_min": max(0, int(round(duration_s / 60.0))),
                }
            )
        return parsed

    @staticmethod
    def _osrm_instruction(mtype: str, modifier: str, road: str) -> str:
        action = " ".join(part for part in (mtype.replace("_", " "), modifier) if part)
        action = action[:1].upper() + action[1:] if action else "Continue"
        if road:
            if mtype in {"turn", "new name", "continue", "fork", "end of road"}:
                return f"{action} onto {road}"
            return f"{action} on {road}"
        return action

    @staticmethod
    def _geojson_line(geometry: Any) -> list[list[float]]:
        if not isinstance(geometry, dict):
            return []
        coords = geometry.get("coordinates") or []
        line: list[list[float]] = []
        for pair in coords:
            if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                continue
            lng, lat = pair[0], pair[1]
            try:
                line.append([float(lat), float(lng)])
            except (TypeError, ValueError):
                continue
        return line

    @staticmethod
    def _in_malaysia(lat: float, lng: float) -> bool:
        return _MIN_LAT <= lat <= _MAX_LAT and _MIN_LNG <= lng <= _MAX_LNG
