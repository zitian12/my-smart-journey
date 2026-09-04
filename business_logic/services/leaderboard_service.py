"""All-traveller Eco Score leaderboard for a calendar period."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from integration.repositories import ItineraryRepository, UserRepository

# Malaysia has no DST; UTC+8 matches Asia/Kuala_Lumpur without requiring tzdata.
MY_TZ = timezone(timedelta(hours=8))
VALID_PERIODS = frozenset({"day", "week", "month", "year"})


def period_window(period: str) -> tuple[datetime, datetime]:
    """Return UTC [start, end] for the current day/week/month/year in Malaysia."""
    if period not in VALID_PERIODS:
        raise ValueError("period must be day, week, month, or year")

    now_local = datetime.now(MY_TZ)
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        start_local = start_local - timedelta(days=start_local.weekday())
    elif period == "month":
        start_local = start_local.replace(day=1)
    elif period == "year":
        start_local = start_local.replace(month=1, day=1)

    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = now_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def _display_name(user: dict | None) -> str:
    if not user:
        return "Traveller"
    nickname = str(user.get("nickname") or "").strip()
    if nickname:
        return nickname
    full_name = str(user.get("full_name") or "").strip()
    return full_name or "Traveller"


class LeaderboardService:
    """Rank travellers by carbon saved, then average eco score."""

    def __init__(
        self,
        itinerary_repository: ItineraryRepository | None = None,
        user_repository: UserRepository | None = None,
    ) -> None:
        self._itineraries = itinerary_repository or ItineraryRepository()
        self._users = user_repository or UserRepository()

    async def list_leaderboard(self, current_user: dict, period: str) -> dict:
        start, end = period_window(period)
        rows = await self._itineraries.list_created_between(start, end)

        totals: dict[str, dict[str, float]] = defaultdict(
            lambda: {"trips": 0.0, "carbon": 0.0, "score_sum": 0.0}
        )
        for row in rows:
            user_id = str(row.get("user_id") or "").strip()
            if not user_id:
                continue
            bucket = totals[user_id]
            bucket["trips"] += 1
            bucket["carbon"] += float(row.get("emissions_reduced_kg") or 0)
            bucket["score_sum"] += float(row.get("eco_score") or 0)

        ranked_ids = sorted(
            totals.keys(),
            key=lambda uid: (
                -totals[uid]["carbon"],
                -(totals[uid]["score_sum"] / totals[uid]["trips"]),
                uid,
            ),
        )
        users = await self._users.get_users_by_ids(ranked_ids)
        users_by_id = {str(user.get("id") or ""): user for user in users}
        current_id = str(current_user.get("id") or "")

        entries = []
        for index, user_id in enumerate(ranked_ids, start=1):
            stats = totals[user_id]
            trip_count = int(stats["trips"])
            user = users_by_id.get(user_id)
            entries.append(
                {
                    "rank": index,
                    "user_id": user_id,
                    "display_name": _display_name(user),
                    "profile_picture": str((user or {}).get("profile_picture") or ""),
                    "trip_count": trip_count,
                    "carbon_saved_kg": round(stats["carbon"], 3),
                    "average_score": round(stats["score_sum"] / trip_count, 1),
                    "is_current_user": user_id == current_id,
                }
            )

        return {
            "period": period,
            "period_start": start,
            "period_end": end,
            "entries": entries,
        }
