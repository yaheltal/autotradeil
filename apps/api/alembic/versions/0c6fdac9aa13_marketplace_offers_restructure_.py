"""marketplace: offers restructure, inventory b2b, notifications

Revision ID: 0c6fdac9aa13
Revises: d8a87b2597fd
Create Date: 2026-04-24 23:32:49.471526

Phase 4.1 — B2B marketplace.

1. `inventory`: add `is_b2b BOOLEAN NOT NULL DEFAULT false` + `b2b_price INTEGER`
2. `offers`: restructure from Phase 1 shape to marketplace shape
   - `from_dealer` → `buyer_dealer_id`
   - `to_dealer`   → `seller_dealer_id`
   - `amount` (NUMERIC(12,2)) → `offered_price` (INTEGER)
   - drop `expires_at`
   - add `message`, `counter_price`, `counter_message`
   - status CHECK: {pending,accepted,rejected,countered,cancelled}
     (superset of old, plus `cancelled`; `withdrawn`/`expired` removed)
3. `notifications`: new table + RLS

Table is empty so DDL-level renames + type changes are safe.
RLS policies on `offers` (`offers_involved_read` etc.) use column-name
references; Postgres auto-rewrites those when columns are renamed.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "0c6fdac9aa13"
down_revision: Union[str, None] = "d8a87b2597fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. inventory — B2B publishing flags
    # --------------------------------------------------------------
    op.add_column(
        "inventory",
        sa.Column(
            "is_b2b",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column("inventory", sa.Column("b2b_price", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "inventory_b2b_price_nonneg",
        "inventory",
        "b2b_price IS NULL OR b2b_price >= 0",
    )

    # --------------------------------------------------------------
    # 2. offers — restructure to marketplace shape
    # --------------------------------------------------------------
    # Drop old CHECK constraints that reference old columns / values.
    op.execute("ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_amount_check")
    op.execute("ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_status_check")
    op.execute("ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_check")

    # Drop old RLS policies — they'll be recreated after column rename so
    # we keep them in lockstep with the new column names.
    op.execute("DROP POLICY IF EXISTS offers_involved_read ON offers")
    op.execute("DROP POLICY IF EXISTS offers_from_insert ON offers")
    op.execute("DROP POLICY IF EXISTS offers_involved_update ON offers")
    op.execute("DROP POLICY IF EXISTS admin_full_access_offers ON offers")

    # Rename columns.
    op.alter_column("offers", "from_dealer", new_column_name="buyer_dealer_id")
    op.alter_column("offers", "to_dealer", new_column_name="seller_dealer_id")

    # amount NUMERIC → offered_price INTEGER.
    op.alter_column(
        "offers",
        "amount",
        new_column_name="offered_price",
        type_=sa.Integer(),
        existing_type=sa.Numeric(12, 2),
        postgresql_using="amount::integer",
    )

    # Drop expires_at, add new columns.
    op.drop_column("offers", "expires_at")
    op.add_column("offers", sa.Column("message", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("counter_price", sa.Integer(), nullable=True))
    op.add_column("offers", sa.Column("counter_message", sa.Text(), nullable=True))

    # Status type: TEXT → VARCHAR(20); default stays 'pending'.
    op.execute("ALTER TABLE offers ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE offers ALTER COLUMN status TYPE VARCHAR(20) "
        "USING status::varchar(20)"
    )
    op.execute("ALTER TABLE offers ALTER COLUMN status SET DEFAULT 'pending'")

    # New CHECK constraints.
    op.create_check_constraint(
        "offers_offered_price_pos", "offers", "offered_price > 0"
    )
    op.create_check_constraint(
        "offers_counter_price_pos",
        "offers",
        "counter_price IS NULL OR counter_price > 0",
    )
    op.create_check_constraint(
        "offers_status_check",
        "offers",
        "status IN ('pending', 'accepted', 'rejected', 'countered', 'cancelled')",
    )
    op.create_check_constraint(
        "offers_different_dealers",
        "offers",
        "buyer_dealer_id <> seller_dealer_id",
    )

    # Re-add indexes (drop old, recreate with canonical names).
    op.execute("DROP INDEX IF EXISTS idx_offers_from_dealer")
    op.execute("DROP INDEX IF EXISTS idx_offers_to_dealer")
    op.create_index("idx_offers_buyer", "offers", ["buyer_dealer_id"])
    op.create_index("idx_offers_seller", "offers", ["seller_dealer_id"])

    # Recreate RLS policies with new column names.
    op.execute(
        """
        CREATE POLICY offers_involved_read ON offers
        FOR SELECT TO authenticated
        USING (
            buyer_dealer_id = current_dealer_id()
            OR seller_dealer_id = current_dealer_id()
            OR is_admin()
        )
        """
    )
    op.execute(
        """
        CREATE POLICY offers_buyer_insert ON offers
        FOR INSERT TO authenticated
        WITH CHECK (buyer_dealer_id = current_dealer_id())
        """
    )
    op.execute(
        """
        CREATE POLICY offers_involved_update ON offers
        FOR UPDATE TO authenticated
        USING (
            buyer_dealer_id = current_dealer_id()
            OR seller_dealer_id = current_dealer_id()
        )
        WITH CHECK (
            buyer_dealer_id = current_dealer_id()
            OR seller_dealer_id = current_dealer_id()
        )
        """
    )
    op.execute(
        """
        CREATE POLICY admin_full_access_offers ON offers
        FOR ALL TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid() AND u.user_type = 'admin'
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid() AND u.user_type = 'admin'
            )
        )
        """
    )

    # --------------------------------------------------------------
    # 3. notifications — dealer-scoped inbox
    # --------------------------------------------------------------
    op.create_table(
        "notifications",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "dealer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dealers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("data", JSONB, nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_notifications_dealer", "notifications", ["dealer_id"])
    op.create_index(
        "idx_notifications_unread",
        "notifications",
        ["dealer_id"],
        postgresql_where=sa.text("read_at IS NULL"),
    )

    op.execute("ALTER TABLE notifications ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY notifications_own ON notifications
        FOR ALL TO authenticated
        USING (dealer_id = current_dealer_id())
        WITH CHECK (dealer_id = current_dealer_id())
        """
    )
    op.execute(
        """
        CREATE POLICY admin_full_access_notifications ON notifications
        FOR ALL TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid() AND u.user_type = 'admin'
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid() AND u.user_type = 'admin'
            )
        )
        """
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated"
    )


