"""inventory_hand_and_ownership_type

Adds two ownership-history columns to the inventory table:
  hand            int   1..4   (4 means "4 or more")
  ownership_type  enum  private | dealer | leasing | rental | government

Both nullable since the columns are added to a populated table — only
new and edited vehicles get the value. Backfill is the dealer's job
(no automatic guess; ownership history materially affects price).

Revision ID: d5e9f2b1c4a7
Revises: c4d8e1a2f3b9
Create Date: 2026-04-26 14:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d5e9f2b1c4a7"
down_revision: Union[str, None] = "c4d8e1a2f3b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inventory", sa.Column("hand", sa.Integer(), nullable=True))
    op.add_column(
        "inventory", sa.Column("ownership_type", sa.String(length=20), nullable=True)
    )
    op.create_check_constraint(
        "inventory_hand_range",
        "inventory",
        "hand IS NULL OR (hand >= 1 AND hand <= 4)",
    )
    op.create_check_constraint(
        "inventory_ownership_type_check",
        "inventory",
        "ownership_type IS NULL OR ownership_type IN "
        "('private', 'dealer', 'leasing', 'rental', 'government')",
    )


def downgrade() -> None:
    op.drop_constraint("inventory_ownership_type_check", "inventory", type_="check")
    op.drop_constraint("inventory_hand_range", "inventory", type_="check")
    op.drop_column("inventory", "ownership_type")
    op.drop_column("inventory", "hand")
