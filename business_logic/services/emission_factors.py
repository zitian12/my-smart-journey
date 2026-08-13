"""Transport emission factors (kg CO₂e per km).

Values follow the Sustainability Score Dashboard calculation spec
(DEFRA/EPA-style averages). Keep this table as the single source of truth
so carbon estimates and the sustainability score stay in sync.
"""

from __future__ import annotations

# Petrol private car is the conventional baseline for every comparison.
BASELINE_MODE = "driving"

EMISSION_FACTORS_KG_PER_KM: dict[str, float] = {
    "walking": 0.000,
    "foot": 0.000,
    "cycling": 0.000,
    "train": 0.041,
    "lrt": 0.041,
    "mrt": 0.041,
    "bus": 0.105,
    "motorcycle": 0.113,
    "driving": 0.171,
    "car": 0.171,
    "grab": 0.171,
    "private_car": 0.171,
    "ev": 0.070,
    "ev_car": 0.070,
    "electric": 0.070,
    "flight": 0.255,
    "domestic_flight": 0.255,
}

_CANONICAL_MODE: dict[str, str] = {
    "walking": "walking",
    "foot": "walking",
    "cycling": "cycling",
    "train": "train",
    "lrt": "train",
    "mrt": "train",
    "bus": "bus",
    "motorcycle": "motorcycle",
    "driving": "driving",
    "car": "driving",
    "grab": "driving",
    "private_car": "driving",
    "ev": "ev",
    "ev_car": "ev",
    "electric": "ev",
    "flight": "flight",
    "domestic_flight": "flight",
}


def normalize_mode(mode: str | None) -> str:
    """Map aliases (car, grab, foot) onto a canonical mode key."""
    key = str(mode or BASELINE_MODE).strip().lower()
    return _CANONICAL_MODE.get(key, BASELINE_MODE)


def emission_factor(mode: str | None) -> float:
    """kg CO₂e / km for a transport mode; unknown modes use petrol car."""
    key = str(mode or BASELINE_MODE).strip().lower()
    return EMISSION_FACTORS_KG_PER_KM.get(
        key, EMISSION_FACTORS_KG_PER_KM[BASELINE_MODE]
    )


def baseline_factor() -> float:
    """Petrol private-car factor used for the conventional baseline."""
    return EMISSION_FACTORS_KG_PER_KM[BASELINE_MODE]
