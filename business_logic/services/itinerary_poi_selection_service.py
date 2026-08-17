"""Select itinerary stops with day-hub orienteering (no LLM)."""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from integration.external_api.geo import (
    haversine_duration_min,
    haversine_km,
    route_projection,
)
from integration.repositories import (
    DestinationCategoryRepository,
    DestinationRepository,
)
from services.featured_destinations import matches_featured_name
from services.itinerary_defaults import (
    DEFAULT_HOURS_PER_DAY,
    stay_minutes_for_slug,
)

logger = logging.getLogger(__name__)

_CORRIDOR_KM = 60.0
_FEATURED_CORRIDOR_KM = 90.0
_WIDE_CORRIDOR_KM = 120.0
_SAME_CITY_KM = 40.0
_CITY_RADIUS_KM = 60.0
_MIN_CANDIDATES = 8
_DAY_DIAMETER_KM = 25.0
_HUB_CLUSTER_KM = 20.0
_NEAR_DUPLICATE_KM = 3.0
_BAND_OVERLAP_KM = 15.0
_DAILY_SLACK_MIN = 60
_DRIVING_KMH = 50.0
_MODE_SPEEDS_KMH = {
    "driving": 50.0,
    "walking": 4.5,
    "transit": 35.0,
    "bus": 35.0,
}
_KMEANS_ROUNDS = 20
_MERGE_CLUSTER_KM = 8.0


