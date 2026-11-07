from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.modules.designs.models import design_tags
from app.modules.parts.models import part_tags
from app.modules.tags.models import Tag
from app.modules.tags.schemas import TagCreate, TagOut, TagUpdate

Counts = tuple[dict[int, int], dict[int, int]]


def _counts(session: Session) -> Counts:
    """How many parts and designs use each tag."""
    return tuple(
        {
            tag_id: count
            for tag_id, count in session.execute(
                select(table.c.tag_id, func.count()).group_by(table.c.tag_id)
            )
        }
        for table in (part_tags, design_tags)
    )


def _to_out(tag: Tag, counts: Counts) -> TagOut:
    parts, designs = counts
    return TagOut(
        id=tag.id,
        name=tag.name,
        part_count=parts.get(tag.id, 0),
        design_count=designs.get(tag.id, 0),
    )


def _check_unique(session: Session, name: str, exclude_id: int | None = None) -> None:
    # The NOCASE column collation makes this comparison case-insensitive.
    existing = session.scalar(select(Tag).where(Tag.name == name))
    if existing and existing.id != exclude_id:
        raise ConflictError(f'A tag named "{existing.name}" already exists')


def get_tag(session: Session, tag_id: int) -> Tag:
    tag = session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(f"Tag {tag_id} not found")
    return tag


def get_tags(session: Session, tag_ids: list[int]) -> list[Tag]:
    return [get_tag(session, tag_id) for tag_id in dict.fromkeys(tag_ids)]


def list_tags(session: Session) -> list[TagOut]:
    counts = _counts(session)
    tags = session.scalars(select(Tag).order_by(func.lower(Tag.name)))
    return [_to_out(tag, counts) for tag in tags]


def create_tag(session: Session, data: TagCreate) -> TagOut:
    _check_unique(session, data.name)
    tag = Tag(name=data.name)
    session.add(tag)
    session.commit()
    return _to_out(tag, _counts(session))


def update_tag(session: Session, tag_id: int, data: TagUpdate) -> TagOut:
    tag = get_tag(session, tag_id)
    _check_unique(session, data.name, exclude_id=tag_id)
    tag.name = data.name
    session.commit()
    return _to_out(tag, _counts(session))


def delete_tag(session: Session, tag_id: int) -> None:
    # Links to parts and designs go with it (ON DELETE CASCADE).
    session.delete(get_tag(session, tag_id))
    session.commit()
