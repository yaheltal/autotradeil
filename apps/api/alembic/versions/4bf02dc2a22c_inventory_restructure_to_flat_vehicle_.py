"""inventory: restructure to flat vehicle columns

Revision ID: 4bf02dc2a22c
Revises: 76c6b59a0658
Create Date: 2026-04-24 18:51:40.248053

Restructures the `inventory` table from the Phase 1 shape
(`vehicle_details` JSONB + `price_dealer` + `price_retail` + status
`draft|active|reserved|sold|archived`) to a flat per-vehicle shape with
a single asking `price` and status `active|sold|hidden`.

The table is empty at migration time (0 rows). `ALTER TABLE ... ADD COLUMN
... NOT NULL` without a default is therefore safe.

Dependency chain handled in order:
  1. The `public_listings` VIEW selects `inventory.vehicle_details` and
     `inventory.status`. We DROP the view first, migrate inventory, then
     recreate the view against the new flat columns.
  2. Phase 1 CHECK constraints were inlined in schema.sql without names,
     so Postgres auto-named them `inventory_check`,
     `inventory_price_dealer_check`, `inventory_price_retail_check`,
     `inventory_status_check`. We drop those specific names.

RLS policies reference only `dealer_id` + helper functions, so they
survive unchanged.

The Phase 1 column-level GRANT that hid `price_dealer` no longer
applies (there is no secret price), so we relax to whole-table grants
for the `authenticated` role.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4bf02dc2a22c"
down_revision: Union[str, None] = "76c6b59a0658"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# -------------------------------------------------------------------------
# public_listings view — recreated at the end of upgrade() against the
# new flat schema. Exposes consumer-safe columns; `notes` is intentionally
# omitted (internal dealer notes must not leak).
# -------------------------------------------------------------------------
_PUBLIC_LISTINGS_NEW = """
CREATE OR REPLACE VIEW public_listings
WITH (security_invoker = TRUE) AS
SELECT
  l.id             AS listing_id,
  l.inventory_id,
  l.published_at,
  l.public_price,
  i.make,
  i.model,
  i.year,
  i.mileage,
  i.price,
  i.color,
  i.transmission,
  i.fuel_type,
  i.engine_volume,
  i.status,
  d.id             AS dealer_id,
  d.business_name  AS dealer_name,
  d.trust_score,
  d.tier
FROM listings l
JOIN inventory i ON i.id = l.inventory_id
JOIN dealers   d ON d.id = i.dealer_id
WHERE l.is_active = TRUE
  AND i.status = 'active';
"""

_PUBLIC_LISTINGS_OLD = """
CREATE OR REPLACE VIEW public_listings
WITH (security_invoker = TRUE) AS
SELECT
  l.id             AS listing_id,
  l.inventory_id,
  l.published_at,
  l.public_price,
  i.vehicle_details,
  i.status,
  d.id             AS dealer_id,
  d.business_name  AS dealer_name,
  d.trust_score,
  d.tier
FROM listings l
JOIN inventory i ON i.id = l.inventory_id
JOIN dealers   d ON d.id = i.dealer_id
WHERE l.is_active = TRUE
  AND i.status = 'active';
