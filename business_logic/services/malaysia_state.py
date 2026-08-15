"""Infer Malaysian state / federal territory from address text or coordinates."""

from __future__ import annotations

import re

from integration.external_api.geo import haversine_km
from services.destination_ai_service import MALAYSIA_STATES, _in_malaysia

# (canonical, alias) — longer aliases are matched first.
_STATE_ALIASES: list[tuple[str, str]] = [
    ("Kuala Lumpur", "federal territory of kuala lumpur"),
    ("Kuala Lumpur", "wilayah persekutuan kuala lumpur"),
    ("Kuala Lumpur", "wp kuala lumpur"),
    ("Kuala Lumpur", "kuala lumpur"),
    ("Putrajaya", "federal territory of putrajaya"),
    ("Putrajaya", "wilayah persekutuan putrajaya"),
    ("Putrajaya", "putrajaya"),
    ("Labuan", "federal territory of labuan"),
    ("Labuan", "wilayah persekutuan labuan"),
    ("Labuan", "wp labuan"),
    ("Labuan", "labuan"),
    ("Negeri Sembilan", "negeri sembilan"),
    ("Negeri Sembilan", "n. sembilan"),
    ("Penang", "pulau pinang"),
    ("Penang", "penang island"),
    ("Penang", "penang"),
    ("Melaka", "malacca"),
    ("Melaka", "melaka"),
    ("Terengganu", "terengganu"),
    ("Selangor", "selangor"),
    ("Sarawak", "sarawak"),
    ("Kelantan", "kelantan"),
    ("Pahang", "pahang"),
    ("Perlis", "perlis"),
    ("Johor", "johor"),
    ("Kedah", "kedah"),
    ("Perak", "perak"),
    ("Sabah", "sabah"),
]

_ALIASES_BY_LENGTH = sorted(_STATE_ALIASES, key=lambda item: len(item[1]), reverse=True)

# Approximate admin-centre coordinates for last-resort nearest-state fallback.
_STATE_CENTROIDS: dict[str, tuple[float, float]] = {
    "Johor": (1.4927, 103.7414),
    "Kedah": (6.1184, 100.3685),
    "Kelantan": (6.1254, 102.2381),
    "Melaka": (2.1896, 102.2501),
    "Negeri Sembilan": (2.7258, 101.9424),
    "Pahang": (3.8077, 103.3260),
    "Penang": (5.4141, 100.3288),
    "Perak": (4.5975, 101.0901),
    "Perlis": (6.4449, 100.1984),
    "Sabah": (5.9804, 116.0735),
    "Sarawak": (1.5533, 110.3592),
    "Selangor": (3.0738, 101.5183),
    "Terengganu": (5.3117, 103.1324),
    "Kuala Lumpur": (3.1390, 101.6869),
    "Labuan": (5.2831, 115.2308),
    "Putrajaya": (2.9264, 101.6964),
}

# KL / Putrajaya sit inside Selangor's broader area — check these first.
_PRIORITY_BOXES: list[tuple[str, tuple[float, float], tuple[float, float]]] = [
    ("Kuala Lumpur", (3.02, 3.25), (101.63, 101.76)),
    ("Putrajaya", (2.88, 2.97), (101.64, 101.75)),
    ("Labuan", (5.22, 5.40), (115.12, 115.32)),
    ("Penang", (5.10, 5.60), (100.10, 100.55)),
    ("Perlis", (6.20, 6.75), (100.05, 100.45)),
    ("Melaka", (2.00, 2.50), (102.05, 102.60)),
]


def infer_malaysia_state(
    address: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> str | None:
    """Return a canonical MALAYSIA_STATES value, or None if unknown."""
    from_address = _from_address(address)
    if from_address:
        return from_address
    return _from_coordinates(latitude, longitude)


def _from_address(address: str | None) -> str | None:
    text = re.sub(r"\s+", " ", (address or "").strip())
    if not text:
        return None

    parts = [part.strip() for part in text.split(",") if part.strip()]
    for part in reversed(parts):
        if part.casefold() in {"malaysia", "my"}:
            continue
        matched = _match_aliases(part)
        if matched:
            return matched
    return _match_aliases(text)


def _match_aliases(text: str) -> str | None:
    lowered = text.casefold()
    for canonical, alias in _ALIASES_BY_LENGTH:
        if canonical not in MALAYSIA_STATES:
            continue
        if re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", lowered):
            return canonical
    return None


def _in_box(
    latitude: float,
    longitude: float,
    lat_range: tuple[float, float],
    lng_range: tuple[float, float],
) -> bool:
    return lat_range[0] <= latitude <= lat_range[1] and lng_range[0] <= longitude <= lng_range[1]


def _from_coordinates(
    latitude: float | None,
    longitude: float | None,
) -> str | None:
    if not _in_malaysia(latitude, longitude):
        return None
    assert latitude is not None and longitude is not None

    for canonical, lat_range, lng_range in _PRIORITY_BOXES:
        if _in_box(latitude, longitude, lat_range, lng_range):
            return canonical

    nearest: str | None = None
    nearest_km = float("inf")
    point = (latitude, longitude)
    for canonical, centroid in _STATE_CENTROIDS.items():
        distance = haversine_km(point, centroid)
        if distance < nearest_km:
            nearest_km = distance
            nearest = canonical
    return nearest
