"""Generate day-packed itineraries from traveller inputs."""

from __future__ import annotations

import math
import re
from itertools import permutations
from typing import Any

from integration.external_api import OrsClient, OsrmClient
from services.carbon_stub_service import CarbonStubService

_DEFAULT_STAY_MIN = 90
_DEFAULT_HOURS_PER_DAY = 8
_SHARED_ORS = OrsClient()
_CATEGORY_STAY_MIN: dict[str, int] = {
    "nature": 120,
    "culture": 90,
    "heritage": 90,
    "adventure": 150,
    "shopping": 90,
}
_MAX_WALK_KM = 3.0
_MAX_WALK_MIN = 45
_MODE_SPEEDS_KMH = {
    "driving": 50.0,
    "walking": 4.5,
    "bus": 35.0,
    "train": 60.0,
}


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    return slug.strip("-") or "place"


def _clamp_stay(minutes: int | None) -> int:
    if minutes is None:
        return _DEFAULT_STAY_MIN
    return max(30, min(480, int(minutes)))


def _stay_min(place: dict[str, Any]) -> int:
    if place.get("recommended_stay_minutes"):
        return _clamp_stay(int(place["recommended_stay_minutes"]))
    slug = (place.get("category_slug") or "").lower()
    for key, value in _CATEGORY_STAY_MIN.items():
        if key in slug:
            return value
    return _DEFAULT_STAY_MIN


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
        osrm_client: OsrmClient | None = None,
        ors_client: OrsClient | None = None,
    ) -> None:
        self._carbon = carbon_service or CarbonStubService()
        self._osrm = osrm_client or OsrmClient()
        self._ors = ors_client or _SHARED_ORS
        self._route_cache: dict[tuple[str, float, float, float, float], dict[str, Any]] = {}

    def generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        # Fresh cache per generate call (logic unchanged; avoids repeat ORS/OSRM hits).
        self._route_cache = {}
        destinations_raw = payload.get("destinations") or []
        if not destinations_raw:
            raise ValueError("At least one destination is required.")

        start = self._resolve_place(payload.get("start") or payload.get("start_location"))
        end = self._resolve_place(payload.get("end") or payload.get("end_location"))
        interests = [str(i) for i in (payload.get("interests") or [])]
        preferred_mode = str(payload.get("preferred_mode") or "driving").lower()

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

        ordered = self._order_stops(start, end, resolved, interests)

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
        scheduled = self._schedule_days(
            path, days=days, daily_budget_min=daily_budget_min
        )
        scheduled = self._ensure_days_spread(
            scheduled,
            days=days,
            daily_budget_min=daily_budget_min,
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
        legs = self._build_legs(scheduled, preferred_mode=preferred_mode)
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
                    f"Day {day_total['day']} exceeds {hours_per_day} hrs/day budget."
                )

        return {
            "start_location": start["name"],
            "end_location": end["name"],
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
        }

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
        return {
            "id": place_id,
            "name": name,
            "latitude": float(lat),
            "longitude": float(lng),
            "stay_min": _stay_min(place),
            "category_slug": place.get("category_slug"),
            "recommended_stay_minutes": place.get("recommended_stay_minutes"),
            "tags": place.get("tags") or [],
        }

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
        matrix = self._driving_matrix(points)
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

    def _driving_matrix(self, points: list[tuple[float, float]]) -> list[list[float]]:
        ors = self._ors.matrix(points)
        if ors is not None:
            return ors

        n = len(points)
        matrix = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                route = self._driving_route(points[i], points[j])
                matrix[i][j] = float(route["duration_min"])
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
        """Pack stops day-by-day; exclude those that exceed hours/day (visit+travel)."""
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
                # Keep at least one stop even if it alone overflows the daily budget.
                selected = [stop]
                forced_oversize = True
            else:
                excluded.append(stop["name"])

        return selected, excluded, forced_oversize

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

    def _ensure_days_spread(
        self,
        scheduled: list[dict[str, Any]],
        *,
        days: int,
        daily_budget_min: int,
    ) -> list[dict[str, Any]]:
        """Reassign stop days so every trip day is used when stops allow."""
        if days <= 1:
            return scheduled

        start = next((p for p in scheduled if p.get("role") == "start"), None)
        end = next((p for p in scheduled if p.get("role") == "end"), None)
        stops = [dict(p) for p in scheduled if p.get("role") == "stop"]
        if start is None or end is None or not stops:
            return scheduled

        occupied = {int(p.get("day") or 1) for p in stops}
        missing = [d for d in range(1, days + 1) if d not in occupied]
        if not missing:
            return scheduled

        n = len(stops)
        # Contiguous even split preserves route order.
        buckets: list[list[dict[str, Any]]] = [[] for _ in range(days)]
        if n >= days:
            base, rem = divmod(n, days)
            idx = 0
            for day_i in range(days):
                take = base + (1 if day_i < rem else 0)
                for stop in stops[idx : idx + take]:
                    row = dict(stop)
                    row["day"] = day_i + 1
                    buckets[day_i].append(row)
                idx += take
        else:
            for i, stop in enumerate(stops):
                row = dict(stop)
                row["day"] = i + 1
                buckets[i].append(row)

        reassigned = [stop for bucket in buckets for stop in bucket]

        # Final pass: if any day still empty and another has 2+, move one over.
        if n >= days:
            by_day: dict[int, list[dict[str, Any]]] = {
                d: [] for d in range(1, days + 1)
            }
            for stop in reassigned:
                by_day[int(stop["day"])].append(stop)
            for empty_day in range(1, days + 1):
                if by_day[empty_day]:
                    continue
                donor_day = next(
                    (d for d in range(1, days + 1) if len(by_day[d]) > 1),
                    None,
                )
                if donor_day is None:
                    break
                moved = by_day[donor_day].pop()
                moved["day"] = empty_day
                by_day[empty_day].append(moved)
            reassigned = [
                stop
                for day_i in range(1, days + 1)
                for stop in by_day[day_i]
            ]
            # Restore corridor order (original stops order) with new day labels.
            day_by_id = {str(s["id"]): int(s["day"]) for s in reassigned}
            ordered: list[dict[str, Any]] = []
            for stop in stops:
                row = dict(stop)
                row["day"] = day_by_id.get(str(stop["id"]), int(row.get("day") or 1))
                ordered.append(row)
            reassigned = ordered

        end_place = dict(end)
        last_stop_day = max((int(s.get("day") or 1) for s in reassigned), default=1)
        end_place["day"] = (
            days
            if any(int(s.get("day") or 1) == days for s in reassigned)
            else min(days, last_stop_day)
        )

        return [{**start, "role": "start", "stay_min": 0}, *reassigned, end_place]

    def _build_legs(
        self,
        path: list[dict[str, Any]],
        *,
        preferred_mode: str = "driving",
    ) -> list[dict[str, Any]]:
        legs: list[dict[str, Any]] = []
        for a, b in zip(path, path[1:]):
            options = self._mode_metrics(a, b)
            default = self._pick_default_option(
                options, preferred_mode=preferred_mode
            )
            road_path = self._driving_path(
                (a["latitude"], a["longitude"]),
                (b["latitude"], b["longitude"]),
            )
            legs.append(
                {
                    "from_place": {"id": a["id"], "name": a["name"]},
                    "to_place": {"id": b["id"], "name": b["name"]},
                    "distance_km": float(default["distance_km"]),
                    "duration_min": int(default["duration_min"]),
                    "transport_options": options,
                    "selected_mode": default["mode"],
                    "day": int(b.get("day") or a.get("day") or 1),
                    "steps": [],
                    "path": road_path,
                }
            )
        return legs

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

    def _mode_metrics(self, a: dict[str, Any], b: dict[str, Any]) -> list[dict[str, Any]]:
        driving = self._driving_route(
            (a["latitude"], a["longitude"]),
            (b["latitude"], b["longitude"]),
        )
        walking = self._walking_metrics(
            (a["latitude"], a["longitude"]),
            (b["latitude"], b["longitude"]),
            driving_distance_km=float(driving["distance_km"]),
        )

        carbon_payload = self._carbon.estimate(
            [
                {"mode": "driving", "distance_km": driving["distance_km"]},
                {"mode": "walking", "distance_km": walking["distance_km"]},
                {"mode": "bus", "distance_km": driving["distance_km"]},
                {"mode": "train", "distance_km": driving["distance_km"]},
            ]
        )
        carbon_values = [r["carbon_kg"] for r in carbon_payload["results"]]

        prefer_walk = (
            float(walking["distance_km"]) <= _MAX_WALK_KM
            and int(walking["duration_min"]) <= _MAX_WALK_MIN
        )

        options = [
            {
                "mode": "driving",
                "duration_min": int(driving["duration_min"]),
                "distance_km": float(driving["distance_km"]),
                "carbon_kg": carbon_values[0],
                "is_default": not prefer_walk,
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
        if float(walking["distance_km"]) <= _MAX_WALK_KM:
            options.append(
                {
                    "mode": "walking",
                    "duration_min": int(walking["duration_min"]),
                    "distance_km": float(walking["distance_km"]),
                    "carbon_kg": carbon_values[1],
                    "is_default": prefer_walk,
                    "is_estimated": bool(walking.get("is_estimated")),
                }
            )
        return options

    def _walking_metrics(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        driving_distance_km: float,
    ) -> dict[str, Any]:
        walking = self._walking_route(a, b)
        if walking is not None:
            return walking
        distance = min(driving_distance_km, self._osrm.haversine_km(a, b) * 1.2)
        duration = max(
            1,
            int(round((distance / _MODE_SPEEDS_KMH["walking"]) * 60.0)),
        )
        return {
            "distance_km": round(distance, 2),
            "duration_min": duration,
            "is_estimated": True,
        }

    def _driving_route(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
        *,
        with_geometry: bool = False,
    ) -> dict[str, Any]:
        cache_key = (
            "driving-geo" if with_geometry else "driving",
            round(a[0], 5),
            round(a[1], 5),
            round(b[0], 5),
            round(b[1], 5),
        )
        cached = self._route_cache.get(cache_key)
        if cached is not None:
            return cached

        ors = self._ors.route(a, b, profile="driving-car", geometry=with_geometry)
        if ors is not None:
            self._route_cache[cache_key] = ors
            return ors
        osrm = self._osrm.route(a, b, profile="driving", geometry=with_geometry)
        if osrm is not None:
            self._route_cache[cache_key] = osrm
            return osrm
        estimated = self._osrm.estimate_haversine(
            a, b, speed_kmh=_MODE_SPEEDS_KMH["driving"]
        )
        self._route_cache[cache_key] = estimated
        return estimated

    def _driving_path(
        self,
        a: tuple[float, float],
        b: tuple[float, float],
    ) -> list[list[float]]:
        """Road polyline [[lat, lng], ...] for map display.

        Prefer OSRM geometry (reliable GeoJSON). ORS is optional backup.
        """
        osrm = self._osrm.route(a, b, profile="driving", geometry=True)
        if osrm and isinstance(osrm.get("path"), list) and len(osrm["path"]) >= 2:
            return osrm["path"]
        ors = self._ors.route(a, b, profile="driving-car", geometry=True)
        if ors and isinstance(ors.get("path"), list) and len(ors["path"]) >= 2:
            return ors["path"]
        cached = self._driving_route(a, b, with_geometry=True)
        path = cached.get("path")
        if isinstance(path, list) and len(path) >= 2:
            return path
        return [[a[0], a[1]], [b[0], b[1]]]

    def _walking_route(
        self, a: tuple[float, float], b: tuple[float, float]
    ) -> dict[str, Any] | None:
        cache_key = ("walking", round(a[0], 5), round(a[1], 5), round(b[0], 5), round(b[1], 5))
        if cache_key in self._route_cache:
            return self._route_cache[cache_key]

        # Prefer OSRM when ORS is rate-limited to avoid extra 429 noise.
        if self._ors.available:
            ors = self._ors.route(a, b, profile="foot-walking", geometry=False)
            if ors is not None:
                self._route_cache[cache_key] = ors
                return ors
        osrm = self._osrm.route(a, b, profile="foot", geometry=False)
        if osrm is not None:
            self._route_cache[cache_key] = osrm
        return osrm

    def _travel_min(self, a: dict[str, Any], b: dict[str, Any]) -> int:
        route = self._driving_route(
            (a["latitude"], a["longitude"]),
            (b["latitude"], b["longitude"]),
        )
        return int(route["duration_min"])
