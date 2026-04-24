# @autotradeil/database

Database schema and migrations for AutoTradeIL (Supabase / PostgreSQL 16).

## Schema

6 tables:

| Table | Purpose | Access |
|-------|---------|--------|
| `users` | Auth + user type (consumer / dealer / admin) | Self-read, self-update |
| `dealers` | Business profile, trust_score, tier | Public profile read; self-write |
| `inventory` | Vehicle + `price_dealer` (B2B) + `price_retail` (B2C) | **Dealer-only** — consumers cannot read |
| `listings` | Public-facing listings with `public_price` | Public read when active; owner write |
| `offers` | B2B dealer-to-dealer negotiation | Only involved dealers |
| `deals` | Completed transactions (B2B or B2C) | Seller / buyer / admin |

## B2B / B2C Separation

`price_dealer` is **never** exposed to `user_type = 'consumer'`. Three layers of enforcement:

1. **RLS policy** on `inventory` — `SELECT` allowed only if `is_dealer() OR is_admin()`.
2. **Column grants** — `anon` role has zero access; `authenticated` has column-scoped grants.
3. **`public_listings` VIEW** — consumer-safe view. No `price_dealer` column exists.

Consumers querying `inventory` directly receive **zero rows**. They must use `public_listings`.

## Apply the schema

```bash
# Local dev (after psql createdb autotradeil)
psql autotradeil < schema.sql

# Supabase (via SQL Editor UI, or supabase CLI)
supabase db push
```

## Note on Supabase auth

`auth.uid()` is provided by Supabase automatically when a request carries a
valid JWT. The helper functions (`auth_user_type()`, `is_dealer()`,
`current_dealer_id()`, `is_admin()`) assume this and are `SECURITY DEFINER`
so they can read the `users` / `dealers` tables even when RLS would otherwise
block the reader.
