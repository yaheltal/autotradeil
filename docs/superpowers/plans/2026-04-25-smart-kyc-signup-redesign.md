# Smart KYC Signup Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dealer signup form with a 2-step wizard: capture three documents with a smart edge-detecting camera (or pick from gallery/files), then confirm a form pre-filled by Claude vision.

**Architecture:** New backend extract endpoint + four new optional columns on existing `users` / `dealers` tables. New `SmartCameraCapture` component using `getUserMedia` + Canvas + Sobel edge detection. New 2-step wizard replaces the current `/signup/dealer` page.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, Postgres, Pydantic 2; Next.js 14, React 18, TypeScript, Tailwind, Radix Dialog, MediaDevices API + Canvas.

**a11y workflow note:** Frontend file edits are gated by an a11y hook. For each frontend task, dispatch `accessibility-agents:accessibility-lead` with the proposed change first, apply required modifications, then commit.

**Spec:** `docs/superpowers/specs/2026-04-25-smart-kyc-signup-redesign.md`

---

## File Map

**Backend:**

- Create: `apps/api/alembic/versions/<rev>_users_dealers_kyc_fields.py`
- Modify: `apps/api/app/models/user.py` — `first_name`, `last_name`, `id_number`, `birth_date`
- Modify: `apps/api/app/models/dealer.py` — `license_until`
- Modify: `apps/api/app/schemas/dealer.py` — `DealerSignupRequest` accepts new optional fields
- Create: `apps/api/app/schemas/kyc.py` — `KYCExtractResponse`
- Modify: `apps/api/app/routers/security.py` — add `POST /kyc/extract`
- Modify: `apps/api/app/routers/signup.py` — persist new fields

**Frontend:**

- Create: `apps/web/src/components/SmartCameraCapture.tsx`
- Modify: `apps/web/src/app/signup/dealer/page.tsx` — full rewrite as 2-step wizard
- Possibly create: `apps/web/src/lib/sobel.ts` — Sobel edge detector utility (~50 lines)

**Verification:** browser test of the public ngrok URL on a real phone with real ID samples + curl smoke for `/kyc/extract`.

---

## Task 1: DB migration — KYC personal fields

**Files:**

- Create: `apps/api/alembic/versions/<rev>_users_dealers_kyc_fields.py`

- [ ] **Step 1: Generate revision**

```bash
cd /Users/user/Desktop/autotradeil/apps/api
source venv/bin/activate
alembic revision -m "users dealers kyc fields"
```

- [ ] **Step 2: Set down_revision**

`down_revision: Union[str, None] = "636dd5c42ee9"` (the Phase 6.5 head).

- [ ] **Step 3: Write upgrade**

```python
def upgrade() -> None:
    # users — personal info extracted from ID
    op.add_column("users", sa.Column("first_name", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("id_number", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("birth_date", sa.Date(), nullable=True))
    op.create_check_constraint(
        "users_id_number_format",
        "users",
        "id_number IS NULL OR id_number ~ '^[0-9]{9}$'",
    )

    # dealers — license expiration
    op.add_column("dealers", sa.Column("license_until", sa.Date(), nullable=True))
```

- [ ] **Step 4: Write downgrade**

```python
def downgrade() -> None:
    op.drop_column("dealers", "license_until")
    op.drop_constraint("users_id_number_format", "users", type_="check")
    op.drop_column("users", "birth_date")
    op.drop_column("users", "id_number")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
```

- [ ] **Step 5: Apply + verify**

```bash
alembic upgrade head
alembic current
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(db): kyc personal fields on users + license_until on dealers"
```

---

## Task 2: ORM model updates

**Files:**

- Modify: `apps/api/app/models/user.py`
- Modify: `apps/api/app/models/dealer.py`

- [ ] **Step 1: Add to user.py**

Inside the `User` class (after the existing fields), add:

```python
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    id_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
```

Imports at the top of user.py — ensure `Date` and `date` are imported.

Add to `__table_args__`:

```python
        CheckConstraint(
            "id_number IS NULL OR id_number ~ '^[0-9]{9}$'",
            name="users_id_number_format",
        ),
```

- [ ] **Step 2: Add to dealer.py**

Inside the `Dealer` class:

