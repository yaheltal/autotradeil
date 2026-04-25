# AutoTradeIL — מפת דרכים מלאה

**עודכן:** 2026-04-25 18:10 (אחרי Phase 6.7)

---

## חלק א׳ — מה כבר נעשה

### Phase 1-2: יסודות (לפני הסשן הזה)

- מונורפו pnpm: apps/api (FastAPI) + apps/web (Next.js) + packages/database
- Supabase Postgres + Alembic
- Auth: Supabase JWT (ES256/RS256/HS256) + impersonation tokens
- Email: Resend + Gmail SMTP fallback
- אדמין panel + dealer signup flow
- Cloudinary image uploads

### Phase 3: מלאי + שוק (לפני הסשן)

- 3.1 — ניהול מלאי backend + frontend
- 3.2 — תמונות רכב (Cloudinary)
- 3.3 — חיפוש חכם בטופס + AI + autocomplete
- 3.5 — OTP + 2FA + KYC

### Phase 4: B2B (לפני הסשן)

- 4.1 — שוק B2B (search + offers + notifications)
- 4.2 — סגירת עסקאות + dealer trust system
- 4.3 — visibility (private/b2b/b2c/both) + pause + analytics
- 4.4 — web app מלא + Gmail SMTP fallback + iOS scaffold

### Phase 6 — AI Agent (סשן 25/04)

✅ POST /api/v1/ai/search — חיפוש בעברית טבעית (Claude Sonnet 4.6)
✅ POST /api/v1/ai/price-analysis — fair/high/low + הסבר עברית
✅ POST /api/v1/ai/recommendations — לפי היסטוריית הצעות+עסקאות

### Phase 6.5 — Dealer Stats + Sale Workflow + Warranty + Image Hide (סשן 25/04)

**Backend:**

- DB: 6 שדות חדשים על inventory (purchase_cost, sale_price, sold_at, sold_to, warranty_type, warranty_until) + hidden boolean על inventory_images
- POST /api/v1/inventory/{id}/sell — סגירת מכירה
- GET /api/v1/inventory/stats?period= — KPIs
- PATCH /api/v1/inventory/{id}/images/{id} — הסתרה/הצגה
- marketplace primary-image מדלג על מוסתרות

**Frontend:**

- 4 קוביות KPI בדף הבית של סוחר
- שדה "עלות קנייה" + פנל אחריות בטופס הוספה
- דיאלוג "סמן כנמכר" עם חישוב רווח חי
- כפתור 💰 "סמן כנמכר" בכל כרטיס פעיל
- ארכיון רכבים שנמכרו עם תאריך + רווח
- כפתור 👁/🚫 לכל תמונה
- תמונת זיהוי הופכת אוטומטית לתמונת פרופיל

### Phase 6.7 — Admin Moderation (סשן 25/04)

**Backend:**

- DB: 5 שדות חדשים על dealers (archived\_\*, suspended_by, suspension_silent) + טבלת suspension_reason_templates עם 10 seeds
- POST /admin/dealers/{id}/suspend — עם silent flag + admin password re-auth
- POST /admin/dealers/{id}/unsuspend — עם re-auth
- POST /admin/dealers/{id}/archive — soft delete + מחיקת auth user
- POST /admin/dealers/{id}/unarchive — שחזור הרשומה
- GET/POST /admin/suspension-reasons — תבניות סיבות
- GET /admin/dealers/archived — רשימת ארכיון
- require_verified_dealer מכבד archived/suspended

**Frontend:**

- 3 דיאלוגים חדשים: SuspendWithReason / SilentSuspend / Archive
- דף /admin/dealers/archived עם כפתור שחזור
- SuspensionBanner בדף הבית של הסוחר (רק להשעיה גלויה)
- "התחזה לסוחר" → "התחבר בתור סוחר" (שינוי שם)

### תיקונים נוספים בסשן (לא חלק מ-phase)

