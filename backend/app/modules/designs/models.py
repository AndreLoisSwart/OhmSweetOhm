from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    ForeignKey,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, UTCDateTime, str_enum, utcnow
from app.modules.parts.models import Author, Part, Pin
from app.modules.tags.models import Tag


class WireColor(StrEnum):
    RED = "red"
    BLACK = "black"
    ORANGE = "orange"
    YELLOW = "yellow"
    GREEN = "green"
    BLUE = "blue"
    PURPLE = "purple"
    GRAY = "gray"
    WHITE = "white"
    BROWN = "brown"


design_tags = Table(
    "design_tags",
    Base.metadata,
    Column("design_id", ForeignKey("designs.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Design(Base):
    __tablename__ = "designs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description_md: Mapped[str] = mapped_column(Text, default="")
    # A Shelf-help Project id: another database, so no foreign key and never checked here.
    shelf_project_id: Mapped[int | None]
    # Where the design's firmware lives: a local path or a URL (build step 13).
    firmware_repo: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    placements: Mapped[list["Placement"]] = relationship(
        back_populates="design",
        cascade="all, delete-orphan",
        order_by=lambda: Placement.id,
        lazy="selectin",
    )
    wires: Mapped[list["Wire"]] = relationship(
        back_populates="design",
        cascade="all, delete-orphan",
        order_by=lambda: Wire.id,
        lazy="selectin",
    )
    tags: Mapped[list[Tag]] = relationship(
        secondary=design_tags, order_by=lambda: func.lower(Tag.name), lazy="selectin"
    )
    revisions: Mapped[list["Revision"]] = relationship(
        back_populates="design",
        cascade="all, delete-orphan",
        order_by=lambda: Revision.id.desc(),
    )

    @property
    def part_count(self) -> int:
        return len(self.placements)


class Placement(Base):
    """A part placed on a design's canvas."""

    __tablename__ = "placements"
    __table_args__ = (
        UniqueConstraint("design_id", "ref"),
        CheckConstraint("rotation IN (0, 90, 180, 270)", name="rotation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    design_id: Mapped[int] = mapped_column(ForeignKey("designs.id", ondelete="CASCADE"), index=True)
    # RESTRICT: a part can't be deleted while it is placed anywhere.
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id", ondelete="RESTRICT"), index=True)
    # Short and identifier-safe, unique within the design: wires say `ref.PIN`.
    ref: Mapped[str] = mapped_column(String(20))
    # The card's top-left corner in canvas px, on the 10 px grid.
    x: Mapped[int] = mapped_column(default=0)
    y: Mapped[int] = mapped_column(default=0)
    # Degrees clockwise, as Wokwi's `rotate`.
    rotation: Mapped[int] = mapped_column(default=0)
    note: Mapped[str] = mapped_column(Text, default="")

    design: Mapped[Design] = relationship(back_populates="placements")
    part: Mapped[Part] = relationship(lazy="selectin")


class Wire(Base):
    """A wire between two pins of placements in the same design."""

    __tablename__ = "wires"

    id: Mapped[int] = mapped_column(primary_key=True)
    design_id: Mapped[int] = mapped_column(ForeignKey("designs.id", ondelete="CASCADE"), index=True)
    # Removing a placement removes its wires.
    a_placement_id: Mapped[int] = mapped_column(
        ForeignKey("placements.id", ondelete="CASCADE"), index=True
    )
    # RESTRICT: a pin can't be deleted while it is wired.
    a_pin_id: Mapped[int] = mapped_column(ForeignKey("pins.id", ondelete="RESTRICT"), index=True)
    b_placement_id: Mapped[int] = mapped_column(
        ForeignKey("placements.id", ondelete="CASCADE"), index=True
    )
    b_pin_id: Mapped[int] = mapped_column(ForeignKey("pins.id", ondelete="RESTRICT"), index=True)
    color: Mapped[WireColor] = mapped_column(str_enum(WireColor, "color"))
    label: Mapped[str] = mapped_column(String(100), default="")

    design: Mapped[Design] = relationship(back_populates="wires")
    a_placement: Mapped[Placement] = relationship(foreign_keys=[a_placement_id], lazy="selectin")
    b_placement: Mapped[Placement] = relationship(foreign_keys=[b_placement_id], lazy="selectin")
    a_pin: Mapped[Pin] = relationship(foreign_keys=[a_pin_id], lazy="selectin")
    b_pin: Mapped[Pin] = relationship(foreign_keys=[b_pin_id], lazy="selectin")


class Revision(Base):
    """The design's placements and wires as they were before a change, to restore."""

    __tablename__ = "revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    design_id: Mapped[int] = mapped_column(ForeignKey("designs.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # Who made the change that followed: the user on the canvas, or Claude over MCP.
    author: Mapped[Author] = mapped_column(str_enum(Author, "author"))
    # The change that followed, e.g. "Removed led1 and its 2 wires".
    summary: Mapped[str] = mapped_column(String(200))
    # A Snapshot (designs/schemas.py): placements and wires.
    snapshot: Mapped[dict] = mapped_column(JSON)

    design: Mapped[Design] = relationship(back_populates="revisions")