"""


def upgrade() -> None:
    # 1. Drop dependent view + old indexes + old CHECK constraints.
    op.execute("DROP VIEW IF EXISTS public_listings")
    op.execute("DROP INDEX IF EXISTS idx_inventory_details")
    op.execute("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_check")
    op.execute("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_price_dealer_check")
    op.execute("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_price_retail_check")
    op.execute("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_status_check")

    # 2. Drop the old columns.
    op.drop_column("inventory", "vehicle_details")
    op.drop_column("inventory", "price_retail")
    op.drop_column("inventory", "price_dealer")

    # 3. Add the new flat columns.
    op.add_column("inventory", sa.Column("make", sa.String(100), nullable=False))
    op.add_column("inventory", sa.Column("model", sa.String(100), nullable=False))
    op.add_column("inventory", sa.Column("year", sa.Integer, nullable=False))
    op.add_column("inventory", sa.Column("mileage", sa.Integer, nullable=False))
    op.add_column("inventory", sa.Column("price", sa.Integer, nullable=False))
    op.add_column("inventory", sa.Column("color", sa.String(50), nullable=True))
    op.add_column("inventory", sa.Column("transmission", sa.String(20), nullable=True))
    op.add_column("inventory", sa.Column("fuel_type", sa.String(20), nullable=True))
    op.add_column(
        "inventory", sa.Column("engine_volume", sa.Numeric(3, 1), nullable=True)
    )
    op.add_column("inventory", sa.Column("notes", sa.Text(), nullable=True))

    # 4. status: TEXT → VARCHAR(20), default → 'active'.
    op.execute("ALTER TABLE inventory ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE inventory ALTER COLUMN status TYPE VARCHAR(20) "
        "USING status::varchar(20)"
    )
    op.execute("ALTER TABLE inventory ALTER COLUMN status SET DEFAULT 'active'")

    # 5. New CHECK constraints (named explicitly).
    op.create_check_constraint(
        "inventory_year_range", "inventory", "year >= 1900 AND year <= 2030"
    )
    op.create_check_constraint(
        "inventory_mileage_nonneg", "inventory", "mileage >= 0"
    )
    op.create_check_constraint(
        "inventory_price_nonneg", "inventory", "price >= 0"
    )
    op.create_check_constraint(
        "inventory_transmission_enum",
        "inventory",
        "transmission IS NULL OR transmission IN ('automatic', 'manual')",
    )
    op.create_check_constraint(
        "inventory_fuel_type_enum",
        "inventory",
        "fuel_type IS NULL OR fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid')",
    )
    op.create_check_constraint(
        "inventory_engine_volume_range",
        "inventory",
        "engine_volume IS NULL OR (engine_volume >= 0.5 AND engine_volume <= 9.9)",
    )
    op.create_check_constraint(
        "inventory_status_check",
        "inventory",
        "status IN ('active', 'sold', 'hidden')",
    )

    # 6. Grants — relax column-scoped SELECT to whole-table.
    op.execute("REVOKE ALL ON inventory FROM authenticated")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON inventory TO authenticated")

    # 7. Recreate public_listings with the new schema.
    op.execute(_PUBLIC_LISTINGS_NEW)
    op.execute("GRANT SELECT ON public_listings TO anon, authenticated")


def downgrade() -> None:
    # Reverse: drop new view, new constraints, new columns; restore old
    # columns, old constraints, old view.
    op.execute("DROP VIEW IF EXISTS public_listings")

    op.execute("REVOKE ALL ON inventory FROM authenticated")
    op.execute(
        "GRANT SELECT (id, dealer_id, price_retail, status, created_at, updated_at) "
        "ON inventory TO authenticated"
    )
    op.execute("GRANT INSERT, UPDATE, DELETE ON inventory TO authenticated")

    op.drop_constraint("inventory_status_check", "inventory", type_="check")
    op.drop_constraint("inventory_engine_volume_range", "inventory", type_="check")
    op.drop_constraint("inventory_fuel_type_enum", "inventory", type_="check")
    op.drop_constraint("inventory_transmission_enum", "inventory", type_="check")
    op.drop_constraint("inventory_price_nonneg", "inventory", type_="check")
    op.drop_constraint("inventory_mileage_nonneg", "inventory", type_="check")
    op.drop_constraint("inventory_year_range", "inventory", type_="check")

    op.execute("ALTER TABLE inventory ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE inventory ALTER COLUMN status TYPE TEXT")
    op.execute("ALTER TABLE inventory ALTER COLUMN status SET DEFAULT 'draft'")

    op.drop_column("inventory", "notes")
    op.drop_column("inventory", "engine_volume")
    op.drop_column("inventory", "fuel_type")
    op.drop_column("inventory", "transmission")
    op.drop_column("inventory", "color")
    op.drop_column("inventory", "price")
    op.drop_column("inventory", "mileage")
    op.drop_column("inventory", "year")
    op.drop_column("inventory", "model")
    op.drop_column("inventory", "make")

    from sqlalchemy.dialects.postgresql import JSONB

    op.add_column(
        "inventory", sa.Column("price_dealer", sa.Numeric(12, 2), nullable=False)
    )
    op.add_column(
        "inventory", sa.Column("price_retail", sa.Numeric(12, 2), nullable=False)
    )
    op.add_column(
        "inventory", sa.Column("vehicle_details", JSONB(), nullable=False)
    )

    op.create_check_constraint(
        "inventory_status_check",
        "inventory",
        "status IN ('draft', 'active', 'reserved', 'sold', 'archived')",
    )
    op.create_check_constraint(
        "inventory_price_retail_check", "inventory", "price_retail >= 0"
    )
    op.create_check_constraint(
        "inventory_price_dealer_check", "inventory", "price_dealer >= 0"
    )
    op.create_check_constraint(
        "inventory_check", "inventory", "price_retail >= price_dealer"
    )
    op.execute(
        "CREATE INDEX idx_inventory_details ON inventory USING GIN (vehicle_details)"
    )
    op.execute(_PUBLIC_LISTINGS_OLD)
