# Smart KYC Signup Redesign — Phase 6.6

**Status:** Approved by user via Telegram (msgs 269, 274, 281)
**Author:** Claude (session 2026-04-25)
**Source:** Telegram messages 259, 260, 262, 265 (and the back-and-forth that followed)

## Goal

Move dealer signup from a personal-details-then-KYC flow to a KYC-first flow where the dealer photographs their three documents (ID front, ID back, dealer license) at the start, an AI extracts the personal information from those photos, and the rest of the form arrives pre-filled. The camera capture step uses a real-time edge-detection overlay that goes green when the document is properly aligned in the frame.

## Non-goals

- OCR for non-Israeli ID formats (only domestic ת"ז + Israeli dealer license)
- Auto-capture (the dealer still taps a shutter button — the green overlay just signals "ready")
- Replacing the existing post-signup KYC re-verification on `/dashboard/security` (that flow stays — admins can still re-request documents later)
- Native iOS/Android camera integration (web-only for now; the iOS scaffold reuses these flows when it ships)

## What exists today

| Piece                    | Location                                                                  | Behavior                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Multi-field signup form  | `apps/web/src/app/signup/dealer/page.tsx`                                 | All personal + business + KYC fields entered manually upfront                                                 |
| KYC upload (post-signup) | `apps/web/src/app/signup/dealer/pending/page.tsx` + `/dashboard/security` | After signup, dealer uploads three docs as separate files; camera-only via `capture="environment"`            |
| KYC backend              | `POST /api/v1/security/kyc/upload`                                        | Stores documents tied to dealer_id                                                                            |
| Claude vision OCR        | `apps/api/app/routers/inventory.py:lookup_by_image`                       | Reference for how the project calls Claude vision                                                             |
| Dealer model             | `apps/api/app/models/dealer.py`                                           | Has `business_name`, `business_id`, `license_number`, `phone`, `city`, `lot_size`, `contact_name`, `verified` |
| User model               | `apps/api/app/models/user.py`                                             | Linked to Supabase auth via `id` UUID                                                                         |

## New user-facing flow (2 wizard steps + redirect)

The original draft included a dedicated "extracting…" screen between capture and confirm. That screen does nothing the dealer cares about — it's just a loading spinner. Folded the spinner into the "Continue" button on step 1 so the wizard is two real screens.

### Step 1 — Capture three documents (smart camera)

Wizard page at `/signup/dealer` (replaces current monolithic form).

For each of the three required documents (ID front, ID back, dealer license):

- A `SmartCameraCapture` component opens.
- Three input modes are offered side-by-side, all leading to the same captured image:
  - 📷 **Camera** — opens `getUserMedia({ video: { facingMode: "environment" } })`. A CSS overlay shows a CR80 card-aspect-ratio frame (1.586:1). A 30 fps Canvas pipeline runs Sobel edge detection on each video frame, finds the largest 4-sided contour, and turns the overlay green when the contour aligns with the target frame. The shutter button is enabled only on green.
  - 🖼️ **Gallery** — `<input type="file" accept="image/*">` with no `capture` attribute (browser shows the gallery picker on mobile).
  - 📄 **Files** — same `<input type="file">` but `accept="image/*,application/pdf"` (some dealers have a PDF of their license).

The captured/selected image is held in component state as a `Blob`. The dealer can re-take/replace before continuing.

### Step 2 — Confirm details

When the dealer taps "המשך" on step 1, the button itself enters a spinner state ("מנתח...") while the wizard POSTs the three blobs to `POST /api/v1/security/kyc/extract`. There is NO dedicated extraction screen. On API response, step 2 renders.

Step 2 is the personal-details + business form pre-filled from extraction. The dealer edits any field. Fields the AI didn't fill (password, business_id if not on the license, lot_size, etc.) are blank and required.

Submit button: when tapped, calls `POST /api/v1/auth/signup/dealer` (existing endpoint, with new fields). On 201, immediately uploads the three captured blobs to `POST /api/v1/security/kyc/upload` (best-effort) and redirects to `/signup/dealer/pending`.

## Data model changes

### `users` — three new optional columns

Holds personal information extracted from the ID. Optional everywhere except when KYC is provided.

| Column       | Type         | Notes                                                           |
| ------------ | ------------ | --------------------------------------------------------------- |
| `first_name` | VARCHAR(100) | NULLABLE                                                        |
| `last_name`  | VARCHAR(100) | NULLABLE                                                        |
| `id_number`  | VARCHAR(20)  | NULLABLE; CHECK `id_number IS NULL OR id_number ~ '^[0-9]{9}$'` |
| `birth_date` | DATE         | NULLABLE                                                        |

### `dealers` — one new optional column

| Column          | Type | Notes                                           |
| --------------- | ---- | ----------------------------------------------- |
| `license_until` | DATE | NULLABLE; expiration date of the dealer license |

### Migration

Single Alembic revision on top of `636dd5c42ee9` (the current head after Phase 6.5 backend). All NULL-able, no backfill required.

## API changes

### New: `POST /api/v1/security/kyc/extract`

Auth: NONE (called during signup, before the user exists). Rate-limited per IP at the same `signup_rate_limit` (5/hour).

Request: `multipart/form-data` with three files:

- `id_front` (image/\*)
- `id_back` (image/\*)
- `license` (image/\* or application/pdf)

Response:

```json
{
  "first_name": "תל",
  "last_name": "יהל",
  "id_number": "123456789",
  "birth_date": "1993-05-12",
  "license_number": "DRL-7821",
  "license_until": "2027-08-31",
  "city": "תל אביב",
  "confidence": "high" | "medium" | "low",
  "warnings": ["ID back unreadable", ...]
}
```

Any field the AI couldn't read is `null`. Confidence is a self-rating from Claude. Warnings list any per-document issues.

Backend implementation: encode three images to base64, send a single `claude-opus-4-7` vision call with all three plus a strict prompt requesting JSON only. Tolerate JSON parse errors with safe defaults (returns all-nulls so the form still works manually). Hard timeout at 30 seconds.

### Modified: `POST /api/v1/auth/signup/dealer`

Accept four new optional fields in `DealerSignupRequest`: `first_name`, `last_name`, `id_number`, `birth_date`, `license_until`. Persisted to the new columns. The existing pre-flight uniqueness checks (business_id, license_number) stay.

### Existing: `POST /api/v1/security/kyc/upload`

No change in shape. Called from the post-success success branch on the new wizard's submit handler with the three already-captured blobs.

## Frontend changes

### New: `SmartCameraCapture` component

Path: `apps/web/src/components/SmartCameraCapture.tsx`

Props: `{ label: string; onCapture: (blob: Blob) => void; onCancel: () => void }`.

Renders a fullscreen modal with three sub-modes (camera / gallery / files). The camera sub-mode contains:

- A `<video>` element streaming `getUserMedia({ video: { facingMode: "environment" } })`.
- A CSS overlay containing the card-shaped target rectangle (rounded corners, dashed border).
- A hidden `<canvas>` matching video dimensions used for edge detection.
- A `requestAnimationFrame` loop that copies each video frame to canvas, runs a Sobel filter (vanilla JS, ~50 lines), then runs a quick contour finder. If a 4-sided contour with area within ±20% of the target rectangle area is found, the overlay turns green (`data-aligned="true"`).
- A shutter button — disabled while not aligned. On press, captures the current video frame to a JPEG `Blob`, stops the stream, calls `onCapture`.

A11y: the overlay state is mirrored to a `role="status" aria-live="polite"` region: "מסגרת הכרטיס לא זוהתה" / "כרטיס זוהה — לחץ לצילום". The shutter button has the appropriate `aria-disabled` and a Hebrew label like "צלם תעודה" / "צלם רישיון".

### New: `KYCWizard` page

Path: `apps/web/src/app/signup/dealer/page.tsx` (replaces current implementation).

A 2-step wizard managed by local state (`step: 1 | 2`) plus an `extracting` boolean:

1. **Capture** — three slots ("ת"ז קדמי", "ת"ז אחורי", "רישיון סוחר"). Each slot starts with a "צלם" button → opens `SmartCameraCapture`. After capture: thumbnail + "צלם שוב" link. "המשך" enabled when all three are captured. On press: button shows a spinner ("מנתח..."), the wizard POSTs the three blobs to `/security/kyc/extract`. On response → store extracted fields, advance to step 2. On failure → toast "לא הצלחנו לקרוא את התעודות — מלא ידנית" and advance anyway with empty fields.
2. **Confirm** — pre-filled form (personal + business). Dealer edits/completes. Submit calls `POST /api/v1/auth/signup/dealer` with new fields → on 201, uploads three blobs to `/api/v1/security/kyc/upload` (best-effort) → redirect to `/signup/dealer/pending`.

A11y: `aria-current="step"` on the active step in a step indicator; focus moves to the new step's heading on transition; per-step heading is `<h2>` so the page `<h1>` ("הרשמה כסוחר") stays anchored.

### Removed (or deferred)

- The current `/signup/dealer/pending` KYC upload UI is no longer the primary path. It stays in the codebase as a fallback for re-verification flows but the typical user never sees it.

## Linkage to existing post-signup KYC

After this phase ships, the typical dealer arrives at `/signup/dealer/pending` already with KYC documents on file. The pending page should detect this (via `GET /security/kyc/status`) and skip the upload UI, showing only the "ממתין לאישור אדמין" status. Out of scope for this phase — file a follow-up.

## Error handling

- Smart camera unavailable (no camera permission, browser denies): the camera sub-mode shows "לא ניתן לפתוח מצלמה — בחר מהגלריה או מהמסמכים".
- Edge detection unsupported (no Canvas / very old browser): camera still works without the green-overlay assist; shutter is always enabled. Falls back gracefully.
- Claude extraction failure or timeout: extract endpoint returns 200 with all-null fields and a warning. Wizard moves to step 3 with empty form (no user-blocking error).
- Image too large (>10MB) or unsupported MIME: rejected with a clear Hebrew message at the slot level.
- Submit failure: dealer stays on step 3 with the inline error message from the existing signup endpoint mapping (Phase 6.5.x fix).

## Testing

Manual smoke (no automated test infra in repo today):

- Take three real document photos via desktop Chrome (use a printed sample card) — verify edge detection turns the overlay green when aligned.
- Pick existing files from gallery — verify upload + extract still works.
- Submit form with extraction-derived values — verify dealer + KYC documents land in DB and Cloudinary.
- Camera permission denied — verify graceful fallback to gallery/files.
- Backend `extract` endpoint hit with three real Israeli ID samples — verify Claude returns plausible JSON; verify timeout at 30s.

## Open decisions

| Question                                                     | Decision                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Edge detection — vanilla JS Sobel or external library?       | Vanilla. ~50 lines of TS, no extra dependency. OpenCV.js is 10MB which would dominate the signup bundle. |
| Camera vs gallery vs files — same UI affordance or separate? | Three buttons in one row. Each button visible from the start.                                            |
| Preserve old monolithic signup as fallback?                  | No. The new wizard is the only path. The monolithic page is replaced.                                    |
| Extraction confidence threshold?                             | None — show pre-filled values regardless; the dealer always gets to confirm/edit in step 3.              |
