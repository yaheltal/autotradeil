"""inventory_visibility_default_b2b

Flips the inventory.visibility column's server-default from 'private'
to 'b2b'. The original default meant every newly-added vehicle was
hidden from the marketplace until the dealer noticed and changed it,
which made the B2B browse pages look broken to early-stage dealers
who had only ever added vehicles via the default-accepting form.

Existing rows are left untouched — flipping their visibility would
silently expose vehicles the dealer chose to keep private. Only the
DEFAULT for future inserts changes.

Revision ID: a3f4c2e1b9d7
Revises: c7a9f2b81e04
Create Date: 2026-04-26 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a3f4c2e1b9d7"
down_revision: Union[str, None] = "c7a9f2b81e04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "inventory",
        "visibility",
        server_default="b2b",
        existing_type=None,
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "inventory",
        "visibility",
        server_default="private",
        existing_type=None,
        existing_nullable=False,
    )
