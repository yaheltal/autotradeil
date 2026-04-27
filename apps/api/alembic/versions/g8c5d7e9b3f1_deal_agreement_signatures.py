"""deal_agreement_signatures

Adds digital "I agree to the terms" signature columns to BOTH offers
and deals. Captured per side (buyer + seller) at the moment of
clicking the confirm-deal button — proof of consent stored alongside
the IP that submitted the request.

Existing rows pre-A.3 get NULL — we don't backfill (no actionable
signature is available retroactively).

Revision ID: g8c5d7e9b3f1
Revises: f7b2c4d6e8a1
Create Date: 2026-04-27 09:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "g8c5d7e9b3f1"
down_revision: Union[str, None] = "f7b2c4d6e8a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for tbl in ("offers", "deals"):
        op.add_column(
            tbl,
            sa.Column("buyer_agreement_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.add_column(
            tbl, sa.Column("buyer_agreement_ip", sa.String(length=45), nullable=True)
        )
        op.add_column(
            tbl,
            sa.Column("seller_agreement_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.add_column(
            tbl, sa.Column("seller_agreement_ip", sa.String(length=45), nullable=True)
        )


def downgrade() -> None:
    for tbl in ("deals", "offers"):
        op.drop_column(tbl, "seller_agreement_ip")
        op.drop_column(tbl, "seller_agreement_at")
        op.drop_column(tbl, "buyer_agreement_ip")
        op.drop_column(tbl, "buyer_agreement_at")
