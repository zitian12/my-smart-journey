"""Simple MongoDB connection check."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from database.connection import get_database

router = APIRouter(tags=["health"])


@router.get("/test-db", response_model=None)
async def test_db():
    try:
        db = get_database()
        await db.command("ping")
        return {
            "status": "success",
            "message": "MongoDB connected successfully",
        }
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"MongoDB connection failed: {exc}",
            },
        )