def downgrade() -> None:
    # Notifications
    op.execute("REVOKE ALL ON notifications FROM authenticated")
    op.execute("DROP POLICY IF EXISTS admin_full_access_notifications ON notifications")
    op.execute("DROP POLICY IF EXISTS notifications_own ON notifications")
    op.execute("ALTER TABLE notifications DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_notifications_unread", table_name="notifications")
    op.drop_index("idx_notifications_dealer", table_name="notifications")
    op.drop_table("notifications")

    # offers — reverse
    op.execute("DROP POLICY IF EXISTS admin_full_access_offers ON offers")
    op.execute("DROP POLICY IF EXISTS offers_involved_update ON offers")
    op.execute("DROP POLICY IF EXISTS offers_buyer_insert ON offers")
    op.execute("DROP POLICY IF EXISTS offers_involved_read ON offers")

    op.drop_index("idx_offers_seller", table_name="offers")
    op.drop_index("idx_offers_buyer", table_name="offers")
    op.create_index("idx_offers_to_dealer", "offers", ["seller_dealer_id"])
    op.create_index("idx_offers_from_dealer", "offers", ["buyer_dealer_id"])

    op.drop_constraint("offers_different_dealers", "offers", type_="check")
    op.drop_constraint("offers_status_check", "offers", type_="check")
    op.drop_constraint("offers_counter_price_pos", "offers", type_="check")
    op.drop_constraint("offers_offered_price_pos", "offers", type_="check")

    op.execute("ALTER TABLE offers ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE offers ALTER COLUMN status TYPE TEXT")
    op.execute("ALTER TABLE offers ALTER COLUMN status SET DEFAULT 'pending'")

    op.drop_column("offers", "counter_message")
    op.drop_column("offers", "counter_price")
    op.drop_column("offers", "message")
    op.add_column(
        "offers", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.alter_column(
        "offers",
        "offered_price",
        new_column_name="amount",
        type_=sa.Numeric(12, 2),
        existing_type=sa.Integer(),
    )
    op.alter_column("offers", "seller_dealer_id", new_column_name="to_dealer")
    op.alter_column("offers", "buyer_dealer_id", new_column_name="from_dealer")

    op.create_check_constraint(
        "offers_status_check",
        "offers",
        "status IN ('pending','accepted','rejected','countered','expired','withdrawn')",
    )
    op.create_check_constraint("offers_amount_check", "offers", "amount >= 0")
    op.create_check_constraint("offers_check", "offers", "from_dealer <> to_dealer")

    # inventory
    op.drop_constraint("inventory_b2b_price_nonneg", "inventory", type_="check")
    op.drop_column("inventory", "b2b_price")
    op.drop_column("inventory", "is_b2b")
