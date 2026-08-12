"""Temporary carbon estimate stub for itinerary generation.

Replace with a call to POST /carbon/estimate when that API is available.
"""

from __future__ import annotations

from typing import Any


class CarbonStubService:
    """Stub matching the shared /carbon/estimate contract."""

    _EMISSION_FACTORS_KG_PER_KM: dict[str, float] = {
        "driving": 0.171,
        "car": 0.171,
        "bus": 0.089,
        "train": 0.041,
        "walking": 0.0,
        "foot": 0.0,
        "cycling": 0.0,
    }

    def estimate(self, legs: list[dict[str, Any]]) -> dict[str, Any]:
        """Estimate carbon for legs of {mode, distance_km}.

        Returns:
            {
              "results": [{"carbon_kg": float}, ...],
              "total_carbon_kg": float,
            }
        """
        results: list[dict[str, float]] = []
        total = 0.0
        for leg in legs:
            mode = str(leg.get("mode") or "driving").lower()
            distance_km = float(leg.get("distance_km") or 0.0)
            factor = self._EMISSION_FACTORS_KG_PER_KM.get(mode, 0.171)
            carbon_kg = round(distance_km * factor, 3)
            results.append({"carbon_kg": carbon_kg})
            total += carbon_kg
        return {"results": results, "total_carbon_kg": round(total, 3)}

