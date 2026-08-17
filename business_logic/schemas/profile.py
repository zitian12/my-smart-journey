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


class PublicUserProfile(BaseModel):
    """Safe subset returned when viewing another user."""

    id: str
    email: str
    full_name: str
    nickname: str = ""
    profile_picture: str
    bio: str = ""


def public_user_from_document(user: dict) -> dict:
    """Map a user document to the public profile payload."""
    return {
        "id": user["id"],
        "email": user.get("email") or "",
        "full_name": user.get("full_name") or "",
        "nickname": user.get("nickname") or "",
        "profile_picture": user.get("profile_picture") or "",
        "bio": user.get("bio") or "",
    }


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    nickname: str = Field(default="", max_length=50)
    bio: str = Field(default="", max_length=500)
    phone: str = Field(default="", max_length=30)
