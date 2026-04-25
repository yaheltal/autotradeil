# Admin Dealer Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Wire the three admin moderation actions (delete-archive, suspend-with-reason, silent-suspend) plus reason templates plus the corresponding admin UI and dealer-side suspension banner.

**Architecture:** New columns on `dealers`, new `suspension_reason_templates` table seeded with defaults. Three new endpoints (`/archive`, `/unarchive`, `GET/POST suspension-reasons`) plus an updated `/suspend`. Three new dialog components and a dealer-side banner. Admin password re-auth on every destructive action via Supabase password grant.

**Tech Stack:** FastAPI/SQLAlchemy/Alembic + Next.js/React/Tailwind/Radix.

**a11y workflow note:** Frontend file edits gated by hook. Delegate to `accessibility-agents:accessibility-lead` per task.

**Spec:** `docs/superpowers/specs/2026-04-25-admin-dealer-actions.md`

---

## File Map

**Backend:**

- Create: `apps/api/alembic/versions/<rev>_dealer_archive_suspension.py`
- Modify: `apps/api/app/models/dealer.py` — archive + suspension columns
- Create: `apps/api/app/models/suspension_reason_template.py`
- Modify: `apps/api/app/schemas/admin.py` — new schemas
- Modify: `apps/api/app/routers/admin.py` — new endpoints + updated suspend
- Modify: `apps/api/app/core/auth.py` — `require_verified_dealer` honors archived/suspended
- Modify: `apps/api/app/core/email.py` — new suspension email template
- Modify: `apps/api/app/models/__init__.py` — export the new template model

**Frontend:**

- Create: `apps/web/src/components/admin/SuspendWithReasonDialog.tsx`
- Create: `apps/web/src/components/admin/SilentSuspendDialog.tsx`
- Create: `apps/web/src/components/admin/ArchiveDealerDialog.tsx`
- Create: `apps/web/src/components/SuspensionBanner.tsx` (dealer-side)
- Modify: `apps/web/src/app/admin/dealers/[id]/page.tsx` — admin actions panel + un/archive button
- Create: `apps/web/src/app/admin/dealers/archived/page.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx` (or page.tsx) — mount the suspension banner

---

## Task 1: DB migration + models

- [ ] Step 1: `alembic revision -m "dealer archive + suspension columns + reason templates"`
- [ ] Step 2: Set `down_revision = "6941dd8d09f0"` (current head).
- [ ] Step 3: Upgrade body:

```python
def upgrade() -> None:
    # dealers — archive + suspend metadata
    op.add_column("dealers", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "dealers",
        sa.Column("archived_by", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("dealers", sa.Column("archived_reason", sa.String(100), nullable=True))
    op.create_foreign_key(
        "dealers_archived_by_fkey", "dealers", "users", ["archived_by"], ["id"], ondelete="SET NULL"
    )
    op.create_index("idx_dealers_archived_at", "dealers", ["archived_at"])

    # suspension fields — `suspended_at`/`suspended_by` may already exist from
    # phase 4.4. Use IF NOT EXISTS via raw SQL to be idempotent.
    op.execute("ALTER TABLE dealers ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ")
    op.execute(
        "ALTER TABLE dealers ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id) ON DELETE SET NULL"
    )
    op.add_column("dealers", sa.Column("suspension_reason", sa.String(200), nullable=True))
    op.add_column(
        "dealers",
        sa.Column("suspension_silent", sa.Boolean, nullable=False, server_default="false"),
    )

    # suspension_reason_templates
    op.create_table(
        "suspension_reason_templates",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("text_he", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind IN ('suspend', 'archive')", name="suspension_reason_templates_kind_check"),
    )

    # Seed
    seeds = [
        ("suspend", "חשד להתנהגות חריגה"),
        ("suspend", "אי-תשלום דמי מנוי"),
        ("suspend", "תלונות חוזרות מסוחרים אחרים"),
        ("suspend", "מסמכי KYC לא בתוקף"),
        ("suspend", "חשד להונאה"),
        ("suspend", "בקשת הסוחר (השעיה זמנית)"),
        ("archive", "בקשה של הסוחר לסגור חשבון"),
        ("archive", "חשד להונאה מאומת"),
        ("archive", "הפרת תנאי שימוש חמורה"),
        ("archive", "אי-פעילות ממושכת"),
    ]
    for kind, text in seeds:
        op.execute(
            sa.text(
                "INSERT INTO suspension_reason_templates (kind, text_he) VALUES (:k, :t)"
            ).bindparams(k=kind, t=text)
        )
```

