from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime, one_owner_constraint, utcnow


class Attachment(Base):
    __tablename__ = "attachments"
    __table_args__ = (one_owner_constraint("part_id", "design_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int]
    # A generated name inside /data/attachments, never derived from the upload.
    stored_path: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    part_id: Mapped[int | None] = mapped_column(
        ForeignKey("parts.id", ondelete="CASCADE"), index=True
    )
    design_id: Mapped[int | None] = mapped_column(
        ForeignKey("designs.id", ondelete="CASCADE"), index=True
    )
