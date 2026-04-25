"""phase 6.8.4 — inventory buyer + trade-in fields

Revision ID: c7a9f2b81e04
Revises: 1df536ba058b
Create Date: 2026-04-26 01:30:00.000000

P6.8.4 — SellVehicleDialog v2 captures buyer details (name / id_number /
phone) at sale-close time, plus an optional trade-in vehicle. Stored
inline on the inventory row to keep the read-side simple; if the
trade-in pattern grows beyond the basics here we'll promote it to a
proper trade_ins table.

Columns added on `inventory`:
  buyer_name         VARCHAR(120) — the natural-person buyer's name
  buyer_id_number    VARCHAR(20)  — Israeli תעודת זהות, ^[0-9]{9}$
  buyer_phone        VARCHAR(30)  — E.164 normalized
  was_trade_in       BOOLEAN      — quick flag for analytics filtering
  trade_in_make      VARCHAR(100)
  trade_in_model     VARCHAR(100)
  trade_in_year      INTEGER      — CHECK 1900-2030
  trade_in_value     INTEGER      — agreed credit toward the sale (₪)
  trade_in_plate     VARCHAR(20)
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "c7a9f2b81e04"
down_revision: Union[str, None] = "1df536ba058b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inventory", sa.Column("buyer_name", sa.String(120), nullable=True))
    op.add_column("inventory", sa.Column("buyer_id_number", sa.String(20), nullable=True))
    op.add_column("inventory", sa.Column("buyer_phone", sa.String(30), nullable=True))
    op.create_check_constraint(
        "inventory_buyer_id_format",
        "inventory",
        "buyer_id_number IS NULL OR buyer_id_number ~ '^[0-9]{9}$'",
    )

    op.add_column(
        "inventory",
        sa.Column(
            "was_trade_in",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("inventory", sa.Column("trade_in_make", sa.String(100), nullable=True))
    op.add_column("inventory", sa.Column("trade_in_model", sa.String(100), nullable=True))
    op.add_column("inventory", sa.Column("trade_in_year", sa.Integer(), nullable=True))
    op.add_column("inventory", sa.Column("trade_in_value", sa.Integer(), nullable=True))
    op.add_column("inventory", sa.Column("trade_in_plate", sa.String(20), nullable=True))
    op.create_check_constraint(
        "inventory_trade_in_year_range",
        "inventory",
        "trade_in_year IS NULL OR (trade_in_year >= 1900 AND trade_in_year <= 2030)",
    )


def downgrade() -> None:
    op.drop_constraint("inventory_trade_in_year_range", "inventory")
    op.drop_column("inventory", "trade_in_plate")
    op.drop_column("inventory", "trade_in_value")
    op.drop_column("inventory", "trade_in_year")
    op.drop_column("inventory", "trade_in_model")
    op.drop_column("inventory", "trade_in_make")
    op.drop_column("inventory", "was_trade_in")
    op.drop_constraint("inventory_buyer_id_format", "inventory")
    op.drop_column("inventory", "buyer_phone")
    op.drop_column("inventory", "buyer_id_number")
    op.drop_column("inventory", "buyer_name")