- [ ] Step 4: Downgrade reverses everything in correct order.
- [ ] Step 5: `alembic upgrade head`; verify columns + table; verify 10 seed rows.
- [ ] Step 6: Update `apps/api/app/models/dealer.py` to declare the new columns.
- [ ] Step 7: Create `apps/api/app/models/suspension_reason_template.py`. Export it from `models/__init__.py`.
- [ ] Step 8: Verify ORM imports cleanly.
- [ ] Step 9: Commit.

---

## Task 2: Backend — admin endpoints

- [ ] Step 1: Add Pydantic schemas to `apps/api/app/schemas/admin.py`:
  - `SuspendRequest { reason: str | None, silent: bool, admin_password: str }`
  - `ArchiveRequest { reason: str, admin_password: str }`
  - `UnarchiveRequest { admin_password: str }`
  - `UnsuspendRequest { admin_password: str }`
  - `SuspensionReasonTemplate { id, text_he, kind, active, created_at }`
  - `CreateSuspensionReasonTemplateRequest { text_he: str, kind: Literal['suspend','archive'] }`

- [ ] Step 2: Add helper `_verify_admin_password(admin_user: User, password: str)` in router that POSTs to Supabase `/auth/v1/token?grant_type=password` and raises 401 on failure.

- [ ] Step 3: Modify `POST /api/v1/admin/dealers/{id}/suspend` to:
  - Validate `admin_password`
  - Set new fields (`suspension_reason`, `suspension_silent`, `suspended_at`, `suspended_by`)
  - On `silent=false`: send `send_suspension_notice_email` (new helper)
  - 409 if already suspended
  - Audit log entry

- [ ] Step 4: Add `POST /api/v1/admin/dealers/{id}/archive` and `/unarchive`:
  - Archive: re-auth, set archived\_\*, call Supabase admin to delete auth user, audit log
  - Unarchive: re-auth, clear archived\_\*, audit log (note: the auth user is gone — invite flow needed but out of scope)

- [ ] Step 5: Add `GET /api/v1/admin/suspension-reasons?kind=` and `POST /api/v1/admin/suspension-reasons`.

- [ ] Step 6: Modify `GET /api/v1/admin/dealers` to accept `?include_archived=true` (default false). Add `GET /api/v1/admin/dealers/archived` for the dedicated view.

- [ ] Step 7: Update `app/core/auth.py:require_verified_dealer` so that:
  - If `dealer.archived_at IS NOT NULL` → 403 `"החשבון נמחק"`
  - If `dealer.suspended_at IS NOT NULL AND suspension_silent=false` → 403 `"החשבון שלך הושעה — {reason}"`
  - If `dealer.suspended_at IS NOT NULL AND suspension_silent=true` → 503 `"שירות לא זמין"`

- [ ] Step 8: Add `send_suspension_notice_email(to_email, business_name, reason)` to `apps/api/app/core/email.py` — Hebrew RTL template.

- [ ] Step 9: Restart API + curl smoke on each new endpoint (expect 401/403 unauthenticated).

- [ ] Step 10: Commit.

---

## Task 3: Frontend — three dialogs

- [ ] Step 1: Delegate to a11y-lead with the three dialog designs (modal pattern, password input, reason picker chips, warning copy).

- [ ] Step 2: Create `apps/web/src/components/admin/SuspendWithReasonDialog.tsx`:
  - Fetches templates on open via `GET /admin/suspension-reasons?kind=suspend`
  - Chip group + "אחר" textarea
  - Optional "שמור כתבנית" checkbox (on submit, also POSTs to /suspension-reasons)
  - Admin password input
  - Submit POSTs to `/admin/dealers/{id}/suspend` with `silent=false`