class ItineraryPoiSelectionService:
    """Score catalog POIs, split into day hubs, then pick 2–4 stops per day."""

    def __init__(
        self,
        destination_repository: DestinationRepository | None = None,
        category_repository: DestinationCategoryRepository | None = None,
    ) -> None:
        self._destinations = destination_repository or DestinationRepository()
        self._categories = category_repository or DestinationCategoryRepository()
        self._speed_kmh = _DRIVING_KMH

    async def select_places(
        self,
        *,
        start: dict[str, Any],
        end: dict[str, Any],
        days: int,
        nights: int,
        interests: list[str],
        hours_per_day: int = DEFAULT_HOURS_PER_DAY,
        preferred_mode: str = "driving",
    ) -> list[dict[str, Any]]:
        """Return PlaceInput-shaped dicts chosen only from the catalog."""
        del nights  # nights constrain lodging, not stop geography
        catalog = await self._load_enriched_catalog()
        return self.select_from_pool(
            catalog,
            start=start,
            end=end,
            days=days,
            interests=interests,
            hours_per_day=hours_per_day,
            preferred_mode=preferred_mode,
        )

    def select_from_pool(
        self,
        catalog: list[dict[str, Any]],
        *,
        start: dict[str, Any],
        end: dict[str, Any],
        days: int,
        interests: list[str],
        hours_per_day: int = DEFAULT_HOURS_PER_DAY,
        preferred_mode: str = "driving",
    ) -> list[dict[str, Any]]:
        """Deterministic pick from an in-memory catalog (used by tests)."""
        mode = str(preferred_mode or "driving").strip().lower()
        if mode in {"walking", "walk", "foot"}:
            self._speed_kmh = _MODE_SPEEDS_KMH["walking"]
        elif mode in {"transit", "bus", "train", "public_transport", "public-transport"}:
            self._speed_kmh = _MODE_SPEEDS_KMH["transit"]
        else:
            self._speed_kmh = _MODE_SPEEDS_KMH["driving"]
        start_pt = (float(start["latitude"]), float(start["longitude"]))
        end_pt = (float(end["latitude"]), float(end["longitude"]))
        days = max(1, int(days))
        hours_per_day = max(1, int(hours_per_day))
        interest_set = {str(i).strip().lower() for i in interests if str(i).strip()}

        pool = self._normalize_pool(catalog, start=start, end=end)
        if not pool:
            raise ValueError(
                "No catalog destinations with map coordinates are available."
            )

        trip_km = haversine_km(start_pt, end_pt)
        same_city = trip_km < _SAME_CITY_KM
        candidates = (
            self._city_filter(pool, start_pt, end_pt)
            if same_city
            else self._corridor_filter(pool, start_pt, end_pt)
        )
        if not candidates:
            raise ValueError(
                "No catalog destinations found near the start–end route."
            )

        radius = _CITY_RADIUS_KM if same_city else _CORRIDOR_KM
        for place in candidates:
            place["_value"] = self._value_score(
                place,
                interests=interest_set,
                radius_km=radius,
            )

        target_per_day = self._stops_per_day(hours_per_day)
        if same_city:
            bands = self._city_day_bands(candidates, start_pt, days)
        else:
            bands = self._route_day_bands(candidates, days)

        picked: list[dict[str, Any]] = []
        used_ids: set[str] = set()
        daily_budget = max(30, hours_per_day * 60 - _DAILY_SLACK_MIN)

        for day_index, band in enumerate(bands, start=1):
            day_pool = self._with_overlap(
                band,
                candidates,
                used_ids=used_ids,
            )
            selected = self._orienteer_day(
                day_pool,
                hub_candidates=band or day_pool,
                used_ids=used_ids,
                target_count=target_per_day,
                daily_budget_min=daily_budget,
            )
            if not selected:
                continue
            hub_label = self._hub_label(band or selected, selected[0])
            for index, place in enumerate(selected):
                used_ids.add(str(place["id"]))
                picked.append(
                    {
                        "id": place["id"],
                        "name": place["name"],
                        "latitude": place["latitude"],
                        "longitude": place["longitude"],
                        "category_slug": place.get("category_slug"),
                        "day": day_index,
                        "hub_label": hub_label,
                        "is_hero": index == 0,
                    }
                )

        if not picked:
            raise ValueError(
                "Could not select destinations from the catalog for this route."
            )
        logger.info(
            "Selected %s catalog stops across %s day hub(s)",
            len(picked),
            days,
        )
        return picked

    async def _load_enriched_catalog(self) -> list[dict[str, Any]]:
        raw = await self._destinations.list_with_coordinates(limit=1500)
        categories = await self._categories.list_active()
        lookup = {c["id"]: c for c in categories}
        enriched: list[dict[str, Any]] = []
        for item in raw:
            category = lookup.get(item.get("category_id") or "")
            row = dict(item)
            row["category_slug"] = category["slug"] if category else None
            row["category_name"] = category["name"] if category else None
            enriched.append(row)
        return enriched

    @staticmethod
    def _normalize_pool(
        catalog: list[dict[str, Any]],
        *,
        start: dict[str, Any],
        end: dict[str, Any],
    ) -> list[dict[str, Any]]:
        start_id = str(start.get("id") or "")
        end_id = str(end.get("id") or "")
        start_name = str(start.get("name") or "").strip().lower()
        end_name = str(end.get("name") or "").strip().lower()
        start_pt = (float(start["latitude"]), float(start["longitude"]))
        end_pt = (float(end["latitude"]), float(end["longitude"]))

        pool: list[dict[str, Any]] = []
        for item in catalog:
            item_id = str(item.get("id") or "")
            name = str(
                item.get("name") or item.get("destination_name") or ""
            ).strip()
            lat = item.get("latitude")
            lng = item.get("longitude")
            if lat is None or lng is None or not name:
                continue
            if item_id and item_id in {start_id, end_id}:
                continue
            if name.lower() in {start_name, end_name}:
                continue
            point = (float(lat), float(lng))
            progress, corridor_km = route_projection(point, start_pt, end_pt)
            featured = bool(item.get("is_featured")) or matches_featured_name(
                name
            )
            pool.append(
                {
                    "id": item_id or name,
                    "name": name,
                    "latitude": float(lat),
                    "longitude": float(lng),
                    "category_slug": item.get("category_slug"),
                    "state": item.get("state") or "",
                    "images": item.get("images") or [],
                    "is_featured": featured,
                    "_corridor_km": corridor_km,
                    "_progress": progress,
                    "_mid_km": haversine_km(
                        point,
                        (
                            (start_pt[0] + end_pt[0]) / 2.0,
                            (start_pt[1] + end_pt[1]) / 2.0,
                        ),
                    ),
                }
            )
        return pool

    @staticmethod
    def _corridor_filter(
        pool: list[dict[str, Any]],
        start_pt: tuple[float, float],
        end_pt: tuple[float, float],
    ) -> list[dict[str, Any]]:
        del start_pt, end_pt
        selected = [
            dict(place)
            for place in pool
            if float(place["_corridor_km"]) <= _CORRIDOR_KM
            or (
                place.get("is_featured")
                and float(place["_corridor_km"]) <= _FEATURED_CORRIDOR_KM
            )
        ]
        if len(selected) < _MIN_CANDIDATES:
            selected = [
                dict(place)
                for place in pool
                if float(place["_corridor_km"]) <= _WIDE_CORRIDOR_KM
            ]
        selected.sort(key=lambda p: float(p["_corridor_km"]))
        return selected

    @staticmethod
    def _city_filter(
        pool: list[dict[str, Any]],
        start_pt: tuple[float, float],
        end_pt: tuple[float, float],
    ) -> list[dict[str, Any]]:
        mid = (
            (start_pt[0] + end_pt[0]) / 2.0,
            (start_pt[1] + end_pt[1]) / 2.0,
        )
        selected = [
            dict(place)
            for place in pool
            if haversine_km(
                (place["latitude"], place["longitude"]), mid
            )
            <= _CITY_RADIUS_KM
        ]
        if len(selected) < _MIN_CANDIDATES:
            selected = [
                dict(place)
                for place in pool
                if haversine_km(
                    (place["latitude"], place["longitude"]), mid
                )
                <= _WIDE_CORRIDOR_KM
            ]
        return selected

    @staticmethod
    def _value_score(
        place: dict[str, Any],
        *,
        interests: set[str],
        radius_km: float,
    ) -> float:
        slug = str(place.get("category_slug") or "").lower()
        if interests:
            interest_match = 1.0 if slug in interests else 0.25
        else:
            interest_match = 1.0
        featured = 1.0 if place.get("is_featured") else 0.0
        media = 1.0 if (place.get("images") or []) else 0.0
        corridor = float(place.get("_corridor_km") or 0.0)
        route_fit = 1.0 - min(1.0, corridor / max(radius_km, 1.0))
        return (
            0.40 * interest_match
            + 0.25 * featured
            + 0.15 * media
            + 0.20 * route_fit
        )

    @staticmethod
    def _stops_per_day(hours_per_day: int) -> int:
        raw = round((max(1, hours_per_day) * 60 - _DAILY_SLACK_MIN) / 120)
        return max(2, min(4, int(raw)))

    @staticmethod
    def _route_day_bands(
        candidates: list[dict[str, Any]],
        days: int,
    ) -> list[list[dict[str, Any]]]:
        """Split by equal route progress so long trips advance geographically."""
        bands: list[list[dict[str, Any]]] = [[] for _ in range(days)]
        if not candidates or days < 1:
            return bands

        for place in candidates:
            progress = min(1.0, max(0.0, float(place.get("_progress") or 0.0)))
            if progress >= 1.0:
                day_idx = days - 1
            else:
                day_idx = min(days - 1, int(progress * days))
            bands[day_idx].append(place)

        min_needed = 2
        step = 1.0 / days
        for day_idx in range(days):
            expand = 0.0
            while len(bands[day_idx]) < min_needed and expand < step * 2:
                expand += step * 0.5
                t0 = max(0.0, day_idx / days - expand)
                t1 = min(1.0, (day_idx + 1) / days + expand)
                seen = {str(p["id"]) for p in bands[day_idx]}
                for place in candidates:
                    place_id = str(place["id"])
                    if place_id in seen:
                        continue
                    progress = float(place.get("_progress") or 0.0)
                    if t0 <= progress <= t1:
                        bands[day_idx].append(place)
                        seen.add(place_id)
        return bands

    def _city_day_bands(
        self,
        candidates: list[dict[str, Any]],
        start_pt: tuple[float, float],
        days: int,
    ) -> list[list[dict[str, Any]]]:
        k = max(1, min(days, len(candidates)))
        coords = [
            (float(p["latitude"]), float(p["longitude"])) for p in candidates
        ]
        labels = self._kmeans_labels(coords, k)
        clusters: dict[int, list[dict[str, Any]]] = {}
        for place, label in zip(candidates, labels):
            clusters.setdefault(label, []).append(place)
        clusters = self._merge_close_clusters(clusters)

        ranked = sorted(
            clusters.values(),
            key=lambda group: haversine_km(
                start_pt, self._centroid(group)
            ),
        )
        # Drop clusters that are empty after merge.
        ranked = [group for group in ranked if group]
        if not ranked:
            return [list(candidates)] + [[] for _ in range(days - 1)]

        bands: list[list[dict[str, Any]]] = [[] for _ in range(days)]
        for day_idx in range(days):
            bands[day_idx] = list(ranked[day_idx % len(ranked)])
        return bands

    @staticmethod
    def _kmeans_labels(
        coords: list[tuple[float, float]],
        k: int,
    ) -> list[int]:
        n = len(coords)
        k = max(1, min(k, n))
        if k == 1:
            return [0] * n
        order = sorted(range(n), key=lambda i: (coords[i][1], coords[i][0]))
        centroids = [
            list(coords[order[int((j + 0.5) * n / k) % n]]) for j in range(k)
        ]
        labels = [0] * n
        for _ in range(_KMEANS_ROUNDS):
            for i, point in enumerate(coords):
                labels[i] = min(
                    range(k),
                    key=lambda c: haversine_km(point, tuple(centroids[c])),
                )
            for cluster in range(k):
                members = [
                    coords[i] for i in range(n) if labels[i] == cluster
                ]
                if not members:
                    continue
                centroids[cluster] = [
                    sum(p[0] for p in members) / len(members),
                    sum(p[1] for p in members) / len(members),
                ]
        return labels

    @staticmethod
    def _merge_close_clusters(
        clusters: dict[int, list[dict[str, Any]]],
    ) -> dict[int, list[dict[str, Any]]]:
        items = list(clusters.items())
        if len(items) <= 1:
            return clusters
        merged: dict[int, list[dict[str, Any]]] = {}
        used: set[int] = set()
        for i, (label_a, group_a) in enumerate(items):
            if label_a in used:
                continue
            combined = list(group_a)
            center_a = ItineraryPoiSelectionService._centroid(group_a)
            for label_b, group_b in items[i + 1 :]:
                if label_b in used:
                    continue
                center_b = ItineraryPoiSelectionService._centroid(group_b)
                if haversine_km(center_a, center_b) <= _MERGE_CLUSTER_KM:
                    combined.extend(group_b)
                    used.add(label_b)
                    center_a = ItineraryPoiSelectionService._centroid(combined)
            used.add(label_a)
            merged[label_a] = combined
        return merged

    @staticmethod
    def _centroid(places: list[dict[str, Any]]) -> tuple[float, float]:
        lat = sum(float(p["latitude"]) for p in places) / len(places)
        lng = sum(float(p["longitude"]) for p in places) / len(places)
        return (lat, lng)

    @staticmethod
    def _with_overlap(
        band: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        *,
        used_ids: set[str],
    ) -> list[dict[str, Any]]:
        if not band:
            return [
                p for p in candidates if str(p["id"]) not in used_ids
            ]
        hub = max(band, key=lambda p: float(p.get("_value") or 0.0))
        hub_pt = (float(hub["latitude"]), float(hub["longitude"]))
        band_ids = {str(p["id"]) for p in band}
        extra = []
        for place in candidates:
            place_id = str(place["id"])
            if place_id in band_ids or place_id in used_ids:
                continue
            dist = haversine_km(
                (place["latitude"], place["longitude"]), hub_pt
            )
            if dist <= _BAND_OVERLAP_KM:
                extra.append(place)
        return [*band, *extra]

    def _orienteer_day(
        self,
        pool: list[dict[str, Any]],
        *,
        hub_candidates: list[dict[str, Any]],
        used_ids: set[str],
        target_count: int,
        daily_budget_min: int,
    ) -> list[dict[str, Any]]:
        available = [
            p for p in pool if str(p["id"]) not in used_ids
        ]
        if not available:
            return []
        hero_pool = [
            p for p in hub_candidates if str(p["id"]) not in used_ids
        ] or available
        hero = max(hero_pool, key=lambda p: float(p.get("_value") or 0.0))
        selected = [hero]
        rejected: set[str] = set()
        hub_pt = (float(hero["latitude"]), float(hero["longitude"]))

        while len(selected) < target_count:
            remaining = [
                p
                for p in available
                if str(p["id"]) not in {str(s["id"]) for s in selected}
                and str(p["id"]) not in rejected
            ]
            if not remaining:
                break
            best = max(
                remaining,
                key=lambda p: self._gain(p, selected, hub_pt),
            )
            trial = selected + [best]
            span = self._span_km(trial)
            too_spread = span > _DAY_DIAMETER_KM and (
                span > 40.0 or len(selected) >= 2
            )
            if too_spread or not self._day_fits(trial, daily_budget_min):
                rejected.add(str(best["id"]))
                continue
            selected.append(best)
        return selected

    @staticmethod
    def _gain(
        place: dict[str, Any],
        selected: list[dict[str, Any]],
        hub_pt: tuple[float, float],
    ) -> float:
        value = float(place.get("_value") or 0.0)
        proximity = 0.0
        point = (float(place["latitude"]), float(place["longitude"]))
        for other in selected:
            dist = haversine_km(
                point,
                (float(other["latitude"]), float(other["longitude"])),
            )
            if dist < _NEAR_DUPLICATE_KM:
                proximity = 1.0
                break
        slug = str(place.get("category_slug") or "").lower()
        used_slugs = {
            str(s.get("category_slug") or "").lower()
            for s in selected
            if s.get("category_slug")
        }
        category_repeat = 1.0 if slug and slug in used_slugs else 0.0
        cluster_bonus = (
            1.0 if haversine_km(point, hub_pt) < _HUB_CLUSTER_KM else 0.0
        )
        return (
            value
            - 0.35 * proximity
            - 0.25 * category_repeat
            + 0.20 * cluster_bonus
        )

    def _day_fits(
        self,
        stops: list[dict[str, Any]],
        budget_min: int,
    ) -> bool:
        """Sightseeing budget only — inter-city legs are not charged here."""
        if not stops:
            return True
        used = stay_minutes_for_slug(stops[0].get("category_slug"))
        prev = stops[0]
        for stop in stops[1:]:
            used += self._travel_min(prev, stop)
            used += stay_minutes_for_slug(stop.get("category_slug"))
            prev = stop
        return used <= budget_min

    def _travel_min(self, a: dict[str, Any], b: dict[str, Any]) -> int:
        minutes = haversine_duration_min(
            (float(a["latitude"]), float(a["longitude"])),
            (float(b["latitude"]), float(b["longitude"])),
            speed_kmh=self._speed_kmh,
        )
        return max(1, int(round(minutes)))

    @staticmethod
    def _span_km(places: list[dict[str, Any]]) -> float:
        if len(places) < 2:
            return 0.0
        farthest = 0.0
        for i, left in enumerate(places):
            a = (float(left["latitude"]), float(left["longitude"]))
            for right in places[i + 1 :]:
                dist = haversine_km(
                    a,
                    (float(right["latitude"]), float(right["longitude"])),
                )
                if dist > farthest:
                    farthest = dist
        return farthest

    @staticmethod
    def _hub_label(
        band: list[dict[str, Any]],
        hero: dict[str, Any],
    ) -> str:
        states = [
            str(p.get("state") or "").strip()
            for p in band
            if str(p.get("state") or "").strip()
        ]
        if states:
            return Counter(states).most_common(1)[0][0]
        return str(hero.get("name") or "Stop")
