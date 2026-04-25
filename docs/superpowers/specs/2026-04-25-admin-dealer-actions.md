# Admin Dealer Actions — Phase 6.7

**Status:** Awaiting user approval
**Source:** Telegram messages 335, 467, 472 from webstudio11

## Goal

Give admins three distinct moderation actions on dealers from `/admin/dealers/[id]`:

1. **Delete (soft + archive)** — moves the dealer to an archive view, prevents login, keeps all history readable. Re-signup with same credentials becomes possible.
2. **Suspend with reason** — dealer keeps logging in but lands on a banner page explaining why their account is suspended; receives an email with the same reason. Cannot perform any actions until lifted.
3. **Silent suspend** — same access block, but no banner, no email. The dealer logs in and finds actions silently failing or returning a generic error. Used when admins want to investigate without tipping the dealer off.

Both suspend variants are reversible. Delete is recoverable (the row is archived, not purged) but the dealer would need to re-register to regain access.

Every destructive action requires a **2-click confirmation**: first click opens a modal, second click submits — and on submit the admin must re-enter their own password to authorize.

Reason templates are predefined chips the admin can pick from (no free typing required for the common cases) plus an "אחר" (other) option that opens a textarea.

## Non-goals

- Bulk actions (operate on one dealer at a time for now)
- Auto-expiry of suspensions (admin must manually un-suspend)
- Email rate limiting per dealer (rely on the existing email layer)
- Audit log retention rules — existing audit_log table handles this

## What exists today

| Piece                    | Location                                           | Behavior                                                                      |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Admin dealer detail page | `apps/web/src/app/admin/dealers/[id]/page.tsx`     | Verify, reject, reset-password, impersonate, suspend (existing — rudimentary) |
| Admin dealer suspend     | `POST /api/v1/admin/dealers/{id}/suspend`          | Already exists (Phase 4.4); flips `dealer.suspended` boolean                  |
| Admin dealer unsuspend   | `POST /api/v1/admin/dealers/{id}/unsuspend`        | Already exists                                                                |
| Audit log                | `audit_log` table                                  | Captures admin actions including suspensions                                  |
| Dealer model             | `apps/api/app/models/dealer.py`                    | Has `verified`, `rejected_at`, plus probably `suspended` from Phase 4.4       |
| Email infrastructure     | `apps/api/app/core/email.py` + Gmail SMTP fallback | Sends Hebrew RTL templates                                                    |

## Data model changes

### `dealers` — new columns

| Column              | Type                           | Notes                                                         |
| ------------------- | ------------------------------ | ------------------------------------------------------------- |
| `archived_at`       | TIMESTAMPTZ                    | NULL = active; non-null = soft-deleted                        |
| `archived_by`       | UUID FK→users(id)              | Admin who archived                                            |
| `archived_reason`   | VARCHAR(100)                   | Optional, defaults to NULL                                    |
| `suspension_reason` | VARCHAR(200)                   | Set on suspend-with-reason; NULL when silent or not suspended |
| `suspension_silent` | BOOLEAN NOT NULL DEFAULT false | true = silent suspend, false = with reason or not suspended   |
| `suspended_at`      | TIMESTAMPTZ                    | Existing column from Phase 4.4 (verify and add if missing)    |
| `suspended_by`      | UUID FK→users(id)              | Admin who suspended (verify, add if missing)                  |

### `suspension_reason_templates` — NEW table

Predefined reason chips so admins don't retype. Seed with ~6 common reasons; admins can add more.

| Column       | Type                               | Notes                                               |
| ------------ | ---------------------------------- | --------------------------------------------------- |
| `id`         | UUID PK                            | gen_random_uuid()                                   |
| `text_he`    | VARCHAR(200) NOT NULL              | Hebrew template text                                |
| `kind`       | VARCHAR(20) NOT NULL               | `'suspend' \| 'archive'` — what the template is for |
| `active`     | BOOLEAN NOT NULL DEFAULT true      | Soft-delete flag                                    |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

Seed values (suspend kind):

- חשד להתנהגות חריגה
- אי-תשלום דמי מנוי
- תלונות חוזרות מסוחרים אחרים
- מסמכי KYC לא בתוקף
- חשד להונאה
- בקשת הסוחר (השעיה זמנית)

Seed values (archive kind):

- בקשה של הסוחר לסגור חשבון
- חשד להונאה מאומת
- הפרת תנאי שימוש חמורה
- אי-פעילות ממושכת

## API changes

### Modified: `POST /api/v1/admin/dealers/{id}/suspend`

Body changes from previous shape:

```json
{
  "reason": "חשד להונאה", // optional; NULL when silent=true
  "silent": false, // false = visible (banner+email), true = silent
  "admin_password": "..." // re-auth (re-submit admin password)
}
```

Behavior:

- 401 if admin_password is wrong (re-verify against Supabase)
- Sets `suspended_at = now()`, `suspended_by = admin.id`, `suspension_reason`, `suspension_silent`
- If `silent=false`: send email "החשבון שלך הושעה — סיבה: {reason}" via existing email layer
- 409 if dealer already suspended
- Returns updated dealer row + ack of email send