- [ ] Step 3: Create `apps/web/src/components/admin/SilentSuspendDialog.tsx`:
  - Strong warning text
  - Admin password input
  - Submit POSTs to `/admin/dealers/{id}/suspend` with `silent=true, reason=null`

- [ ] Step 4: Create `apps/web/src/components/admin/ArchiveDealerDialog.tsx`:
  - Same template-picker pattern as SuspendWithReason but `kind=archive`
  - Strong warning ("ימחק את חשבון האותנטיקציה — שמור היסטוריה")
  - Admin password input
  - Submit POSTs to `/admin/dealers/{id}/archive`

All three reuse the hardened modal pattern (dir=rtl, dvh).

- [ ] Step 5: Compile + commit.

---

## Task 4: Frontend — admin dealer detail wiring

- [ ] Step 1: Delegate to a11y-lead — adding a "פעולות מנהל" section with 3 buttons; on suspended/archived states, swap buttons appropriately.

- [ ] Step 2: In `apps/web/src/app/admin/dealers/[id]/page.tsx`:
  - Import the three new dialogs
  - Add state for each dialog's open/close
  - Render the 3 buttons (or status panel if already suspended/archived)
  - On success of each action, refetch the dealer row + show toast

- [ ] Step 3: Compile + commit.

---

## Task 5: Frontend — archived dealers page

- [ ] Step 1: Delegate to a11y-lead briefly.

- [ ] Step 2: Create `apps/web/src/app/admin/dealers/archived/page.tsx`:
  - Fetches `/api/v1/admin/dealers/archived`
  - Table-like list of archived dealers with archived_at, archived_by, archived_reason, "שחזר" button
  - "שחזר" opens an UnarchiveDialog (re-auth)

- [ ] Step 3: Add a link to "ארכיון סוחרים" from the admin dealers list page.

- [ ] Step 4: Compile + commit.

---

## Task 6: Dealer-side suspension banner

- [ ] Step 1: Delegate to a11y-lead — top-of-page red banner pattern with `role="alert"`, sticky positioning, and how it interacts with the dashboard layout.

- [ ] Step 2: Create `apps/web/src/components/SuspensionBanner.tsx`:
  - Calls `/api/v1/dealers/me`; if `suspended_at` and `suspension_reason`, render the red banner
  - Banner sticks to top with `aria-label="הודעת השעיה"`
  - Includes contact info link

- [ ] Step 3: Mount the banner in the dealer dashboard root (e.g., wrap `DashboardSubNav` or add to `apps/web/src/app/dashboard/page.tsx` and other dealer pages).

- [ ] Step 4: Compile + commit.

---

## Task 7: End-to-end smoke verification

- [ ] Step 1: Restart stack cleanly.
- [ ] Step 2: Verify all new endpoints in OpenAPI.
- [ ] Step 3: Browser walkthrough as admin:
  - Open a dealer detail
  - Suspend with reason → check email arrives + dealer side shows banner
  - Unsuspend → banner disappears
  - Silent suspend → no email; dealer side shows generic 503
  - Archive → dealer can re-register with same email
  - Archived list page shows the row with restore button
- [ ] Step 4: Final commit.

---

## Spec Coverage

| Spec section                               | Tasks |
| ------------------------------------------ | ----- |
| dealers new columns                        | 1     |
| suspension_reason_templates table + seed   | 1     |
| Modified /suspend                          | 2     |
| New /archive, /unarchive                   | 2     |
| New /suspension-reasons endpoints          | 2     |
| Modified /admin/dealers                    | 2     |
| require_verified_dealer behavior           | 2     |
| Suspension email template                  | 2     |
| Three dialogs (Suspend / Silent / Archive) | 3     |
| Admin dealer detail wiring                 | 4     |
| Archived list page                         | 5     |
| Dealer suspension banner                   | 6     |
| Smoke verification                         | 7     |