- ngrok tunnel ציבורי + Next.js rewrites
- Mobile modal fix (iOS Safari RTL): html { overflow-x: clip } + dvh-based dialog sizing
- Image OCR לוחית רישוי + הצלבה אוטומטית עם data.gov.il
- iPhone autocomplete לקוד SMS (domain-bound format)
- OTP login phone-first + admin OTP login
- Routing fix: ניתוב admin/dealer לפי user_type אחרי OTP
- Signup error mapping (Hebrew specific errors) + orphan cleanup
- 4 stats route order fix
- formatPrice unwrap (DealerStatsCards + SellVehicleDialog)
- Dashboard cards merge (tier + trust_score בקוביה אחת)
- Image upload split: 📷 צלם / 🖼️ בחר מהגלריה (iOS Safari capture issue)

### מספרים נוכחיים

- 85 API endpoints
- 24 Next.js pages
- 27 components (24 כללי + 3 admin)
- ~50+ commits בסשן הזה
- 10 dealer seeds (suspension reason templates)
- 3 specs + 3 plans כתובים

---

## חלק ב׳ — מה נשאר לעשות

### Phase 6.8 — דרישות חדשות (Telegram msg 537)

_ממתין לתכנון מפורט ולאישורך_

#### 1. עדכון "פרטי העסק" בדאשבורד הסוחר

- במקום: עיר, טלפון, דרגה+ציון אמון
- להציג: שם העסק, דירוג, מספר רישיון סוחר
- שינוי קטן ב-`apps/web/src/app/dashboard/page.tsx`

#### 2. הוספת רכב — שיפורי ולידציית מספר רכב

- אם המספר לא מלא → לא לפתוח אוטומטית את שדה מספר הרכב
- אם זיהוי חלקי → להציג התראה ולבקש מילוי ידני קודם
- שינוי ב-`InventoryFormDialog.tsx` runImageLookup branch

#### 3. חשיפת רכב — נעילה זמנית

- האפשרויות הפעילות: B2B + פרטי בלבד
- "B2C" ו-"שניהם" → אפור, לא ניתן ללחוץ, tooltip "בקרוב"
- שינוי ב-`InventoryFormDialog.tsx` visibility fieldset

#### 4. שיפור דיאלוג "סמן כנמכר"

- סדר חדש של שדות:
  1. מחיר מכירה (ממולא אוטומטית אם הוזן purchase_cost)
  2. מחיר קנייה
  3. רווח מחושב
  4. לאיזה שוק נמכר (רק B2B פעיל, השאר אפור)
  5. בר פרטי קונה: שם מלא, ת"ז, טלפון
  6. כפתור "האם בוצע טרייד?" (אפור, פותח חלון לפרטי טרייד)
  7. כפתור סיום
- שינוי משמעותי ב-`SellVehicleDialog.tsx`
- צריך גם backend: שדות חדשים על inventory (buyer*name, buyer_id, buyer_phone, trade_vehicle*\*)

#### 5. הודעות אישור סוחר

- לשלוח SMS + email עם קישור התחברות אחרי dealer.verify
- שינוי ב-`apps/api/app/routers/admin.py:verify_dealer` — להוסיף קריאה ל-send_sms

#### 6. KYC signup flow — סיום תהליך

- כפתור "סיום תהליך" אחרי 3 העלאות (פעיל רק כשכל 3 קיימים)
- popup הסבר על תהליך אימות
- הודעת support team ל-email + SMS
- שינוי ב-`apps/web/src/app/signup/dealer/pending/page.tsx`

#### 7. Admin — סוחרים ממתינים לאישור עם תמונות KYC

- בדף /admin/dealers (טאב "ממתין"): להציג thumbnails של 3 התעודות באיכות גבוהה + כל הפרטים שמלא
- שינוי משמעותי ב-`apps/web/src/app/admin/dealers/page.tsx` או יצירת view מורחב

### Phase 6.6 — Smart KYC Signup Redesign

