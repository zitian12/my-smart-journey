"""Destination document model."""

from pydantic import BaseModel


class Destination(BaseModel):
    name: str
    state: str
    description: str
    image_url: str
    category: str
