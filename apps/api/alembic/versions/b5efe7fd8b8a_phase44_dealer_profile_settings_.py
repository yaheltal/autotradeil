"""phase 4.4 — dealer profile fields, suspension, notification prefs, system_settings

Revision ID: b5efe7fd8b8a
Revises: 52f7e36abcc3
Create Date: 2026-04-25 02:37:48.968614

Phase 4.4:
  1. dealers — add description / logo_url / suspended_at / suspended_reason
     + 3 notification preference booleans (offers/deals/updates).
  2. system_settings — singleton (id=1) row holding admin-editable knobs:
     site_name, support_email, welcome_message.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5efe7fd8b8a"
down_revision: Union[str, None] = "52f7e36abcc3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------
    # 1. dealers — profile + suspension + notification prefs
    # --------------------------------------------------------------
    op.add_column("dealers", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("dealers", sa.Column("logo_url", sa.Text(), nullable=True))
    op.add_column(
        "dealers",
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("dealers", sa.Column("suspended_reason", sa.Text(), nullable=True))
    op.add_column(
        "dealers",
        sa.Column(
            "notification_offers",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "notification_deals",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "notification_updates",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )

    # --------------------------------------------------------------
    # 2. system_settings — singleton table (id=1 enforced by CHECK)
    # --------------------------------------------------------------
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "site_name", sa.String(100), nullable=False, server_default="AutoTradeIL"
        ),
        sa.Column(
            "support_email",
            sa.String(255),
            nullable=False,
            server_default="support@autotradeil.co.il",
        ),
        sa.Column(
            "welcome_message",
            sa.Text(),
            nullable=False,
            server_default="ברוכים הבאים ל-AutoTradeIL — המערכת המקצועית לסחר רכבים.",
        ),
        sa.Column("subscription_tiers", JSONB, nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("id = 1", name="system_settings_singleton"),
    )
    # Seed the singleton.
    op.execute(
        "INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table("system_settings")

    op.drop_column("dealers", "notification_updates")
    op.drop_column("dealers", "notification_deals")
    op.drop_column("dealers", "notification_offers")
    op.drop_column("dealers", "suspended_reason")
    op.drop_column("dealers", "suspended_at")
    op.drop_column("dealers", "logo_url")
    op.drop_column("dealers", "description")
