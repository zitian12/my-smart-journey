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


def route_projection(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[float, float]:
    """Project a point onto start→end.

    Returns (t, distance_km) where t is clamped to [0, 1] along the
    segment (0 = start, 1 = end) and distance_km is the equirectangular
    distance from the point to the closest point on the segment.
    """
    lat0 = math.radians((start[0] + end[0]) / 2.0)

    def to_xy(lat: float, lon: float) -> tuple[float, float]:
        x = math.radians(lon) * math.cos(lat0) * _EARTH_RADIUS_KM
        y = math.radians(lat) * _EARTH_RADIUS_KM
        return x, y

    px, py = to_xy(*point)
    ax, ay = to_xy(*start)
    bx, by = to_xy(*end)
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    if ab2 < 1e-9:
        return 0.0, haversine_km(point, start)
    t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab2))
    cx, cy = ax + t * abx, ay + t * aby
    return t, math.hypot(px - cx, py - cy)


def point_to_segment_km(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    """Approximate distance from a point to the start→end segment (km)."""
    _t, dist = route_projection(point, start, end)
    return dist


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


def split_polyline_by_waypoints(
    line: list[list[float]],
    waypoints: list[tuple[float, float]],
) -> list[list[list[float]]]:
    """Slice a road polyline into one chunk per consecutive waypoint pair."""
    if len(waypoints) < 2 or len(line) < 2:
        return []

    def nearest(wp: tuple[float, float], lo: int, hi: int) -> int:
        best_i = lo
        best_d = float("inf")
        for i in range(lo, max(lo + 1, hi)):
            point = line[i]
            dist = haversine_km((float(point[0]), float(point[1])), wp)
            if dist < best_d:
                best_d = dist
                best_i = i
        return best_i

    indices = [0] * len(waypoints)
    indices[0] = nearest(waypoints[0], 0, len(line))
    indices[-1] = nearest(waypoints[-1], indices[0], len(line))
    for k in range(1, len(waypoints) - 1):
        indices[k] = nearest(waypoints[k], indices[k - 1], len(line))
    for k in range(1, len(indices)):
        if indices[k] <= indices[k - 1]:
            indices[k] = min(len(line) - 1, indices[k - 1] + 1)

    chunks: list[list[list[float]]] = []
    for i in range(len(waypoints) - 1):
        start_i = indices[i]
        end_i = indices[i + 1]
        chunk = line[start_i : end_i + 1]
        if len(chunk) < 2:
            a = waypoints[i]
            b = waypoints[i + 1]
            chunk = [[a[0], a[1]], [b[0], b[1]]]
        chunks.append(chunk)
    return chunks
