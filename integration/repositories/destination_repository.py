"""Destination repository — data access for the destinations collection."""

import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models import Destination

logger = logging.getLogger(__name__)


class DestinationRepository:
    """Handles CRUD operations for destinations in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["destinations"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the destinations collection."""
        await self._collection.create_index("name_normalized", unique=True)
        await self._collection.create_index("category_id")
        await self._collection.create_index("state")
        await self._collection.create_index("is_active")
        await self._collection.create_index(
            [("destination_name", "text"), ("description", "text")]
        )
        logger.info(
            "Ensured indexes on destinations "
            "(name_normalized, category_id, state, is_active, text)"
        )

    async def upsert_by_name(self, destination: Destination) -> dict:
        """Insert or update a destination by normalized name."""
        now = datetime.now(timezone.utc)
        payload = destination.model_dump()
        payload["updated_at"] = now

        set_on_insert = {
            "name_normalized": destination.name_normalized,
            "created_at": destination.created_at,
            "source": destination.source,
        }
        set_fields = {
            key: value
            for key, value in payload.items()
            if key not in ("name_normalized", "created_at", "source")
        }

        result = await self._collection.update_one(
            {"name_normalized": destination.name_normalized},
            {"$set": set_fields, "$setOnInsert": set_on_insert},
            upsert=True,
        )

        document = await self._collection.find_one(
            {"name_normalized": destination.name_normalized}
        )
        if document is None:
            raise RuntimeError(
                f"Failed to upsert destination: {destination.destination_name}"
            )

        action = "inserted" if result.upserted_id else "updated"
        logger.info(
            "Destination %s — name=%s",
            action,
            destination.destination_name,
        )
        return self._serialize(document)

    async def list_destinations(
        self,
        *,
        name: str | None = None,
        state: str | None = None,
        category_id: str | None = None,
        active_only: bool = True,
        limit: int = 300,
    ) -> list[dict]:
        """Return destinations filtered by optional name, state, and category."""
        query: dict[str, Any] = {}
        if active_only:
            query["is_active"] = True
        if state:
            query["state"] = {"$regex": f"^{state}$", "$options": "i"}
        if category_id:
            query["category_id"] = category_id
        if name:
            query["destination_name"] = {"$regex": name.strip(), "$options": "i"}

        cursor = self._collection.find(query).sort("destination_name", 1).limit(limit)
        documents = await cursor.to_list(length=limit)
        return [self._serialize(doc) for doc in documents]

    async def list_with_coordinates(
        self,
        *,
        active_only: bool = True,
        limit: int = 500,
    ) -> list[dict]:
        """Return active destinations that have usable map coordinates."""
        query: dict[str, Any] = {
            "latitude": {"$ne": None, "$exists": True},
            "longitude": {"$ne": None, "$exists": True},
        }
        if active_only:
            query["is_active"] = True

        cursor = self._collection.find(query).sort("destination_name", 1).limit(limit)
        documents = await cursor.to_list(length=limit)
        serialized = [self._serialize(doc) for doc in documents]
        return [
            item
            for item in serialized
            if isinstance(item.get("latitude"), (int, float))
            and isinstance(item.get("longitude"), (int, float))
        ]

    async def get_by_id(self, destination_id: str) -> dict | None:
        """Return a destination by id, or None if not found."""
        try:
            object_id = ObjectId(destination_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    async def deactivate_missing(self, active_normalized_names: set[str]) -> int:
        """Soft-deactivate destinations not present in the latest sync set."""
        if not active_normalized_names:
            return 0

        result = await self._collection.update_many(
            {
                "is_active": True,
                "name_normalized": {"$nin": list(active_normalized_names)},
            },
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        if result.modified_count:
            logger.info("Deactivated %s destinations missing from sync", result.modified_count)
        return result.modified_count

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None
        return {
            "id": str(document["_id"]),
            "destination_name": document.get("destination_name") or "",
            "name_normalized": document.get("name_normalized") or "",
            "description": document.get("description") or "",
            "category_id": document.get("category_id") or "",
            "state": document.get("state") or "",
            "location": document.get("location") or "",
            "latitude": document.get("latitude"),
            "longitude": document.get("longitude"),
            "operating_hours": document.get("operating_hours") or "",
            "images": document.get("images") or [],
            "source": document.get("source") or "gemini",
            "is_active": bool(document.get("is_active", True)),
            "created_at": document.get("created_at"),
            "updated_at": document.get("updated_at"),
        }
