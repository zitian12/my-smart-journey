"""Favourite destinations, folders, and folder items repositories."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo.errors import DuplicateKeyError

from database.connection import get_database
from database.models.favourite import (
    FavouriteDestination,
    FavouriteFolder,
    FavouriteFolderItem,
)

logger = logging.getLogger(__name__)


class FavouriteDestinationRepository:
    """CRUD for the favourite_destinations collection."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()[
            "favourite_destinations"
        ]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("user_id", 1), ("destination_id", 1)],
            unique=True,
        )
        await self._collection.create_index("user_id")
        logger.info(
            "Ensured indexes on favourite_destinations "
            "(user_id+destination_id unique, user_id)"
        )

    async def add(self, favourite: FavouriteDestination) -> dict:
        """Insert a favourite; return existing if already present."""
        existing = await self._collection.find_one(
            {
                "user_id": favourite.user_id,
                "destination_id": favourite.destination_id,
            }
        )
        if existing is not None:
            return self._serialize(existing)

        document = favourite.model_dump()
        try:
            result = await self._collection.insert_one(document)
        except DuplicateKeyError:
            existing = await self._collection.find_one(
                {
                    "user_id": favourite.user_id,
                    "destination_id": favourite.destination_id,
                }
            )
            if existing is None:
                raise
            return self._serialize(existing)

        inserted = await self._collection.find_one({"_id": result.inserted_id})
        if inserted is None:
            raise RuntimeError("Failed to load inserted favourite")
        return self._serialize(inserted)

    async def remove(self, user_id: str, destination_id: str) -> bool:
        result = await self._collection.delete_one(
            {"user_id": user_id, "destination_id": destination_id}
        )
        return result.deleted_count > 0

    async def list_destination_ids(self, user_id: str) -> list[str]:
        cursor = self._collection.find(
            {"user_id": user_id},
            {"destination_id": 1},
        ).sort("created_at", -1)
        documents = await cursor.to_list(length=5000)
        return [
            str(doc.get("destination_id") or "")
            for doc in documents
            if doc.get("destination_id")
        ]

    async def list_by_user(self, user_id: str) -> list[dict]:
        cursor = self._collection.find({"user_id": user_id}).sort("created_at", -1)
        documents = await cursor.to_list(length=5000)
        return [self._serialize(doc) for doc in documents]

    async def exists(self, user_id: str, destination_id: str) -> bool:
        document = await self._collection.find_one(
            {"user_id": user_id, "destination_id": destination_id},
            {"_id": 1},
        )
        return document is not None

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None
        created_at = document.get("created_at")
        return {
            "id": str(document["_id"]),
            "user_id": document.get("user_id") or "",
            "destination_id": document.get("destination_id") or "",
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else created_at,
        }


class FavouriteFolderRepository:
    """CRUD for the favourite_folders collection."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["favourite_folders"]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index("user_id")
        logger.info("Ensured indexes on favourite_folders (user_id)")

    async def create(self, folder: FavouriteFolder) -> dict:
        document = folder.model_dump()
        result = await self._collection.insert_one(document)
        inserted = await self._collection.find_one({"_id": result.inserted_id})
        if inserted is None:
            raise RuntimeError("Failed to load inserted folder")
        return self._serialize(inserted)

    async def list_by_user(self, user_id: str) -> list[dict]:
        cursor = self._collection.find({"user_id": user_id}).sort("created_at", -1)
        documents = await cursor.to_list(length=500)
        return [self._serialize(doc) for doc in documents]

    async def get_for_user(self, folder_id: str, user_id: str) -> dict | None:
        try:
            object_id = ObjectId(folder_id)
        except InvalidId:
            return None
        document = await self._collection.find_one(
            {"_id": object_id, "user_id": user_id}
        )
        return self._serialize(document)

    async def rename(self, folder_id: str, user_id: str, name: str) -> dict | None:
        try:
            object_id = ObjectId(folder_id)
        except InvalidId:
            return None
        result = await self._collection.update_one(
            {"_id": object_id, "user_id": user_id},
            {
                "$set": {
                    "name": name,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        if result.matched_count == 0:
            return None
        return await self.get_for_user(folder_id, user_id)

    async def delete(self, folder_id: str, user_id: str) -> bool:
        try:
            object_id = ObjectId(folder_id)
        except InvalidId:
            return False
        result = await self._collection.delete_one(
            {"_id": object_id, "user_id": user_id}
        )
        return result.deleted_count > 0

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
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else created_at,
            "updated_at": updated_at.isoformat()
            if isinstance(updated_at, datetime)
            else updated_at,
        }


class FavouriteFolderItemRepository:
    """CRUD for the favourite_folder_items collection."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()[
            "favourite_folder_items"
        ]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("folder_id", 1), ("destination_id", 1)],
            unique=True,
        )
        await self._collection.create_index([("user_id", 1), ("folder_id", 1)])
        logger.info(
            "Ensured indexes on favourite_folder_items "
            "(folder_id+destination_id unique, user_id+folder_id)"
        )

    async def add(self, item: FavouriteFolderItem) -> dict:
        existing = await self._collection.find_one(
            {
                "folder_id": item.folder_id,
                "destination_id": item.destination_id,
            }
        )
        if existing is not None:
            return self._serialize(existing)

        document = item.model_dump()
        try:
            result = await self._collection.insert_one(document)
        except DuplicateKeyError:
            existing = await self._collection.find_one(
                {
                    "folder_id": item.folder_id,
                    "destination_id": item.destination_id,
                }
            )
            if existing is None:
                raise
            return self._serialize(existing)

        inserted = await self._collection.find_one({"_id": result.inserted_id})
        if inserted is None:
            raise RuntimeError("Failed to load inserted folder item")
        return self._serialize(inserted)

    async def remove(
        self,
        folder_id: str,
        user_id: str,
        destination_id: str,
    ) -> bool:
        result = await self._collection.delete_one(
            {
                "folder_id": folder_id,
                "user_id": user_id,
                "destination_id": destination_id,
            }
        )
        return result.deleted_count > 0

    async def list_by_folder(self, folder_id: str, user_id: str) -> list[dict]:
        cursor = self._collection.find(
            {"folder_id": folder_id, "user_id": user_id}
        ).sort("created_at", -1)
        documents = await cursor.to_list(length=5000)
        return [self._serialize(doc) for doc in documents]

    async def count_by_folder_ids(
        self,
        user_id: str,
        folder_ids: list[str],
    ) -> dict[str, int]:
        if not folder_ids:
            return {}
        pipeline = [
            {"$match": {"user_id": user_id, "folder_id": {"$in": folder_ids}}},
            {"$group": {"_id": "$folder_id", "count": {"$sum": 1}}},
        ]
        rows = await self._collection.aggregate(pipeline).to_list(length=len(folder_ids))
        return {str(row["_id"]): int(row["count"]) for row in rows}

    async def delete_by_folder(self, folder_id: str, user_id: str) -> int:
        result = await self._collection.delete_many(
            {"folder_id": folder_id, "user_id": user_id}
        )
        return result.deleted_count

    async def delete_destination_for_user(
        self,
        user_id: str,
        destination_id: str,
    ) -> int:
        result = await self._collection.delete_many(
            {"user_id": user_id, "destination_id": destination_id}
        )
        return result.deleted_count

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None
        created_at = document.get("created_at")
        return {
            "id": str(document["_id"]),
            "user_id": document.get("user_id") or "",
            "folder_id": document.get("folder_id") or "",
            "destination_id": document.get("destination_id") or "",
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else created_at,
        }