```python
    license_until: Mapped[date | None] = mapped_column(Date, nullable=True)
```

Top imports — ensure `Date` and `date` are imported.

- [ ] **Step 3: Verify**

```bash
source venv/bin/activate && python -c "
from app.models import User, Dealer
for col in ('first_name','last_name','id_number','birth_date'):
    assert col in User.__table__.columns.keys(), f'User missing {col}'
assert 'license_until' in Dealer.__table__.columns.keys()
print('OK')
"
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(model): kyc personal fields"
```

---

## Task 3: Schema additions

**Files:**

- Modify: `apps/api/app/schemas/dealer.py`
- Create: `apps/api/app/schemas/kyc.py`

- [ ] **Step 1: Extend `DealerSignupRequest`**

Find the existing class. Add the four new optional fields:

```python
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    id_number: str | None = Field(default=None, pattern="^[0-9]{9}$")
    birth_date: date | None = Field(default=None)
    license_until: date | None = Field(default=None)
```

Add `from datetime import date` if missing.

- [ ] **Step 2: Create `apps/api/app/schemas/kyc.py`**

```python
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class KYCExtractResponse(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    license_number: str | None = None
    license_until: date | None = None
    city: str | None = None
    confidence: Literal["high", "medium", "low"] = "low"
    warnings: list[str] = Field(default_factory=list)
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(schema): kyc extract response + signup new fields"
```

---

## Task 4: New endpoint POST /api/v1/security/kyc/extract

**Files:**

- Modify: `apps/api/app/routers/security.py`

- [ ] **Step 1: Delegate the security review**

Although this endpoint has no UI, it's unauthenticated. Confirm with the existing `signup_rate_limit` import + rate-limit dependency.

- [ ] **Step 2: Implement**

Add at the end of security.py (or alongside other KYC routes):

````python
import base64
from datetime import date as _date

import anthropic
from fastapi import File, UploadFile

from app.core.config import settings as app_settings
from app.core.rate_limit import rate_limit
from app.schemas.kyc import KYCExtractResponse

kyc_extract_rate_limit = rate_limit("5/hour", scope="kyc_extract")


