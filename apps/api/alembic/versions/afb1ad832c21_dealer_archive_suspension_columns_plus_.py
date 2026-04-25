"""phase 6.7 — dealer archive + suspension hardening + reason templates

Revision ID: afb1ad832c21
Revises: 6941dd8d09f0
Create Date: 2026-04-25 16:55:22.593058

Phase 6.7 — admin moderation actions on dealers.

1. `dealers` (new columns):
   - `archived_at`        TIMESTAMPTZ           — soft-delete sentinel
   - `archived_by`        UUID FK→users(id)     — admin who archived
   - `archived_reason`    VARCHAR(100)
   - `suspended_by`       UUID FK→users(id)     — admin who suspended
   - `suspension_silent`  BOOLEAN NOT NULL DEFAULT false
                                                — true = silent block, no banner/email
   `suspended_at` and `suspended_reason` already exist from Phase 4.4 —
   we reuse them. The `suspension_silent` flag distinguishes the new
   silent path from the regular reason-bearing suspension.

2. `suspension_reason_templates` (new table):
   Predefined Hebrew reason chips so admins don't retype. Two kinds:
   `suspend` (6 seeds) and `archive` (4 seeds).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op


revision: str = "afb1ad832c21"
down_revision: Union[str, None] = "6941dd8d09f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. dealers — archive + suspension metadata
    # --------------------------------------------------------------
    op.add_column(
        "dealers", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "dealers", sa.Column("archived_by", UUID(as_uuid=True), nullable=True)
    )
    op.add_column(
        "dealers", sa.Column("archived_reason", sa.String(100), nullable=True)
    )
    op.create_foreign_key(
        "dealers_archived_by_fkey",
        "dealers",
        "users",
        ["archived_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_dealers_archived_at", "dealers", ["archived_at"])

    op.add_column(
        "dealers", sa.Column("suspended_by", UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "dealers_suspended_by_fkey",
        "dealers",
        "users",
        ["suspended_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "dealers",
        sa.Column(
            "suspension_silent", sa.Boolean(), nullable=False, server_default="false"
        ),
    )

    # --------------------------------------------------------------
    # 2. suspension_reason_templates
    # --------------------------------------------------------------
    op.create_table(
        "suspension_reason_templates",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("text_he", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column(
            "active", sa.Boolean(), nullable=False, server_default="true"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "kind IN ('suspend', 'archive')",
            name="suspension_reason_templates_kind_check",
        ),
    )

    # Seed defaults via raw SQL (one statement per row, op.execute).
    seeds = [
        ("suspend", "חשד להתנהגות חריגה"),
        ("suspend", "אי-תשלום דמי מנוי"),
        ("suspend", "תלונות חוזרות מסוחרים אחרים"),
        ("suspend", "מסמכי KYC לא בתוקף"),
        ("suspend", "חשד להונאה"),
        ("suspend", "בקשת הסוחר (השעיה זמנית)"),
        ("archive", "בקשה של הסוחר לסגור חשבון"),
        ("archive", "חשד להונאה מאומת"),
        ("archive", "הפרת תנאי שימוש חמורה"),
        ("archive", "אי-פעילות ממושכת"),
    ]
    for kind, text in seeds:
        # Hebrew text contains no apostrophes that need escaping in any
        # of the seed strings; if a future seed does, switch to bound
        # parameters via the connection bind directly.
        op.execute(
            sa.text(
                "INSERT INTO suspension_reason_templates (kind, text_he) "
                "VALUES (:k, :t)"
            ).bindparams(k=kind, t=text)
        )


def downgrade() -> None:
    op.drop_table("suspension_reason_templates")
    op.drop_constraint(
        "dealers_suspended_by_fkey", "dealers", type_="foreignkey"
    )
    op.drop_column("dealers", "suspension_silent")
    op.drop_column("dealers", "suspended_by")
    op.drop_index("idx_dealers_archived_at", table_name="dealers")
    op.drop_constraint("dealers_archived_by_fkey", "dealers", type_="foreignkey")
    op.drop_column("dealers", "archived_reason")
    op.drop_column("dealers", "archived_by")
    op.drop_column("dealers", "archived_at")
