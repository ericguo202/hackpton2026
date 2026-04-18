from fastapi import APIRouter
from app.api.v1.endpoints import health

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["health"])

# Add future routers here, e.g.:
# from app.api.v1.endpoints import users
# api_router.include_router(users.router, prefix="/users", tags=["users"])
