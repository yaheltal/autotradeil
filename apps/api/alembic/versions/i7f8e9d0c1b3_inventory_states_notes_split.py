"""inventory: hide/sold/pending_deletion states + notes split

Wave 2 vehicle-model overhaul. Splits notes into public_notes /
private_notes, retires the paused_until / pause_reason mechanism (was
auto-pausing during negotiation — product decision to remove), adds
pending_deletion as a new status with dealer-initiated + admin-approved
hard-delete flow.

Schema changes on `inventory`:

1. NEW columns (all nullable so existing rows insert cleanly):
   - public_notes TEXT             — marketplace-visible notes
   - private_notes TEXT            — owner-only notes, never returned
                                     to non-owners
   - pending_deletion_reason TEXT  — dealer's stated reason
   - pending_deletion_requested_at TIMESTAMPTZ
   - previous_status VARCHAR(20)   — what to revert to on
                                     cancel-deletion (active or hidden)

2. DATA backfill:
   - UPDATE inventory SET public_notes = notes WHERE notes IS NOT NULL
   - UPDATE inventory SET status='active', paused_until=NULL,
       pause_reason=NULL WHERE paused_until IS NOT NULL
     (the "paused" pseudo-state is gone; offers continue regardless of
     negotiation activity).

3. STATUS CHECK constraint replaced:
   active / sold / hidden / in_transaction / pending_deletion
   (in_transaction kept — load-bearing for the admin deal-escort flow
   in /admin/transactions/{id}/complete.)

4. REMOVED columns (paused feature retired):
   - paused_until
   - pause_reason

The OLD `notes` column is intentionally KEPT in this migration —
expand/contract pattern — so a code rollback within the deploy window
doesn't lose data written by the previous release. A follow-up
migration (separate PR after Wave 2 is stable in prod) drops it.

Revision ID: i7f8e9d0c1b3
Revises: h9d6e8f0c4b2
Create Date: 2026-05-29 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "i7f8e9d0c1b3"
down_revision: Union[str, None] = "h9d6e8f0c4b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ----------------------------------------------------------------
    # 1. NEW columns
    # ----------------------------------------------------------------
    op.add_column("inventory", sa.Column("public_notes", sa.Text(), nullable=True))
    op.add_column("inventory", sa.Column("private_notes", sa.Text(), nullable=True))
    op.add_column(
        "inventory",
        sa.Column("pending_deletion_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "inventory",
        sa.Column(
            "pending_deletion_requested_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "inventory",
        sa.Column("previous_status", sa.String(20), nullable=True),
    )

    # ----------------------------------------------------------------
    # 2. DATA backfill — must run BEFORE the status check constraint
    #    is replaced (the UPDATE would pass the old constraint anyway,
    #    but the ordering keeps intent obvious).
    # ----------------------------------------------------------------
    op.execute(
        "UPDATE inventory SET public_notes = notes "
        "WHERE notes IS NOT NULL AND public_notes IS NULL"
    )
    # Flip every currently-paused row back to active. The paused
    # pseudo-state used status='hidden' + paused_until IS NOT NULL;
    # we now want those rows live and accepting offers again.
    op.execute(
        "UPDATE inventory "
        "SET status='active', paused_until=NULL, pause_reason=NULL "
        "WHERE paused_until IS NOT NULL"
    )

    # ----------------------------------------------------------------
    # 3. STATUS check constraint — replace
    # ----------------------------------------------------------------
    op.drop_constraint("inventory_status_check", "inventory", type_="check")
    op.create_check_constraint(
        "inventory_status_check",
        "inventory",
        "status IN ('active', 'sold', 'hidden', 'in_transaction', 'pending_deletion')",
    )

    # ----------------------------------------------------------------
    # 4. DROP retired paused columns
    # ----------------------------------------------------------------
    op.drop_column("inventory", "pause_reason")
    op.drop_column("inventory", "paused_until")


def downgrade() -> None:
    # Re-add paused columns first so the previous code release can
    # boot against them after a rollback.
    op.add_column(
        "inventory",
        sa.Column("paused_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "inventory",
        sa.Column("pause_reason", sa.String(100), nullable=True),
    )

    # Defensive copy-back: any new public_notes content that was
    # written via the new UI for a row whose legacy `notes` column was
    # NULL (a fresh insert post-Wave-2) is restored to `notes` so the
    # rolled-back release still sees the dealer's text. Rows where
    # `notes` was already populated keep the original (pre-Wave-2)
    # text untouched.
    op.execute(
        "UPDATE inventory SET notes = public_notes "
        "WHERE notes IS NULL AND public_notes IS NOT NULL"
    )

    # Restore the tighter status check. Any rows currently in
    # 'pending_deletion' get flipped back to 'active' so the tighter
    # constraint can re-apply without violation — same pattern as the
    # f7b2c4d6e8a1 migration used for 'in_transaction'.
    op.execute(
        "UPDATE inventory SET status='active' "
        "WHERE status = 'pending_deletion'"
    )
    op.drop_constraint("inventory_status_check", "inventory", type_="check")
    op.create_check_constraint(
        "inventory_status_check",
        "inventory",
        "status IN ('active', 'sold', 'hidden', 'in_transaction')",
    )

    op.drop_column("inventory", "previous_status")
    op.drop_column("inventory", "pending_deletion_requested_at")
    op.drop_column("inventory", "pending_deletion_reason")
    op.drop_column("inventory", "private_notes")
    op.drop_column("inventory", "public_notes")