_ממתין מ-2026-04-25 — spec + plan כתובים, לא בוצע_

- הזרימה החדשה: צילום 3 מסמכים → AI חילוץ → טופס מולא אוטומטית
- מצלמה חכמה עם Sobel edge detection (מסגרת ירוקה כשמיושר)
- אופציות: מצלמה / גלריה / קבצים
- צריך לראות אם 6.6 חופף עם 6.8.6 — כנראה 6.8.6 הוא subset של 6.6

### Phase 6.10 — Smart Search Everywhere (Telegram msg 551)

_ממתין לתכנון מפורט — חדש_

הרחבת ה-AI search מהשוק B2B לכל שדות החיפוש באתר:

- **Marketplace** — קיים (`/api/v1/ai/search` עם פילטרים בעברית). להמשיך להשתמש בו.
- **חיפוש סוחרים באדמין** — typo-tolerant + intent
- **חיפוש מלאי באדמין** — typo-tolerant
- **חיפוש מלאי הסוחר עצמו** — אם יש שדה חיפוש בדף /dashboard/inventory
- **חיפוש בהצעות / עסקאות / נוטיפיקציות** — אם יש

טכנית: כל שדה search שמופיע באתר מנותב דרך AI parser (Claude) שמתקן typos + מחלץ intent.

זמן משוער: ~60-90 דקות לפי כמות שדות החיפוש.

### Phase 6.9 — Admin Inventory Visibility (Telegram msg 546)

_ממתין לתכנון מפורט — חדש_

#### 9.1 — מלאי לפי סוחר ב-/admin/dealers/[id]

- טאב "מלאי" (קיים) — לוודא שמראה את הרכבים של אותו סוחר ספציפי
- אם לא קיים — להוסיף

#### 9.2 — חיפוש + סינונים מורחבים ב-/admin/inventory

- סינון לפי סוחר (dropdown)
- סינון לפי שוק (B2B / B2C / private / both)
- חיפוש טקסט (יצרן / דגם / מספר רכב)
- אדמין-בלבד — סוחרים לא רואים פילטר "לפי סוחר"

#### 9.3 — שוק לסוחרים

- כרגע: B2B בלבד
- בעתיד: B2C כשיפתח

### דברים גדולים יותר שעוד לא בתכנון

- **iOS native app** — apps/ios/ scaffold קיים, לא בנוי
- **Tests** — אין infra, אין coverage
- **Production deploy** — Vercel/Render/AWS, ngrok זה רק dev
- **CI/CD** — אין GitHub Actions, אין auto-deploy
- **Rate limiting global** — קיים per-endpoint, לא global
- **Analytics dashboard** — Mixpanel/PostHog/etc.
- **Payments** — אם יש מודל freemium או commission

---

## חלק ג׳ — עדיפויות מומלצות לעבודה

### Sprint A — Phase 6.8 (כל ה-7 דרישות החדשות)

זמן משוער: 90-120 דקות. שש מהדרישות הן UI/UX קלות, אחת (סמן כנמכר עם trade) דורשת backend חדש.

### Sprint B — Phase 6.6 (KYC חכם)

זמן משוער: 120 דקות. קיים spec + plan, חלק חופף עם 6.8.6.

### Sprint C — שיפורים גדולים

- iOS app
- Tests + CI
- Production deploy

---

## מצב טכני נוכחי

🟢 **שרתים פעילים:**

- API :8000 (DB connected, Alembic head: afb1ad832c21)
- Web :3000 (Next.js 14)
- ngrok → https://brink-entire-easter.ngrok-free.dev → frontend (proxies /api/v1/\* to local FastAPI)

🟢 **DB state:**

- 5 users (1 admin, 2 dealers active, 0 archived, 2 test rows)
- migrations applied: 14 total

🟢 **a11y compliance:**
כל UI שנכתב בסשן עבר accessibility-lead review. מסומן בדגל ב-CLAUDE-related hook.
