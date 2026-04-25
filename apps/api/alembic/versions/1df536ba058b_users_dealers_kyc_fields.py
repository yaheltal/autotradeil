"""phase 6.6 — users + dealers KYC personal fields

Revision ID: 1df536ba058b
Revises: afb1ad832c21
Create Date: 2026-04-25 18:24:05.020651

Phase 6.6 — smart KYC signup. Holds personal details extracted from the
ID and license images.

1. `users` (new optional columns):
   - `first_name`  VARCHAR(100)
   - `last_name`   VARCHAR(100)
   - `id_number`   VARCHAR(20)   CHECK ~ '^[0-9]{9}$'
   - `birth_date`  DATE

2. `dealers`:
   - `license_until` DATE — expiration date of the dealer license
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "1df536ba058b"
down_revision: Union[str, None] = "afb1ad832c21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("id_number", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("birth_date", sa.Date(), nullable=True))
    op.create_check_constraint(
        "users_id_number_format",
        "users",
        "id_number IS NULL OR id_number ~ '^[0-9]{9}$'",
    )
    op.add_column("dealers", sa.Column("license_until", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("dealers", "license_until")
    op.drop_constraint("users_id_number_format", "users", type_="check")
    op.drop_column("users", "birth_date")
    op.drop_column("users", "id_number")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
