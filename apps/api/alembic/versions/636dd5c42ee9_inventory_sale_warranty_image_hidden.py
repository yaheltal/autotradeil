"""phase 6.5 — inventory sale lifecycle + warranty + per-image hidden

Revision ID: 636dd5c42ee9
Revises: b5efe7fd8b8a
Create Date: 2026-04-25 14:14:02.913535

Phase 6.5 — Dealer-facing sale workflow + per-image visibility.

1. `inventory` (six new nullable columns):
   - `purchase_cost` INTEGER  CHECK >= 0  — what the dealer paid
   - `sale_price`    INTEGER  CHECK >= 0  — what the deal closed at
   - `sold_at`       TIMESTAMPTZ          — sale timestamp
   - `sold_to`       VARCHAR(20) CHECK ∈ {'b2b','b2c','external'}
   - `warranty_type` VARCHAR(20) CHECK ∈ {'manufacturer','dealer','extended','none'}
   - `warranty_until` DATE
   All NULL-able; no data backfill required. `b2b_price` / `b2c_price`
   are kept as listed prices; `sale_price` is what actually changed hands.
   Index `idx_inventory_sold_at` accelerates period-bounded stat queries.

2. `inventory_images`:
   - `hidden` BOOLEAN NOT NULL DEFAULT false
   Per-image visibility toggle. Existing rows backfill to `false` via the
   server_default before NOT NULL is enforced. The marketplace primary-image
   lookup is updated separately to skip rows where `hidden = true`.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "636dd5c42ee9"
down_revision: Union[str, None] = "b5efe7fd8b8a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. inventory — sale lifecycle + warranty
    # --------------------------------------------------------------
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

    # --------------------------------------------------------------
    # 2. inventory_images — per-image hidden flag
    # --------------------------------------------------------------
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
