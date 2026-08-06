"""Seed sample users into MongoDB (for local testing only)."""

import asyncio
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from database.models import User
from integration.repositories import UserRepository


async def main() -> None:
    repo = UserRepository()
    await repo.ensure_indexes()

    users = [
        User(
            google_id="google_test_alice",
            email="alice@example.com",
            full_name="Alice Tan",
            profile_picture="https://example.com/alice.jpg",
        ),
        User(
            google_id="google_test_bob",
            email="bob@example.com",
            full_name="Bob Lim",
            profile_picture="https://example.com/bob.jpg",
        ),
    ]

    for user in users:
        user_id = await repo.create_user(user)
        print(f"Inserted {user.email} -> {user_id}")


if __name__ == "__main__":
    asyncio.run(main())
