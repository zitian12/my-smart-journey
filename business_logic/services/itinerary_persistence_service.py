"""Persist and load saved itinerary snapshots."""

from __future__ import annotations

import copy
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId

from database.models.itinerary import SavedItinerary
from integration.repositories import (
    DestinationRepository,
    ItineraryRepository,
    TripShareRepository,
)
from services.destination_image_service import DestinationImageService
from services.sustainability_service import SustainabilityService

FALLBACK_IMAGE = (
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80"
)
_FALLBACK_IMAGE_PREFIX = FALLBACK_IMAGE.split("?")[0]

_sustainability = SustainabilityService()


class ItineraryNameConflictError(Exception):
    """Another owned itinerary already uses this display name."""


def ensure_sustainability(itinerary: dict) -> dict:
    """Return itinerary with a sustainability payload (compute if missing)."""
    if not isinstance(itinerary, dict):
        return {}
    out = dict(itinerary)
    existing = out.get("sustainability")
    if isinstance(existing, dict) and existing.get("score") is not None:
        return out
    out["sustainability"] = _sustainability.evaluate_legs(out.get("legs") or [])
    return out


def derive_eco_score(itinerary: dict) -> int:
    """Map sustainability score (reduction %) to a 0–100 integer for cards."""
    payload = ensure_sustainability(itinerary)
    sustainability = payload.get("sustainability") or {}
    try:
        score = float(sustainability.get("score") or 0)
    except (TypeError, ValueError):
        score = 0.0
    return max(0, min(100, int(round(score))))


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


def _is_fallback_cover(url: str | None) -> bool:
    text = (url or "").strip()
    return not text or text == FALLBACK_IMAGE or _FALLBACK_IMAGE_PREFIX in text


def _is_catalog_id(value: str) -> bool:
    try:
        ObjectId(value)
    except (InvalidId, TypeError):
        return False
    return True


def destination_ids_in_order(doc: dict) -> list[str]:
    """Catalog stop ids in trip order (skip start/end address slugs)."""
    seen: set[str] = set()
    ordered: list[str] = []

    itinerary = doc.get("itinerary") or {}
    for dest in itinerary.get("destinations") or []:
        dest_id = str(dest.get("id") or "").strip()
        if dest_id and _is_catalog_id(dest_id) and dest_id not in seen:
            seen.add(dest_id)
            ordered.append(dest_id)

    if ordered:
        return ordered

    for place in doc.get("places") or []:
        place_id = str(place.get("id") or "").strip()
        if place_id and _is_catalog_id(place_id) and place_id not in seen:
            seen.add(place_id)
            ordered.append(place_id)
    return ordered


def first_catalog_cover(
    dest_ids: list[str],
    images_by_id: dict[str, list[str]],
) -> str | None:
    """First trusted photo already stored on a catalog destination."""
    for dest_id in dest_ids:
        images = DestinationImageService.real_images(images_by_id.get(dest_id))
        if images:
            return images[0]
    return None


async def attach_cover_images(
    summaries: list[dict],
    docs: list[dict],
    *,
    destination_repository: DestinationRepository | None = None,
) -> list[dict]:
    """Replace Unsplash fallback covers with the first catalog stop photo."""
    if not summaries:
        return summaries

    doc_by_id = {str(doc.get("id") or ""): doc for doc in docs if doc.get("id")}
    ids_by_trip: dict[str, list[str]] = {}
    all_ids: list[str] = []
    seen_ids: set[str] = set()

    for summary in summaries:
        trip_id = str(summary.get("id") or "")
        doc = doc_by_id.get(trip_id)
        if not trip_id or doc is None:
            continue
        dest_ids = destination_ids_in_order(doc)
        ids_by_trip[trip_id] = dest_ids
        for dest_id in dest_ids:
            if dest_id not in seen_ids:
                seen_ids.add(dest_id)
                all_ids.append(dest_id)

    images_by_id: dict[str, list[str]] = {}
    if all_ids:
        repo = destination_repository or DestinationRepository()
        destinations = await repo.get_by_ids(all_ids)
        images_by_id = {
            str(dest["id"]): dest.get("images") or []
            for dest in destinations
            if dest and dest.get("id")
        }

    for summary in summaries:
        trip_id = str(summary.get("id") or "")
        if not trip_id or not _is_fallback_cover(summary.get("image")):
            continue
        cover = first_catalog_cover(ids_by_trip.get(trip_id) or [], images_by_id)
        if cover:
            summary["image"] = cover
    return summaries


