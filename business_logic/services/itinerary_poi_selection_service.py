"""Select itinerary stops from the MongoDB destination catalog."""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any

from config import GEMINI_API_KEY, GEMINI_MODEL
from integration.external_api import GeminiClient
from integration.repositories import (
    DestinationCategoryRepository,
    DestinationRepository,
)

logger = logging.getLogger(__name__)

_CORRIDOR_KM = 100.0
_WIDE_CORRIDOR_KM = 180.0
_MIN_CANDIDATES = 8
_MAX_CANDIDATES_FOR_GEMINI = 40
_STOPS_PER_DAY = 3
_DEFAULT_HOURS_PER_DAY = 8


def _haversine_km(
    a: tuple[float, float],
    b: tuple[float, float],
) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def _point_to_segment_km(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    """Approximate distance from point to great-circle segment (km)."""
    # Project in local equirectangular plane around segment midpoint.
    lat0 = math.radians((start[0] + end[0]) / 2.0)
    def to_xy(lat: float, lon: float) -> tuple[float, float]:
        x = math.radians(lon) * math.cos(lat0) * 6371.0
        y = math.radians(lat) * 6371.0
        return x, y

    px, py = to_xy(*point)
    ax, ay = to_xy(*start)
    bx, by = to_xy(*end)
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    if ab2 < 1e-9:
        return _haversine_km(point, start)
    t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab2))
    cx, cy = ax + t * abx, ay + t * aby
    return math.hypot(px - cx, py - cy)


