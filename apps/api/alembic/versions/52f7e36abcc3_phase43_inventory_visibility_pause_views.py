"""phase 4.3 — inventory visibility + pause + view tracking

Revision ID: 52f7e36abcc3
Revises: 9e565d493557
Create Date: 2026-04-25 01:47:33.182497

Phase 4.3 — Inventory visibility controls + analytics.

1. `inventory`:
   - `visibility` VARCHAR(20) NOT NULL DEFAULT 'private'
     CHECK ∈ {'private','b2b','b2c','both'}  — replaces is_b2b boolean
   - `b2c_price` INTEGER  (retail price shown to consumers)
   - `paused_until` TIMESTAMPTZ  (NULL = not paused)
   - `pause_reason` VARCHAR(100)
   Backfill: existing rows with is_b2b=true → visibility='b2b';
   rows with is_b2b=false stay 'private'. The `is_b2b` column is KEPT
   as a shadow so the ORM and any legacy reads continue to work; a
   later migration can drop it once all call sites are visibility-based.

2. `inventory_views` (new table):
   - one row per vehicle-detail view
   - `viewer_dealer_id` NULL for anonymous/B2C views

3. `dealers` — aggregate counters used by the analytics endpoint:
   - `total_views` INTEGER
   - `total_offers_value` BIGINT
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "52f7e36abcc3"
down_revision: Union[str, None] = "9e565d493557"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. inventory — visibility, b2c_price, pause fields
    # --------------------------------------------------------------
    op.add_column(
        "inventory",
        sa.Column(
            "visibility",
            sa.String(20),
            nullable=False,
            server_default="private",
        ),
    )
    op.add_column("inventory", sa.Column("b2c_price", sa.Integer(), nullable=True))
    op.add_column(
        "inventory", sa.Column("paused_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "inventory", sa.Column("pause_reason", sa.String(100), nullable=True)
    )
    op.create_check_constraint(
        "inventory_visibility_check",
        "inventory",
        "visibility IN ('private', 'b2b', 'b2c', 'both')",
    )
    op.create_check_constraint(
        "inventory_b2c_price_nonneg",
        "inventory",
        "b2c_price IS NULL OR b2c_price >= 0",
    )
    # Backfill: is_b2b=true becomes visibility='b2b'.
    op.execute("UPDATE inventory SET visibility='b2b' WHERE is_b2b = true")

    # --------------------------------------------------------------
    # 2. inventory_views
    # --------------------------------------------------------------
    op.create_table(
        "inventory_views",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "inventory_id",
            UUID(as_uuid=True),
            sa.ForeignKey("inventory.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "viewer_dealer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dealers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "viewed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "source",
            sa.String(20),
            nullable=False,
            server_default="marketplace",
        ),
    )
    op.create_check_constraint(
        "inventory_views_source_check",
        "inventory_views",
        "source IN ('marketplace', 'b2c', 'direct')",
    )
    op.create_index(
        "idx_inventory_views_inventory", "inventory_views", ["inventory_id"]
    )
    op.create_index(
        "idx_inventory_views_dealer", "inventory_views", ["viewer_dealer_id"]
    )
    op.create_index(
        "idx_inventory_views_viewed_at",
        "inventory_views",
        [sa.text("viewed_at DESC")],
    )

    # --------------------------------------------------------------
    # 3. dealers — aggregate counters
    # --------------------------------------------------------------
    op.add_column(
        "dealers",
        sa.Column("total_views", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "total_offers_value",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("dealers", "total_offers_value")
    op.drop_column("dealers", "total_views")

    op.drop_index("idx_inventory_views_viewed_at", table_name="inventory_views")
    op.drop_index("idx_inventory_views_dealer", table_name="inventory_views")
    op.drop_index("idx_inventory_views_inventory", table_name="inventory_views")
    op.drop_constraint(
        "inventory_views_source_check", "inventory_views", type_="check"
    )
    op.drop_table("inventory_views")

    op.drop_constraint("inventory_b2c_price_nonneg", "inventory", type_="check")
    op.drop_constraint("inventory_visibility_check", "inventory", type_="check")
    op.drop_column("inventory", "pause_reason")
    op.drop_column("inventory", "paused_until")
    op.drop_column("inventory", "b2c_price")
    op.drop_column("inventory", "visibility")
