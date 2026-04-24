-- ==========================================================================
-- AutoTradeIL — Database Schema (Supabase / PostgreSQL 16)
-- ==========================================================================
-- B2B/B2C separation: price_dealer is NEVER exposed to user_type = 'consumer'.
-- Enforcement layers:
--   1. RLS policies on `inventory` restrict SELECT to dealers only.
--   2. Consumers read from `public_listings` VIEW which EXCLUDES price_dealer.
--   3. SECURITY INVOKER on the view ensures RLS is still applied via base tables.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------------
-- updated_at trigger helper
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================================
-- 1. users
-- ==========================================================================
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  user_type    TEXT NOT NULL CHECK (user_type IN ('consumer', 'dealer', 'admin')),
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email      ON users (email);
CREATE INDEX idx_users_user_type  ON users (user_type);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- 2. dealers
-- ==========================================================================
CREATE TABLE dealers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name  TEXT NOT NULL,
  license_num    TEXT NOT NULL UNIQUE,
  trust_score    NUMERIC(5,2) NOT NULL DEFAULT 0.00
                 CHECK (trust_score >= 0 AND trust_score <= 100),
  tier           TEXT NOT NULL DEFAULT 'bronze'
                 CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealers_user_id     ON dealers (user_id);
CREATE INDEX idx_dealers_tier        ON dealers (tier);
CREATE INDEX idx_dealers_trust_score ON dealers (trust_score DESC);

CREATE TRIGGER trg_dealers_updated_at
  BEFORE UPDATE ON dealers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- 3. inventory (contains B2B price_dealer — dealer-only access)
-- ==========================================================================
CREATE TABLE inventory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id        UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_details  JSONB NOT NULL,
  price_dealer     NUMERIC(12,2) NOT NULL CHECK (price_dealer >= 0),
  price_retail     NUMERIC(12,2) NOT NULL CHECK (price_retail >= 0),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'reserved', 'sold', 'archived')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (price_retail >= price_dealer)
);

CREATE INDEX idx_inventory_dealer_id ON inventory (dealer_id);
CREATE INDEX idx_inventory_status    ON inventory (status);
CREATE INDEX idx_inventory_details   ON inventory USING GIN (vehicle_details);

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- 4. listings (public-facing — contains public_price only, no price_dealer)
-- ==========================================================================
CREATE TABLE listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id   UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  public_price   NUMERIC(12,2) NOT NULL CHECK (public_price >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (inventory_id)
);

CREATE INDEX idx_listings_inventory_id ON listings (inventory_id);
CREATE INDEX idx_listings_published_at ON listings (published_at DESC);
CREATE INDEX idx_listings_active       ON listings (is_active) WHERE is_active = TRUE;

-- ==========================================================================
-- 5. offers (B2B dealer-to-dealer negotiation)
-- ==========================================================================
CREATE TABLE offers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id   UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  from_dealer    UUID NOT NULL REFERENCES dealers(id),
  to_dealer      UUID NOT NULL REFERENCES dealers(id),
  amount         NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected',
                                   'countered', 'expired', 'withdrawn')),
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_dealer <> to_dealer)
);

CREATE INDEX idx_offers_inventory_id ON offers (inventory_id);
CREATE INDEX idx_offers_from_dealer  ON offers (from_dealer);
CREATE INDEX idx_offers_to_dealer    ON offers (to_dealer);
CREATE INDEX idx_offers_status       ON offers (status);

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- 6. deals (completed transactions — B2B or B2C)
-- ==========================================================================
CREATE TABLE deals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id   UUID NOT NULL REFERENCES inventory(id),
  seller         UUID NOT NULL REFERENCES users(id),
  buyer          UUID NOT NULL REFERENCES users(id),
  deal_type      TEXT NOT NULL CHECK (deal_type IN ('b2b', 'b2c')),
  final_price    NUMERIC(12,2) NOT NULL CHECK (final_price >= 0),
  closed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (seller <> buyer)
);

CREATE INDEX idx_deals_inventory_id ON deals (inventory_id);
CREATE INDEX idx_deals_seller       ON deals (seller);
CREATE INDEX idx_deals_buyer        ON deals (buyer);
CREATE INDEX idx_deals_deal_type    ON deals (deal_type);
CREATE INDEX idx_deals_closed_at    ON deals (closed_at DESC);

-- ==========================================================================
-- Helper functions (SECURITY DEFINER — run as table owner, bypass RLS)
-- ==========================================================================

-- Returns the current authenticated user's type (consumer | dealer | admin)
CREATE OR REPLACE FUNCTION auth_user_type()
RETURNS TEXT AS $$
  SELECT user_type FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- TRUE if the current user is a registered dealer
