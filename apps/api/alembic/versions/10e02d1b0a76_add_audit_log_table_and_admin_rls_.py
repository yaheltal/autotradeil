"""add audit_log table and admin RLS policies

Revision ID: 10e02d1b0a76
Revises: 8069b755cec5
Create Date: 2026-04-24 14:37:00.621212

This migration adds:

1. `audit_log` table  — append-only ledger of admin actions (verify, impersonate,
   etc.), with RLS so only admins can read/write.

2. Admin bypass policies — one per tenant table (users, dealers, inventory,
   listings, offers, deals). A user with `user_type = 'admin'` can SELECT,
   INSERT, UPDATE, DELETE any row. These are ADDITIONAL permissive policies
   OR-ed with the existing self/owner policies; non-admin behavior is
   unchanged.

3. `public.handle_new_auth_user()` trigger — fires AFTER INSERT on
   `auth.users` to mirror a row into `public.users` with a default
   `user_type = 'dealer'`. Signup flow (Phase 2) can later promote or
   demote.  ON CONFLICT (id) DO NOTHING makes this idempotent.

All changes are reversible — `downgrade()` drops in exact reverse order.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "10e02d1b0a76"
down_revision: Union[str, None] = "8069b755cec5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables that admins get blanket access to.
TENANT_TABLES: tuple[str, ...] = (
    "users",
    "dealers",
    "inventory",
    "listings",
    "offers",
    "deals",
)


ADMIN_POLICY_SQL = """
CREATE POLICY admin_full_access_{table} ON {table}
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.user_type = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.user_type = 'admin'
    )
);
"""


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. audit_log table
    # --------------------------------------------------------------
    op.create_table(
        "audit_log",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "actor_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "impersonated_dealer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dealers.id"),
            nullable=True,
        ),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=True),
        sa.Column("target_id", UUID(as_uuid=True), nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_audit_log_actor", "audit_log", ["actor_user_id"])
    op.create_index(
        "idx_audit_log_created_at",
        "audit_log",
        [sa.text("created_at DESC")],
    )

    # --------------------------------------------------------------
    # 2. RLS on audit_log + admin-only read/insert
    # --------------------------------------------------------------
    op.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;")

    op.execute(
        """
        CREATE POLICY admin_read_audit_log ON audit_log
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = auth.uid() AND u.user_type = 'admin'
            )
        );
        """
    )

    op.execute(
        """
        CREATE POLICY admin_insert_audit_log ON audit_log
        FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = auth.uid() AND u.user_type = 'admin'
            )
        );
        """
    )

    # --------------------------------------------------------------
    # 3. admin_full_access_* policies on each tenant table
    # --------------------------------------------------------------
    for table in TENANT_TABLES:
        op.execute(ADMIN_POLICY_SQL.format(table=table))

    # --------------------------------------------------------------
    # 4. handle_new_auth_user trigger
    # --------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
        RETURNS TRIGGER AS $$
        BEGIN
            INSERT INTO public.users (id, email, user_type, verified, created_at, updated_at)
            VALUES (NEW.id, NEW.email, 'dealer', false, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
        """
    )

    op.execute(
        """
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
        """
    )


def downgrade() -> None:
    # Reverse of upgrade(), in opposite order.

    # 4. trigger + function
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;")
    op.execute("DROP FUNCTION IF EXISTS public.handle_new_auth_user();")

    # 3. admin_full_access_* policies
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS admin_full_access_{table} ON {table};")

    # 2. audit_log policies + disable RLS
    op.execute("DROP POLICY IF EXISTS admin_insert_audit_log ON audit_log;")
    op.execute("DROP POLICY IF EXISTS admin_read_audit_log ON audit_log;")
    op.execute("ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;")

    # 1. audit_log table + indexes
    op.drop_index("idx_audit_log_created_at", table_name="audit_log")
    op.drop_index("idx_audit_log_actor", table_name="audit_log")
    op.drop_table("audit_log")
