"""Replace snapshot updates trip content without changing name or favourite."""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_BL = Path(__file__).resolve().parents[1]
for _path in (_ROOT, _BL):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from services.itinerary_persistence_service import ItineraryPersistenceService

ORIGINAL_ID = "64f1a2b3c4d5e6f7a8b9c0d1"
PAVILION_ID = "507f1f77bcf86cd799439011"
AQUARIA_ID = "507f191e810c19729de860ea"
COVER = "https://lh3.googleusercontent.com/places/pavilion-cover"


class FakeItineraryRepo:
    def __init__(self, source: dict) -> None:
        self.source = dict(source)

    async def get_by_id(self, itinerary_id: str) -> dict | None:
        if itinerary_id != self.source["id"]:
            return None
        return dict(self.source)

    async def replace_snapshot(
        self,
        itinerary_id: str,
        user_id: str,
        fields: dict,
    ) -> dict | None:
        if itinerary_id != self.source["id"] or user_id != self.source["user_id"]:
            return None
        self.source.update(fields)
        return dict(self.source)


class FakeDestinationRepo:
    async def get_by_ids(self, destination_ids: list[str]) -> list[dict]:
        return []


def _source_doc() -> dict:
    return {
        "id": ORIGINAL_ID,
        "user_id": "user-1",
        "name": "Song → Sabah State Railway",
        "start_point": "Song",
        "end_point": "Sabah State Railway",
        "location": "DBKU Cat Museum, Malaysia",
        "days": 3,
        "nights": 2,
        "hours_per_day": 5,
        "travelers": 2,
        "eco_score": 0,
        "status": "upcoming",
        "image": COVER,
        "is_favourite": True,
        "itinerary": {
            "start_location": "Song",
            "end_location": "Sabah State Railway",
            "days": 3,
            "nights": 2,
            "hours_per_day": 5,
            "destinations": [{"id": PAVILION_ID, "name": "DBKU Cat Museum"}],
            "legs": [],
        },
        "places": [
            {
                "id": PAVILION_ID,
                "name": "DBKU Cat Museum",
                "image": COVER,
            }
        ],
        "created_at": "2026-08-18T00:00:00+00:00",
    }


class ReplaceItineraryTests(unittest.TestCase):
    def test_replace_keeps_name_and_favourite(self) -> None:
        asyncio.run(self._replace_keeps_name_and_favourite())

    async def _replace_keeps_name_and_favourite(self) -> None:
        repo = FakeItineraryRepo(_source_doc())
        service = ItineraryPersistenceService(
            repository=repo,  # type: ignore[arg-type]
            share_repository=object(),  # type: ignore[arg-type]
            destination_repository=FakeDestinationRepo(),  # type: ignore[arg-type]
        )
        result = await service.replace_for_user(
            ORIGINAL_ID,
            "user-1",
            itinerary={
                "start_location": "Song",
                "end_location": "Sabah State Railway",
                "days": 3,
                "nights": 2,
                "hours_per_day": 5,
                "destinations": [
                    {"id": PAVILION_ID, "name": "DBKU Cat Museum"},
                    {"id": AQUARIA_ID, "name": "Chimney Museum"},
                ],
                "legs": [],
            },
            places=[
                {"id": PAVILION_ID, "name": "DBKU Cat Museum", "image": COVER},
                {"id": AQUARIA_ID, "name": "Chimney Museum"},
            ],
            travelers=2,
        )
        assert result is not None
        self.assertEqual(result["id"], ORIGINAL_ID)
        self.assertEqual(result["name"], "Song → Sabah State Railway")
        self.assertTrue(result["is_favourite"])
        dest_ids = [d["id"] for d in result["itinerary"]["destinations"]]
        self.assertEqual(dest_ids, [PAVILION_ID, AQUARIA_ID])
        self.assertEqual(repo.source["name"], "Song → Sabah State Railway")
        self.assertTrue(repo.source["is_favourite"])

    def test_replace_rejects_other_users(self) -> None:
        asyncio.run(self._replace_rejects_other_users())

    async def _replace_rejects_other_users(self) -> None:
        repo = FakeItineraryRepo(_source_doc())
        service = ItineraryPersistenceService(
            repository=repo,  # type: ignore[arg-type]
            share_repository=object(),  # type: ignore[arg-type]
            destination_repository=FakeDestinationRepo(),  # type: ignore[arg-type]
        )
        result = await service.replace_for_user(
            ORIGINAL_ID,
            "other-user",
            itinerary={"start_location": "A", "end_location": "B", "days": 1, "legs": []},
            places=[],
        )
        self.assertIsNone(result)
        self.assertEqual(repo.source["name"], "Song → Sabah State Railway")


if __name__ == "__main__":
    unittest.main()
