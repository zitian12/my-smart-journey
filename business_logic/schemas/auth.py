"""Auth request and response schemas."""

from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    token: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    profile_picture: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class LogoutResponse(BaseModel):
    message: str