@router.post("/kyc/extract", response_model=KYCExtractResponse)
async def kyc_extract(
    id_front: UploadFile = File(...),
    id_back: UploadFile = File(...),
    license: UploadFile = File(...),
    _: None = Depends(kyc_extract_rate_limit),
) -> KYCExtractResponse:
    """Extract personal info from three KYC documents using Claude vision.

    Public endpoint — called during signup before the user exists.
    Rate-limited to 5/hour/IP. Always returns 200; missing fields are null
    so the wizard can proceed with manual entry."""
    if not app_settings.anthropic_api_key:
        return KYCExtractResponse(warnings=["AI service not configured"])

    async def encode(f: UploadFile) -> tuple[str, str]:
        content = await f.read()
        if len(content) > MAX_KYC_BYTES:
            raise HTTPException(status_code=400, detail="קובץ גדול מדי")
        media = (
            "image/jpeg" if f.content_type in (None, "image/heic") else f.content_type
        )
        return media, base64.standard_b64encode(content).decode("ascii")

    fmt_front, b64_front = await encode(id_front)
    fmt_back, b64_back = await encode(id_back)
    fmt_lic, b64_lic = await encode(license)

    client = anthropic.Anthropic(api_key=app_settings.anthropic_api_key)

    prompt = """אתה מקבל 3 תמונות של מסמכי זיהוי ישראליים:
1. ת"ז קדמי
2. ת"ז אחורי
3. רישיון סוחר רכב

החזר אך ורק JSON (ללא טקסט נוסף, ללא code fences) במבנה:
{
  "first_name": "שם פרטי בעברית או null",
  "last_name": "שם משפחה בעברית או null",
  "id_number": "מספר ת״ז 9 ספרות או null",
  "birth_date": "YYYY-MM-DD או null",
  "license_number": "מספר רישיון סוחר או null",
  "license_until": "YYYY-MM-DD תאריך תפוגת רישיון או null",
  "city": "עיר מגורים בעברית או null",
  "confidence": "high" | "medium" | "low",
  "warnings": ["תיאור בעיה אחת או יותר", ...]
}
אם שדה אינו קריא — null. אל תנחש."""

    try:
        msg = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=600,
            timeout=30,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": fmt_front, "data": b64_front}},
                        {"type": "image", "source": {"type": "base64", "media_type": fmt_back, "data": b64_back}},
                        {"type": "image", "source": {"type": "base64", "media_type": fmt_lic, "data": b64_lic}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
    except Exception as exc:
        logger.warning("kyc extract Claude call failed: %s", exc)
        return KYCExtractResponse(warnings=["AI extraction failed"])

    text = ""
    for blk in msg.content:
        if getattr(blk, "type", None) == "text":
            text = blk.text
            break

    import json
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").lstrip("json").strip()
    try:
        parsed = json.loads(cleaned[cleaned.find("{"): cleaned.rfind("}") + 1])
    except (ValueError, json.JSONDecodeError):
        return KYCExtractResponse(warnings=["AI returned unparseable JSON"])

    try:
        return KYCExtractResponse(**parsed)
    except Exception as exc:
        logger.info("kyc extract validation failed: %s payload=%s", exc, parsed)
        return KYCExtractResponse(warnings=["Some extracted fields were invalid"])
````

Add `MAX_KYC_BYTES = 10 * 1024 * 1024` near the top of the file if not already defined.

- [ ] **Step 3: Restart API + smoke test**

```bash
pkill -f "uvicorn app.main"; sleep 1
cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &
sleep 4
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import json, sys
paths = json.load(sys.stdin)['paths']
assert '/api/v1/security/kyc/extract' in paths
print('OK kyc/extract registered')
"
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): POST /security/kyc/extract — Claude vision OCR"
```

---

## Task 5: Persist new fields in signup endpoint

**Files:**

- Modify: `apps/api/app/routers/signup.py`

- [ ] **Step 1: Update the dealer creation to write the new fields**

Find the `Dealer(...)` constructor. Add `license_until=payload.license_until`.

For the user-side fields, do an UPDATE on the existing `User` row (created by trigger):

```python
        # Persist personal info from KYC extraction (if present).
        if any([payload.first_name, payload.last_name, payload.id_number, payload.birth_date]):
            user.first_name = payload.first_name
            user.last_name = payload.last_name
            user.id_number = payload.id_number
            user.birth_date = payload.birth_date
```

Insert this block right after the existing `if user is None:` check and before `dealer = Dealer(...)`.

- [ ] **Step 2: Restart + verify openapi reflects new request fields**

```bash
pkill -f "uvicorn app.main"; sleep 1; (cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &)
sleep 4
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import json, sys
schemas = json.load(sys.stdin)['components']['schemas']
props = schemas['DealerSignupRequest']['properties']
for f in ('first_name','last_name','id_number','birth_date','license_until'):
    assert f in props, f'{f} missing'
print('OK signup accepts new fields')
"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): signup persists kyc personal fields"
```

---

## Task 6: SmartCameraCapture component

**Files:**

- Create: `apps/web/src/components/SmartCameraCapture.tsx`
- Possibly create: `apps/web/src/lib/sobel.ts`

- [ ] **Step 1: Delegate to accessibility-lead**

Submit the proposed component for review. Key concerns:

- Camera permission denial graceful fallback
- Live region announces alignment state changes ("מסגרת לא זוהתה" / "כרטיס מיושר — לחץ לצילום")
- Shutter button has clear `aria-disabled` when not aligned
- Three input modes (camera / gallery / files) — make sure each is a real button, not styled `<a>`
- Modal dismissal returns focus to the trigger

- [ ] **Step 2: Apply lead's feedback, then create**

Create `apps/web/src/lib/sobel.ts` with a small Sobel + 4-corner contour finder (~80 lines vanilla TS, no deps). Then create the component as designed in the spec. Full code is intentionally not inlined here because it's >300 lines — the implementer will write it from the spec's "SmartCameraCapture component" section, following the existing project's modal patterns (Radix Dialog, dir="rtl", h-[100dvh], w-screen).

Required props:

```typescript
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string; // e.g. "ת״ז קדמי"
  onCapture: (blob: Blob) => void;
};
```

Internal modes (`mode: "menu" | "camera" | null`): the menu shows three buttons (camera / gallery / files). Camera mode opens the live stream + edge detection. Gallery and files just trigger a hidden `<input type="file">` and call `onCapture` with the picked file.

- [ ] **Step 3: Manual smoke (desktop browser with webcam)**

Hold a credit card up to the webcam. Verify the overlay turns green when aligned and the shutter enables. Capture, check the resulting blob is a JPEG.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ui): SmartCameraCapture — camera/gallery/files + edge detect"
```

---

## Task 7: 2-step wizard at /signup/dealer

**Files:**

- Modify: `apps/web/src/app/signup/dealer/page.tsx` (full rewrite)

- [ ] **Step 1: Delegate to accessibility-lead**

Rewriting the entire signup page. Focus areas:

- Step indicator with `aria-current="step"`
- Heading hierarchy: `<h1>` page title, `<h2>` per step
- Focus management on step transition (move focus to step heading)
- Form validation patterns same as today
- Error inline (Hebrew) when extraction fails

- [ ] **Step 2: Implement step 1 — three captures**

State:

```typescript
const [docs, setDocs] = useState<{ id_front?: Blob; id_back?: Blob; license?: Blob }>({});
const [activeSlot, setActiveSlot] = useState<"id_front" | "id_back" | "license" | null>(null);
const [extracting, setExtracting] = useState(false);
const [extracted, setExtracted] = useState<KYCExtractResult | null>(null);
const [step, setStep] = useState<1 | 2>(1);
```

Render: 3 slot cards, each with a "צלם" button → opens `SmartCameraCapture` with the corresponding label. After capture: thumbnail (URL.createObjectURL) + "צלם שוב" link. "המשך" enabled when all three blobs present.

On "המשך" press: `setExtracting(true)`, POST FormData of three blobs to `/api/v1/security/kyc/extract`, store result, `setStep(2)`, `setExtracting(false)`. On error: same advance, `extracted = null`.

- [ ] **Step 3: Implement step 2 — pre-filled form**

Reuse the existing form fields (already present in the current page implementation). Pre-fill default values from `extracted` when present. Submit handler unchanged structurally — just include the new fields in the payload, then POST `/api/v1/security/kyc/upload` with the three blobs after the signup succeeds.

- [ ] **Step 4: Manual smoke (browser)**

Open `https://brink-entire-easter.ngrok-free.dev/signup/dealer` on phone. Take three photos of any documents. Verify: extract spinner runs, form pre-fills with whatever AI returned (or stays empty), submit succeeds, KYC documents appear in admin's KYC review queue.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): kyc-first signup wizard at /signup/dealer"
```

---

## Task 8: End-to-end smoke verification

- [ ] **Step 1: Restart stack cleanly**

```bash
pkill -f "uvicorn app.main"; pkill -f "next dev"; pkill -f "next-server"; sleep 2
cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &
cd /Users/user/Desktop/autotradeil/apps/web && nohup pnpm dev > /tmp/autotradeil-web.log 2>&1 &
sleep 5
```

- [ ] **Step 2: Verify all touched endpoints respond**

```bash
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import json, sys
paths = json.load(sys.stdin)['paths']
for p in ('/api/v1/security/kyc/extract', '/api/v1/auth/signup/dealer'):
    assert p in paths
print('OK')"
```

- [ ] **Step 3: Browser walkthrough on the public ngrok URL**

1. Open `/signup/dealer`
2. Take three real document photos (or pick from gallery)
3. Verify edge detection works on at least one
4. Verify form pre-fills (or shows graceful empty if AI couldn't read)
5. Edit/complete fields, submit
6. End up at `/signup/dealer/pending` — verify dealer + KYC docs in DB

- [ ] **Step 4: Final commit if any tweaks needed**

```bash
git status
git log --oneline -10
```

---

## Spec Coverage Check

| Spec section                                          | Tasks |
| ----------------------------------------------------- | ----- |
| users new columns                                     | 1, 2  |
| dealers.license_until                                 | 1, 2  |
| Migration                                             | 1     |
| POST /security/kyc/extract                            | 4     |
| signup endpoint accepts new fields                    | 3, 5  |
| SmartCameraCapture (camera+gallery+files+edge detect) | 6     |
| 2-step wizard at /signup/dealer                       | 7     |
| End-to-end                                            | 8     |