### New: `POST /api/v1/admin/dealers/{id}/archive`

Body:

```json
{
  "reason": "בקשת סוחר",
  "admin_password": "..."
}
```

Behavior:

- 401 on wrong admin_password
- Sets `archived_at = now()`, `archived_by`, `archived_reason`
- Calls Supabase admin to delete the auth user (so dealer can re-signup with same email)
- Does NOT delete `dealers`, `inventory`, `offers`, `deals` rows — they stay for history
- Audit log entry
- Returns 200

### New: `POST /api/v1/admin/dealers/{id}/unarchive`

Body: `{ "admin_password": "..." }`. Restores: clears `archived_at`/`archived_by`/`archived_reason`. Note: the dealer will need to be re-invited to set a new password (auth user no longer exists).

### New: `GET /api/v1/admin/suspension-reasons?kind=suspend|archive`

Returns the list of templates for the picker. No auth on shape, but admin-only.

### New: `POST /api/v1/admin/suspension-reasons`

Admin creates a new template. Body: `{ text_he, kind }`. Useful when an admin types a custom reason and wants to save it for next time.

### Modified: `GET /api/v1/admin/dealers`

Add `?include_archived=false|true` query (default false). Add a separate route `/api/v1/admin/dealers/archived` for the dedicated archive view.

### Existing endpoint behavior changes

- `require_verified_dealer` now returns 403 with `{detail: "החשבון שלך הושעה — {reason}"}` when `suspension_silent=false`, or returns 503 with a generic "שירות לא זמין" message when `suspension_silent=true`. The 503 is the "shibush" — the dealer doesn't get a clear explanation.
- `archived_at IS NOT NULL` → all endpoints reject with 403 "החשבון נמחק" (dealer is fully gone in user-facing terms).

## Frontend changes

### Admin dealer detail page (`/admin/dealers/[id]`)

Add a new "פעולות מנהל" section with three buttons:

- 🟡 השעה עם סיבה — opens SuspendWithReasonDialog
- 🟠 השעה בשקט — opens SilentSuspendDialog
- 🔴 מחק (ארכיון) — opens ArchiveDealerDialog

Existing "verify"/"reject" buttons stay where they are.

If the dealer is currently suspended, replace the suspend buttons with a single "בטל השעיה" button + a panel showing the current reason and silent/visible flag.

If the dealer is archived, all action buttons hide and show a "החשבון בארכיון" notice with the reason and an "שחזר" button.

### New dialogs

All three follow the hardened modal pattern (dir=rtl, dvh sizing). All require admin password before submit.

**SuspendWithReasonDialog**:

1. Reason picker — chips from `GET /admin/suspension-reasons?kind=suspend` + "אחר" option
2. If "אחר" picked → textarea (with "save as template" checkbox)
3. Admin password input (autocomplete=current-password)
4. Two buttons: "ביטול" / "השעה את הסוחר"

**SilentSuspendDialog**:
Simpler. Just a strong warning ("הסוחר לא יקבל שום הודעה — יראה רק שגיאות גנריות"), admin password, submit.

**ArchiveDealerDialog**:
Same shape as SuspendWithReason but with a stronger warning: "פעולה זו תמחק את חשבון האותנטיקציה. הסוחר יוכל להירשם מחדש עם אותו אימייל. כל ההיסטוריה (מלאי, הצעות, עסקאות) נשמרת."

### New page: `/admin/dealers/archived`

Lists archived dealers (paginated). Each row: business_name, archived date, admin who archived, reason, "שחזר" button.

### Dealer side: suspension banner

On every authenticated dealer page, if the dealer is suspended-with-reason, show a top-of-page red banner: "החשבון שלך הושעה. סיבה: {reason}. צור קשר עם התמיכה." The banner is sticky and the rest of the page is functionally read-only (existing `require_verified_dealer` already returns 403, so most pages would already show errors — the banner adds context).

For silent suspend, no banner — the dealer just sees errors when trying to act.

## Email template

New template: "החשבון שלך הושעה" — Hebrew RTL, includes the reason, contact info for support. Reuses the existing Gmail SMTP fallback path.

## Audit log

Every admin action writes an `audit_log` entry:

- `admin_dealer.suspend.with_reason` — payload: `{reason, silent: false}`
- `admin_dealer.suspend.silent` — payload: `{silent: true}`
- `admin_dealer.unsuspend` — payload: `{}`
- `admin_dealer.archive` — payload: `{reason}`
- `admin_dealer.unarchive` — payload: `{}`

## Open decisions

| Question                                   | Decision                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Re-auth on every action or session-cached? | Every destructive action — no caching. The 2-click + password is the safety net. |
| Silent suspend duration limit?             | None for now — manual unsuspend only.                                            |
| Can admins archive themselves?             | No — endpoint rejects if dealer.user_id == admin.user_id.                        |
| Reason templates per-admin or global?      | Global. Any admin can use templates created by any other admin.                  |
