"""inventory_status_in_transaction

Adds the "in_transaction" value to inventory.status. A vehicle in this
state is hidden from /marketplace/search (which already filters
status="active") and surfaces only on /admin/transactions while an
admin escorts the deal through closure.

Lifecycle: active → in_transaction → sold
                                  ↘ active   (admin cancels)

Revision ID: f7b2c4d6e8a1
Revises: d5e9f2b1c4a7
Create Date: 2026-04-27 09:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f7b2c4d6e8a1"
down_revision: Union[str, None] = "d5e9f2b1c4a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("inventory_status_check", "inventory", type_="check")
    op.create_check_constraint(
        "inventory_status_check",
        "inventory",
        "status IN ('active', 'sold', 'hidden', 'in_transaction')",
    )


def downgrade() -> None:
    # Flip any rows still mid-transaction back to active so the
    # tighter constraint can re-apply without violating.
    op.execute("UPDATE inventory SET status = 'active' WHERE status = 'in_transaction'")
    op.drop_constraint("inventory_status_check", "inventory", type_="check")
    op.create_check_constraint(
        "inventory_status_check",
        "inventory",
        "status IN ('active', 'sold', 'hidden')",
    )