async def resolve_cover_image(
    *,
    itinerary: dict,
    places: list[dict],
    destination_repository: DestinationRepository | None = None,
) -> str:
    """Cover URL for a new save: first catalog stop photo, else places[].image."""
    dest_ids = destination_ids_in_order({"itinerary": itinerary, "places": places})
    images_by_id: dict[str, list[str]] = {}
    if dest_ids:
        repo = destination_repository or DestinationRepository()
        destinations = await repo.get_by_ids(dest_ids)
        images_by_id = {
            str(dest["id"]): dest.get("images") or []
            for dest in destinations
            if dest and dest.get("id")
        }
    return first_catalog_cover(dest_ids, images_by_id) or _cover_image(places)


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
    itinerary = doc.get("itinerary") or {}
    payload = ensure_sustainability(itinerary) if itinerary else {}
    sustainability = payload.get("sustainability") or {}
    eco_score = derive_eco_score(itinerary) if itinerary else int(doc.get("eco_score") or 0)
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
        "eco_score": eco_score,
        "carbon_kg": float(sustainability.get("total_footprint_kg") or 0),
        "baseline_footprint_kg": float(sustainability.get("baseline_footprint_kg") or 0),
        "emissions_reduced_kg": float(sustainability.get("emissions_reduced_kg") or 0),
        "reduction_percent": float(sustainability.get("reduction_percent") or 0),
        "status": doc.get("status") or "upcoming",
        "image": doc.get("image") or FALLBACK_IMAGE,
        "is_favourite": bool(doc.get("is_favourite", False)),
        "created_at": doc.get("created_at"),
    }


def to_detail(doc: dict) -> dict:
    """Map a repository document to detail + snapshot payload."""
    summary = to_summary(doc)
    itinerary = ensure_sustainability(doc.get("itinerary") or {})
    summary["itinerary"] = itinerary
    summary["places"] = doc.get("places") or []
    summary["eco_score"] = derive_eco_score(itinerary)
    return summary


