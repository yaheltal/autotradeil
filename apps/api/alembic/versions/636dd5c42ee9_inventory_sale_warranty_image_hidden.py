"""inventory sale warranty image hidden

Revision ID: 636dd5c42ee9
Revises: b5efe7fd8b8a
Create Date: 2026-04-25 14:14:02.913535

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '636dd5c42ee9'
down_revision: Union[str, None] = 'b5efe7fd8b8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ----------------------------------------------------------
    # inventory — sale lifecycle + warranty
    # ----------------------------------------------------------
    op.add_column("inventory", sa.Column("purchase_cost", sa.Integer(), nullable=True))
    op.add_column("inventory", sa.Column("sale_price", sa.Integer(), nullable=True))
    op.add_column(
        "inventory",
        sa.Column("sold_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("inventory", sa.Column("sold_to", sa.String(20), nullable=True))
    op.add_column("inventory", sa.Column("warranty_type", sa.String(20), nullable=True))
    op.add_column("inventory", sa.Column("warranty_until", sa.Date(), nullable=True))

    op.create_check_constraint(
        "inventory_purchase_cost_nonneg",
        "inventory",
        "purchase_cost IS NULL OR purchase_cost >= 0",
    )
    op.create_check_constraint(
        "inventory_sale_price_nonneg",
        "inventory",
        "sale_price IS NULL OR sale_price >= 0",
    )
    op.create_check_constraint(
        "inventory_sold_to_check",
        "inventory",
        "sold_to IS NULL OR sold_to IN ('b2b', 'b2c', 'external')",
    )
    op.create_check_constraint(
        "inventory_warranty_type_check",
        "inventory",
        "warranty_type IS NULL OR warranty_type IN ('manufacturer', 'dealer', 'extended', 'none')",
    )
    op.create_index("idx_inventory_sold_at", "inventory", ["sold_at"])

    # ----------------------------------------------------------
    # inventory_images — hidden flag (per-image visibility toggle)
    # ----------------------------------------------------------
    op.add_column(
        "inventory_images",
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("inventory_images", "hidden")
    op.drop_index("idx_inventory_sold_at", table_name="inventory")
    op.drop_constraint("inventory_warranty_type_check", "inventory", type_="check")
    op.drop_constraint("inventory_sold_to_check", "inventory", type_="check")
    op.drop_constraint("inventory_sale_price_nonneg", "inventory", type_="check")
    op.drop_constraint("inventory_purchase_cost_nonneg", "inventory", type_="check")
    op.drop_column("inventory", "warranty_until")
    op.drop_column("inventory", "warranty_type")
    op.drop_column("inventory", "sold_to")
    op.drop_column("inventory", "sold_at")
    op.drop_column("inventory", "sale_price")
    op.drop_column("inventory", "purchase_cost")
