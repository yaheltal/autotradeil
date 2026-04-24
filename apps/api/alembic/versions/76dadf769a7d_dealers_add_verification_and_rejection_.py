"""dealers: add verification and rejection audit fields

Revision ID: 76dadf769a7d
Revises: 89042f7f5060
Create Date: 2026-04-24 15:55:10.718758

Adds the verification state + audit fields to `dealers`:

    verified          BOOLEAN NOT NULL DEFAULT FALSE   -- dealer-level gate
    verified_at       TIMESTAMPTZ NULL                 -- when approved
    verified_by       UUID NULL → users.id (SET NULL)  -- admin who approved
    rejection_reason  TEXT NULL                        -- free text
    rejected_at       TIMESTAMPTZ NULL                 -- when rejected
    rejected_by       UUID NULL → users.id (SET NULL)  -- admin who rejected

A `verified` column did not previously exist on `dealers` —
`require_verified_dealer` in auth.py currently falls back to `users.verified`.
This migration adds the proper per-dealer gate so the business-approval
signal is distinct from email verification. Phase 2.2 will switch auth.py
to read `dealers.verified`.

Also adds:
  - pg_trgm extension (idempotent)
  - idx_dealers_verified_status       — partial WHERE verified = false
                                        (admin review queue)
  - idx_dealers_created_at            — created_at DESC
  - idx_dealers_business_name_trgm    — GIN + gin_trgm_ops on business_name
                                        (fuzzy search / autocomplete)

CHECK constraints enforce state consistency:
  - ck_dealers_rejection_consistency
      rejection_reason / rejected_at / rejected_by are all-or-nothing
  - ck_dealers_verification_consistency
      verified=true  ⇒ verified_at + verified_by populated
      verified=false ⇒ both NULL

Before installing the consistency constraint, back-fill any rows that
already claim verified=true so they satisfy it (self-verify). At the
time this migration runs the `dealers` table is empty (admins exist in
`users` only), so the UPDATE is a no-op — but we keep it for safety on
re-runs against seeded environments.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "76dadf769a7d"
down_revision: Union[str, None] = "89042f7f5060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. pg_trgm extension for trigram fuzzy search on business_name
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # 2. Columns
    op.add_column(
        "dealers",
        sa.Column(
            "verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "dealers",
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "verified_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "dealers",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "dealers",
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "rejected_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # 3. Bootstrap: back-fill existing verified=true rows so they pass the
    #    consistency check about to be installed. No-op on empty table.
    op.execute(
        """
        UPDATE dealers
        SET verified_at = created_at,
            verified_by = user_id
        WHERE verified = true
          AND (verified_at IS NULL OR verified_by IS NULL)
        """
    )

    # 4. Indexes
    op.create_index(
        "idx_dealers_verified_status",
        "dealers",
        ["verified"],
        postgresql_where=sa.text("verified = false"),
    )
    op.create_index(
        "idx_dealers_created_at",
        "dealers",
        [sa.text("created_at DESC")],
    )
    op.execute(
        "CREATE INDEX idx_dealers_business_name_trgm "
        "ON dealers USING gin (business_name gin_trgm_ops)"
    )

    # 5. CHECK constraints — enforce state consistency
    op.create_check_constraint(
        "ck_dealers_rejection_consistency",
        "dealers",
        "(rejection_reason IS NULL) = (rejected_at IS NULL) "
        "AND (rejected_at IS NULL) = (rejected_by IS NULL)",
    )
    op.create_check_constraint(
        "ck_dealers_verification_consistency",
        "dealers",
        "(verified = false AND verified_at IS NULL AND verified_by IS NULL) "
        "OR (verified = true AND verified_at IS NOT NULL AND verified_by IS NOT NULL)",
    )


def downgrade() -> None:
    # Reverse strict opposite order. pg_trgm is left installed — other
    # migrations may depend on it in the future.
    op.drop_constraint(
        "ck_dealers_verification_consistency", "dealers", type_="check"
    )
    op.drop_constraint(
        "ck_dealers_rejection_consistency", "dealers", type_="check"
    )
    op.execute("DROP INDEX IF EXISTS idx_dealers_business_name_trgm")
    op.drop_index("idx_dealers_created_at", table_name="dealers")
    op.drop_index("idx_dealers_verified_status", table_name="dealers")

    op.drop_column("dealers", "rejected_by")
    op.drop_column("dealers", "rejected_at")
    op.drop_column("dealers", "rejection_reason")
    op.drop_column("dealers", "verified_by")
    op.drop_column("dealers", "verified_at")
    op.drop_column("dealers", "verified")
