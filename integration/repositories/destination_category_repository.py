"""Destination category repository — data access for destination_categories."""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models import DestinationCategory

logger = logging.getLogger(__name__)


class DestinationCategoryRepository:
    """Handles CRUD operations for destination categories in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()[
            "destination_categories"
        ]

    async def ensure_indexes(self) -> None:
        """Create indexes for the destination_categories collection."""
        await self._collection.create_index("slug", unique=True)
        await self._collection.create_index("is_active")
        logger.info("Ensured indexes on destination_categories (slug, is_active)")

    async def ensure_category(self, category: DestinationCategory) -> dict:
        """Insert or update a category by slug and return the serialized document."""
        now = datetime.now(timezone.utc)
        result = await self._collection.update_one(
            {"slug": category.slug},
            {
                "$set": {
                    "name": category.name,
                    "description": category.description,
                    "is_active": category.is_active,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "slug": category.slug,
                    "created_at": category.created_at,
                },
            },
            upsert=True,
        )

        document = await self._collection.find_one({"slug": category.slug})
        if document is None:
            raise RuntimeError(f"Failed to ensure category: {category.slug}")

        action = "inserted" if result.upserted_id else "updated"
        logger.info("Category %s — slug=%s", action, category.slug)
        return self._serialize(document)

    async def list_active(self) -> list[dict]:
        """Return all active categories ordered by name."""
        cursor = self._collection.find({"is_active": True}).sort("name", 1)
        documents = await cursor.to_list(length=100)
        return [self._serialize(doc) for doc in documents]

    async def get_by_slug(self, slug: str) -> dict | None:
        """Return a category by slug, or None if not found."""
        document = await self._collection.find_one({"slug": slug})
        return self._serialize(document)

    async def get_by_id(self, category_id: str) -> dict | None:
        """Return a category by id, or None if not found."""
        try:
            object_id = ObjectId(category_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None
        return {
            "id": str(document["_id"]),
            "name": document.get("name") or "",
            "slug": document.get("slug") or "",
            "description": document.get("description") or "",
            "is_active": bool(document.get("is_active", True)),
            "created_at": document.get("created_at"),
            "updated_at": document.get("updated_at"),
        }
