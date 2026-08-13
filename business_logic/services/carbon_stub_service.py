"""Temporary carbon estimate stub for itinerary generation.

Replace with a call to POST /carbon/estimate when that API is available.
Emission factors live in emission_factors.py (single source of truth).
"""

from __future__ import annotations

from typing import Any

from services.emission_factors import emission_factor


class CarbonStubService:
    """Stub matching the shared /carbon/estimate contract."""

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
            carbon_kg = round(distance_km * emission_factor(mode), 3)
            results.append({"carbon_kg": carbon_kg})
            total += carbon_kg
        return {"results": results, "total_carbon_kg": round(total, 3)}
