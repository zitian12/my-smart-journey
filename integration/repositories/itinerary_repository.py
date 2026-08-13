"""Itinerary repository — data access for the itineraries collection."""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models.itinerary import SavedItinerary

logger = logging.getLogger(__name__)


class ItineraryRepository:
    """Handles CRUD operations for saved itineraries in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["itineraries"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the itineraries collection."""
        await self._collection.create_index([("user_id", 1), ("created_at", -1)])
        await self._collection.create_index("user_id")
        logger.info("Ensured indexes on itineraries (user_id, user_id+created_at)")

    async def create(self, itinerary: SavedItinerary) -> dict:
        """Insert a saved itinerary and return the serialized document."""
        document = itinerary.model_dump()
        result = await self._collection.insert_one(document)
        if not result.acknowledged:
            raise RuntimeError("MongoDB did not acknowledge the itinerary insert")

        inserted = await self._collection.find_one({"_id": result.inserted_id})
        if inserted is None:
            raise RuntimeError("Failed to load inserted itinerary")

        logger.info(
            "Itinerary saved — id=%s user_id=%s name=%s",
            result.inserted_id,
            itinerary.user_id,
            itinerary.name,
        )
        return self._serialize(inserted)

    async def list_by_user(self, user_id: str) -> list[dict]:
        """Return saved itineraries for a user, newest first."""
        cursor = (
            self._collection.find({"user_id": user_id})
            .sort("created_at", -1)
        )
        documents = await cursor.to_list(length=500)
        return [self._serialize(doc) for doc in documents]

    async def get_by_id(self, itinerary_id: str) -> dict | None:
        """Return a saved itinerary by id, or None."""
        try:
            object_id = ObjectId(itinerary_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    async def delete_for_user(self, itinerary_id: str, user_id: str) -> bool:
        """Delete an itinerary owned by the user. Returns True if removed."""
        try:
            object_id = ObjectId(itinerary_id)
        except InvalidId:
            return False

        result = await self._collection.delete_one(
            {"_id": object_id, "user_id": user_id}
        )
        if result.deleted_count == 0:
            return False

        logger.info("Deleted itinerary — id=%s user_id=%s", itinerary_id, user_id)
        return True

    async def set_favourite(
        self,
        itinerary_id: str,
        user_id: str,
        is_favourite: bool,
    ) -> dict | None:
        """Update favourite flag for an owned itinerary."""
        try:
            object_id = ObjectId(itinerary_id)
        except InvalidId:
            return None

        result = await self._collection.update_one(
            {"_id": object_id, "user_id": user_id},
            {
                "$set": {
                    "is_favourite": is_favourite,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        if result.matched_count == 0:
            return None

        return await self.get_by_id(itinerary_id)

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None

        created_at = document.get("created_at")
        updated_at = document.get("updated_at")

        return {
            "id": str(document["_id"]),
            "user_id": document.get("user_id") or "",
            "name": document.get("name") or "",
            "start_point": document.get("start_point") or "",
            "end_point": document.get("end_point") or "",
            "location": document.get("location") or "",
            "days": int(document.get("days") or 1),
            "nights": int(document.get("nights") or 0),
            "hours_per_day": int(document.get("hours_per_day") or 8),
            "travelers": int(document.get("travelers") or 1),
            "eco_score": int(document.get("eco_score") or 80),
            "status": document.get("status") or "upcoming",
            "image": document.get("image") or "",
            "is_favourite": bool(document.get("is_favourite", False)),
            "itinerary": document.get("itinerary") or {},
            "places": document.get("places") or [],
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else created_at,
            "updated_at": updated_at.isoformat()
            if isinstance(updated_at, datetime)
            else updated_at,
        }
