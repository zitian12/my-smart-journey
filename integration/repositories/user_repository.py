"""User repository — data access for the users collection."""

import logging
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models import User

logger = logging.getLogger(__name__)


class UserRepository:
    """Handles CRUD operations for users in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["users"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the users collection."""
        index_info = await self._collection.index_information()

        for field in ("email", "google_id"):
            legacy_name = f"{field}_1"
            if legacy_name in index_info and "partialFilterExpression" not in index_info[legacy_name]:
                await self._collection.drop_index(legacy_name)
                logger.info("Dropped legacy index: %s", legacy_name)

        await self._collection.create_index(
            "email",
            unique=True,
            partialFilterExpression={"email": {"$exists": True, "$type": "string"}},
        )
        await self._collection.create_index(
            "google_id",
            unique=True,
            partialFilterExpression={"google_id": {"$exists": True, "$type": "string"}},
        )
        logger.info("Ensured indexes on users collection (email, google_id)")

    async def create_user(self, user: User) -> str:
        """Insert a user and return the inserted document id."""
        document = user.model_dump()
        result = await self._collection.insert_one(document)

        if not result.acknowledged:
            raise RuntimeError("MongoDB did not acknowledge the user insert")

        user_id = str(result.inserted_id)
        logger.info(
            "User document written to MongoDB — email=%s id=%s collection=users",
            user.email,
            user_id,
        )
        return user_id

    async def get_user_by_email(self, email: str) -> dict | None:
        """Return a user document by email, or None if not found."""
        normalized = email.strip()
        if not normalized:
            return None

        document = await self._collection.find_one({"email": normalized})
        if document is None:
            document = await self._collection.find_one(
                {
                    "email": {
                        "$regex": f"^{re.escape(normalized)}$",
                        "$options": "i",
                    }
                }
            )
        return self._serialize(document)

    async def search_users(
        self,
        query: str,
        exclude_user_id: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search users by email, full name, or nickname (case-insensitive)."""
        cleaned = query.strip()
        if len(cleaned) < 2:
            return []

        pattern = re.escape(cleaned)
        filters: dict = {
            "$or": [
                {"email": {"$regex": pattern, "$options": "i"}},
                {"full_name": {"$regex": pattern, "$options": "i"}},
                {"nickname": {"$regex": pattern, "$options": "i"}},
            ]
        }

        if exclude_user_id:
            try:
                filters["_id"] = {"$ne": ObjectId(exclude_user_id)}
            except InvalidId:
                pass

        cursor = self._collection.find(filters).limit(max(1, min(limit, 50)))
        documents = await cursor.to_list(length=max(1, min(limit, 50)))
        users: list[dict] = []
        for document in documents:
            serialized = self._serialize(document)
            if serialized is not None:
                users.append(serialized)
        return users

    async def get_users_by_ids(self, user_ids: list[str]) -> list[dict]:
        """Return user documents for the given ids."""
        object_ids: list[ObjectId] = []
        for user_id in user_ids:
            try:
                object_ids.append(ObjectId(user_id))
            except InvalidId:
                continue
        if not object_ids:
            return []

        cursor = self._collection.find({"_id": {"$in": object_ids}})
        documents = await cursor.to_list(length=len(object_ids))
        users: list[dict] = []
        for document in documents:
            serialized = self._serialize(document)
            if serialized is not None:
                users.append(serialized)
        return users

    async def get_user_by_google_id(self, google_id: str) -> dict | None:
        """Return a user document by Google id, or None if not found."""
        document = await self._collection.find_one({"google_id": google_id})
        return self._serialize(document)

    async def get_user_by_id(self, user_id: str) -> dict | None:
        """Return a user document by id, or None if not found."""
        try:
            object_id = ObjectId(user_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    async def update_last_login(self, user_id: str, email: str) -> None:
        """Update the last_login timestamp for a user."""
        result = await self._collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"last_login": datetime.now(timezone.utc)}},
        )

        if result.matched_count == 0:
            raise RuntimeError(f"User not found for last_login update: {user_id}")

        logger.info(
            "Updated last_login in MongoDB — email=%s id=%s",
            email,
            user_id,
        )

    async def update_profile(self, user_id: str, fields: dict) -> dict | None:
        """Update editable profile fields and return the updated user."""
        if not fields:
            return await self.get_user_by_id(user_id)

        try:
            object_id = ObjectId(user_id)
        except InvalidId:
            return None

        result = await self._collection.update_one(
            {"_id": object_id},
            {"$set": fields},
        )

        if result.matched_count == 0:
            return None

        logger.info("Updated user profile — id=%s fields=%s", user_id, list(fields))
        return await self.get_user_by_id(user_id)

    async def delete_user(self, user_id: str) -> bool:
        """Delete a user document by id. Returns True if a document was removed."""
        try:
            object_id = ObjectId(user_id)
        except InvalidId:
            return False

        result = await self._collection.delete_one({"_id": object_id})
        if result.deleted_count == 0:
            return False

        logger.info("Deleted user — id=%s", user_id)
        return True

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None
        return {
            "id": str(document["_id"]),
            "google_id": document.get("google_id"),
            "email": document["email"],
            "full_name": document.get("full_name") or "",
            "profile_picture": document.get("profile_picture") or "",
            "nickname": document.get("nickname") or "",
            "bio": document.get("bio") or "",
            "phone": document.get("phone") or "",
            "created_at": document.get("created_at"),
            "last_login": document.get("last_login"),
        }
