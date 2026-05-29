"""merge wave2 + security branches

Two branches forked from h9d6e8f0c4b2 (placeholder_align_db_head) and
landed on main without one chaining to the other:

  h9d6e8f0c4b2 ─┬─> i0a1b2c3d4e5 (add_ai_usage_tracking)
                │   └─> j1b2c3d4e5f6 (add_performance_indexes)
                └─> i7f8e9d0c1b3 (inventory_states_notes_split, Wave 2)

Alembic refuses `upgrade head` when multiple heads exist — Render's
start script crashes with "Multiple head revisions are present" and
the API never boots.

This migration carries no DDL. It exists solely to declare both heads
as the same point in the linear chain so `head` resolves to a single
target again.

Revision ID: m0e8d7c6b5a4
Revises: j1b2c3d4e5f6, i7f8e9d0c1b3
Create Date: 2026-05-29 15:00:00.000000
"""

from typing import Sequence, Union


revision: str = "m0e8d7c6b5a4"
down_revision: Union[str, Sequence[str], None] = ("j1b2c3d4e5f6", "i7f8e9d0c1b3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
