# Dealer Stats + Sale Workflow + Warranty — Design

**Status:** Draft, awaiting user review
**Author:** Claude (session 2026-04-25)
**Source request:** Telegram messages 146, 149, 152, 153, 157 from webstudio11

## Goal

Give every dealer four headline KPIs on their dashboard (cars in stock, cars sold, revenue, profit), a one-click "mark as sold" flow that captures the sale price + purchase cost so per-vehicle profit is visible, and a sold-vehicles archive that exposes the same fields. As a related ask, let dealers optionally record purchase cost and warranty (type + expiration) at the moment they add a vehicle to inventory.

## Non-goals

- Multi-dealer aggregation / admin-level reporting (out of scope; admin already has separate stats endpoints)
- Tax calculations or accounting integrations
- Reversing a sale (mark-as-unsold) — defer to a later phase
- Profit forecasting or pricing suggestions — separate AI work
- Touching the existing B2B `Deal` schema — we link to it, we do not replace it

## What exists today

| Piece                                             | Location                                        | Status                                                             |
| ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `inventory.status` ENUM('active','sold','hidden') | `apps/api/app/models/inventory.py:107`          | Present, "sold" is unused in the UI                                |
| `Deal` model (B2B post-acceptance double-confirm) | `apps/api/app/models/deal.py`                   | Present, captures `final_price` + timestamps for marketplace deals |
| `dealer.deals_completed` counter                  | `apps/api/app/models/dealer.py`                 | Present, bumps on Deal close                                       |
| `inventory.b2b_price` / `b2c_price`               | `apps/api/app/models/inventory.py`              | Present, listed prices per market                                  |
| `/dashboard/inventory?status=sold` filter         | `apps/web/src/app/dashboard/inventory/page.tsx` | URL works, list view exists, no sale-specific columns              |
| `/dashboard/analytics`                            | `apps/web/src/app/dashboard/analytics/page.tsx` | Basic page exists, not the home-page KPI surface the user wants    |
| `/dashboard` (dealer home)                        | `apps/web/src/app/dashboard/page.tsx`           | Exists, no KPI tiles                                               |

The infrastructure for "sold" already exists in the schema; the UI layer never wired it up because the marketplace flow drives most sales through the `Deal` table instead. This spec adds the manual / external-sale path and the dealer-facing aggregate view.

## Data model changes

### `inventory` table — five new columns

| Column           | Type        | Nullable | Notes                                                                                                                          |
| ---------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `purchase_cost`  | INTEGER     | YES      | NIS. Optional at creation; editable. CHECK `>= 0`.                                                                             |
| `sale_price`     | INTEGER     | YES      | NIS. Set when status flips to 'sold'. CHECK `>= 0`.                                                                            |
| `sold_at`        | TIMESTAMPTZ | YES      | UTC timestamp when sale was recorded.                                                                                          |
| `sold_to`        | VARCHAR(20) | YES      | CHECK `IN ('b2b','b2c','external')`. NULL until sold.                                                                          |
| `warranty_type`  | VARCHAR(20) | YES      | CHECK `IN ('manufacturer','dealer','extended','none')`. NULL = "not specified".                                                |
| `warranty_until` | DATE        | YES      | Expiration date. Independent of `warranty_type` for flexibility (a dealer can record expiration without classifying the type). |

`b2b_price` and `b2c_price` are kept as the _listed_ asking prices per market. `sale_price` is what the deal actually closed at — they may differ.

### Migration

New Alembic revision `xxxx_inventory_sale_and_warranty.py` adds the six columns above with the listed CHECK constraints. No data backfill required (all NULL-able, no default for status flip).

## API changes

### New: `POST /api/v1/inventory/{inventory_id}/sell`

Auth: `require_verified_dealer`. The caller must own the inventory row (or be admin via impersonation).

Request body:

```json
{
  "sale_price": 95000,
  "purchase_cost": 80000,        // optional — only sent if changed/added at sale time
  "sold_to": "b2b" | "b2c" | "external",
  "sold_at": "2026-04-25T10:00:00Z"  // optional — defaults to now
}
```

Behavior:

1. 404 if not found, 403 if not the owner, 409 if `status != 'active'`.
2. Update `inventory`: `status='sold'`, `sale_price`, `sold_at`, `sold_to`, and `purchase_cost` if supplied.
3. If a closed `Deal` row exists for this inventory and `sold_to='b2b'`, the response includes an optional `warnings.deal_price_mismatch` field with `{ deal_final_price, supplied_sale_price }` when they differ. The request is NOT rejected — the dealer may have added or absorbed external costs.
4. Emit `inventory.sold` event (audit trail).
5. Return the updated inventory row.

### New: `GET /api/v1/inventory/stats`

Auth: `require_verified_dealer`.

Query: `?period=lifetime|year|month` (default `lifetime`).

Response:

```json
{
  "period": "lifetime",
  "active_count": 12,
  "sold_count": 47,
  "total_revenue": 3200000, // SUM(sale_price) over period
  "total_profit": 410000, // SUM(sale_price - purchase_cost) where both present
  "profit_margin_pct": 12.8, // total_profit / total_revenue * 100, rounded 1 dp
  "avg_days_to_sell": 23, // avg(sold_at - created_at) in days, sold rows only
  "rows_missing_purchase_cost": 4 // count of sold rows where profit can't be computed
}
```

`rows_missing_purchase_cost` lets the UI surface a small nudge ("4 sold vehicles are missing purchase cost — add them to see real profit").

### Existing endpoints — minor touches

