from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse

from app.core.db import SessionDep
from app.modules.attachments import service, storage
from app.modules.attachments.models import Attachment
from app.modules.attachments.schemas import AttachmentOut
from app.modules.owners import OwnerType

router = APIRouter(prefix="/attachments", tags=["attachments"])


def _out(attachment: Attachment) -> AttachmentOut:
    return AttachmentOut.model_validate(attachment).model_copy(
        update={"viewable": service.is_viewable(attachment.mime_type)}
    )


@router.get("")
def list_attachments(
    owner_type: OwnerType, owner_id: int, session: SessionDep
) -> list[AttachmentOut]:
    """The files of one part, oldest first."""
    return [_out(a) for a in service.list_attachments(session, owner_type, owner_id)]


@router.post("", status_code=201)
async def upload_attachment(
    owner_type: Annotated[OwnerType, Form()],
    owner_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
    session: SessionDep,
) -> AttachmentOut:
    return _out(await service.add_attachment(session, owner_type, owner_id, file))


@router.get("/{attachment_id}/file", response_class=FileResponse)
def get_attachment_file(attachment_id: int, session: SessionDep) -> FileResponse:
    """Viewable types (PDFs, plain images) open in the browser; everything else downloads."""
    attachment = service.get_attachment(session, attachment_id)
    viewable = service.is_viewable(attachment.mime_type)
    # no-cache: revalidate every time. SQLite can reuse a deleted attachment's id, so a
    # cached copy could otherwise show the old file under the new one's URL.
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-cache"}
    if attachment.mime_type.startswith("image/"):
        # An image needs nothing else; a sandboxed, script-free page in case it's misread.
        headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; sandbox"
    return FileResponse(
        storage.path_for(attachment.stored_path),
        media_type=attachment.mime_type if viewable else "application/octet-stream",
        filename=attachment.original_filename,
        content_disposition_type="inline" if viewable else "attachment",
        headers=headers,
    )


@router.delete("/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int, session: SessionDep) -> None:
    service.delete_attachment(session, attachment_id)
