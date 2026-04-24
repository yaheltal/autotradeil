"""add inventory_images table

Revision ID: d8a87b2597fd
Revises: 4bf02dc2a22c
Create Date: 2026-04-24 22:41:40.108297

Adds the `inventory_images` table + RLS policies.

RLS:
  - dealer_own_inventory_images       — dealers access only their own rows
  - admin_full_access_inventory_images — admins unrestricted
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d8a87b2597fd"
down_revision: Union[str, None] = "4bf02dc2a22c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inventory_images",
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
            "dealer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dealers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("public_id", sa.Text(), nullable=False),
        sa.Column(
            "position",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_inventory_images_inventory_id",
        "inventory_images",
        ["inventory_id"],
    )

    op.execute("ALTER TABLE inventory_images ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY dealer_own_inventory_images ON inventory_images
        FOR ALL TO authenticated
        USING (dealer_id = current_dealer_id())
        WITH CHECK (dealer_id = current_dealer_id())
        """
    )
    op.execute(
        """
        CREATE POLICY admin_full_access_inventory_images ON inventory_images
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

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_images TO authenticated")


def downgrade() -> None:
    op.execute("REVOKE ALL ON inventory_images FROM authenticated")
    op.execute(
        "DROP POLICY IF EXISTS admin_full_access_inventory_images ON inventory_images"
    )
    op.execute("DROP POLICY IF EXISTS dealer_own_inventory_images ON inventory_images")
    op.execute("ALTER TABLE inventory_images DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_inventory_images_inventory_id", table_name="inventory_images")
    op.drop_table("inventory_images")
