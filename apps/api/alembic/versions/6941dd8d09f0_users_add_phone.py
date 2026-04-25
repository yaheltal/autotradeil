"""users — add phone column for OTP login

Revision ID: 6941dd8d09f0
Revises: 636dd5c42ee9
Create Date: 2026-04-25 15:18:51.189961

Lets admins (and any non-dealer user) participate in the OTP login flow.
Until now, OTP was scoped to `dealers.phone` — admins had no phone column
and so couldn't receive an SMS code. Now any user with a phone can.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "6941dd8d09f0"
down_revision: Union[str, None] = "636dd5c42ee9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(30), nullable=True))
    # Unique only when set — so multiple NULL admins remain allowed.
    op.create_index(
        "uq_users_phone",
        "users",
        ["phone"],
        unique=True,
        postgresql_where=sa.text("phone IS NOT NULL"),
    )
    # Move OTP login state from `dealers` (dealer-only) to `users` so admins
    # can also use OTP login. The /security/otp/* endpoints (in-app
    # privileged action confirmation) keep using `dealers.otp_*` since they
    # always have an authenticated dealer session.
    op.add_column("users", sa.Column("otp_code_hash", sa.Text, nullable=True))
    op.add_column(
        "users",
        sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("users", sa.Column("otp_method", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "otp_method")
    op.drop_column("users", "otp_expires_at")
    op.drop_column("users", "otp_code_hash")
    op.drop_index("uq_users_phone", table_name="users")
    op.drop_column("users", "phone")
