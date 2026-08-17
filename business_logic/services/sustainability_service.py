"""Sustainability score, rating, and impact copy for an itinerary.

Formulas follow the Sustainability Score Dashboard calculation spec:
leg footprint, petrol-car baseline, reduction %, score = reduction %.
"""

from __future__ import annotations

from typing import Any

from services.emission_factors import (
    baseline_factor,
    emission_factor,
    normalize_mode,
)

_NO_DATA_MESSAGE = (
    "No confirmed transportation data is available to calculate a "
    "sustainability score."
)


def _round3(value: float) -> float:
    return round(float(value), 3)


def _round1(value: float) -> float:
    return round(float(value), 1)


def _place_name(place: Any) -> str:
    if isinstance(place, dict):
        return str(place.get("name") or "").strip()
    return str(place or "").strip()


def _selected_metrics(leg: dict[str, Any]) -> tuple[str, float]:
    selected = str(leg.get("selected_mode") or "driving")
    options = leg.get("transport_options") or []
    match = next(
        (opt for opt in options if str(opt.get("mode") or "") == selected),
        None,
    )
    if isinstance(match, dict):
        return selected, float(match.get("distance_km") or 0.0)
    return selected, float(leg.get("distance_km") or 0.0)


def rating_for_score(score: float) -> str:
    if score >= 80:
        return "excellent"
    if score >= 60:
        return "good"
    if score >= 40:
        return "moderate"
    return "low"


def impact_text_for_percent(reduction_percent: float) -> str:
    """Human-readable interpretation from the calculation spec §9."""
    pct = _round1(reduction_percent)
    if pct >= 70:
        return (
            f"Excellent! This itinerary produces {pct}% less carbon "
            "than the average route."
        )
    if pct >= 40:
        return (
            f"Good progress — this itinerary cuts carbon emissions by "
            f"{pct}% compared to driving."
        )
    if pct >= 1:
        return (
            f"This itinerary reduces emissions by {pct}%, but there's "
            "room to switch more legs to public transport."
        )
    return (
        "This itinerary currently matches private-vehicle emissions — "
        "consider public transport or walking for some legs."
    )


class SustainabilityService:
    """Compute the sustainability payload attached to an itinerary."""

    def evaluate_legs(self, legs: list[dict[str, Any]] | None) -> dict[str, Any]:
        rows = list(legs or [])
        breakdown_by_leg: list[dict[str, Any]] = []
        mode_carbon: dict[str, float] = {}
        mode_distance: dict[str, float] = {}
        total_footprint = 0.0
        baseline_footprint = 0.0
        distance_km = 0.0

        for index, leg in enumerate(rows, start=1):
            raw_mode, distance = _selected_metrics(leg)
            mode = normalize_mode(raw_mode)
            carbon = _round3(distance * emission_factor(raw_mode))
            baseline_leg = _round3(distance * baseline_factor())

            total_footprint += carbon
            baseline_footprint += baseline_leg
            distance_km += distance
            mode_carbon[mode] = mode_carbon.get(mode, 0.0) + carbon
            mode_distance[mode] = mode_distance.get(mode, 0.0) + distance

            from_place = leg.get("from_place") or {}
            to_place = leg.get("to_place") or {}
            breakdown_by_leg.append(
                {
                    "index": index,
                    "from_name": _place_name(from_place),
                    "to": _place_name(to_place),
                    "day": int(leg.get("day") or 1),
                    "distance_km": _round3(distance),
                    "carbon_kg": carbon,
                    "mode": mode,
                }
            )

        total_footprint = _round3(total_footprint)
        baseline_footprint = _round3(baseline_footprint)
        distance_km = _round3(distance_km)

        if baseline_footprint <= 0:
            return {
                "score": 0.0,
                "rating": "low",
                "total_footprint_kg": 0.0,
                "baseline_footprint_kg": 0.0,
                "emissions_reduced_kg": 0.0,
                "reduction_percent": 0.0,
                "distance_km": distance_km,
                "modes_used": [],
                "breakdown_by_mode": [],
                "breakdown_by_leg": breakdown_by_leg,
                "impact_text": _NO_DATA_MESSAGE,
                "has_transport_data": False,
            }

        emissions_reduced = max(0.0, _round3(baseline_footprint - total_footprint))
        reduction_percent = _round1((emissions_reduced / baseline_footprint) * 100)
        reduction_percent = max(0.0, min(100.0, reduction_percent))
        score = reduction_percent

        modes_used = list(mode_carbon.keys())
        breakdown_by_mode = []
        for mode in modes_used:
            carbon = _round3(mode_carbon[mode])
            share = (
                _round1((carbon / total_footprint) * 100)
                if total_footprint > 0
                else (100.0 if len(modes_used) == 1 else 0.0)
            )
            breakdown_by_mode.append(
                {
                    "mode": mode,
                    "carbon_kg": carbon,
                    "distance_km": _round3(mode_distance[mode]),
                    "share_percent": share,
                }
            )

        return {
            "score": score,
            "rating": rating_for_score(score),
            "total_footprint_kg": total_footprint,
            "baseline_footprint_kg": baseline_footprint,
            "emissions_reduced_kg": emissions_reduced,
            "reduction_percent": reduction_percent,
            "distance_km": distance_km,
            "modes_used": modes_used,
            "breakdown_by_mode": breakdown_by_mode,
            "breakdown_by_leg": breakdown_by_leg,
            "impact_text": impact_text_for_percent(reduction_percent),
            "has_transport_data": True,
        }

    def evaluate_itinerary(self, itinerary: dict[str, Any] | None) -> dict[str, Any]:
        payload = itinerary if isinstance(itinerary, dict) else {}
        existing = payload.get("sustainability")
        if isinstance(existing, dict) and existing.get("score") is not None:
            return existing
        return self.evaluate_legs(payload.get("legs") or [])
