"""Google Gemini client for structured Malaysia destination generation."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import ClientError

logger = logging.getLogger(__name__)

# AI model: Gemini (google-genai SDK). Default model configured via GEMINI_MODEL.

VALID_CATEGORY_SLUGS = frozenset(
    {"nature", "culture", "heritage", "adventure", "shopping"}
)


class GeminiClient:
    """Calls Gemini to generate structured Malaysia destination payloads."""

    _rate_limited_until: float = 0.0
    _COOLDOWN_SECONDS = 60.0

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self._model = model
        self._client = genai.Client(api_key=api_key)

    @classmethod
    def is_rate_limited(cls) -> bool:
        return time.monotonic() < cls._rate_limited_until

    @classmethod
    def clear_rate_limit(cls) -> None:
        cls._rate_limited_until = 0.0

    @classmethod
    def _mark_rate_limited(cls, seconds: float | None = None) -> None:
        delay = cls._COOLDOWN_SECONDS if seconds is None else max(5.0, float(seconds))
        cls._rate_limited_until = time.monotonic() + delay
        logger.warning(
            "Gemini cooldown %.0fs — pause AI calls",
            delay,
        )

    def generate_destinations_for_state(
        self,
        *,
        state: str,
        count: int = 6,
    ) -> list[dict[str, Any]]:
        """Return popular destinations located in a specific Malaysian state."""
        prompt = f"""You are a Malaysia tourism expert.
Generate exactly {count} real tourist destinations located in "{state}", Malaysia.

Mix categories across these allowed slugs only:
nature, culture, heritage, adventure, shopping

Prefer the most popular / well-known places travelers actually visit in {state}.
Include a mix of attractions (nature spots, cultural sites, heritage, activities,
markets/malls) when the state has them.

Return ONLY valid JSON (no markdown) with this shape:
{{
  "destinations": [
    {{
      "destination_name": "string",
      "description": "2-3 sentence description",
      "category_slug": "nature|culture|heritage|adventure|shopping",
      "state": "{state}",
      "location": "city/area and short address-style location in {state}",
      "operating_hours": "typical visitor hours or Outdoor / All day",
      "image_query": "exact English Wikipedia page title for this place",
      "latitude": 3.1390,
      "longitude": 101.6869
    }}
  ]
}}

Rules:
- Exactly {count} destinations.
- Every destination MUST be physically in {state} (or that federal territory).
- state field must be exactly "{state}".
- category_slug must be one of: nature, culture, heritage, adventure, shopping.
- Prefer famous or popular places; avoid ultra-obscure spots.
- destination_name should be the common tourist name (short and searchable).
- Do NOT create near-duplicates of the same place with alternate names
  (e.g. avoid both "Central Market KL" and "Central Market Kuala Lumpur",
  or both "Taman Negara" and "Taman Negara National Park").
- latitude and longitude must be realistic coordinates inside {state}, Malaysia.
- Keep operating_hours concise.
"""

        text = self._generate_with_retry(prompt)
        payload = self._parse_json(text)
        destinations = payload.get("destinations")
        if not isinstance(destinations, list):
            raise ValueError("Gemini response missing destinations list")

        cleaned: list[dict[str, Any]] = []
        for item in destinations:
            if not isinstance(item, dict):
                continue
            name = str(item.get("destination_name") or "").strip()
            if not name:
                continue

            category_slug = (
                str(item.get("category_slug") or "culture").strip().lower()
            )
            if category_slug not in VALID_CATEGORY_SLUGS:
                category_slug = "culture"

            cleaned.append(
                {
                    "destination_name": name,
                    "description": str(item.get("description") or "").strip(),
                    "category_slug": category_slug,
                    "state": state,
                    "location": str(item.get("location") or "").strip(),
                    "operating_hours": str(item.get("operating_hours") or "").strip(),
                    "image_query": str(item.get("image_query") or name).strip(),
                    "latitude": self._to_float(item.get("latitude")),
                    "longitude": self._to_float(item.get("longitude")),
                }
            )

        logger.info(
            "Gemini generated %s destinations for state=%s",
            len(cleaned),
            state,
        )
        return cleaned

    def generate_place_description(
        self,
        *,
        name: str,
        state: str = "",
        category_slug: str = "",
    ) -> str:
        """Return a short tourism blurb for one Malaysia destination."""
        place = (name or "").strip()
        if not place:
            return ""
        if self.is_rate_limited():
            raise RuntimeError("Gemini is in rate-limit cooldown")

        region = (state or "").strip() or "Malaysia"
        category = (category_slug or "").strip().lower()
        category_line = (
            f"- Category hint: {category}\n" if category in VALID_CATEGORY_SLUGS else ""
        )
        prompt = f"""You are a Malaysia tourism copywriter.
Write a visitor description for this real place:

- Name: {place}
- State / region: {region}
{category_line}
Return ONLY valid JSON (no markdown):
{{
  "description": "2-3 sentences in English"
}}

Rules:
- Be factual and useful for travelers.
- Do NOT invent precise street addresses, phone numbers, ticket prices, or exact opening hours.
- Do NOT start with the place name alone as a title line.
- Keep it natural, specific to this place, and free of marketing fluff.
- If the place is a mall, park, museum, temple, beach, etc., say so clearly.
"""
        text = self._generate_with_retry(prompt, attempts=2)
        payload = self._parse_json(text)
        description = str(payload.get("description") or "").strip()
        # Strip wrapping quotes if the model double-encodes.
        if description.startswith('"') and description.endswith('"'):
            description = description[1:-1].strip()
        return description

    def _generate_with_retry(self, prompt: str, *, attempts: int = 1) -> str:
        if self.is_rate_limited():
            raise RuntimeError("Gemini is in rate-limit cooldown")

        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                response = self._client.models.generate_content(
                    model=self._model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.35,
                        response_mime_type="application/json",
                    ),
                )
                return (response.text or "").strip()
            except ClientError as exc:
                last_error = exc
                message = str(exc)
                if "429" not in message and "RESOURCE_EXHAUSTED" not in message:
                    raise
                retry_seconds = None
                match = re.search(r"Please retry in ([0-9.]+)s", message)
                if match:
                    retry_seconds = float(match.group(1)) + 2.0
                self._mark_rate_limited(retry_seconds)
                logger.warning(
                    "Gemini rate-limited (attempt %s/%s); cooldown set",
                    attempt,
                    attempts,
                )
                break

        assert last_error is not None
        raise last_error

    @staticmethod
    def _to_float(value: Any) -> float | None:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise ValueError("Gemini did not return parseable JSON")
        data = json.loads(match.group(0))
        if not isinstance(data, dict):
            raise ValueError("Gemini JSON root must be an object")
        return data
