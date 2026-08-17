"""Shared stay-time defaults for itinerary selection and packing."""

from __future__ import annotations

DEFAULT_STAY_MIN = 90
DEFAULT_HOURS_PER_DAY = 8
CATEGORY_STAY_MIN: dict[str, int] = {
    "nature": 120,
    "culture": 90,
    "heritage": 90,
    "adventure": 150,
    "shopping": 90,
}


def stay_minutes_for_slug(category_slug: str | None) -> int:
    """Return planned visit minutes from category, else the default stay."""
    slug = (category_slug or "").lower()
    for key, value in CATEGORY_STAY_MIN.items():
        if key in slug:
            return value
    return DEFAULT_STAY_MIN
