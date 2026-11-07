import mimetypes

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules import owners
from app.modules.attachments import storage
from app.modules.attachments.models import Attachment
from app.modules.owners import OwnerType

# Behind Ingress, files are served from Home Assistant's own origin. Anything the browser
# could run as a page (HTML, SVG, XML...) must download instead of opening, or it could act
# with the user's HA login. Only these types open in the browser.
VIEWABLE_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"}


def is_viewable(mime_type: str) -> bool:
    return mime_type in VIEWABLE_TYPES


def get_attachment(session: Session, attachment_id: int) -> Attachment:
    attachment = session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Attachment {attachment_id} not found")
    return attachment


def list_attachments(session: Session, owner_type: OwnerType, owner_id: int) -> list[Attachment]:
    owners.get_owner(session, owner_type, owner_id)
    query = (
        select(Attachment)
        .where(owners.owner_filter(Attachment, owner_type, owner_id))
        .order_by(Attachment.created_at, Attachment.id)
    )
    return list(session.scalars(query))


async def add_attachment(
    session: Session, owner_type: OwnerType, owner_id: int, upload: UploadFile
) -> Attachment:
    owners.get_owner(session, owner_type, owner_id)
    # Keep only the name: some browsers send a path.
    filename = (upload.filename or "file").replace("\\", "/").rsplit("/", 1)[-1][:255] or "file"
    # From the extension, not the browser's claim, so the served type is predictable.
    mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    stored_path, size = await storage.save_upload(upload)
    attachment = Attachment(
        original_filename=filename, mime_type=mime_type, size=size, stored_path=stored_path
    )
    setattr(attachment, f"{owner_type}_id", owner_id)
    session.add(attachment)
    owners.touch_owner(session, owner_type, owner_id)
    try:
        session.commit()
    except BaseException:
        storage.remove_files([stored_path])
        raise
    return attachment


def delete_attachment(session: Session, attachment_id: int) -> None:
    attachment = get_attachment(session, attachment_id)
    owners.touch_owner(session, *owners.owner_of(attachment))
    stored_path = attachment.stored_path
    session.delete(attachment)
    session.commit()
    storage.remove_files([stored_path])
