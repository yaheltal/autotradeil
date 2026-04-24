"""dealers: add signup fields (business_id, phone, city, lot_size, contact_name) and rename license_num

Revision ID: 76c6b59a0658
Revises: 76dadf769a7d
Create Date: 2026-04-24 16:07:41.401532

The dealer signup API (Phase 2.2) expects 5 fields the original schema
didn't carry, plus a column name the API uses in place of `license_num`.

    business_id     TEXT NOT NULL UNIQUE  — Israeli ח.פ / ע.מ (9 digits)
    phone           TEXT NOT NULL         — mobile; format validated in API layer
    city            TEXT NOT NULL
    lot_size        INTEGER NOT NULL      — number of vehicles on lot (1..1000)
    contact_name    TEXT NOT NULL
    license_num     →  rename to  license_number

CHECK constraints:
    ck_dealers_business_id_format  — must be exactly 9 digits
    ck_dealers_lot_size_range      — 1 <= lot_size <= 1000

At the time this runs, `dealers` is empty (admins live in `users` only),
so ADD COLUMN NOT NULL without a server default is safe.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "76c6b59a0658"
down_revision: Union[str, None] = "76dadf769a7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Rename license_num → license_number
    op.alter_column("dealers", "license_num", new_column_name="license_number")

    # 2. Add new columns (table is empty → NOT NULL without default is fine)
    op.add_column("dealers", sa.Column("business_id", sa.Text(), nullable=False))
    op.add_column("dealers", sa.Column("phone", sa.Text(), nullable=False))
    op.add_column("dealers", sa.Column("city", sa.Text(), nullable=False))
    op.add_column("dealers", sa.Column("lot_size", sa.Integer(), nullable=False))
    op.add_column("dealers", sa.Column("contact_name", sa.Text(), nullable=False))

    # 3. UNIQUE + format constraints
    op.create_unique_constraint(
        "uq_dealers_business_id", "dealers", ["business_id"]
    )
    op.create_check_constraint(
        "ck_dealers_business_id_format",
        "dealers",
        "business_id ~ '^[0-9]{9}$'",
    )
    op.create_check_constraint(
        "ck_dealers_lot_size_range",
        "dealers",
        "lot_size >= 1 AND lot_size <= 1000",
    )

    # 4. Useful indexes
    op.create_index("idx_dealers_city", "dealers", ["city"])


def downgrade() -> None:
    op.drop_index("idx_dealers_city", table_name="dealers")
    op.drop_constraint("ck_dealers_lot_size_range", "dealers", type_="check")
    op.drop_constraint("ck_dealers_business_id_format", "dealers", type_="check")
    op.drop_constraint("uq_dealers_business_id", "dealers", type_="unique")

    op.drop_column("dealers", "contact_name")
    op.drop_column("dealers", "lot_size")
    op.drop_column("dealers", "city")
    op.drop_column("dealers", "phone")
    op.drop_column("dealers", "business_id")

    op.alter_column("dealers", "license_number", new_column_name="license_num")
