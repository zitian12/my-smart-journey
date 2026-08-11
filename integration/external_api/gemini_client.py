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

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self._model = model
        self._client = genai.Client(api_key=api_key)

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

    def _generate_with_retry(self, prompt: str, *, attempts: int = 8) -> str:
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
                delay = min(90, 15 * attempt)
                logger.warning(
                    "Gemini rate-limited (attempt %s/%s); sleeping %ss",
                    attempt,
                    attempts,
                    delay,
                )
                time.sleep(delay)

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