class ItineraryPoiSelectionService:
    """Corridor-filter catalog POIs, then Gemini-rank (with rule fallback)."""

    def __init__(
        self,
        destination_repository: DestinationRepository | None = None,
        category_repository: DestinationCategoryRepository | None = None,
        gemini_client: GeminiClient | None = None,
    ) -> None:
        self._destinations = destination_repository or DestinationRepository()
        self._categories = category_repository or DestinationCategoryRepository()
        self._gemini = gemini_client
        if self._gemini is None and GEMINI_API_KEY:
            try:
                self._gemini = GeminiClient(
                    api_key=GEMINI_API_KEY,
                    model=GEMINI_MODEL,
                )
            except ValueError:
                self._gemini = None

    async def select_places(
        self,
        *,
        start: dict[str, Any],
        end: dict[str, Any],
        days: int,
        nights: int,
        interests: list[str],
        hours_per_day: int = _DEFAULT_HOURS_PER_DAY,
    ) -> list[dict[str, Any]]:
        """Return PlaceInput-shaped dicts chosen only from the catalog."""
        enriched = await self._load_enriched_catalog()
        start_id = str(start.get("id") or "")
        end_id = str(end.get("id") or "")
        start_name = str(start.get("name") or "").strip().lower()
        end_name = str(end.get("name") or "").strip().lower()

        pool: list[dict[str, Any]] = []
        for item in enriched:
            item_id = str(item.get("id") or "")
            name = str(item.get("destination_name") or "").strip()
            lat = item.get("latitude")
            lng = item.get("longitude")
            if lat is None or lng is None:
                continue
            if item_id and item_id in {start_id, end_id}:
                continue
            if name.lower() in {start_name, end_name}:
                continue
            pool.append(
                {
                    "id": item_id,
                    "name": name,
                    "latitude": float(lat),
                    "longitude": float(lng),
                    "category_slug": item.get("category_slug"),
                    "state": item.get("state") or "",
                    "images": item.get("images") or [],
                }
            )

        if not pool:
            raise ValueError(
                "No catalog destinations with map coordinates are available."
            )

        start_pt = (float(start["latitude"]), float(start["longitude"]))
        end_pt = (float(end["latitude"]), float(end["longitude"]))
        mid_pt = ((start_pt[0] + end_pt[0]) / 2.0, (start_pt[1] + end_pt[1]) / 2.0)

        candidates = self._corridor_filter(pool, start_pt, end_pt, _CORRIDOR_KM)
        if len(candidates) < _MIN_CANDIDATES:
            candidates = self._corridor_filter(
                pool, start_pt, end_pt, _WIDE_CORRIDOR_KM
            )
        if not candidates:
            scored = sorted(
                pool,
                key=lambda p: _haversine_km(
                    (p["latitude"], p["longitude"]), mid_pt
                ),
            )
            candidates = scored[: max(_MIN_CANDIDATES, _STOPS_PER_DAY * days)]

        if not candidates:
            raise ValueError(
                "No catalog destinations found near the start–end route."
            )

        # Prefer interest matches but keep enough candidates to fill all days.
        shortlist = self._interest_shortlist(
            candidates,
            interests=interests,
            limit=_MAX_CANDIDATES_FOR_GEMINI,
        )
        # Budget-driven target: ~90 stay + ~30 travel per stop; fill all days.
        usable_min = max(1, days) * max(1, hours_per_day) * 60
        budget_target = max(1, usable_min // 120)
        target_count = max(
            days,
            min(len(candidates), days * 4, budget_target),
        )
        # Ensure Gemini shortlist is large enough to reach target.
        if len(shortlist) < target_count:
            seen = {str(p["id"]) for p in shortlist}
            for place in candidates:
                if str(place["id"]) in seen:
                    continue
                shortlist.append(place)
                seen.add(str(place["id"]))
                if len(shortlist) >= min(target_count * 2, _MAX_CANDIDATES_FOR_GEMINI):
                    break

        picked_ids: list[dict[str, Any]] = []
        if self._gemini is not None and not GeminiClient.is_rate_limited():
            try:
                picked_ids = await asyncio.to_thread(
                    self._gemini.pick_itinerary_stops,
                    candidates=shortlist,
                    start_name=str(start.get("name") or ""),
                    end_name=str(end.get("name") or ""),
                    days=days,
                    nights=nights,
                    interests=interests,
                    target_count=target_count,
                )
            except Exception as exc:  # noqa: BLE001 — fall back to rules
                logger.warning("Gemini stop pick failed; using rule fallback: %s", exc)
        elif GeminiClient.is_rate_limited():
            logger.info("Skipping Gemini stop pick — rate-limit cooldown")

        if not picked_ids:
            picked_ids = self._rule_pick(
                shortlist,
                start_pt=start_pt,
                end_pt=end_pt,
                interests=interests,
                target_count=target_count,
            )
        if len(picked_ids) < target_count:
            # Top up from full corridor candidates (not only shortlist).
            picked_ids = self._top_up_picks(
                picked_ids,
                candidates,
                start_pt=start_pt,
                end_pt=end_pt,
                interests=interests,
                target_count=target_count,
            )

        max_stay = max(30, hours_per_day * 60 - 45)
        by_id = {str(p["id"]): p for p in candidates}
        places: list[dict[str, Any]] = []
        for picked in picked_ids:
            place = by_id.get(str(picked.get("id") or ""))
            if not place:
                continue
            payload = {
                "id": place["id"],
                "name": place["name"],
                "latitude": place["latitude"],
                "longitude": place["longitude"],
                "category_slug": place.get("category_slug"),
            }
            stay = picked.get("recommended_stay_minutes")
            if stay is None:
                stay = 90
            payload["recommended_stay_minutes"] = max(30, min(int(stay), max_stay))
            places.append(payload)

        if not places:
            raise ValueError(
                "Could not select destinations from the catalog for this route."
            )
        return places

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
    def _corridor_filter(
        pool: list[dict[str, Any]],
        start: tuple[float, float],
        end: tuple[float, float],
        radius_km: float,
    ) -> list[dict[str, Any]]:
        selected: list[dict[str, Any]] = []
        for place in pool:
            dist = _point_to_segment_km(
                (place["latitude"], place["longitude"]),
                start,
                end,
            )
            if dist <= radius_km:
                row = dict(place)
                row["_corridor_km"] = dist
                selected.append(row)
        selected.sort(key=lambda p: float(p.get("_corridor_km") or 0.0))
        return selected

    @staticmethod
    def _interest_shortlist(
        candidates: list[dict[str, Any]],
        *,
        interests: list[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        if not interests or len(candidates) <= limit:
            return candidates[:limit]

        interest_set = {i.lower() for i in interests}
        matched = [
            c
            for c in candidates
            if str(c.get("category_slug") or "").lower() in interest_set
        ]
        others = [
            c
            for c in candidates
            if str(c.get("category_slug") or "").lower() not in interest_set
        ]
        # ~70% interest matches, ~30% diversity fillers.
        match_slots = max(1, int(round(limit * 0.7)))
        shortlist = matched[:match_slots] + others[: max(0, limit - match_slots)]
        if len(shortlist) < min(limit, len(candidates)):
            seen = {str(p["id"]) for p in shortlist}
            for place in candidates:
                if str(place["id"]) in seen:
                    continue
                shortlist.append(place)
                if len(shortlist) >= limit:
                    break
        return shortlist[:limit]

    @staticmethod
    def _top_up_picks(
        picked: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        *,
        start_pt: tuple[float, float],
        end_pt: tuple[float, float],
        interests: list[str],
        target_count: int,
    ) -> list[dict[str, Any]]:
        """Append rule-picked stops until target_count, skipping already picked ids."""
        seen = {str(p.get("id") or "") for p in picked}
        remaining = [c for c in candidates if str(c.get("id") or "") not in seen]
        if not remaining or len(picked) >= target_count:
            return picked

        extra = ItineraryPoiSelectionService._rule_pick(
            remaining,
            start_pt=start_pt,
            end_pt=end_pt,
            interests=interests,
            target_count=target_count - len(picked),
        )
        return [*picked, *extra]

    @staticmethod
    def _rule_pick(
        candidates: list[dict[str, Any]],
        *,
        start_pt: tuple[float, float],
        end_pt: tuple[float, float],
        interests: list[str],
        target_count: int,
    ) -> list[dict[str, Any]]:
        interest_set = {i.lower() for i in interests}
        selected: list[dict[str, Any]] = []
        used_categories: set[str] = set()

        def score(place: dict[str, Any]) -> tuple[float, float, float]:
            corridor = float(place.get("_corridor_km") or _point_to_segment_km(
                (place["latitude"], place["longitude"]),
                start_pt,
                end_pt,
            ))
            slug = str(place.get("category_slug") or "").lower()
            interest_bonus = -1.0 if slug in interest_set else 0.0
            diversity_penalty = 0.5 if slug and slug in used_categories else 0.0
            # Prefer progress along the route (closer to start first).
            progress = _haversine_km(
                start_pt, (place["latitude"], place["longitude"])
            )
            return (corridor + diversity_penalty + interest_bonus, progress, corridor)

        remaining = list(candidates)
        while remaining and len(selected) < target_count:
            # Soft diversity: every ~3rd pick force a non-used category if possible.
            force_diverse = (
                interest_set
                and len(selected) > 0
                and len(selected) % 3 == 2
            )
            pool = remaining
            if force_diverse:
                diverse = [
                    p
                    for p in remaining
                    if str(p.get("category_slug") or "").lower() not in used_categories
                ]
                if diverse:
                    pool = diverse
            nxt = min(pool, key=score)
            remaining = [p for p in remaining if p["id"] != nxt["id"]]
            selected.append({"id": nxt["id"], "recommended_stay_minutes": None})
            slug = str(nxt.get("category_slug") or "").lower()
            if slug:
                used_categories.add(slug)

        return selected
