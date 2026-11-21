"""perfboard board type

Revision ID: 259f5e122451
Revises: 796cdbf7f8dd
Create Date: 2026-11-21 17:19:03.176227

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "259f5e122451"
down_revision: str | Sequence[str] | None = "796cdbf7f8dd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# The board type's CHECK constraint lists the allowed values, so a new type rebuilds it.
OLD = "board_type IN ('stripboard', 'breadboard')"
NEW = "board_type IN ('stripboard', 'breadboard', 'perfboard')"


def _set_types(allowed: str) -> None:
    with op.batch_alter_table("layouts", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("ck_layouts_board_type"), type_="check")
        batch_op.create_check_constraint(batch_op.f("ck_layouts_board_type"), allowed)


def upgrade() -> None:
    """Upgrade schema."""
    _set_types(NEW)


def downgrade() -> None:
    """Downgrade schema. Fails while any perfboard layout is left: remove those first."""
    _set_types(OLD)
