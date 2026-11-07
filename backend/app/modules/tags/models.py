from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    # NOCASE: "Sensor" and "sensor" are the same tag.
    name: Mapped[str] = mapped_column(String(200, collation="NOCASE"), unique=True)
