from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.db import SessionDep

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    database: str
    time: datetime


@router.get("/health")
def get_health(session: SessionDep) -> Health:
    session.execute(text("SELECT 1"))
    return Health(status="ok", database="ok", time=datetime.now(UTC))
