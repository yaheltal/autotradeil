"""dealers: add security — OTP, TOTP 2FA, KYC document fields

Revision ID: 6edf8999e660
Revises: 0c6fdac9aa13
Create Date: 2026-04-25 00:55:31.143510

Phase 3.5 — Advanced Security.

OTP:
    - `otp_code_hash` (bcrypt-style; we store a hash, never the plaintext code)
    - `otp_expires_at` (timezone-aware)
    - `otp_method` ('email' | 'sms'; default 'email')
    - `otp_send_count`, `otp_send_window_start` (rate-limit 3 / 10 min)

TOTP 2FA (RFC 6238, Google Authenticator compatible):
    - `totp_secret`   (base32 secret; set only after confirmation)
    - `totp_enabled`  (BOOLEAN; default false)

KYC document URLs (Cloudinary "authenticated" type — never the files themselves):
    - `id_card_front_url`, `id_card_back_url`, `dealer_license_url`
    - `kyc_status`  ('pending' | 'submitted' | 'approved' | 'rejected')
    - `kyc_rejected_reason`

The `dealers.phone` column already exists (from signup). We leave it unchanged.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6edf8999e660"
down_revision: Union[str, None] = "0c6fdac9aa13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------
    # OTP
    # --------------------------------------------------------------
    op.add_column(
        "dealers",
        sa.Column("otp_code_hash", sa.String(128), nullable=True),
    )
    op.add_column(
        "dealers",
        sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "otp_method",
            sa.String(10),
            nullable=False,
            server_default="email",
        ),
    )
    op.add_column(
        "dealers",
        sa.Column(
            "otp_send_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "dealers",
        sa.Column("otp_send_window_start", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "dealers_otp_method_check",
        "dealers",
        "otp_method IN ('email', 'sms')",
    )

    # --------------------------------------------------------------
    # TOTP 2FA
    # --------------------------------------------------------------
    op.add_column("dealers", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column(
        "dealers",
        sa.Column(
            "totp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # --------------------------------------------------------------
    # KYC
    # --------------------------------------------------------------
    op.add_column("dealers", sa.Column("id_card_front_url", sa.Text(), nullable=True))
    op.add_column("dealers", sa.Column("id_card_back_url", sa.Text(), nullable=True))
    op.add_column("dealers", sa.Column("dealer_license_url", sa.Text(), nullable=True))
    op.add_column(
        "dealers",
        sa.Column(
            "kyc_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "dealers", sa.Column("kyc_rejected_reason", sa.Text(), nullable=True)
    )
    op.create_check_constraint(
        "dealers_kyc_status_check",
        "dealers",
        "kyc_status IN ('pending', 'submitted', 'approved', 'rejected')",
    )
    op.create_index(
        "idx_dealers_kyc_status_submitted",
        "dealers",
        ["kyc_status"],
        postgresql_where=sa.text("kyc_status = 'submitted'"),
    )


def downgrade() -> None:
    op.drop_index("idx_dealers_kyc_status_submitted", table_name="dealers")
    op.drop_constraint("dealers_kyc_status_check", "dealers", type_="check")
    op.drop_column("dealers", "kyc_rejected_reason")
    op.drop_column("dealers", "kyc_status")
    op.drop_column("dealers", "dealer_license_url")
    op.drop_column("dealers", "id_card_back_url")
    op.drop_column("dealers", "id_card_front_url")

    op.drop_column("dealers", "totp_enabled")
    op.drop_column("dealers", "totp_secret")

    op.drop_constraint("dealers_otp_method_check", "dealers", type_="check")
    op.drop_column("dealers", "otp_send_window_start")
    op.drop_column("dealers", "otp_send_count")
    op.drop_column("dealers", "otp_method")
    op.drop_column("dealers", "otp_expires_at")
    op.drop_column("dealers", "otp_code_hash")
