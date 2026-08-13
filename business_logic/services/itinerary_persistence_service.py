"""Persist and load saved itinerary snapshots."""

from __future__ import annotations

from datetime import datetime

from database.models.itinerary import SavedItinerary
from integration.repositories import ItineraryRepository

FALLBACK_IMAGE = (
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80"
)


def derive_eco_score(carbon_kg: float) -> int:
    """Map trip carbon to a 0–100 eco score (lower carbon → higher score)."""
    return max(0, min(100, int(round(100 - float(carbon_kg)))))


def _format_date(created_at: str | datetime | None) -> str:
    if isinstance(created_at, datetime):
        return created_at.strftime("%d %b %Y")
    if isinstance(created_at, str) and created_at:
        try:
            parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            return parsed.strftime("%d %b %Y")
        except ValueError:
            return created_at[:10]
    return ""


def _cover_image(places: list[dict]) -> str:
    for place in places:
        image = place.get("image")
        if isinstance(image, str) and image.strip():
            return image.strip()
    return FALLBACK_IMAGE


def _location_label(itinerary: dict, places: list[dict]) -> str:
    states = []
    for place in places:
        state = place.get("state")
        if isinstance(state, str) and state.strip() and state.strip() not in states:
            states.append(state.strip())
    if states:
        return " · ".join(states) + ", Malaysia"

    stop_names = [
        str(d.get("name") or "").strip()
        for d in itinerary.get("destinations") or []
        if str(d.get("name") or "").strip()
    ]
    if stop_names:
        shown = stop_names[:3]
        suffix = "…" if len(stop_names) > 3 else ""
        return " · ".join(shown) + suffix + ", Malaysia"

    start = str(itinerary.get("start_location") or "").strip()
    end = str(itinerary.get("end_location") or "").strip()
    if start and end:
        return f"{start} → {end}"
    return start or end or "Malaysia"


def to_summary(doc: dict) -> dict:
    """Map a repository document to list-card fields."""
    return {
        "id": doc["id"],
        "name": doc.get("name") or "",
        "start_point": doc.get("start_point") or "",
        "end_point": doc.get("end_point") or "",
        "location": doc.get("location") or "",
        "date": _format_date(doc.get("created_at")),
        "days": int(doc.get("days") or 1),
        "nights": int(doc.get("nights") or 0),
        "travelers": int(doc.get("travelers") or 1),
        "hours_per_day": int(doc.get("hours_per_day") or 8),
        "eco_score": int(doc.get("eco_score") or 80),
        "status": doc.get("status") or "upcoming",
        "image": doc.get("image") or FALLBACK_IMAGE,
        "is_favourite": bool(doc.get("is_favourite", False)),
        "created_at": doc.get("created_at"),
    }


def to_detail(doc: dict) -> dict:
    """Map a repository document to detail + snapshot payload."""
    summary = to_summary(doc)
    summary["itinerary"] = doc.get("itinerary") or {}
    summary["places"] = doc.get("places") or []
    return summary


class ItineraryPersistenceService:
    """Create / list / load / favourite / delete saved itineraries."""

    def __init__(self, repository: ItineraryRepository | None = None) -> None:
        self._repo = repository or ItineraryRepository()

    async def save(
        self,
        *,
        user_id: str,
        name: str | None,
        itinerary: dict,
        places: list[dict],
        travelers: int = 1,
    ) -> dict:
        start = str(itinerary.get("start_location") or "").strip() or "Start"
        end = str(itinerary.get("end_location") or "").strip() or "End"
        trip_name = (name or "").strip() or f"{start} → {end}"

        totals = itinerary.get("totals") or {}
        carbon = float(totals.get("carbon_kg") or 0)

        document = SavedItinerary(
            user_id=user_id,
            name=trip_name,
            start_point=start,
            end_point=end,
            location=_location_label(itinerary, places),
            days=int(itinerary.get("days") or 1),
            nights=int(itinerary.get("nights") or max(0, int(itinerary.get("days") or 1) - 1)),
            hours_per_day=int(itinerary.get("hours_per_day") or 8),
            travelers=travelers,
            eco_score=derive_eco_score(carbon),
            status="upcoming",
            image=_cover_image(places),
            is_favourite=False,
            itinerary=itinerary,
            places=places,
        )
        saved = await self._repo.create(document)
        return to_detail(saved)

    async def list_for_user(self, user_id: str) -> list[dict]:
        docs = await self._repo.list_by_user(user_id)
        return [to_summary(doc) for doc in docs]

    async def get_for_user(self, itinerary_id: str, user_id: str) -> dict | None:
        doc = await self._repo.get_by_id(itinerary_id)
        if doc is None or doc.get("user_id") != user_id:
            return None
        return to_detail(doc)

    async def set_favourite(
        self,
        itinerary_id: str,
        user_id: str,
        is_favourite: bool,
    ) -> dict | None:
        updated = await self._repo.set_favourite(itinerary_id, user_id, is_favourite)
        if updated is None:
            return None
        return to_summary(updated)

    async def delete_for_user(self, itinerary_id: str, user_id: str) -> bool:
        return await self._repo.delete_for_user(itinerary_id, user_id)
