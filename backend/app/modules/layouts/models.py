"""Protoboard layouts (build step 15): a design's parts on a physical board.

A layout holds only physical facts: which of the design's placements are on the board
and where, the board's type and size, and cuts, jumpers and connectors. Connectivity
stays the design's; board connectivity and layout checks are computed, never stored.

Positions are 1-based and match the board's labels: strip 1 is A, hole 1 is the first
along it, so (3, 14) reads C14. The board is drawn landscape, strips left to right.
"""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, UTCDateTime, str_enum, utcnow
from app.modules.designs.models import Design, Placement, WireColor
from app.modules.parts.models import Author, Pin


class BoardType(StrEnum):
    # Copper strips along each row, cut where needed.
    STRIPBOARD = "stripboard"
    # A breadboard's pattern: power rails along the edges, columns of five each side of
    # the gap. No cuts.
    BREADBOARD = "breadboard"


class Mount(StrEnum):
    # In female headers, raised: holes under the body stay usable.
    SOCKETED = "socketed"
    # Straight onto the board: holes under the body are blocked on top.
    SOLDERED = "soldered"


class JumperSide(StrEnum):
    # Insulated wire on the component side, through two free holes.
    TOP = "top"
    # Wire or solder on the copper: touches every strip it crosses unless insulated.
    BOTTOM = "bottom"


class ConnectorType(StrEnum):
    HEADER_MALE = "header_male"
    HEADER_FEMALE = "header_female"
    JST_XH = "jst_xh"
    SCREW_508 = "screw_508"


class Layout(Base):
    __tablename__ = "layouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    design_id: Mapped[int] = mapped_column(ForeignKey("designs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    board_type: Mapped[BoardType] = mapped_column(str_enum(BoardType, "board_type"))
    # Rows (lettered) and holes along each (numbered).
    strips: Mapped[int]
    holes: Mapped[int]
    # The distance between holes, in mm: 2.54 for nearly every protoboard and always
    # for a breadboard pattern; 2.0 or 1.27 for finer boards.
    pitch_mm: Mapped[float] = mapped_column(default=2.54, server_default="2.54")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    design: Mapped[Design] = relationship()
    parts: Mapped[list["LayoutPart"]] = relationship(
        back_populates="layout",
        cascade="all, delete-orphan",
        order_by=lambda: LayoutPart.id,
        lazy="selectin",
    )
    cuts: Mapped[list["Cut"]] = relationship(
        cascade="all, delete-orphan", order_by=lambda: Cut.id, lazy="selectin"
    )
    jumpers: Mapped[list["Jumper"]] = relationship(
        cascade="all, delete-orphan", order_by=lambda: Jumper.id, lazy="selectin"
    )
    connectors: Mapped[list["Connector"]] = relationship(
        cascade="all, delete-orphan", order_by=lambda: Connector.id, lazy="selectin"
    )
    revisions: Mapped[list["LayoutRevision"]] = relationship(
        cascade="all, delete-orphan", order_by=lambda: LayoutRevision.id.desc()
    )


class LayoutPart(Base):
    """One of the design's placements in a layout: on the board, or off it (on a cable).
    A placement with none isn't placed yet."""

    __tablename__ = "layout_parts"
    __table_args__ = (
        UniqueConstraint("layout_id", "placement_id"),
        CheckConstraint("rotation IN (0, 90, 180, 270)", name="rotation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id", ondelete="CASCADE"), index=True)
    # Removing a placement from the design removes it from its layouts.
    placement_id: Mapped[int] = mapped_column(
        ForeignKey("placements.id", ondelete="CASCADE"), index=True
    )
    on_board: Mapped[bool] = mapped_column(default=True)
    # Where the part's origin (its footprint's 0, 0) sits; null when off board.
    strip: Mapped[int | None]
    hole: Mapped[int | None]
    # Degrees clockwise, top view.
    rotation: Mapped[int] = mapped_column(default=0)
    mount: Mapped[Mount] = mapped_column(str_enum(Mount, "mount"))
    # The part's footprint when it was last placed or moved, to notice it changing.
    footprint_sig: Mapped[str] = mapped_column(String(64), default="")

    layout: Mapped[Layout] = relationship(back_populates="parts")
    placement: Mapped[Placement] = relationship(lazy="selectin")


class Cut(Base):
    """A break in a strip: at a hole (its copper removed) or between it and the next."""

    __tablename__ = "layout_cuts"
    __table_args__ = (UniqueConstraint("layout_id", "strip", "hole", "between"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id", ondelete="CASCADE"), index=True)
    strip: Mapped[int]
    hole: Mapped[int]
    between: Mapped[bool] = mapped_column(default=False)


class Jumper(Base):
    __tablename__ = "layout_jumpers"

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id", ondelete="CASCADE"), index=True)
    a_strip: Mapped[int]
    a_hole: Mapped[int]
    b_strip: Mapped[int]
    b_hole: Mapped[int]
    side: Mapped[JumperSide] = mapped_column(str_enum(JumperSide, "side"))
    # A bottom link in sleeving touches only its ends.
    insulated: Mapped[bool] = mapped_column(default=False)
    color: Mapped[WireColor] = mapped_column(str_enum(WireColor, "color"))


class Connector(Base):
    """A generic connector for parts off the board: pin 1 at its position, the rest
    along the board's holes (to the right before rotation)."""

    __tablename__ = "layout_connectors"
    __table_args__ = (
        UniqueConstraint("layout_id", "ref"),
        CheckConstraint("rotation IN (0, 90, 180, 270)", name="rotation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id", ondelete="CASCADE"), index=True)
    ref: Mapped[str] = mapped_column(String(20))
    type: Mapped[ConnectorType] = mapped_column(str_enum(ConnectorType, "type"))
    pin_count: Mapped[int]
    # Pin 1's hole; null until it's put on the board.
    strip: Mapped[int | None]
    hole: Mapped[int | None]
    rotation: Mapped[int] = mapped_column(default=0)

    pins: Mapped[list["ConnectorPin"]] = relationship(
        cascade="all, delete-orphan", order_by=lambda: ConnectorPin.index, lazy="selectin"
    )


class ConnectorPin(Base):
    """What one connector pin carries: an off-board part's pin. Cleared when that part
    or pin goes."""

    __tablename__ = "layout_connector_pins"
    __table_args__ = (UniqueConstraint("connector_id", "index"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    connector_id: Mapped[int] = mapped_column(
        ForeignKey("layout_connectors.id", ondelete="CASCADE"), index=True
    )
    # From 1.
    index: Mapped[int]
    placement_id: Mapped[int | None] = mapped_column(
        ForeignKey("placements.id", ondelete="SET NULL")
    )
    pin_id: Mapped[int | None] = mapped_column(ForeignKey("pins.id", ondelete="SET NULL"))

    placement: Mapped[Placement | None] = relationship(lazy="selectin")
    pin: Mapped[Pin | None] = relationship(lazy="selectin")


class LayoutRevision(Base):
    """The layout as it was before a change, to restore."""

    __tablename__ = "layout_revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    author: Mapped[Author] = mapped_column(str_enum(Author, "author"))
    summary: Mapped[str] = mapped_column(String(200))
    # A LayoutSnapshot (layouts/schemas.py).
    snapshot: Mapped[dict] = mapped_column(JSON)
