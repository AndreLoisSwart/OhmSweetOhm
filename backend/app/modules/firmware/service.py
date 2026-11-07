from sqlalchemy.orm import Session

from app.modules.designs import service as designs
from app.modules.firmware import pinmap
from app.modules.firmware.pinmap import FILENAMES, Lang
from app.modules.firmware.schemas import PinMapOut


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
