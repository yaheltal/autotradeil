"""phase 4.2 — offer closing + dealer trust + deals restructure

Revision ID: 9e565d493557
Revises: 6edf8999e660
Create Date: 2026-04-25 01:18:21.056143

Phase 4.2 — Offer refinements + dealer trust system.

1. `offers` — add close-of-deal fields (both sides must confirm):
   - closed_at TIMESTAMPTZ
   - deal_confirmed_buyer BOOLEAN DEFAULT false
   - deal_confirmed_seller BOOLEAN DEFAULT false

2. `dealers` — add trust counters + member_since.
   NB: `trust_score` and `tier` ALREADY EXIST (Numeric + Text with CHECK).
   We keep the existing types; Phase 4.2's trust calculator writes
   integer values that coerce cleanly into the Numeric column.

3. `deals` — restructure from the Phase 0 user-scoped shape to a
   dealer-scoped marketplace shape. Table is empty so column renames +
   type changes + FK swaps are safe.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9e565d493557"
down_revision: Union[str, None] = "6edf8999e660"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. offers — deal-closing fields
    # --------------------------------------------------------------
    op.add_column(
        "offers", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "offers",
        sa.Column(
            "deal_confirmed_buyer",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "offers",
        sa.Column(
            "deal_confirmed_seller",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # --------------------------------------------------------------
    # 2. dealers — trust counters
    # --------------------------------------------------------------
    op.add_column(
        "dealers",
        sa.Column(
            "deals_completed", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "deals_cancelled", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "dealers",
        sa.Column("offers_sent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "offers_received", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "member_since",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # Backfill member_since for existing dealers to their created_at value.
    op.execute("UPDATE dealers SET member_since = created_at")

    # --------------------------------------------------------------
    # 3. deals — restructure (empty table, safe DDL)
    # --------------------------------------------------------------
    op.execute("DROP INDEX IF EXISTS idx_deals_deal_type")
    op.execute("DROP INDEX IF EXISTS idx_deals_seller")
    op.execute("DROP INDEX IF EXISTS idx_deals_buyer")
    op.execute("DROP INDEX IF EXISTS idx_deals_closed_at")
    op.execute("DROP INDEX IF EXISTS idx_deals_inventory_id")

    op.execute("ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_final_price_nonneg")
    op.execute("ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_different_parties")
    op.execute("ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_deal_type_check")

    op.drop_column("deals", "deal_type")
    op.drop_column("deals", "closed_at")

    # Rename user-scoped FKs to dealer-scoped FKs.
    op.alter_column("deals", "seller", new_column_name="seller_dealer_id")
    op.alter_column("deals", "buyer", new_column_name="buyer_dealer_id")

    # Drop existing FKs (they point at users) and recreate pointing at dealers.
    op.execute("ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_seller_fkey")
    op.execute("ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_buyer_fkey")
    op.create_foreign_key(
        "deals_seller_dealer_id_fkey",
        "deals",
        "dealers",
        ["seller_dealer_id"],
        ["id"],
    )
    op.create_foreign_key(
        "deals_buyer_dealer_id_fkey",
        "deals",
        "dealers",
        ["buyer_dealer_id"],
        ["id"],
    )

    # final_price NUMERIC → INTEGER.
    op.alter_column(
        "deals",
        "final_price",
        type_=sa.Integer(),
        existing_type=sa.Numeric(12, 2),
        postgresql_using="final_price::integer",
    )

    # Add Phase 4.2 columns.
    op.add_column(
        "deals",
        sa.Column(
            "offer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("offers.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.add_column(
        "deals", sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "deals",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_check_constraint(
        "deals_final_price_nonneg", "deals", "final_price >= 0"
    )
    op.create_check_constraint(
        "deals_different_dealers",
        "deals",
        "buyer_dealer_id <> seller_dealer_id",
    )
    op.create_index("idx_deals_buyer", "deals", ["buyer_dealer_id"])
    op.create_index("idx_deals_seller", "deals", ["seller_dealer_id"])
    op.create_index("idx_deals_inventory_id", "deals", ["inventory_id"])
    op.create_index(
        "idx_deals_created_at", "deals", [sa.text("created_at DESC")]
    )


def downgrade() -> None:
    op.drop_index("idx_deals_created_at", table_name="deals")
    op.drop_index("idx_deals_inventory_id", table_name="deals")
    op.drop_index("idx_deals_seller", table_name="deals")
    op.drop_index("idx_deals_buyer", table_name="deals")

    op.drop_constraint("deals_different_dealers", "deals", type_="check")
    op.drop_constraint("deals_final_price_nonneg", "deals", type_="check")

    op.drop_column("deals", "created_at")
    op.drop_column("deals", "confirmed_at")
    op.drop_column("deals", "offer_id")

    op.alter_column(
        "deals",
        "final_price",
        type_=sa.Numeric(12, 2),
        existing_type=sa.Integer(),
    )

    op.drop_constraint("deals_buyer_dealer_id_fkey", "deals", type_="foreignkey")
    op.drop_constraint("deals_seller_dealer_id_fkey", "deals", type_="foreignkey")
    op.alter_column("deals", "buyer_dealer_id", new_column_name="buyer")
    op.alter_column("deals", "seller_dealer_id", new_column_name="seller")
    op.create_foreign_key("deals_seller_fkey", "deals", "users", ["seller"], ["id"])
    op.create_foreign_key("deals_buyer_fkey", "deals", "users", ["buyer"], ["id"])

    op.add_column("deals", sa.Column("deal_type", sa.Text(), nullable=True))
    op.execute("UPDATE deals SET deal_type='b2b'")
    op.alter_column("deals", "deal_type", nullable=False)
    op.add_column(
        "deals",
        sa.Column(
            "closed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_check_constraint(
        "deals_deal_type_check", "deals", "deal_type IN ('b2b', 'b2c')"
    )
    op.create_check_constraint(
        "deals_different_parties", "deals", "seller <> buyer"
    )
    op.create_check_constraint(
        "deals_final_price_nonneg", "deals", "final_price >= 0"
    )
    op.create_index("idx_deals_inventory_id", "deals", ["inventory_id"])
    op.create_index("idx_deals_seller", "deals", ["seller"])
    op.create_index("idx_deals_buyer", "deals", ["buyer"])
    op.create_index("idx_deals_deal_type", "deals", ["deal_type"])
    op.create_index("idx_deals_closed_at", "deals", [sa.text("closed_at DESC")])

    op.drop_column("dealers", "member_since")
    op.drop_column("dealers", "offers_received")
    op.drop_column("dealers", "offers_sent")
    op.drop_column("dealers", "deals_cancelled")
    op.drop_column("dealers", "deals_completed")

    op.drop_column("offers", "deal_confirmed_seller")
    op.drop_column("offers", "deal_confirmed_buyer")
    op.drop_column("offers", "closed_at")
