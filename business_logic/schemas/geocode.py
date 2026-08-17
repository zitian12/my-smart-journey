"""Schemas for OSM address suggestions."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AddressSuggestion(BaseModel):
    name: str = Field(min_length=1)
    latitude: float
    longitude: float
    subtitle: str = ""