class ItineraryPersistenceService:
    """Create / list / load / rename / favourite / delete saved itineraries."""

    def __init__(
        self,
        repository: ItineraryRepository | None = None,
        share_repository: TripShareRepository | None = None,
        destination_repository: DestinationRepository | None = None,
    ) -> None:
        self._repo = repository or ItineraryRepository()
        self._shares = share_repository or TripShareRepository()
        self._destinations = destination_repository or DestinationRepository()

    async def _summaries_with_covers(self, docs: list[dict]) -> list[dict]:
        summaries = [to_summary(doc) for doc in docs]
        return await attach_cover_images(
            summaries,
            docs,
            destination_repository=self._destinations,
        )

    async def _summary_with_cover(self, doc: dict) -> dict:
        return (await self._summaries_with_covers([doc]))[0]

    async def _detail_with_cover(self, doc: dict) -> dict:
        detail = to_detail(doc)
        await attach_cover_images(
            [detail],
            [doc],
            destination_repository=self._destinations,
        )
        return detail

    async def _assert_unique_name(
        self,
        user_id: str,
        name: str,
        exclude_id: str | None = None,
    ) -> None:
        needle = name.strip().casefold()
        if not needle:
            return
        existing = await self._repo.list_by_user(user_id)
        for doc in existing:
            if exclude_id and str(doc.get("id") or "") == exclude_id:
                continue
            if str(doc.get("name") or "").strip().casefold() == needle:
                raise ItineraryNameConflictError(
                    "A trip with this name already exists. Please choose a different name."
                )

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
        await self._assert_unique_name(user_id, trip_name)

        itinerary = ensure_sustainability(itinerary)
        cover = await resolve_cover_image(
            itinerary=itinerary,
            places=places,
            destination_repository=self._destinations,
        )

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
            eco_score=derive_eco_score(itinerary),
            status="upcoming",
            image=cover,
            is_favourite=False,
            itinerary=itinerary,
            places=places,
        )
        saved = await self._repo.create(document)
        return await self._detail_with_cover(saved)

    async def duplicate_for_user(self, itinerary_id: str, user_id: str) -> dict | None:
        """Clone an owned itinerary snapshot into a new document for the same user."""
        doc = await self._repo.get_by_id(itinerary_id)
        if doc is None or doc.get("user_id") != user_id:
            return None

        original_name = str(doc.get("name") or "").strip() or "Trip"
        itinerary = copy.deepcopy(doc.get("itinerary") or {})
        places = copy.deepcopy(doc.get("places") or [])
        document = SavedItinerary(
            user_id=user_id,
            name=f"{original_name} (copy)",
            start_point=str(doc.get("start_point") or ""),
            end_point=str(doc.get("end_point") or ""),
            location=str(doc.get("location") or ""),
            days=int(doc.get("days") or 1),
            nights=int(doc.get("nights") or 0),
            hours_per_day=int(doc.get("hours_per_day") or 8),
            travelers=int(doc.get("travelers") or 1),
            eco_score=int(doc.get("eco_score") or 0),
            status="upcoming",
            image=str(doc.get("image") or ""),
            is_favourite=False,
            itinerary=itinerary,
            places=places,
        )
        saved = await self._repo.create(document)
        return await self._summary_with_cover(saved)

    async def replace_for_user(
        self,
        itinerary_id: str,
        user_id: str,
        *,
        itinerary: dict,
        places: list[dict],
        travelers: int = 1,
    ) -> dict | None:
        """Overwrite an owned trip snapshot; keep name, favourite, status, created_at."""
        itinerary = ensure_sustainability(itinerary)
        start = str(itinerary.get("start_location") or "").strip() or "Start"
        end = str(itinerary.get("end_location") or "").strip() or "End"
        cover = await resolve_cover_image(
            itinerary=itinerary,
            places=places,
            destination_repository=self._destinations,
        )
        updated = await self._repo.replace_snapshot(
            itinerary_id,
            user_id,
            {
                "itinerary": itinerary,
                "places": places,
                "start_point": start,
                "end_point": end,
                "location": _location_label(itinerary, places),
                "days": int(itinerary.get("days") or 1),
                "nights": int(
                    itinerary.get("nights")
                    or max(0, int(itinerary.get("days") or 1) - 1)
                ),
                "hours_per_day": int(itinerary.get("hours_per_day") or 8),
                "travelers": travelers,
                "eco_score": derive_eco_score(itinerary),
                "image": cover,
            },
        )
        if updated is None:
            return None
        return await self._detail_with_cover(updated)

    async def list_for_user(self, user_id: str) -> list[dict]:
        docs = await self._repo.list_by_user(user_id)
        return await self._summaries_with_covers(docs)

    async def get_for_user(self, itinerary_id: str, user_id: str) -> dict | None:
        doc = await self._repo.get_by_id(itinerary_id)
        if doc is None or doc.get("user_id") != user_id:
            return None
        return await self._detail_with_cover(doc)

    async def set_favourite(
        self,
        itinerary_id: str,
        user_id: str,
        is_favourite: bool,
    ) -> dict | None:
        updated = await self._repo.set_favourite(itinerary_id, user_id, is_favourite)
        if updated is None:
            return None
        return await self._summary_with_cover(updated)

    async def rename(
        self,
        itinerary_id: str,
        user_id: str,
        name: str,
    ) -> dict | None:
        trip_name = name.strip()
        if not trip_name:
            return None
        await self._assert_unique_name(user_id, trip_name, exclude_id=itinerary_id)
        updated = await self._repo.update_name(itinerary_id, user_id, name=trip_name)
        if updated is None:
            return None
        return await self._summary_with_cover(updated)

    async def delete_for_user(self, itinerary_id: str, user_id: str) -> bool:
        deleted = await self._repo.delete_for_user(itinerary_id, user_id)
        if deleted:
            await self._shares.delete_for_itinerary(itinerary_id)
        return deleted
