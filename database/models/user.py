"""User document model."""

from pydantic import BaseModel


class User(BaseModel):
    email: str
