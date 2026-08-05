"""MongoDB connection for My Smart Journey (Motor async driver)."""

import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_ENV_PATH = Path(__file__).resolve().parent.parent / "business_logic" / ".env"
load_dotenv(_ENV_PATH)
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "my_smart_journey"

_client: AsyncIOMotorClient | None = None


def get_database() -> AsyncIOMotorDatabase:
    """Return the shared application database."""
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGO_URI)
    return _client[DB_NAME]
