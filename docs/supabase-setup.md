# Supabase Setup for AutoTradeIL

This document covers the manual steps required to stand up the Supabase
project that backs AutoTradeIL. These steps **cannot** be run from code —
they require dashboard access.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and sign in.
2. **New project**
   - **Name**: `autotradeil-dev`
   - **Region**: `eu-west-2` (London) — closest to Israel for low latency.
   - **Database password**: generate a strong one and store it in your password
     manager. You'll need it for `DATABASE_URL`.
3. Wait \~2 minutes for provisioning.

## 2. Apply the schema

1. In the project, open **SQL Editor → New query**.
2. Paste the contents of [`packages/database/schema.sql`](../packages/database/schema.sql).
3. Click **Run**. The whole script is idempotent-friendly except for
   `CREATE TABLE` — if any table already exists, drop it first in a Supabase
   project you're fine to reset.
4. Confirm tables exist: **Table Editor** should show `users`, `dealers`,
   `inventory`, `listings`, `offers`, `deals`, and the `public_listings` view.

## 3. Collect credentials

From **Project Settings → API**:

| UI label                             | Goes into                                                                         | Purpose                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Project URL                          | `SUPABASE_URL` (API) and `NEXT_PUBLIC_SUPABASE_URL` (web)                         | Base URL for all Supabase calls                           |
| Publishable key (`sb_publishable_…`) | `SUPABASE_PUBLISHABLE_KEY` (API) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (web) | Browser-safe key for client SDK                           |
| Secret key (`sb_secret_…`)           | `SUPABASE_SECRET_KEY` (API only)                                                  | Server-side bypass of RLS. **Never** ship to the browser. |

From **Project Settings → Database → Connection string → Transaction pooler**:

- Copy the **session** pooler URL (port `5432`) or **transaction** pooler URL
  (port `6543`). Either works for our async engine.
- Paste into `DATABASE_URL` in `apps/api/.env`.
- You may use `postgresql://` directly — our settings auto-upgrade it to
  `postgresql+asyncpg://` at load time.

## 4. Fill the env files

```bash
# apps/api/.env
ENVIRONMENT=development
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…
CORS_ORIGINS=["http://localhost:3000","http://localhost:3010"]

# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Both `.env` files are git-ignored — verified with `git check-ignore`.

## 5. Verify end-to-end

```bash
# API
cd apps/api
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 &

curl -s http://localhost:8000/health | python3 -m json.tool
# expected: "database_connected": true

# Web
cd ../web
pnpm dev  # Next.js defaults to :3000; if taken it will bump to 3001
```

Open the Next.js URL in a browser — the `ApiStatus` badge in the top nav
must read **"API מחובר"**. If it reads **"API מנותק"**:

- Open DevTools → Network. If the call to `/health` is blocked by CORS,
  add the Next.js origin (`http://localhost:<port>` **and**
  `http://127.0.0.1:<port>`) to `CORS_ORIGINS` in `apps/api/.env` and
  restart uvicorn.

## 6. B2B/B2C separation — sanity check

The critical invariant: `price_dealer` must never reach a consumer client.
Enforcement layers live in [`schema.sql`](../packages/database/schema.sql):

1. **RLS** on `inventory` — `SELECT` requires `is_dealer() OR is_admin()`.
2. **Column grants** — `anon` has no access to `inventory` at all.
3. **`public_listings` view** — the consumer-facing surface. Its column
   list has no `price_dealer`.

To sanity-check from the Supabase SQL Editor, run:

```sql
-- As a consumer JWT:
SELECT * FROM inventory LIMIT 1;          -- expected: 0 rows (RLS)
SELECT * FROM public_listings LIMIT 1;    -- expected: visible rows, no price_dealer column
```

## 7. Bootstrap admin users (Yahel + Tal)

Admins exist in two places:

1. `auth.users` — Supabase's identity store. Create manually once.
2. `public.users` — our app's user row. The `on_auth_user_created`
   trigger (see migration `10e02d1b0a76`) mirrors every new auth.users
   row into public.users with `user_type = 'dealer'`. We then elevate
   specific people to admin via SQL.

Steps (Supabase dashboard):

1. **Authentication → Users → Add user.** Create these two, each with a
   strong password:
   - `talyahel4@gmail.com`
   - `talniv93@gmail.com`
2. **SQL Editor → New query.** Paste and run the contents of
   [`apps/api/scripts/seed_admins.sql`](../apps/api/scripts/seed_admins.sql).
3. The trailing `SELECT` should return both rows with `user_type = 'admin'`
   and `verified = true`.

Admins can now:

- Call any endpoint protected by `require_admin` (e.g. `GET /api/v1/auth/admin-only`).
- Impersonate any dealer by adding `X-Impersonate-Dealer-Id: <uuid>` on
  dealer-scoped endpoints. Every impersonation writes an `audit_log` row
  (`action = 'impersonate.begin'`).

## 8. JWT secret for the backend

`apps/api/.env` needs `SUPABASE_JWT_SECRET`. Get it from
**Project Settings → API → JWT Settings → JWT Secret** (HS256). This is
different from the publishable/secret API keys — the backend uses it to
verify access tokens arriving in the `Authorization: Bearer …` header.

## 9. Common gotchas

- **Wrong URL scheme.** `postgres://` and `postgresql://` are accepted; our
  config adapter rewrites both to `postgresql+asyncpg://`. Do not manually
  type `asyncpg` in the URL that lives in the Supabase dashboard.
- **Region mismatch.** The pooler host embeds the region
  (`aws-1-eu-west-2...`). If you moved regions, update `DATABASE_URL`.
- **Publishable vs. secret key.** The web app must only ever see the
  publishable key. If a build ever references `SUPABASE_SECRET_KEY` or
  `process.env.SUPABASE_SECRET_KEY`, treat it as a leak and rotate keys
  from Project Settings → API.
