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

    emails = [
        "alice@example.com",
        "bob@example.com",
        "carol@example.com",
    ]

    for email in emails:
        user_id = await repo.create_user(User(email=email))
        print(f"Inserted {email} -> {user_id}")


if __name__ == "__main__":
    asyncio.run(main())
