"""push_subscriptions_table

Stores Web Push browser subscriptions per user device. Allows the
backend to deliver native browser notifications via the Web Push
protocol — driven by the dealer's "התראות דחיפה" toggle on
/dashboard/security.

Revision ID: c4d8e1a2f3b9
Revises: a3f4c2e1b9d7
Create Date: 2026-04-26 13:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "c4d8e1a2f3b9"
down_revision: Union[str, None] = "a3f4c2e1b9d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("user_id", "endpoint", name="uq_push_user_endpoint"),
    )
    op.create_index("idx_push_user_id", "push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_push_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
