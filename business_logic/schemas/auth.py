"""Auth request and response schemas."""

from pydantic import BaseModel

from schemas.profile import UserProfileResponse


class GoogleAuthRequest(BaseModel):
    token: str


class UserResponse(UserProfileResponse):
    """User payload returned after authentication."""


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class LogoutResponse(BaseModel):
    message: str