CREATE OR REPLACE FUNCTION is_dealer()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM dealers WHERE user_id = auth.uid())
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- Returns the dealer_id for the current user, or NULL if not a dealer
CREATE OR REPLACE FUNCTION current_dealer_id()
RETURNS UUID AS $$
  SELECT id FROM dealers WHERE user_id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- TRUE if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
  )
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- ==========================================================================
-- Row Level Security (enable on all tables)
-- ==========================================================================
ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals     ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- users policies
-- --------------------------------------------------------------------------
CREATE POLICY users_self_read   ON users FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY users_self_update ON users FOR UPDATE USING (id = auth.uid())
                                         WITH CHECK (id = auth.uid());

-- --------------------------------------------------------------------------
-- dealers policies — public profile read; self-write only
-- --------------------------------------------------------------------------
CREATE POLICY dealers_public_read ON dealers FOR SELECT USING (TRUE);
CREATE POLICY dealers_self_insert ON dealers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY dealers_self_update ON dealers FOR UPDATE USING (user_id = auth.uid())
                                             WITH CHECK (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- inventory policies — DEALER-ONLY READ (price_dealer must never leak)
-- --------------------------------------------------------------------------
-- Consumers accessing `inventory` directly get ZERO rows. They must use the
-- `public_listings` view below, which strips price_dealer.
CREATE POLICY inventory_dealer_read ON inventory FOR SELECT
  USING (is_dealer() OR is_admin());

CREATE POLICY inventory_owner_insert ON inventory FOR INSERT
  WITH CHECK (dealer_id = current_dealer_id());

CREATE POLICY inventory_owner_update ON inventory FOR UPDATE
  USING (dealer_id = current_dealer_id())
  WITH CHECK (dealer_id = current_dealer_id());

CREATE POLICY inventory_owner_delete ON inventory FOR DELETE
  USING (dealer_id = current_dealer_id());

-- --------------------------------------------------------------------------
-- listings policies — public read when active; dealer-owner write
-- --------------------------------------------------------------------------
CREATE POLICY listings_public_read ON listings FOR SELECT
  USING (is_active = TRUE OR is_admin());

CREATE POLICY listings_owner_insert ON listings FOR INSERT
  WITH CHECK (
    inventory_id IN (SELECT id FROM inventory WHERE dealer_id = current_dealer_id())
  );

CREATE POLICY listings_owner_update ON listings FOR UPDATE
  USING (
    inventory_id IN (SELECT id FROM inventory WHERE dealer_id = current_dealer_id())
  )
  WITH CHECK (
    inventory_id IN (SELECT id FROM inventory WHERE dealer_id = current_dealer_id())
  );

-- --------------------------------------------------------------------------
-- offers policies — only the two dealers involved can see/act
-- --------------------------------------------------------------------------
CREATE POLICY offers_involved_read ON offers FOR SELECT
  USING (
    from_dealer = current_dealer_id()
    OR to_dealer = current_dealer_id()
    OR is_admin()
  );

CREATE POLICY offers_from_insert ON offers FOR INSERT
  WITH CHECK (from_dealer = current_dealer_id());

CREATE POLICY offers_involved_update ON offers FOR UPDATE
  USING (from_dealer = current_dealer_id() OR to_dealer = current_dealer_id())
  WITH CHECK (from_dealer = current_dealer_id() OR to_dealer = current_dealer_id());

-- --------------------------------------------------------------------------
-- deals policies — only seller / buyer / admin can read
-- --------------------------------------------------------------------------
CREATE POLICY deals_parties_read ON deals FOR SELECT
  USING (seller = auth.uid() OR buyer = auth.uid() OR is_admin());

-- ==========================================================================
-- public_listings VIEW — consumer-safe (NO price_dealer, NO internal fields)
-- ==========================================================================
-- Consumers query THIS view, not the inventory table. SECURITY INVOKER means
-- the caller's RLS still applies on the base tables (listings, dealers), so
-- this cannot be used to bypass policies.
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
FROM listings  l
JOIN inventory i ON i.id = l.inventory_id
JOIN dealers   d ON d.id = i.dealer_id
WHERE l.is_active = TRUE
  AND i.status    = 'active';

-- Grant SELECT on the view to the anon / authenticated Supabase roles.
GRANT SELECT ON public_listings TO anon, authenticated;

-- ==========================================================================
-- Revoke direct column access to price_dealer for non-dealer roles.
-- (Defence-in-depth on top of RLS — any consumer SELECT on inventory must
--  fail loudly if it ever slips through.)
-- ==========================================================================
REVOKE ALL ON inventory FROM anon;
GRANT SELECT (id, dealer_id, vehicle_details, price_retail, status,
              created_at, updated_at) ON inventory TO authenticated;
GRANT INSERT, UPDATE, DELETE ON inventory TO authenticated;
-- Note: RLS still gates which rows are visible. The column grant above is a
-- secondary guardrail against price_dealer leaking even if a future policy
-- is written loosely.