- `POST /api/v1/inventory` and `PUT /api/v1/inventory/{id}` accept the new optional fields: `purchase_cost`, `warranty_type`, `warranty_until`.
- `GET /api/v1/inventory` already returns the full row; no shape change beyond the new fields appearing.
- `GET /api/v1/inventory?status=sold` works as-is. The frontend renders the new columns.

## Frontend changes

### 1. Dealer dashboard home — KPI strip

File: `apps/web/src/app/dashboard/page.tsx`

Add a four-card strip at the top, above the existing content. Each card: large number, Hebrew label, contextual emoji icon. Mobile: 2x2 grid; sm+: 4-across.

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 🚗 12       │ 📦 47       │ 💰 ₪3.2M    │ 📈 ₪410K    │
│ במלאי       │ נמכרו        │ הכנסות       │ רווח 12.8%  │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

Above the strip: a small period toggle — "החודש / השנה / הכל". Default to "הכל". Selection persists in `localStorage`.

If `rows_missing_purchase_cost > 0`, render a small inline notice under the strip: "ל-N רכבים חסרה עלות קנייה — עדכן כדי לראות רווח אמיתי" with a link to `/dashboard/inventory?status=sold`.

### 2. Inventory form — purchase cost + warranty

File: `apps/web/src/components/InventoryFormDialog.tsx`

In the existing pricing section, add an optional **"עלות קנייה"** number field next to the b2b/b2c price inputs.

In a new collapsed disclosure ("פרטים נוספים — אחריות"), add:

- **"סוג אחריות"** select: `(ריק) | יצרן | סוחר | מורחבת | ללא`
- **"תוקף האחריות"** date input

Both optional; both stored on create + edit.

### 3. "Mark as sold" dialog

New file: `apps/web/src/components/SellVehicleDialog.tsx`

Trigger: a new "סמן כנמכר" button on each active vehicle card in `/dashboard/inventory`. The button only appears when `status === 'active'`.

Dialog contents:

- **מחיר מכירה** (number, required) — pre-filled with `b2b_price ?? b2c_price ?? price`
- **עלות קנייה** (number, optional) — pre-filled with existing `purchase_cost`, editable
- **לאיזה שוק נמכר** — radio group: `B2B | B2C | חיצוני`
- **רווח (מחושב)** — read-only display, updates in real time as the dealer types: `sale_price - purchase_cost` and `(diff / sale_price) * 100%`
- If a closed `Deal` exists for this vehicle: show "נמצאה עסקה ב-B2B עם מחיר ₪X — האם זה המחיר?" and offer a "השתמש במחיר מהעסקה" link.

Submit calls `POST /api/v1/inventory/{id}/sell`. On success: dialog closes, list refreshes, toast announces "הרכב סומן כנמכר".

A11y notes: this dialog follows the same hardened pattern from the InventoryFormDialog fix (explicit `dir="rtl"`, `w-screen h-[100dvh]`, dvh-based card heights).

### 4. Sold-vehicles columns

File: `apps/web/src/app/dashboard/inventory/page.tsx`

When the URL has `?status=sold`, render two extra cells per card: **תאריך מכירה** and **רווח (אם זמין)**. The "סמן כנמכר" button does not appear on sold cards (replaced with a "פרטי מכירה" disclosure that shows sale_price + purchase_cost + sold_to).

The existing tab nav already has the "נמכר" filter — no nav change.

## Linkage to existing `Deal` (B2B)

When a dealer marks a vehicle as sold via the new dialog and an associated `Deal` row already exists (status `closed`), the dialog pre-fills `sale_price` from `Deal.final_price` and pre-selects `sold_to = 'b2b'`. The dealer can override but the default removes manual re-entry for the marketplace path.

We do NOT auto-flip `inventory.status` to 'sold' when a `Deal` closes. The decision to mark sold remains in the dealer's hands — sometimes a deal closes pending paperwork, financing, or buyer pickup. Coupling the two would surprise dealers and can be added later if requested.

## Error handling

- 409 `inventory_not_active` when sell is called on a non-active row. UI shows "הרכב כבר סומן כנמכר".
- Validation: `sale_price > 0`, `purchase_cost >= 0` if supplied, `warranty_until` must be a valid date, `warranty_type` must be in the enum. All enforced server-side via Pydantic + DB CHECK; client-side via the form schema.
- Stats endpoint never errors on missing data — returns zeros and reports `rows_missing_purchase_cost` instead.

## Testing

Backend:

- Unit: `sell` happy path, 409 on already-sold, 403 on non-owner, profit calculation with and without purchase_cost.
- Stats: lifetime / month / year aggregations on a seeded dealer with mixed sold/active rows; verify `rows_missing_purchase_cost` count.
- Migration: up/down on a clean schema; verify CHECK constraints reject bad enum values.

Frontend:

- The KPI strip renders zero-state when no sales exist.
- The sell dialog calculates profit live as the dealer types.
- The sold-archive cards display sale columns.

## Rollout

Single migration + single backend deploy + single frontend deploy. No feature flag — the new fields are NULL-able and the new dialog is purely additive. Existing dealers see KPIs immediately, all showing zeros until they record their first sale.

## Open questions resolved

- Q: B2B Deal integration — auto-fill or fully manual? **A: Manual flow with smart pre-fill from Deal.** (User chose option B with hint enhancement.)
- Q: Warranty type — dropdown or free text? **A: Dropdown enum.** (User accepted recommendation.)
- Q: Warranty duration — DATE or months remaining? **A: DATE expiration.** (User accepted recommendation.)
