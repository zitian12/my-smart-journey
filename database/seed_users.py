"""Seed sample users into MongoDB."""

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
            email="alice@example.com",
            password="password123",
            full_name="Alice Tan",
        ),
        User(
            email="bob@example.com",
            password="password123",
            full_name="Bob Lim",
        ),
        User(
            email="carol@example.com",
            password="password123",
            full_name="Carol Ng",
        ),
    ]

    for user in users:
        user_id = await repo.create_user(user)
        print(f"Inserted {user.email} -> {user_id}")


if __name__ == "__main__":
    asyncio.run(main())
