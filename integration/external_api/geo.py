"""Local geometry helpers — no external API calls."""

from __future__ import annotations

import math
from typing import Any

_EARTH_RADIUS_KM = 6371.0
_ROAD_FACTOR = 1.35


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in kilometres. Coordinates are (lat, lng)."""
    lat1, lng1 = a
    lat2, lng2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    h = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def haversine_duration_min(
    a: tuple[float, float],
    b: tuple[float, float],
    *,
    speed_kmh: float,
) -> float:
    """Estimated road duration in minutes from haversine × road factor."""
    road_km = haversine_km(a, b) * _ROAD_FACTOR
    return (road_km / max(speed_kmh, 1.0)) * 60.0


def estimate_route(
    a: tuple[float, float],
    b: tuple[float, float],
    *,
    speed_kmh: float = 50.0,
) -> dict[str, Any]:
    """Straight-line fallback when Google Directions is unavailable."""
    road_km = haversine_km(a, b) * _ROAD_FACTOR
    duration_min = max(1, int(round((road_km / max(speed_kmh, 1.0)) * 60.0)))
    return {
        "distance_km": round(road_km, 2),
        "duration_min": duration_min,
        "is_estimated": True,
        "path": [[a[0], a[1]], [b[0], b[1]]],
    }


def decode_polyline(encoded: str) -> list[list[float]]:
    """Decode a Google encoded polyline into [[lat, lng], ...]."""
    if not encoded:
        return []

    points: list[list[float]] = []
    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        result = 0
        shift = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lat += ~(result >> 1) if result & 1 else result >> 1

        result = 0
        shift = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lng += ~(result >> 1) if result & 1 else result >> 1

        points.append([lat / 1e5, lng / 1e5])

    return points
