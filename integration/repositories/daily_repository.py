"""Daily repository — data access for the dailies collection."""

import logging
from datetime import datetime, timezone

from bson import Binary, ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models.daily import Daily

logger = logging.getLogger(__name__)

_METADATA_PROJECTION = {"image_bytes": 0}


class DailyRepository:
    """Handles CRUD operations for 24-hour photo dailies in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["dailies"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the dailies collection."""
        await self._collection.create_index([("user_id", 1), ("expires_at", 1)])
        await self._collection.create_index([("user_id", 1), ("created_at", -1)])
        await self._collection.create_index("expires_at")
        logger.info("Ensured indexes on dailies collection")

    async def create(
        self,
        daily: Daily,
        image_bytes: bytes | None = None,
        content_type: str | None = None,
    ) -> dict:
        """Insert a daily and return the serialized document."""
        document = daily.model_dump(exclude_none=True)
        document["image_url"] = ""
        if image_bytes:
            document["image_bytes"] = Binary(image_bytes)
            document["content_type"] = content_type or "application/octet-stream"
        else:
            document.pop("image_bytes", None)
            document.pop("content_type", None)
        result = await self._collection.insert_one(document)
        if not result.acknowledged:
            raise RuntimeError("MongoDB did not acknowledge the daily insert")

        inserted = await self._collection.find_one(
            {"_id": result.inserted_id},
            _METADATA_PROJECTION,
        )
        if inserted is None:
            raise RuntimeError("Failed to load inserted daily")

        logger.info(
            "Daily created — id=%s user=%s",
            result.inserted_id,
            daily.user_id,
        )
        return self._serialize(inserted)

    async def get_by_id(self, daily_id: str) -> dict | None:
        """Return a daily by id, or None."""
        try:
            object_id = ObjectId(daily_id)
        except InvalidId:
            return None

        document = await self._collection.find_one(
            {"_id": object_id},
            _METADATA_PROJECTION,
        )
        return self._serialize(document)

    async def get_image(self, daily_id: str) -> tuple[bytes, str] | None:
        """Return image bytes and content type, or None."""
        try:
            object_id = ObjectId(daily_id)
        except InvalidId:
            return None

        document = await self._collection.find_one(
            {"_id": object_id},
            {"image_bytes": 1, "content_type": 1},
        )
        if document is None:
            return None
        raw = document.get("image_bytes")
        if not raw:
            return None
        content_type = document.get("content_type") or "application/octet-stream"
        return bytes(raw), content_type

    async def list_unexpired_for_users(self, user_ids: list[str]) -> list[dict]:
        """Return unexpired dailies for the given users, oldest first."""
        if not user_ids:
            return []

        now = datetime.now(timezone.utc)
        cursor = self._collection.find(
            {
                "user_id": {"$in": user_ids},
                "expires_at": {"$gt": now},
            },
            _METADATA_PROJECTION,
        ).sort("created_at", 1)
        documents = await cursor.to_list(length=500)
        items: list[dict] = []
        for document in documents:
            serialized = self._serialize(document)
            if serialized is not None:
                items.append(serialized)
        return items

    async def list_for_user(self, user_id: str) -> list[dict]:
        """Return all dailies for a user (including expired), newest first."""
        cursor = self._collection.find(
            {"user_id": user_id},
            _METADATA_PROJECTION,
        ).sort("created_at", -1)
        documents = await cursor.to_list(length=500)
        items: list[dict] = []
        for document in documents:
            serialized = self._serialize(document)
            if serialized is not None:
                items.append(serialized)
        return items

    async def delete(self, daily_id: str) -> dict | None:
        """Delete a daily by id. Returns the removed document, or None."""
        existing = await self.get_by_id(daily_id)
        if existing is None:
            return None

        try:
            object_id = ObjectId(daily_id)
        except InvalidId:
            return None

        result = await self._collection.delete_one({"_id": object_id})
        if result.deleted_count == 0:
            return None

        logger.info("Deleted daily — id=%s", daily_id)
        return existing

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None

        created_at = document.get("created_at")
        expires_at = document.get("expires_at")
        daily_id = str(document["_id"])
        has_image = bool(document.get("content_type"))
        stored_url = document.get("image_url") or ""
        kind = document.get("kind") or (
            "photo" if has_image or stored_url else "text"
        )
        trip = document.get("trip")
        if not isinstance(trip, dict) or not trip.get("id"):
            trip = None
        return {
            "id": daily_id,
            "user_id": document.get("user_id") or "",
            "kind": kind,
            "image_url": f"/api/dailies/{daily_id}/image" if has_image else stored_url,
            "caption": document.get("caption") or "",
            "trip": trip,
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else created_at,
            "expires_at": expires_at.isoformat()
            if isinstance(expires_at, datetime)
            else expires_at,
        }
