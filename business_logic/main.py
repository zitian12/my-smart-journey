from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import api_router

app = FastAPI(title="My Smart Journey")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "My Smart Journey API is running"}
