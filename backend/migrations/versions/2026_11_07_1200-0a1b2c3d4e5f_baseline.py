"""baseline

Empty starting point. Tables arrive with their feature modules.

Revision ID: 0a1b2c3d4e5f
Revises:
Create Date: 2026-11-07 12:00:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0a1b2c3d4e5f"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
