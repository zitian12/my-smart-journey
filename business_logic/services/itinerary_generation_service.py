"""Generate day-packed itineraries from traveller inputs."""

from __future__ import annotations

import math
import re
from itertools import permutations
from typing import Any

from integration.external_api import GoogleMapsClient, OsrmClient
from integration.external_api.geo import (
    estimate_route,
    haversine_duration_min,
    haversine_km,
    route_projection,
)
from services.carbon_stub_service import CarbonStubService
from services.itinerary_defaults import (
    DEFAULT_HOURS_PER_DAY,
    DEFAULT_STAY_MIN,
    stay_minutes_for_slug,
)
from services.itinerary_poi_selection_service import ItineraryPoiSelectionService
from services.sustainability_service import SustainabilityService

_DEFAULT_STAY_MIN = DEFAULT_STAY_MIN
_DEFAULT_HOURS_PER_DAY = DEFAULT_HOURS_PER_DAY
_SHARED_MAPS = GoogleMapsClient()
_SHARED_OSRM = OsrmClient()
_SAME_CITY_KM = 40.0
_MAX_WALK_KM = 3.0
_MAX_WALK_MIN = 45
_MODE_SPEEDS_KMH = {
    "driving": 50.0,
    "walking": 4.5,
    "bus": 35.0,
    "transit": 35.0,
    "train": 60.0,
}


def _normalize_preferred_mode(mode: str | None) -> str:
    key = str(mode or "driving").strip().lower()
    if key in {"walking", "walk", "foot"}:
        return "walking"
    if key in {"transit", "bus", "train", "public_transport", "public-transport"}:
        return "transit"
    return "driving"


def _pack_speed_kmh(mode: str) -> float:
    if mode == "walking":
        return _MODE_SPEEDS_KMH["walking"]
    if mode == "transit":
        return _MODE_SPEEDS_KMH["transit"]
    return _MODE_SPEEDS_KMH["driving"]


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    return slug.strip("-") or "place"


def _clamp_stay(minutes: int | None) -> int:
    if minutes is None:
        return _DEFAULT_STAY_MIN
    return max(30, min(480, int(minutes)))


def _stay_min(place: dict[str, Any]) -> int:
    if place.get("stay_min"):
        return _clamp_stay(int(place["stay_min"]))
    if place.get("recommended_stay_minutes"):
        return _clamp_stay(int(place["recommended_stay_minutes"]))
    return stay_minutes_for_slug(place.get("category_slug"))


def _interest_score(place: dict[str, Any], interests: list[str]) -> float:
    if not interests:
        return 0.0
    hay = " ".join(
        str(place.get(k) or "") for k in ("name", "category_slug", "tags")
    ).lower()
    return float(sum(1 for interest in interests if interest.lower() in hay))


