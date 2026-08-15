"""Strict local matching for Gemini rows missing place_id."""

from __future__ import annotations

import re
from typing import Any

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOP = frozenset(
    {
        "the",
        "and",
        "of",
        "in",
        "at",
        "a",
        "an",
        "to",
        "for",
        "by",
        "de",
        "sdn",
        "bhd",
        "malaysia",
        "park",
        "mall",
        "centre",
        "center",
        "shopping",
        "national",
        "state",
        "river",
        "island",
        "beach",
        "lake",
        "taman",
        "gunung",
        "mount",
        "hill",
        "street",
        "market",
        "museum",
        "garden",
        "botanical",
        "wetland",
        "adventure",
        "recreational",
        "forest",
        "waterfall",
        "view",
        "kuala",
        "lumpur",
        "penang",
        "melaka",
        "malacca",
        "sabah",
        "sarawak",
        "johor",
        "kedah",
        "kelantan",
        "perak",
        "perlis",
        "pahang",
        "selangor",
        "terengganu",
        "negeri",
        "sembilan",
        "putrajaya",
        "labuan",
        "kota",
        "kinabalu",
        "langkawi",
    }
)


def name_tokens(name: str) -> set[str]:
    tokens = {t for t in _TOKEN_RE.findall((name or "").casefold()) if len(t) >= 3}
    return tokens - _STOP


def match_score(left_name: str, right_name: str) -> float:
    """Return 0..1 similarity; higher is better. Prefer mutual containment."""
    left = (left_name or "").casefold().strip()
    right = (right_name or "").casefold().strip()
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    if left in right or right in left:
        shorter = left if len(left) <= len(right) else right
        longer = right if len(left) <= len(right) else left
        # Short region/brand names must not match random longer businesses.
        if len(shorter) < 12:
            return 0.0
        if len(shorter) / max(len(longer), 1) < 0.45:
            return 0.0
        return 0.92 + 0.08 * (len(shorter) / max(len(longer), 1))

    left_tokens = name_tokens(left)
    right_tokens = name_tokens(right)
    if len(left_tokens) < 1 or len(right_tokens) < 1:
        return 0.0
    inter = left_tokens & right_tokens
    if not inter:
        return 0.0
    union = left_tokens | right_tokens
    jaccard = len(inter) / max(len(union), 1)
    left_cov = len(inter) / max(len(left_tokens), 1)
    right_cov = len(inter) / max(len(right_tokens), 1)

    # Need strong overlap on BOTH sides to avoid geo-name false friends.
    if len(inter) >= 2 and left_cov >= 0.6 and right_cov >= 0.4:
        return max(jaccard, (left_cov + right_cov) / 2)

    distinctive = {t for t in inter if len(t) >= 6}
    if (
        distinctive
        and left_cov >= 0.6
        and right_cov >= 0.45
        and len(left_tokens) <= 3
        and len(right_tokens) <= 4
    ):
        return 0.8

    return 0.0


def find_sibling(
    orphan: dict[str, Any],
    candidates: list[dict[str, Any]],
    *,
    min_score: float = 0.75,
) -> dict[str, Any] | None:
    """Pick best same-state candidate that already has place_id."""
    orphan_id = str(orphan.get("id") or "")
    orphan_state = (orphan.get("state") or "").strip().casefold()
    orphan_name = str(orphan.get("destination_name") or "")
    best: dict[str, Any] | None = None
    best_score = 0.0

    for row in candidates:
        if str(row.get("id") or "") == orphan_id:
            continue
        if not str(row.get("place_id") or "").strip():
            continue
        row_state = (row.get("state") or "").strip().casefold()
        if orphan_state and row_state and orphan_state != row_state:
            continue
        score = match_score(orphan_name, str(row.get("destination_name") or ""))
        if score < min_score:
            continue
        images = row.get("images") or []
        adjusted = score + (0.2 if images else 0.0)
        if adjusted > best_score:
            best_score = adjusted
            best = row
    return best
