import re
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Column,
    ForeignKey,
    String,
    Table,
    Text,
    UniqueConstraint,
    case,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, UTCDateTime, str_enum, utcnow
from app.modules.tags.models import Tag


class PartKind(StrEnum):
    BOARD = "board"
    SENSOR = "sensor"
    DISPLAY = "display"
    ACTUATOR = "actuator"
    MODULE = "module"
    POWER = "power"
    PASSIVE = "passive"
    OTHER = "other"


class LogicVoltage(StrEnum):
    V3V3 = "3v3"
    V5 = "5v"
    BOTH = "both"
    NONE = "none"


class Platform(StrEnum):
    """A board's PlatformIO platform; library entries can be limited to some of them."""

    ESP32 = "espressif32"
    ESP8266 = "espressif8266"
    AVR = "atmelavr"


class Author(StrEnum):
    USER = "user"
    CLAUDE = "claude"


class PinKind(StrEnum):
    POWER_OUT = "power_out"
    POWER_IN = "power_in"
    GROUND = "ground"
    GPIO = "gpio"
    ANALOG = "analog"
    I2C_SDA = "i2c_sda"
    I2C_SCL = "i2c_scl"
    SPI_MOSI = "spi_mosi"
    SPI_MISO = "spi_miso"
    SPI_SCK = "spi_sck"
    SPI_CS = "spi_cs"
    UART_TX = "uart_tx"
    UART_RX = "uart_rx"
    ENABLE = "enable"
    RESET = "reset"
    NC = "nc"
    OTHER = "other"


class PinFlag(StrEnum):
    INPUT_ONLY = "input_only"
    STRAPPING = "strapping"
    FLASH = "flash"
    ADC2 = "adc2"
    FIVE_V_TOLERANT = "five_v_tolerant"
    OPEN_DRAIN = "open_drain"
    BOOT_HIGH = "boot_high"
    BOOT_LOW = "boot_low"


class PinSide(StrEnum):
    LEFT = "left"
    RIGHT = "right"
    TOP = "top"
    BOTTOM = "bottom"


part_tags = Table(
    "part_tags",
    Base.metadata,
    Column("part_id", ForeignKey("parts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Part(Base):
    __tablename__ = "parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # NOCASE: unique ignoring case.
    name: Mapped[str] = mapped_column(String(200, collation="NOCASE"), unique=True)
    kind: Mapped[PartKind] = mapped_column(str_enum(PartKind, "kind"))
    description: Mapped[str] = mapped_column(Text, default="")
    logic_voltage: Mapped[LogicVoltage] = mapped_column(str_enum(LogicVoltage, "logic_voltage"))
    supply_min_v: Mapped[float | None]
    supply_max_v: Mapped[float | None]
    # 7-bit addresses; the first is the default.
    i2c_addresses: Mapped[list[int]] = mapped_column(JSON, default=list)
    datasheet_url: Mapped[str] = mapped_column(String(2000), default="")
    notes_md: Mapped[str] = mapped_column(Text, default="")
    verified: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[Author] = mapped_column(str_enum(Author, "created_by"))
    # A Shelf-help Item id: another database, so no foreign key and never checked here.
    shelf_item_id: Mapped[int | None]
    # Wokwi's part type, for the phase 2 export, e.g. "board-esp32-devkit-c-v4".
    wokwi_type: Mapped[str | None] = mapped_column(String(100))
    # For boards: PlatformIO's platform and board id (e.g. espressif32, esp32dev).
    platform: Mapped[Platform | None] = mapped_column(str_enum(Platform, "platform"))
    platformio_board: Mapped[str | None] = mapped_column(String(60))
    # Libraries firmware for this part needs: [{"spec": "owner/Name@^1.2",
    # "platforms": [...]}], an empty platforms list meaning every platform.
    libraries: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    pins: Mapped[list["Pin"]] = relationship(
        back_populates="part",
        cascade="all, delete-orphan",
        # Left, right, top, bottom; each in header order.
        order_by=lambda: (
            case({side: i for i, side in enumerate(PinSide)}, value=Pin.side),
            Pin.position,
        ),
        lazy="selectin",
    )
    tags: Mapped[list[Tag]] = relationship(
        secondary=part_tags, order_by=lambda: func.lower(Tag.name), lazy="selectin"
    )

    @property
    def pin_count(self) -> int:
        return len(self.pins)


class Pin(Base):
    __tablename__ = "pins"
    __table_args__ = (UniqueConstraint("part_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    # Unique within the part, ignoring case. Wires and MCP tools say `ref.NAME`.
    name: Mapped[str] = mapped_column(String(40, collation="NOCASE"))
    kind: Mapped[PinKind] = mapped_column(str_enum(PinKind, "kind"))
    # Alternate roles, e.g. ESP32 GPIO21 is `gpio` with functions ["i2c_sda"].
    functions: Mapped[list[str]] = mapped_column(JSON, default=list)
    # What a power pin supplies or needs; the most a signal pin accepts. None: the part's.
    voltage: Mapped[float | None]
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    side: Mapped[PinSide] = mapped_column(str_enum(PinSide, "side"))
    # Order along its side, from 0: top to bottom on left/right, left to right on top/bottom.
    position: Mapped[int]
    # Wokwi's name for this pin where it differs (phase 2 export).
    wokwi_name: Mapped[str | None] = mapped_column(String(40))
    # Pins of a part with the same tie are joined inside it (two 3V3 pins, say), so
    # wiring one wires them all. Ground pins are always joined, tie or not.
    tie: Mapped[str | None] = mapped_column(String(20))
    # What firmware calls this pin (`21`, `A0`), where the name rule gets it wrong.
    code_name: Mapped[str | None] = mapped_column(String(20))

    part: Mapped[Part] = relationship(back_populates="pins")

    @property
    def default_code_name(self) -> str | None:
        """The code name from the pin's name: GPIO21 → 21, D2 → 2, A0 → A0; else none."""
        return default_code_name(self.name)

    @property
    def effective_code_name(self) -> str | None:
        return self.code_name or self.default_code_name


# Pin name → code name prefix: GPIO21 → 21, D2 → 2, A0 → A0.
_CODE_NAME_RULES = (
    (re.compile(r"^GPIO(\d+)$", re.I), ""),
    (re.compile(r"^D(\d+)$", re.I), ""),
    (re.compile(r"^A(\d+)$", re.I), "A"),
)


def default_code_name(name: str) -> str | None:
    for pattern, prefix in _CODE_NAME_RULES:
        if match := pattern.match(name):
            # Leading zeros dropped (GPIO05 → 5).
            return f"{prefix}{int(match[1])}"
    return None
