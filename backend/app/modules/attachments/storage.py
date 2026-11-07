"""Attachment files on disk. Imports no services, so any module can clean up files."""

import logging
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import TooLargeError
from app.modules.attachments.models import Attachment

log = logging.getLogger(__name__)
CHUNK = 1024 * 1024


def path_for(stored_path: str) -> Path:
    directory = settings.attachments_dir.resolve()
    path = (directory / stored_path).resolve()
    # Stored names are generated, but never follow one outside the directory.
    if path.parent != directory:
        raise ValueError(f"Unexpected attachment path: {stored_path}")
    return path


async def save_upload(upload: UploadFile) -> tuple[str, int]:
    """Writes the upload under a generated name. Returns that name and the size."""
    settings.ensure_data_dirs()
    limit = settings.max_upload_mb * 1024 * 1024
    stored_path = uuid.uuid4().hex
    path = path_for(stored_path)
    size = 0
    try:
        with path.open("wb") as out:
            while chunk := await upload.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise TooLargeError(f"Files can be at most {settings.max_upload_mb} MB")
                out.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return stored_path, size


def remove_files(stored_paths: list[str]) -> None:
    """Call after the rows are deleted and committed. A missing file is not an error."""
    for stored_path in stored_paths:
        try:
            path_for(stored_path).unlink(missing_ok=True)
        except OSError:
            log.exception("Could not remove attachment file %s", stored_path)


def stored_paths_of(session: Session, column, owner_id: int) -> list[str]:
    """The files of one owner, collected before deleting it (the rows go by cascade)."""
    return list(session.scalars(select(Attachment.stored_path).where(column == owner_id)))