class ItineraryGenerationService:
    """Resolve places, order stops, pack days, and build transport legs."""

    def __init__(
        self,
        carbon_service: CarbonStubService | None = None,
        maps_client: GoogleMapsClient | None = None,
        osrm_client: OsrmClient | None = None,
    ) -> None:
        self._carbon = carbon_service or CarbonStubService()
        self._sustainability = SustainabilityService()
        self._maps = maps_client or _SHARED_MAPS
        self._osrm = osrm_client if osrm_client is not None else _SHARED_OSRM
        self._route_cache: dict[tuple[str, float, float, float, float], dict[str, Any]] = {}
        self._preferred_mode = "driving"

    def generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        # Fresh walking-pair cache per generate; Directions itself is cached on the client.
        self._route_cache = {}
        destinations_raw = payload.get("destinations") or []
        if not destinations_raw:
            raise ValueError("At least one destination is required.")

        start = self._resolve_place(payload.get("start") or payload.get("start_location"))
        end = self._resolve_place(payload.get("end") or payload.get("end_location"))
        interests = [str(i) for i in (payload.get("interests") or [])]
        preferred_mode = _normalize_preferred_mode(payload.get("preferred_mode"))
        self._preferred_mode = preferred_mode

        resolved: list[dict[str, Any]] = []
        excluded: list[str] = []
        notes: list[str] = []
        auto_days = payload.get("days") is None
        auto_hours = payload.get("hours_per_day") is None
        auto_nights = payload.get("nights") is None

        hours_per_day = int(payload.get("hours_per_day") or _DEFAULT_HOURS_PER_DAY)

        for item in destinations_raw:
            try:
                place = self._resolve_place(item)
                resolved.append(place)
            except ValueError:
                name = ""
                if isinstance(item, dict):
                    name = str(item.get("name") or "")
                elif isinstance(item, str):
                    name = item
                if name:
                    excluded.append(name)
                notes.append(
                    "Select a destination from the list (system destinations with map coordinates)."
                )

        if not resolved:
            raise ValueError(
                "Select a destination from the list (system destinations with map coordinates)."
            )

        ordered = self._order_for_generate(start, end, resolved, interests)

        if payload.get("days") is None:
            days = self._estimate_days(
                start, end, ordered, hours_per_day=hours_per_day
            )
        else:
            days = max(1, min(30, int(payload["days"])))

        if payload.get("nights") is None:
            nights = max(0, days - 1)
        else:
            nights = max(0, min(30, int(payload["nights"])))

        daily_budget_min = hours_per_day * 60
        feasible, more_excluded, forced_oversize = self._select_feasible_stops(
            ordered,
            days=days,
            daily_budget_min=daily_budget_min,
            start=start,
            end=end,
        )
        excluded.extend(more_excluded)

        path = self._build_path(start, feasible, end)
        if self._has_assigned_days(feasible):
            scheduled = self._apply_assigned_days(path, days=days)
        else:
            scheduled = self._schedule_days(
                path, days=days, daily_budget_min=daily_budget_min
            )
        max_stop_day = max(
            (
                int(p.get("day") or 1)
                for p in scheduled
                if p.get("role") == "stop"
            ),
            default=0,
        )
        if max_stop_day < days and sum(1 for p in scheduled if p.get("role") == "stop") < days:
            notes.append(
                f"Only enough catalog stops to fill {max(max_stop_day, 1)} of "
                f"{days} day(s); remaining days are shown empty."
            )
        legs = self._build_legs(
            scheduled, preferred_mode=preferred_mode, notes=notes
        )
        self._note_straight_line_route(notes, legs)
        day_totals = self._build_day_totals(scheduled, legs, days=days)

        ordered_destinations: list[dict[str, Any]] = []
        order = 1
        for place in scheduled:
            if place.get("role") in {"start", "end"}:
                continue
            ordered_destinations.append(
                {
                    "id": place["id"],
                    "name": place["name"],
                    "order": order,
                    "day": int(place.get("day") or 1),
                    "stay_min": int(place.get("stay_min") or _DEFAULT_STAY_MIN),
                    "latitude": place.get("latitude"),
                    "longitude": place.get("longitude"),
                    "category_slug": place.get("category_slug"),
                    "hub_label": place.get("hub_label") or None,
                }
            )
            order += 1

        travel_duration = sum(int(leg["duration_min"]) for leg in legs)
        stay_duration = sum(int(d["stay_min"]) for d in ordered_destinations)
        total_distance = round(sum(float(leg["distance_km"]) for leg in legs), 2)
        total_carbon = round(
            sum(
                next(
                    (
                        float(opt["carbon_kg"])
                        for opt in leg["transport_options"]
                        if opt.get("mode") == leg.get("selected_mode")
                    ),
                    0.0,
                )
                for leg in legs
            ),
            3,
        )

        if auto_days or auto_hours or auto_nights:
            notes.append(
                f"System planned {days} day(s) / {nights} night(s) "
                f"at {hours_per_day} hrs/day, optimized stop order and transport."
            )
        if forced_oversize:
            notes.append(
                "At least one stop exceeds the daily hours budget alone; "
                "it was kept so the trip is not empty."
            )
        if excluded:
            notes.append(
                f"Excluded {len(excluded)} stop(s) that could not fit within "
                f"{hours_per_day} hrs/day (visit + travel)."
            )
        for day_total in day_totals:
            if int(day_total["duration_min"]) > daily_budget_min:
                notes.append(
                    self._over_budget_note(
                        int(day_total["day"]), hours_per_day
                    )
                )

        return {
            "start_location": start["name"],
            "end_location": end["name"],
            "start_latitude": float(start["latitude"]),
            "start_longitude": float(start["longitude"]),
            "end_latitude": float(end["latitude"]),
            "end_longitude": float(end["longitude"]),
            "days": days,
            "nights": nights,
            "hours_per_day": hours_per_day,
            "interests": interests,
            "preferred_mode": preferred_mode,
            "destinations": ordered_destinations,
            "legs": legs,
            "totals": {
                "duration_min": travel_duration + stay_duration,
                "travel_duration_min": travel_duration,
                "stay_duration_min": stay_duration,
                "distance_km": total_distance,
                "carbon_kg": total_carbon,
            },
            "day_totals": day_totals,
            "excluded_destinations": excluded,
            "notes": notes,
            "sustainability": self._sustainability.evaluate_legs(legs),
        }

    def recompute(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Rebuild legs/totals from an explicit user stop list.

        Default: preserves array/order and optional day/stay.
        With optimize_order=True (Add stop): re-order by driving corridor and
        re-pack days. Never drops stops for feasibility — over-budget noted only.
        """
        self._route_cache = {}
        destinations_raw = list(payload.get("destinations") or [])
        optimize_order = bool(payload.get("optimize_order"))

        start = self._resolve_place(payload.get("start") or payload.get("start_location"))
        end = self._resolve_place(payload.get("end") or payload.get("end_location"))
        interests = [str(i) for i in (payload.get("interests") or [])]
        preferred_mode = _normalize_preferred_mode(payload.get("preferred_mode"))
        self._preferred_mode = preferred_mode
        hours_per_day = int(payload.get("hours_per_day") or _DEFAULT_HOURS_PER_DAY)
        days = max(1, min(30, int(payload.get("days") or 1)))
        if payload.get("nights") is None:
            nights = max(0, days - 1)
        else:
            nights = max(0, min(30, int(payload["nights"])))
        daily_budget_min = hours_per_day * 60
        notes: list[str] = []

        resolved: list[dict[str, Any]] = []
        for index, item in enumerate(destinations_raw):
            if not isinstance(item, dict):
                item = {"name": item}
            place = self._resolve_place(item)
            if item.get("stay_min") is not None:
                place["stay_min"] = _clamp_stay(int(item["stay_min"]))
            elif item.get("recommended_stay_minutes") is not None:
                place["stay_min"] = _clamp_stay(int(item["recommended_stay_minutes"]))
            if item.get("day") is not None:
                place["user_day"] = max(1, min(days, int(item["day"])))
                place["day"] = place["user_day"]
            if item.get("hub_label"):
                place["hub_label"] = str(item["hub_label"])
            if item.get("order") is not None:
                place["user_order"] = int(item["order"])
            else:
                place["user_order"] = index + 1
            resolved.append(place)

        if optimize_order and resolved:
            resolved = self._assign_days_along_route(
                start, end, resolved, days=days
            )
            resolved = self._order_stops_grouped(
                start, end, resolved, interests
            )
            notes.append(
                "Stop order was re-planned within each day's area."
            )
        else:
            resolved.sort(key=lambda p: int(p.get("user_order") or 0))

        path = self._build_path(start, resolved, end)
        has_user_days = (
            not optimize_order
            and bool(resolved)
            and all(p.get("user_day") is not None for p in resolved)
        )
        if has_user_days:
            scheduled = self._apply_user_days(path, days=days)
        elif self._has_assigned_days(resolved):
            scheduled = self._apply_assigned_days(path, days=days)
        else:
            scheduled = self._schedule_days(
                path, days=days, daily_budget_min=daily_budget_min
            )
            # Re-attach any stops dropped by overflow on last day.
            kept_ids = {
                str(p["id"]) for p in scheduled if p.get("role") == "stop"
            }
            missing = [p for p in resolved if str(p["id"]) not in kept_ids]
            if missing:
                last_day = days
                for stop in missing:
                    scheduled.insert(
                        -1,
                        {
                            **stop,
                            "role": "stop",
                            "day": last_day,
                            "stay_min": int(stop.get("stay_min") or _DEFAULT_STAY_MIN),
                        },
                    )
                notes.append(
                    "Some stops exceeded the daily hours budget; they were kept "
                    f"on day {last_day} without removing them."
                )

        legs = self._build_legs(
            scheduled, preferred_mode=preferred_mode, notes=notes
        )
        self._note_straight_line_route(notes, legs)
        day_totals = self._build_day_totals(scheduled, legs, days=days)

        ordered_destinations: list[dict[str, Any]] = []
        order = 1
        for place in scheduled:
            if place.get("role") in {"start", "end"}:
                continue
            ordered_destinations.append(
                {
                    "id": place["id"],
                    "name": place["name"],
                    "order": order,
                    "day": int(place.get("day") or 1),
                    "stay_min": int(place.get("stay_min") or _DEFAULT_STAY_MIN),
                    "latitude": place.get("latitude"),
                    "longitude": place.get("longitude"),
                    "category_slug": place.get("category_slug"),
                    "hub_label": place.get("hub_label") or None,
                }
            )
            order += 1

        travel_duration = sum(int(leg["duration_min"]) for leg in legs)
        stay_duration = sum(int(d["stay_min"]) for d in ordered_destinations)
        total_distance = round(sum(float(leg["distance_km"]) for leg in legs), 2)
        total_carbon = round(
            sum(
                next(
                    (
                        float(opt["carbon_kg"])
                        for opt in leg["transport_options"]
                        if opt.get("mode") == leg.get("selected_mode")
                    ),
                    0.0,
                )
                for leg in legs
            ),
            3,
        )

        for day_total in day_totals:
            if int(day_total["duration_min"]) > daily_budget_min:
                notes.append(
                    self._over_budget_note(
                        int(day_total["day"]), hours_per_day
                    )
                )

        return {
            "start_location": start["name"],
            "end_location": end["name"],
            "start_latitude": float(start["latitude"]),
            "start_longitude": float(start["longitude"]),
            "end_latitude": float(end["latitude"]),
            "end_longitude": float(end["longitude"]),
            "days": days,
            "nights": nights,
            "hours_per_day": hours_per_day,
            "interests": interests,
            "preferred_mode": preferred_mode,
            "destinations": ordered_destinations,
            "legs": legs,
            "totals": {
                "duration_min": travel_duration + stay_duration,
                "travel_duration_min": travel_duration,
                "stay_duration_min": stay_duration,
                "distance_km": total_distance,
                "carbon_kg": total_carbon,
            },
            "day_totals": day_totals,
            "excluded_destinations": [],
            "notes": notes,
            "sustainability": self._sustainability.evaluate_legs(legs),
        }

    def _apply_user_days(
        self,
        path: list[dict[str, Any]],
        *,
        days: int,
    ) -> list[dict[str, Any]]:
        """Assign days from user_day on stops; start=1, end=last stop day."""
        scheduled: list[dict[str, Any]] = []
        max_stop_day = 1
        for place in path:
            row = dict(place)
            role = row.get("role")
            if role == "start":
                row["day"] = 1
                row["stay_min"] = 0
            elif role == "end":
                row["day"] = min(days, max(1, max_stop_day))
                row["stay_min"] = 0
            else:
                day = max(1, min(days, int(row.get("user_day") or 1)))
                row["day"] = day
                row["stay_min"] = int(row.get("stay_min") or _DEFAULT_STAY_MIN)
                max_stop_day = max(max_stop_day, day)
            scheduled.append(row)
        # Fix end day after max_stop_day is known.
        for row in scheduled:
            if row.get("role") == "end":
                row["day"] = min(days, max(1, max_stop_day))
        return scheduled

    def _estimate_days(
        self,
        start: dict[str, Any],
        end: dict[str, Any],
        stops: list[dict[str, Any]],
        *,
        hours_per_day: int,
    ) -> int:
        """Estimate trip length from stay + travel along ordered wishlist."""
        path = [start, *stops, end]
        total_min = 0
        for place in stops:
            total_min += int(place.get("stay_min") or _DEFAULT_STAY_MIN)
        for a, b in zip(path, path[1:]):
            total_min += self._travel_min(a, b)

        daily_budget = max(60, hours_per_day * 60)
        days = max(1, int(math.ceil(total_min / daily_budget)))
        return min(30, days)

    def _resolve_place(self, place: Any) -> dict[str, Any]:
        if place is None:
            raise ValueError("Place is required.")
        if isinstance(place, str):
            place = {"name": place}

        name = str(place.get("name") or "").strip()
        if not name:
            raise ValueError("Place name is required.")

        lat = place.get("latitude", place.get("lat"))
        lng = place.get("longitude", place.get("lng"))
        if lat is None or lng is None:
            raise ValueError(
                "Select a destination from the list (system destinations with map coordinates)."
            )

        place_id = str(place.get("id") or _slugify(name))
        resolved = {
            "id": place_id,
            "name": name,
            "latitude": float(lat),
            "longitude": float(lng),
            "stay_min": _stay_min(place),
            "category_slug": place.get("category_slug"),
            "recommended_stay_minutes": place.get("recommended_stay_minutes"),
            "tags": place.get("tags") or [],
        }
        if place.get("day") is not None:
            resolved["day"] = max(1, int(place["day"]))
        hub_label = place.get("hub_label")
        if hub_label:
            resolved["hub_label"] = str(hub_label)
        if place.get("is_hero"):
            resolved["is_hero"] = True
        return resolved

    @staticmethod
    def _has_assigned_days(stops: list[dict[str, Any]]) -> bool:
        return bool(stops) and all(p.get("day") is not None for p in stops)

    def _order_for_generate(
        self,
        start: dict[str, Any],
        end: dict[str, Any],
        stops: list[dict[str, Any]],
        interests: list[str],
    ) -> list[dict[str, Any]]:
        if self._has_assigned_days(stops):
            return self._order_stops_grouped(start, end, stops, interests)
        return self._order_stops(start, end, stops, interests)

    def _order_stops_grouped(
        self,
        start: dict[str, Any],
        end: dict[str, Any],
        stops: list[dict[str, Any]],
        interests: list[str],
    ) -> list[dict[str, Any]]:
        """TSP within each assigned day; chain days start → end without zigzag."""
        by_day: dict[int, list[dict[str, Any]]] = {}
        for stop in stops:
            by_day.setdefault(int(stop.get("day") or 1), []).append(stop)

        ordered: list[dict[str, Any]] = []
        prev = start
        for day in sorted(by_day):
            group = by_day[day]
            ranked = self._order_stops(prev, end, group, interests)
            for stop in ranked:
                stop["day"] = day
            ordered.extend(ranked)
            if ranked:
                prev = ranked[-1]
        return ordered

    def _assign_days_along_route(
        self,
        start: dict[str, Any],
        end: dict[str, Any],
        stops: list[dict[str, Any]],
        *,
        days: int,
    ) -> list[dict[str, Any]]:
        """Put each stop in a progress (or city) band without global reshuffle."""
        if not stops:
            return stops
        start_pt = (float(start["latitude"]), float(start["longitude"]))
        end_pt = (float(end["latitude"]), float(end["longitude"]))
        trip_km = haversine_km(start_pt, end_pt)
        rows = [dict(stop) for stop in stops]

        if trip_km < _SAME_CITY_KM and len(rows) >= 2:
            coords = [
                (float(s["latitude"]), float(s["longitude"])) for s in rows
            ]
            k = max(1, min(days, len(rows)))
            labels = ItineraryPoiSelectionService._kmeans_labels(coords, k)
            groups: dict[int, list[dict[str, Any]]] = {}
            for stop, label in zip(rows, labels):
                groups.setdefault(label, []).append(stop)
            ranked = sorted(
                groups.values(),
                key=lambda group: haversine_km(
                    start_pt,
                    ItineraryPoiSelectionService._centroid(group),
                ),
            )
            for day_index, group in enumerate(ranked, start=1):
                day = min(days, day_index)
                for stop in group:
                    stop["day"] = day
            return rows

        for stop in rows:
            progress, _dist = route_projection(
                (float(stop["latitude"]), float(stop["longitude"])),
                start_pt,
                end_pt,
            )
            stop["_progress"] = progress
        ranked_stops = sorted(rows, key=lambda s: float(s.get("_progress") or 0.0))
        n = len(ranked_stops)
        for index, stop in enumerate(ranked_stops):
            stop["day"] = min(days, int(index * days / n) + 1)
            stop.pop("_progress", None)
        return ranked_stops

    def _apply_assigned_days(
        self,
        path: list[dict[str, Any]],
        *,
        days: int,
    ) -> list[dict[str, Any]]:
        """Keep selector/user day labels; do not slice clusters by time budget."""
        scheduled: list[dict[str, Any]] = []
        max_stop_day = 1
        for place in path:
            row = dict(place)
            role = row.get("role")
            if role == "start":
                row["day"] = 1
                row["stay_min"] = 0
            elif role == "end":
                row["day"] = min(days, max(1, max_stop_day))
                row["stay_min"] = 0
            else:
                day = max(1, min(days, int(row.get("day") or 1)))
                row["day"] = day
                row["stay_min"] = int(row.get("stay_min") or _DEFAULT_STAY_MIN)
                max_stop_day = max(max_stop_day, day)
            scheduled.append(row)
        for row in scheduled:
            if row.get("role") == "end":
                row["day"] = min(days, max(1, max_stop_day))
        return scheduled

    def _order_stops(
        self,
        start: dict[str, Any],
        end: dict[str, Any],
        stops: list[dict[str, Any]],
        interests: list[str],
    ) -> list[dict[str, Any]]:
        if len(stops) <= 1:
            return list(stops)

        points = [
            (start["latitude"], start["longitude"]),
            *[(s["latitude"], s["longitude"]) for s in stops],
            (end["latitude"], end["longitude"]),
        ]
        matrix = self._duration_matrix(points)
        end_idx = len(points) - 1

        # Exact best order for small wishlists (avoids Melaka→KL→Johor→KL backtracks).
        if len(stops) <= 8:
            best_perm: list[int] | None = None
            best_cost = float("inf")

            for perm in permutations(range(len(stops))):
                cost = matrix[0][perm[0] + 1]
                for a, b in zip(perm, perm[1:]):
                    cost += matrix[a + 1][b + 1]
                cost += matrix[perm[-1] + 1][end_idx]
                # Mild interest tie-break: prefer higher interest earlier.
                interest_bonus = sum(
                    _interest_score(stops[i], interests) * 0.01
                    for i in perm
                )
                score = cost - interest_bonus
                if score + 1e-6 < best_cost:
                    best_cost = score
                    best_perm = list(perm)
            if best_perm is not None:
                return [stops[i] for i in best_perm]

        # Larger lists: end-aware nearest neighbour + 2-opt.
        remaining = list(range(len(stops)))
        order: list[int] = []
        current = 0

        while remaining:

            def score(idx: int) -> tuple[float, float, float]:
                stop_matrix_idx = idx + 1
                travel = matrix[current][stop_matrix_idx]
                # Prefer stops that stay on the way toward the end (discourage detours).
                to_end = matrix[stop_matrix_idx][end_idx]
                interest = -_interest_score(stops[idx], interests)
                return (travel + 0.35 * to_end, travel, interest)

            nxt = min(remaining, key=score)
            remaining.remove(nxt)
            order.append(nxt)
            current = nxt + 1

        perm = [idx + 1 for idx in order]
        improved = self._two_opt(perm, matrix)
        return [stops[i - 1] for i in improved]

    def _duration_matrix(self, points: list[tuple[float, float]]) -> list[list[float]]:
        """Haversine duration matrix — no Google Distance Matrix calls."""
        n = len(points)
        speed = _pack_speed_kmh(self._preferred_mode)
        matrix = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                matrix[i][j] = haversine_duration_min(
                    points[i], points[j], speed_kmh=speed
                )
        return matrix

    def _two_opt(
        self, order: list[int], durations: list[list[float]]
    ) -> list[int]:
        def path_cost(seq: list[int]) -> float:
            cost = durations[0][seq[0]] if seq else 0.0
            for a, b in zip(seq, seq[1:]):
                cost += durations[a][b]
            if seq:
                cost += durations[seq[-1]][len(durations) - 1]
            return cost

        best = list(order)
        improved = True
        while improved:
            improved = False
            for i in range(len(best) - 1):
                for k in range(i + 1, len(best)):
                    candidate = (
                        best[:i] + list(reversed(best[i : k + 1])) + best[k + 1 :]
                    )
                    if path_cost(candidate) + 1e-6 < path_cost(best):
                        best = candidate
                        improved = True
                        break
                if improved:
                    break
        return best

    def _select_feasible_stops(
        self,
        stops: list[dict[str, Any]],
        *,
        days: int,
        daily_budget_min: int,
        start: dict[str, Any],
        end: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], list[str], bool]:
        """Pack stops; when days are pre-assigned, trim fillers per day only."""
        if self._has_assigned_days(stops):
            return self._trim_per_day(
                stops,
                days=days,
                daily_budget_min=daily_budget_min,
                start=start,
                end=end,
            )

        selected: list[dict[str, Any]] = []
        excluded: list[str] = []
        forced_oversize = False

        for stop in stops:
            trial = selected + [stop]
            if self._pack_fits(
                trial,
                start=start,
                end=end,
                days=days,
                daily_budget_min=daily_budget_min,
            ):
                selected = trial
                continue

            if not selected:
                selected = [stop]
                forced_oversize = True
            else:
                excluded.append(stop["name"])

        return selected, excluded, forced_oversize

    def _trim_per_day(
        self,
        stops: list[dict[str, Any]],
        *,
        days: int,
        daily_budget_min: int,
        start: dict[str, Any],
        end: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], list[str], bool]:
        """Drop overflow fillers; never drop the first (hero) stop of a day."""
        del start, end
        by_day: dict[int, list[dict[str, Any]]] = {}
        for stop in stops:
            by_day.setdefault(int(stop.get("day") or 1), []).append(stop)

        selected: list[dict[str, Any]] = []
        excluded: list[str] = []
        forced_oversize = False

        for day in sorted(by_day):
            if day > days:
                excluded.extend(stop["name"] for stop in by_day[day])
                continue
            kept: list[dict[str, Any]] = []
            for index, stop in enumerate(by_day[day]):
                trial = kept + [stop]
                fits = self._day_budget_fits(
                    trial,
                    daily_budget_min=daily_budget_min,
                )
                is_hero = bool(stop.get("is_hero")) or index == 0
                if fits or is_hero:
                    if not fits and is_hero:
                        forced_oversize = True
                    kept.append(stop)
                else:
                    excluded.append(stop["name"])
            selected.extend(kept)
        return selected, excluded, forced_oversize

    def _day_budget_fits(
        self,
        stops: list[dict[str, Any]],
        *,
        daily_budget_min: int,
    ) -> bool:
        if not stops:
            return True
        used = int(stops[0].get("stay_min") or _DEFAULT_STAY_MIN)
        prev = stops[0]
        for stop in stops[1:]:
            used += self._travel_min(prev, stop)
            used += int(stop.get("stay_min") or _DEFAULT_STAY_MIN)
            prev = stop
        return used <= daily_budget_min

    def _pack_fits(
        self,
        stops: list[dict[str, Any]],
        *,
        start: dict[str, Any],
        end: dict[str, Any],
        days: int,
        daily_budget_min: int,
    ) -> bool:
        """True if stops + end travel fit within days × hours/day hard caps."""
        day = 1
        used = 0
        prev = start

        for stop in stops:
            travel = self._travel_min(prev, stop)
            stay = int(stop["stay_min"])
            need = travel + stay
            if used + need > daily_budget_min:
                if day < days:
                    day += 1
                    used = 0
                else:
                    return False
            if used + need > daily_budget_min:
                return False
            used += need
            prev = stop

        end_travel = self._travel_min(prev, end)
        if used + end_travel > daily_budget_min:
            if day < days:
                return end_travel <= daily_budget_min
            return False
        return True

    def _build_path(
        self,
        start: dict[str, Any],
        visits: list[dict[str, Any]],
        end: dict[str, Any],
    ) -> list[dict[str, Any]]:
        path = [{**start, "role": "start", "stay_min": 0}]
        for stop in visits:
            path.append({**stop, "role": "stop"})
        path.append({**end, "role": "end", "stay_min": 0})
        return path

    def _schedule_days(
        self,
        path: list[dict[str, Any]],
        *,
        days: int,
        daily_budget_min: int,
    ) -> list[dict[str, Any]]:
        scheduled: list[dict[str, Any]] = []
        day = 1
        used = 0

        for place in path:
            place = dict(place)
            if place.get("role") == "start":
                place["day"] = 1
                scheduled.append(place)
                continue

            prev = scheduled[-1]
            travel = self._travel_min(prev, place)
            stay = int(place.get("stay_min") or 0)

            if place.get("role") == "end":
                if used + travel > daily_budget_min and day < days:
                    day += 1
                    used = 0
                place["day"] = min(day, days)
                scheduled.append(place)
                used += travel
                continue

            need = travel + stay
            if used + need > daily_budget_min and day < days:
                day += 1
                used = 0
            if used + need > daily_budget_min:
                # Overflow on last day: drop stop (feasibility should already exclude).
                continue
            place["day"] = day
            place["stay_min"] = stay
            scheduled.append(place)
            used += need
        return scheduled

    def _build_legs(
        self,
        path: list[dict[str, Any]],
        *,
        preferred_mode: str = "driving",
        notes: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        notes = notes if notes is not None else []
        points = [(p["latitude"], p["longitude"]) for p in path]
        walking_legs: list[dict[str, Any]] = []
        driving_legs: list[dict[str, Any]] = []
        transit_legs: list[dict[str, Any] | None] = []

        if preferred_mode == "walking":
            walking_legs = self._route_road(points, mode="walking")
        elif preferred_mode == "transit":
            transit_legs = self._route_transit_pairs(points)
            missing = [
                index
                for index, leg in enumerate(transit_legs)
                if not self._usable_route(leg)
            ]
            if missing:
                driving_legs = self._route_road(points, mode="driving")
        else:
            driving_legs = self._route_road(points, mode="driving")

        legs: list[dict[str, Any]] = []
        for index, (a, b) in enumerate(zip(path, path[1:])):
            driving = driving_legs[index] if index < len(driving_legs) else None
            walking = walking_legs[index] if index < len(walking_legs) else None
            transit = transit_legs[index] if index < len(transit_legs) else None
            if preferred_mode == "transit" and not self._usable_route(transit):
                notes.append(
                    f"{a['name']} → {b['name']} 没有公共交通，该路段改用驾车。"
                )
                transit = None
            options = self._mode_metrics(
                a,
                b,
                driving=driving,
                walking=walking,
                transit=transit,
                preferred_mode=preferred_mode,
            )
            default = self._pick_default_option(
                options, preferred_mode=preferred_mode
            )
            selected_route = {
                "walking": walking,
                "transit": transit,
                "driving": driving,
            }.get(str(default.get("mode") or ""))
            road_path: list[Any] = []
            if selected_route and isinstance(selected_route.get("path"), list):
                road_path = selected_route["path"]
            if len(road_path) < 2 and driving and isinstance(driving.get("path"), list):
                road_path = driving["path"]
            if len(road_path) < 2:
                road_path = [
                    [a["latitude"], a["longitude"]],
                    [b["latitude"], b["longitude"]],
                ]
            steps: list[Any] = []
            if selected_route and isinstance(selected_route.get("steps"), list):
                steps = selected_route["steps"]
            legs.append(
                {
                    "from_place": {"id": a["id"], "name": a["name"]},
                    "to_place": {"id": b["id"], "name": b["name"]},
                    "distance_km": float(default["distance_km"]),
                    "duration_min": int(default["duration_min"]),
                    "transport_options": options,
                    "selected_mode": default["mode"],
                    "day": int(b.get("day") or a.get("day") or 1),
                    "steps": steps,
                    "path": road_path,
                }
            )
        return legs

    def _route_road(
        self,
        points: list[tuple[float, float]],
        *,
        mode: str,
    ) -> list[dict[str, Any]]:
        if len(points) < 2:
            return []
        google = self._maps.route_waypoints(points, mode=mode) if points else []
        n_legs = len(points) - 1
        need_geometry = False
        need_osrm_steps = False
        for index in range(n_legs):
            google_leg = google[index] if index < len(google) else None
            if not self._usable_route(google_leg):
                need_geometry = True
                need_osrm_steps = True
                continue
            path = (google_leg or {}).get("path") or []
            if len(path) < 3:
                need_geometry = True
            if not ((google_leg or {}).get("steps") or []):
                need_osrm_steps = True

        osrm: list[dict[str, Any]] = []
        if need_geometry or need_osrm_steps:
            osrm = self._osrm.route_waypoints(
                points, mode=mode, include_steps=need_osrm_steps
            )

        speed = _pack_speed_kmh(mode)
        filled: list[dict[str, Any]] = []
        for index in range(n_legs):
            filled.append(
                self._merge_road_leg(
                    google[index] if index < len(google) else None,
                    osrm[index] if index < len(osrm) else None,
                    points[index],
                    points[index + 1],
                    speed_kmh=speed,
                )
            )
        return filled

    def _merge_road_leg(
        self,
        google: dict[str, Any] | None,
        osrm: dict[str, Any] | None,
        origin: tuple[float, float],
        dest: tuple[float, float],
        *,
        speed_kmh: float,
    ) -> dict[str, Any]:
        """Keep Google duration/steps; borrow OSRM path only when the polyline is thin."""
        if self._usable_route(google) and google is not None:
            merged = dict(google)
            path = merged.get("path") or []
            osrm_path = (osrm or {}).get("path") or []
            if len(path) < 3 and isinstance(osrm_path, list) and len(osrm_path) >= 3:
                merged["path"] = osrm_path
            if not (merged.get("steps") or []) and (osrm or {}).get("steps"):
                merged["steps"] = osrm["steps"]
            return merged
        if self._usable_route(osrm) and osrm is not None:
            return dict(osrm)
        return estimate_route(origin, dest, speed_kmh=speed_kmh)

    def _route_transit_pairs(
        self, points: list[tuple[float, float]]
    ) -> list[dict[str, Any] | None]:
        if len(points) < 2:
            return []
        raw = self._maps.route_waypoints(points, mode="transit")
        result: list[dict[str, Any] | None] = []
        for index in range(len(points) - 1):
            leg = raw[index] if index < len(raw) else None
            result.append(leg if self._usable_route(leg) else None)
        return result

    @staticmethod
    def _usable_route(leg: dict[str, Any] | None) -> bool:
        if not leg:
            return False
        if leg.get("unavailable"):
            return False
        try:
            return float(leg.get("distance_km") or 0) > 0
        except (TypeError, ValueError):
            return False

    @staticmethod
    def _over_budget_note(day: int, hours_per_day: int) -> str:
        return (
            f"Day {day} is over the {hours_per_day} hrs/day plan. "
            f"You can edit Day {day} below — shorten a stay, "
            "move a stop to another day, or remove one."
        )

    @staticmethod
    def _note_straight_line_route(
        notes: list[str],
        legs: list[dict[str, Any]],
    ) -> None:
        straight = False
        for leg in legs:
            path = leg.get("path") or []
            driving = next(
                (
                    opt
                    for opt in leg.get("transport_options") or []
                    if opt.get("mode") == "driving"
                ),
                None,
            )
            if (driving and driving.get("is_estimated")) and len(path) < 3:
                straight = True
                break
            if len(path) < 3:
                straight = True
                break
        if straight:
            notes.append(
                "Route path is estimated (straight line); "
                "road geometry was unavailable."
            )

    def _build_day_totals(
        self,
        path: list[dict[str, Any]],
        legs: list[dict[str, Any]],
        *,
        days: int,
    ) -> list[dict[str, Any]]:
        totals: list[dict[str, Any]] = []
        for day in range(1, max(1, days) + 1):
            travel = sum(
                int(leg["duration_min"])
                for leg in legs
                if int(leg.get("day") or 1) == day
            )
            stay = sum(
                int(p.get("stay_min") or 0)
                for p in path
                if p.get("role") == "stop" and int(p.get("day") or 1) == day
            )
            totals.append(
                {
                    "day": day,
                    "travel_duration_min": travel,
                    "stay_duration_min": stay,
                    "duration_min": travel + stay,
                }
            )
        return totals

    def _pick_default_option(
        self,
        options: list[dict[str, Any]],
        *,
        preferred_mode: str = "driving",
    ) -> dict[str, Any]:
        if preferred_mode == "walking":
            walking = next((o for o in options if o.get("mode") == "walking"), None)
            if walking:
                return walking
        if preferred_mode == "transit":
            transit = next((o for o in options if o.get("mode") == "transit"), None)
            if transit:
                return transit
            driving = next((o for o in options if o.get("mode") == "driving"), None)
            if driving:
                return driving
        if preferred_mode == "driving":
            driving = next((o for o in options if o.get("mode") == "driving"), None)
            if driving:
                return driving

        walking = next((o for o in options if o.get("mode") == "walking"), None)
        if (
            walking
            and float(walking["distance_km"]) <= _MAX_WALK_KM
            and int(walking["duration_min"]) <= _MAX_WALK_MIN
        ):
            return walking
        driving = next((o for o in options if o.get("mode") == "driving"), None)
        if driving:
            return driving
        defaults = [o for o in options if o.get("is_default")]
        if defaults:
            return defaults[0]
        return min(options, key=lambda o: int(o["duration_min"]))

    def _mode_metrics(
        self,
        a: dict[str, Any],
        b: dict[str, Any],
        *,
        driving: dict[str, Any] | None = None,
        walking: dict[str, Any] | None = None,
        transit: dict[str, Any] | None = None,
        preferred_mode: str = "driving",
    ) -> list[dict[str, Any]]:
        origin = (a["latitude"], a["longitude"])
        dest = (b["latitude"], b["longitude"])
        if not self._usable_route(driving):
            driving = estimate_route(
                origin, dest, speed_kmh=_MODE_SPEEDS_KMH["driving"]
            )
        if not self._usable_route(walking):
            if preferred_mode == "driving":
                walking = self._walking_metrics(
                    origin,
                    dest,
                    driving_distance_km=float(driving["distance_km"]),
                )
            else:
                walking = estimate_route(
                    origin, dest, speed_kmh=_MODE_SPEEDS_KMH["walking"]
                )

        carbon_items = [
            {"mode": "driving", "distance_km": driving["distance_km"]},
            {"mode": "walking", "distance_km": walking["distance_km"]},
            {"mode": "bus", "distance_km": driving["distance_km"]},
            {"mode": "train", "distance_km": driving["distance_km"]},
        ]
        carbon_payload = self._carbon.estimate(carbon_items)
        carbon_values = [r["carbon_kg"] for r in carbon_payload["results"]]
        transit_route = transit if self._usable_route(transit) else None
        if transit_route is not None:
            carbon_values.append(self._transit_carbon_kg(transit_route))

        prefer_walk = preferred_mode == "walking" or (
            float(walking["distance_km"]) <= _MAX_WALK_KM
            and int(walking["duration_min"]) <= _MAX_WALK_MIN
        )

        options = [
            {
                "mode": "driving",
                "duration_min": int(driving["duration_min"]),
                "distance_km": float(driving["distance_km"]),
                "carbon_kg": carbon_values[0],
                "is_default": preferred_mode == "driving" and not prefer_walk,
                "is_estimated": bool(driving.get("is_estimated")),
            },
            {
                "mode": "bus",
                "duration_min": max(1, int(round(int(driving["duration_min"]) * 1.35))),
                "distance_km": float(driving["distance_km"]),
                "carbon_kg": carbon_values[2],
                "is_default": False,
                "is_estimated": True,
            },
            {
                "mode": "train",
                "duration_min": max(1, int(round(int(driving["duration_min"]) * 1.15))),
                "distance_km": float(driving["distance_km"]),
                "carbon_kg": carbon_values[3],
                "is_default": False,
                "is_estimated": True,
            },
        ]
        if preferred_mode == "walking" or float(walking["distance_km"]) <= _MAX_WALK_KM:
            options.append(
                {
                    "mode": "walking",
                    "duration_min": int(walking["duration_min"]),
                    "distance_km": float(walking["distance_km"]),
                    "carbon_kg": carbon_values[1],
                    "is_default": prefer_walk and preferred_mode != "transit",
                    "is_estimated": bool(walking.get("is_estimated")),
                }
            )
        if transit_route is not None:
            options.append(
                {
                    "mode": "transit",
                    "duration_min": int(transit_route["duration_min"]),
                    "distance_km": float(transit_route["distance_km"]),
                    "carbon_kg": carbon_values[4],
                    "is_default": preferred_mode == "transit",
                    "is_estimated": bool(transit_route.get("is_estimated")),
                }
            )
        return options

    def _transit_carbon_kg(self, transit_route: dict[str, Any]) -> float:
        """Sum distance × factor per Rapid Bus / MRT / walk step."""
        steps = transit_route.get("steps") or []
        items: list[dict[str, Any]] = []
        for step in steps:
            if not isinstance(step, dict):
                continue
            km = float(step.get("distance_m") or 0) / 1000.0
            kind = str(step.get("kind") or "")
            if kind == "walk":
                items.append({"mode": "walking", "distance_km": km})
            elif kind == "transit":
                vehicle = str(step.get("vehicle") or "bus").lower()
                items.append(
                    {
                        "mode": "train" if vehicle == "train" else "bus",
                        "distance_km": km,
                    }
                )
        if items:
            return float(self._carbon.estimate(items)["total_carbon_kg"])
        kind = str(transit_route.get("transit_kind") or "bus").lower()
        payload = self._carbon.estimate(
            [
                {
                    "mode": "train" if kind == "train" else "bus",
                    "distance_km": float(transit_route.get("distance_km") or 0),
                }
            ]
        )
        return float(payload["results"][0]["carbon_kg"])

    def _walking_metrics(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        driving_distance_km: float,
    ) -> dict[str, Any]:
        if haversine_km(a, b) <= _MAX_WALK_KM:
            walking = self._walking_route(a, b)
            if walking is not None:
                return walking
        distance = min(driving_distance_km, haversine_km(a, b) * 1.2)
        duration = max(
            1,
            int(round((distance / _MODE_SPEEDS_KMH["walking"]) * 60.0)),
        )
        return {
            "distance_km": round(distance, 2),
            "duration_min": duration,
            "is_estimated": True,
        }

    def _walking_route(
        self, a: tuple[float, float], b: tuple[float, float]
    ) -> dict[str, Any] | None:
        cache_key = (
            "walking",
            round(a[0], 5),
            round(a[1], 5),
            round(b[0], 5),
            round(b[1], 5),
        )
        cached = self._route_cache.get(cache_key)
        if cached is not None:
            return cached

        walking = self._maps.route_pair(a, b, mode="walking")
        if walking is not None:
            self._route_cache[cache_key] = walking
        return walking

    def _travel_min(self, a: dict[str, Any], b: dict[str, Any]) -> int:
        minutes = haversine_duration_min(
            (a["latitude"], a["longitude"]),
            (b["latitude"], b["longitude"]),
            speed_kmh=_pack_speed_kmh(self._preferred_mode),
        )
        return max(1, int(round(minutes)))
