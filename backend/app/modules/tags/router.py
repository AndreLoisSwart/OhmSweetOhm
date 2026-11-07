from fastapi import APIRouter

from app.core.db import SessionDep
from app.modules.tags import service
from app.modules.tags.schemas import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("")
def list_tags(session: SessionDep) -> list[TagOut]:
    return service.list_tags(session)


@router.post("", status_code=201)
def create_tag(data: TagCreate, session: SessionDep) -> TagOut:
    return service.create_tag(session, data)


@router.patch("/{tag_id}")
def update_tag(tag_id: int, data: TagUpdate, session: SessionDep) -> TagOut:
    return service.update_tag(session, tag_id, data)


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int, session: SessionDep) -> None:
    service.delete_tag(session, tag_id)
