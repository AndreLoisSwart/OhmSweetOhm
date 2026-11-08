from sqlalchemy.orm import Session

from app.modules.designs import service as designs
from app.modules.firmware import bringup, pinmap
from app.modules.firmware.pinmap import FILENAMES, Lang
from app.modules.firmware.schemas import BringupOut, FirmwareFile, PinMapOut


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


def bringup_sketch(session: Session, design_id: int, board: str | None = None) -> BringupOut:
    design = designs.get_design(session, design_id)
    built, text = bringup.sketch(design, board)
    return BringupOut(
        board=built.board.ref,
        boards=[b.ref for b in pinmap.boards_of(design)],
        files=[
            FirmwareFile(filename=bringup.FILENAME, text=text),
            FirmwareFile(filename=FILENAMES[Lang.C], text=pinmap.render(built, Lang.C)),
        ],
    )
