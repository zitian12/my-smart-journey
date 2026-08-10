"""Profile request and response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    profile_picture: str
    nickname: str = ""
    bio: str = ""
    phone: str = ""
    created_at: datetime | None = None


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    nickname: str = Field(default="", max_length=50)
    bio: str = Field(default="", max_length=500)
    phone: str = Field(default="", max_length=30)
