"""Database connection helpers for My Smart Journey.

Uses Motor (async MongoDB driver). Configure via MONGO_URI in .env.
"""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB_NAME", "my_smart_journey")

_client: Any = None
_db: Any = None


def get_client():
    """Return a shared AsyncIOMotorClient instance."""
    global _client
    if _client is None:
        from motor.motor_asyncio import AsyncIOMotorClient

        _client = AsyncIOMotorClient(MONGO_URI)
    return _client


def get_database():
    """Return the application database handle."""
    global _db
    if _db is None:
        _db = get_client()[DB_NAME]
    return _db


async def close_connection() -> None:
    """Close the MongoDB client if it was opened."""
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
