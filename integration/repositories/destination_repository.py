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

_SKIP_NONE_FIELDS = frozenset(
    {
        "place_id",
        "fetched_at",
        "photo_name",
        "media_enriched_at",
        "description_source",
    }
)


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
        await self._collection.create_index("source")
        await self._collection.create_index("place_id", unique=True, sparse=True)
        await self._collection.create_index(
            [("destination_name", "text"), ("description", "text")]
        )
        logger.info(
            "Ensured indexes on destinations "
            "(name_normalized, category_id, state, is_active, source, "
            "place_id, text)"
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
            and not (key in _SKIP_NONE_FIELDS and value is None)
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

    async def update_media_fields(
        self,
        *,
        name_normalized: str,
        description: str | None = None,
        images: list[str] | None = None,
        photo_name: str | None = None,
        clear_description: bool = False,
        clear_photo_name: bool = False,
        is_featured: bool | None = None,
        media_enriched_at: datetime | None = None,
        mark_media_enriched: bool = False,
        place_id: str | None = None,
        description_source: str | None = None,
    ) -> bool:
        """Patch description/images/photo_name/featured/place_id; returns True if matched."""
        now = datetime.now(timezone.utc)
        fields: dict[str, Any] = {"updated_at": now}
        if clear_description:
            fields["description"] = ""
        elif description is not None:
            fields["description"] = description
        if images is not None:
            fields["images"] = images
        if clear_photo_name:
            fields["photo_name"] = None
        elif photo_name is not None:
            fields["photo_name"] = photo_name
        if is_featured is not None:
            fields["is_featured"] = is_featured
        if place_id is not None:
            fields["place_id"] = place_id
        if description_source is not None:
            fields["description_source"] = description_source
        if mark_media_enriched:
            fields["media_enriched_at"] = media_enriched_at or now
        elif media_enriched_at is not None:
            fields["media_enriched_at"] = media_enriched_at
        if len(fields) == 1:
            return False
        result = await self._collection.update_one(
            {"name_normalized": name_normalized},
            {"$set": fields},
        )
        return result.matched_count > 0

    async def update_state(self, *, name_normalized: str, state: str) -> bool:
        """Patch only the state field. Returns True if a document matched."""
        if not name_normalized or not state:
            return False
        result = await self._collection.update_one(
            {"name_normalized": name_normalized},
            {
                "$set": {
                    "state": state,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        return result.matched_count > 0

    async def list_destinations(
        self,
        *,
        name: str | None = None,
        state: str | None = None,
        category_id: str | None = None,
        source: str | None = None,
        active_only: bool = True,
        limit: int = 1000,
    ) -> list[dict]:
        """Return destinations filtered by optional name, state, and category."""
        query: dict[str, Any] = {}
        if active_only:
            query["is_active"] = True
        if state:
            query["state"] = {"$regex": f"^{state}$", "$options": "i"}
        if category_id:
            query["category_id"] = category_id
        if source:
            query["source"] = source
        if name:
            query["destination_name"] = {"$regex": name.strip(), "$options": "i"}

        cursor = self._collection.find(query).sort("destination_name", 1).limit(limit)
        documents = await cursor.to_list(length=limit)
        return [self._serialize(doc) for doc in documents]

    async def list_with_coordinates(
        self,
        *,
        active_only: bool = True,
        limit: int = 1500,
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

    async def get_by_normalized_name(self, name_normalized: str) -> dict | None:
        """Return a destination by normalized name, or None if not found."""
        document = await self._collection.find_one(
            {"name_normalized": name_normalized}
        )
        return self._serialize(document)

    async def get_by_place_id(self, place_id: str) -> dict | None:
        """Return a destination by Google place_id, or None if not found."""
        if not place_id:
            return None
        document = await self._collection.find_one({"place_id": place_id})
        return self._serialize(document)

    async def get_by_id(self, destination_id: str) -> dict | None:
        """Return a destination by id, or None if not found."""
        try:
            object_id = ObjectId(destination_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    async def get_by_ids(self, destination_ids: list[str]) -> list[dict]:
        """Return destinations matching the given ids (preserves no order)."""
        object_ids: list[ObjectId] = []
        for destination_id in destination_ids:
            try:
                object_ids.append(ObjectId(destination_id))
            except InvalidId:
                continue
        if not object_ids:
            return []
        cursor = self._collection.find({"_id": {"$in": object_ids}})
        documents = await cursor.to_list(length=len(object_ids))
        return [self._serialize(doc) for doc in documents if doc is not None]


    async def deactivate_missing(
        self,
        active_normalized_names: set[str],
        *,
        exclude_sources: list[str] | None = None,
    ) -> int:
        """Soft-deactivate destinations not present in the latest sync set."""
        if not active_normalized_names:
            return 0

        query: dict[str, Any] = {
            "is_active": True,
            "name_normalized": {"$nin": list(active_normalized_names)},
        }
        if exclude_sources:
            query["source"] = {"$nin": exclude_sources}

        result = await self._collection.update_many(
            query,
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        if result.modified_count:
            logger.info(
                "Deactivated %s destinations missing from sync",
                result.modified_count,
            )
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
            "place_id": document.get("place_id"),
            "photo_name": document.get("photo_name"),
            "is_featured": bool(document.get("is_featured", False)),
            "description_source": document.get("description_source"),
            "media_enriched_at": document.get("media_enriched_at"),
            "fetched_at": document.get("fetched_at"),
            "is_active": bool(document.get("is_active", True)),
            "created_at": document.get("created_at"),
            "updated_at": document.get("updated_at"),
        }
