"""add events table for domain event log

Revision ID: e6b08a202308
Revises: 10e02d1b0a76
Create Date: 2026-04-24 14:47:35.004393

This migration adds:

1. `events` table — append-only stream of domain events
   (dealer.created, vehicle.listed, offer.sent, …). Distinct from
   `audit_log`, which tracks admin actions: `events` is the canonical
   source of truth for what happened in the business domain, consumed
   later by AI / analytics / notification workers.

2. Indexes:
   - idx_events_type          — filter by event_type
   - idx_events_aggregate     — composite (aggregate_type, aggregate_id)
                                for per-entity timelines
   - idx_events_occurred_at   — recent events first
   - idx_events_unprocessed   — partial, selects rows whose
                                processed_at IS NULL (worker inbox)

3. RLS — enabled, with an `admin_full_access_events` policy.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e6b08a202308"
down_revision: Union[str, None] = "10e02d1b0a76"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ADMIN_POLICY_SQL = """
CREATE POLICY admin_full_access_events ON events
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.user_type = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.user_type = 'admin'
    )
);
"""


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. events table
    # --------------------------------------------------------------
    op.create_table(
        "events",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column(
            "actor_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("aggregate_type", sa.Text(), nullable=False),
        sa.Column("aggregate_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # --------------------------------------------------------------
    # 2. indexes
    # --------------------------------------------------------------
    op.create_index("idx_events_type", "events", ["event_type"])
    op.create_index(
        "idx_events_aggregate",
        "events",
        ["aggregate_type", "aggregate_id"],
    )
    op.create_index(
        "idx_events_occurred_at",
        "events",
        [sa.text("occurred_at DESC")],
    )
    op.create_index(
        "idx_events_unprocessed",
        "events",
        ["processed_at"],
        postgresql_where=sa.text("processed_at IS NULL"),
    )

    # --------------------------------------------------------------
    # 3. RLS + admin-only access
    # --------------------------------------------------------------
    op.execute("ALTER TABLE events ENABLE ROW LEVEL SECURITY;")
    op.execute(ADMIN_POLICY_SQL)


def downgrade() -> None:
    # Reverse strict opposite order.
    op.execute("DROP POLICY IF EXISTS admin_full_access_events ON events;")
    op.execute("ALTER TABLE events DISABLE ROW LEVEL SECURITY;")
    op.drop_index("idx_events_unprocessed", table_name="events")
    op.drop_index("idx_events_occurred_at", table_name="events")
    op.drop_index("idx_events_aggregate", table_name="events")
    op.drop_index("idx_events_type", table_name="events")
    op.drop_table("events")
