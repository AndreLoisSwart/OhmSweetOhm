from sqlalchemy.orm import Session

from app.modules.designs import service as designs
from app.modules.firmware import bringup, pinmap, platformio, wokwi
from app.modules.firmware.pinmap import FILENAMES, Lang
from app.modules.firmware.schemas import (
    ConstantChange,
    ConstantOut,
    FirmwareFile,
    FirmwareFiles,
    PinMapCompare,
    PinMapDrift,
    PinMapOut,
    WokwiExport,
    WokwiSkipped,
)


def pin_map(
    session: Session, design_id: int, lang: Lang = Lang.C, board: str | None = None
) -> PinMapOut:
    design = designs.get_design(session, design_id)
    built = pinmap.build(design, board)
    return PinMapOut(
        lang=lang,
        filename=FILENAMES[lang],
        board=built.board.ref,
        boards=[b.ref for b in pinmap.boards_of(design)],
        text=pinmap.render(built, lang),
    )


def bringup_sketch(session: Session, design_id: int, board: str | None = None) -> FirmwareFiles:
    design = designs.get_design(session, design_id)
    built, text = bringup.sketch(design, board)
    return FirmwareFiles(
        board=built.board.ref,
        boards=[b.ref for b in pinmap.boards_of(design)],
        files=[
            FirmwareFile(filename=bringup.FILENAME, text=text),
            FirmwareFile(filename=FILENAMES[Lang.C], text=pinmap.render(built, Lang.C)),
        ],
    )


def platformio_project(session: Session, design_id: int, board: str | None = None) -> FirmwareFiles:
    design = designs.get_design(session, design_id)
    chosen, text = platformio.render(design, board)
    return FirmwareFiles(
        board=chosen.ref,
        boards=[b.ref for b in pinmap.boards_of(design)],
        files=[FirmwareFile(filename=platformio.FILENAME, text=text)],
    )


def wokwi_export(session: Session, design_id: int, board: str | None = None) -> WokwiExport:
    design = designs.get_design(session, design_id)
    boards = pinmap.boards_of(design)
    chosen = pinmap.choose_board(design, board) if board or len(boards) == 1 else None
    built = wokwi.export(design, chosen)
    files = [FirmwareFile(filename=wokwi.DIAGRAM, text=built.diagram)]
    if built.toml:
        files.append(FirmwareFile(filename=wokwi.TOML, text=built.toml))
    return WokwiExport(
        board=chosen.ref if chosen else None,
        boards=[b.ref for b in boards],
        files=files,
        skipped=[WokwiSkipped(ref=s.ref, part=s.part, wires=s.wires) for s in built.skipped],
    )


def compare_pin_map(session: Session, design_id: int, data: PinMapCompare) -> PinMapDrift:
    """How a firmware's pins.h (or pins.py) differs from the design as it is now."""
    is_header = "constexpr" in data.text or "#define" in data.text
    lang = data.lang or (Lang.C if is_header else Lang.PY)
    design = designs.get_design(session, design_id)
    built = pinmap.build(design, data.board)
    drift = pinmap.compare(built, data.text)
    return PinMapDrift(
        up_to_date=not (drift.changed or drift.added or drift.removed),
        changed=[
            ConstantChange(name=c.name, in_file=old, in_design=c.value, comment=c.comment)
            for c, old in drift.changed
        ],
        added=[ConstantOut(name=c.name, value=c.value, comment=c.comment) for c in drift.added],
        removed=[ConstantOut(name=name, value=value) for name, value in drift.removed],
        pin_map=PinMapOut(
            lang=lang,
            filename=FILENAMES[lang],
            board=built.board.ref,
            boards=[b.ref for b in pinmap.boards_of(design)],
            text=pinmap.render(built, lang),
        ),
    )
