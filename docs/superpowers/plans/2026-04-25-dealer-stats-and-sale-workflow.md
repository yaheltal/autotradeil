# Dealer Stats + Sale Workflow + Warranty + Image Hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dealer-facing aggregate KPIs, manual sale closure with profit calc, optional purchase cost + warranty on inventory, auto-promote ID photo to profile image, and per-image hide/show.

**Architecture:** Pure additive change. New columns on `inventory` and `inventory_images`. Two new backend endpoints (`/sell`, `/stats`) and one new image-patch endpoint. Three new frontend components (`SellVehicleDialog`, `DealerStatsCards`, `WarrantyPanel`) plus modifications to existing `InventoryFormDialog`, `VehicleImagesDialog`, `dashboard/page.tsx`, and `dashboard/inventory/page.tsx`.

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.0 async, Alembic, Postgres (Supabase), Pydantic 2.10, Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Radix UI Dialog.

**a11y workflow note:** The repo enforces an a11y hook on all UI file edits (`globals.css`, `**/*.tsx`). For each frontend task, the executor MUST first delegate to `accessibility-agents:accessibility-lead` with the proposed change, apply any required modifications, then commit. The pattern is established — see Telegram session 2026-04-25 commits for examples.

**Spec:** `docs/superpowers/specs/2026-04-25-dealer-stats-and-sale-workflow-design.md`

---

## File Map

**Backend (create or modify):**

- Create: `apps/api/alembic/versions/<rev>_inventory_sale_warranty_image_hidden.py`
- Modify: `apps/api/app/models/inventory.py` — 6 new columns + CHECK constraints
- Modify: `apps/api/app/models/inventory_image.py` — `hidden` boolean
- Modify: `apps/api/app/schemas/inventory.py` — add fields, add `SellRequest`, `SellResponse`, `StatsResponse`, `ImagePatchRequest`
- Modify: `apps/api/app/routers/inventory.py` — add `/sell`, `/stats`, `PATCH /images/{image_id}`, extend create/update to accept new fields, update `_primary_image_url_for` to skip hidden

**Frontend (create or modify):**

- Create: `apps/web/src/components/SellVehicleDialog.tsx`
- Create: `apps/web/src/components/DealerStatsCards.tsx`
- Modify: `apps/web/src/components/InventoryFormDialog.tsx` — purchase_cost field, warranty disclosure, post-create image upload
- Modify: `apps/web/src/components/VehicleImagesDialog.tsx` — hide/show toggle per image
- Modify: `apps/web/src/app/dashboard/page.tsx` — mount `DealerStatsCards`
- Modify: `apps/web/src/app/dashboard/inventory/page.tsx` — sell button + sold-card sale columns

**Verification (no new files):** curl smoke tests + browser checks via the public ngrok URL.

---

## Task 1: DB migration scaffold

**Files:**

- Create: `apps/api/alembic/versions/abcd1234_inventory_sale_warranty_image_hidden.py` (rev id will be Alembic-generated)

- [ ] **Step 1: Generate the empty revision**

```bash
cd /Users/user/Desktop/autotradeil/apps/api
source venv/bin/activate
alembic revision -m "inventory sale warranty image hidden"
```

Expected: prints the path of the new file under `alembic/versions/`. Note the revision id.

- [ ] **Step 2: Confirm down_revision points to the current head**

Open the generated file. Verify `down_revision: Union[str, None] = "b5efe7fd8b8a"`. If not, set it.

- [ ] **Step 3: Write the upgrade body**

Replace the `def upgrade()` body with:

```python
def upgrade() -> None:
    # ----------------------------------------------------------
    # inventory — sale lifecycle + warranty
    # ----------------------------------------------------------
    op.add_column("inventory", sa.Column("purchase_cost", sa.Integer(), nullable=True))
    op.add_column("inventory", sa.Column("sale_price", sa.Integer(), nullable=True))
    op.add_column(
        "inventory",
        sa.Column("sold_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("inventory", sa.Column("sold_to", sa.String(20), nullable=True))
    op.add_column("inventory", sa.Column("warranty_type", sa.String(20), nullable=True))
    op.add_column("inventory", sa.Column("warranty_until", sa.Date(), nullable=True))

    op.create_check_constraint(
        "inventory_purchase_cost_nonneg",
        "inventory",
        "purchase_cost IS NULL OR purchase_cost >= 0",
    )
    op.create_check_constraint(
        "inventory_sale_price_nonneg",
        "inventory",
        "sale_price IS NULL OR sale_price >= 0",
    )
    op.create_check_constraint(
        "inventory_sold_to_check",
        "inventory",
        "sold_to IS NULL OR sold_to IN ('b2b', 'b2c', 'external')",
    )
    op.create_check_constraint(
        "inventory_warranty_type_check",
        "inventory",
        "warranty_type IS NULL OR warranty_type IN ('manufacturer', 'dealer', 'extended', 'none')",
    )
    op.create_index("idx_inventory_sold_at", "inventory", ["sold_at"])

    # ----------------------------------------------------------
    # inventory_images — hidden flag (per-image visibility toggle)
    # ----------------------------------------------------------
    op.add_column(
        "inventory_images",
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default="false"),
    )
```

- [ ] **Step 4: Write the downgrade body**

Replace the `def downgrade()` body with:

```python
def downgrade() -> None:
    op.drop_column("inventory_images", "hidden")
    op.drop_index("idx_inventory_sold_at", table_name="inventory")
    op.drop_constraint("inventory_warranty_type_check", "inventory", type_="check")
    op.drop_constraint("inventory_sold_to_check", "inventory", type_="check")
    op.drop_constraint("inventory_sale_price_nonneg", "inventory", type_="check")
    op.drop_constraint("inventory_purchase_cost_nonneg", "inventory", type_="check")
    op.drop_column("inventory", "warranty_until")
    op.drop_column("inventory", "warranty_type")
    op.drop_column("inventory", "sold_to")
    op.drop_column("inventory", "sold_at")
    op.drop_column("inventory", "sale_price")
    op.drop_column("inventory", "purchase_cost")
```

- [ ] **Step 5: Apply the migration**

```bash
alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade b5efe7fd8b8a -> <new>, inventory sale warranty image hidden`

- [ ] **Step 6: Verify schema**

```bash
alembic current
psql "$DATABASE_URL" -c "\d inventory" | grep -E "purchase_cost|sale_price|sold_at|sold_to|warranty"
psql "$DATABASE_URL" -c "\d inventory_images" | grep hidden
```

Expected: all 6 inventory columns + `hidden` on inventory_images.

- [ ] **Step 7: Commit**

```bash
git add apps/api/alembic/versions/<new_revision_file>.py
git commit -m "feat(db): add inventory sale + warranty cols + image hidden flag"
```

---

## Task 2: Update Inventory ORM model

**Files:**

- Modify: `apps/api/app/models/inventory.py`

- [ ] **Step 1: Add the columns to the model**

After the existing `pause_reason` column (around line 86), insert:

```python
    # ---- Phase 6.5: sale lifecycle ----
    purchase_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sale_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sold_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sold_to: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ---- Phase 6.5: warranty (optional) ----
    warranty_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)
```

- [ ] **Step 2: Add the imports**

At the top, ensure `Date` and `date` are imported:

```python
from datetime import date, datetime
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ...
)
```

- [ ] **Step 3: Add CHECK constraints to `__table_args__`**

Inside the `__table_args__` tuple, before the existing `Index(...)` entries, add:

```python
        CheckConstraint(
            "purchase_cost IS NULL OR purchase_cost >= 0",
            name="inventory_purchase_cost_nonneg",
        ),
        CheckConstraint(
            "sale_price IS NULL OR sale_price >= 0",
            name="inventory_sale_price_nonneg",
        ),
        CheckConstraint(
            "sold_to IS NULL OR sold_to IN ('b2b', 'b2c', 'external')",
            name="inventory_sold_to_check",
        ),
        CheckConstraint(
            "warranty_type IS NULL OR warranty_type IN ('manufacturer', 'dealer', 'extended', 'none')",
            name="inventory_warranty_type_check",
        ),
```

- [ ] **Step 4: Verify the model imports cleanly**

```bash
cd /Users/user/Desktop/autotradeil/apps/api
source venv/bin/activate
python -c "from app.models.inventory import Inventory; print(Inventory.__table__.columns.keys())"
```

Expected output includes: `purchase_cost, sale_price, sold_at, sold_to, warranty_type, warranty_until`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/models/inventory.py
git commit -m "feat(model): inventory sale + warranty columns"
```

---

## Task 3: Update InventoryImage ORM model

**Files:**

- Modify: `apps/api/app/models/inventory_image.py`

- [ ] **Step 1: Add the hidden column**

After `position` column (around line 29), insert:

```python
    hidden: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
```

- [ ] **Step 2: Add the import**

Ensure `Boolean` is in the SQLAlchemy import block:

```python
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Text, func
```

- [ ] **Step 3: Verify import**

```bash
python -c "from app.models.inventory_image import InventoryImage; print('hidden' in InventoryImage.__table__.columns.keys())"
```

Expected: `True`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/models/inventory_image.py
git commit -m "feat(model): inventory_image hidden flag"
```

---

## Task 4: Update inventory schemas

**Files:**

- Modify: `apps/api/app/schemas/inventory.py`

- [ ] **Step 1: Add new optional fields to `InventoryItemCreate`**

After the existing `notes` field, insert:

```python
    purchase_cost: int | None = Field(default=None, ge=0)
    warranty_type: str | None = Field(
        default=None, pattern="^(manufacturer|dealer|extended|none)$"
    )
    warranty_until: date | None = Field(default=None)
```

- [ ] **Step 2: Add the same fields to `InventoryItemUpdate`**

After the existing `b2c_price` field:

```python
    purchase_cost: int | None = Field(default=None, ge=0)
    warranty_type: str | None = Field(
        default=None, pattern="^(manufacturer|dealer|extended|none)$"
    )
    warranty_until: date | None = Field(default=None)
```

- [ ] **Step 3: Add output fields to `InventoryItemResponse`**

After `pause_reason`, insert:

```python
    purchase_cost: int | None
    sale_price: int | None
    sold_at: datetime | None
    sold_to: str | None
    warranty_type: str | None
    warranty_until: date | None
```

- [ ] **Step 4: Add new schemas at the end of the file**

```python
class SellRequest(BaseModel):
    sale_price: int = Field(gt=0)
    purchase_cost: int | None = Field(default=None, ge=0)
    sold_to: str = Field(pattern="^(b2b|b2c|external)$")
    sold_at: datetime | None = Field(default=None)


class SellWarning(BaseModel):
    deal_price_mismatch: dict[str, int] | None = None


class SellResponse(BaseModel):
    inventory: InventoryItemResponse
    warnings: SellWarning | None = None


class StatsResponse(BaseModel):
    period: str
    active_count: int
    sold_count: int
    total_revenue: int
    total_profit: int
    profit_margin_pct: float
    avg_days_to_sell: int | None
    rows_missing_purchase_cost: int


class ImagePatchRequest(BaseModel):
    hidden: bool
```

- [ ] **Step 5: Add `date` to imports**

Top of file:

```python
from datetime import date, datetime
```

- [ ] **Step 6: Verify imports**

```bash
python -c "from app.schemas.inventory import SellRequest, StatsResponse, ImagePatchRequest, SellResponse; print('ok')"
```

Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/schemas/inventory.py
git commit -m "feat(schema): inventory sell, stats, image-patch schemas"
```

---

## Task 5: Update inventory create/update routers to accept new fields

**Files:**

- Modify: `apps/api/app/routers/inventory.py`

- [ ] **Step 1: Find the `create_item` handler**

Search for `async def create_item` and the line `item = Inventory(`. The constructor call needs the three new optional fields.

- [ ] **Step 2: Add to the create constructor**

After the existing fields in the `Inventory(...)` constructor, add:

```python
        purchase_cost=payload.purchase_cost,
        warranty_type=payload.warranty_type,
        warranty_until=payload.warranty_until,
```

- [ ] **Step 3: Find the `update_item` handler**

Search for `async def update_item`. After existing field updates, add:

```python
    if payload.purchase_cost is not None:
        item.purchase_cost = payload.purchase_cost
    if payload.warranty_type is not None:
        item.warranty_type = payload.warranty_type
    if payload.warranty_until is not None:
        item.warranty_until = payload.warranty_until
```

- [ ] **Step 4: Restart API and verify response includes new fields**

```bash
pkill -f "uvicorn app.main"; sleep 1
cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &
sleep 3
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import json, sys
spec = json.load(sys.stdin)
schema = spec['components']['schemas']['InventoryItemCreate']
props = schema['properties'].keys()
assert 'purchase_cost' in props, 'missing purchase_cost'
assert 'warranty_type' in props, 'missing warranty_type'
assert 'warranty_until' in props, 'missing warranty_until'
print('OK — create accepts new fields')
"
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/routers/inventory.py
git commit -m "feat(api): accept purchase_cost + warranty on create/update"
```

---

## Task 6: Add POST /inventory/{id}/sell endpoint

**Files:**

- Modify: `apps/api/app/routers/inventory.py`

- [ ] **Step 1: Add the import for new schemas at top of file**

Find the `from app.schemas.inventory import` block and add `SellRequest, SellResponse, SellWarning`:

```python
from app.schemas.inventory import (
    InventoryImageResponse,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryListResponse,
    SellRequest,
    SellResponse,
    SellWarning,
)
```

(Adjust to match the actual existing import shape.)

- [ ] **Step 2: Append the sell endpoint**

Add after the existing `unpause` endpoint (search for `@router.post("/{item_id}/unpause"`):

```python
@router.post("/{inventory_id}/sell", response_model=SellResponse)
async def sell_item(
    inventory_id: uuid.UUID,
    payload: SellRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SellResponse:
    """Mark an active inventory row as sold.

    Captures sale_price, optional purchase_cost, the destination market
    (b2b/b2c/external), and timestamp. If a closed B2B Deal exists for
    this inventory and the supplied price differs, returns a warning."""
    from datetime import datetime, timezone as _tz

    user, dealer = ud
    item = await db.get(Inventory, inventory_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="רכב לא נמצא"
        )
    if item.dealer_id != dealer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה"
        )
    if item.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="הרכב כבר סומן כנמכר או מוסתר",
        )

    item.status = "sold"
    item.sale_price = payload.sale_price
    item.sold_at = payload.sold_at or datetime.now(tz=_tz.utc)
    item.sold_to = payload.sold_to
    if payload.purchase_cost is not None:
        item.purchase_cost = payload.purchase_cost

    # B2B Deal cross-check (warn-only)
    warnings: SellWarning | None = None
    if payload.sold_to == "b2b":
        from app.models import Deal

        deal = (
            await db.execute(
                select(Deal).where(Deal.inventory_id == inventory_id).limit(1)
            )
        ).scalar_one_or_none()
        if deal is not None and deal.final_price != payload.sale_price:
            warnings = SellWarning(
                deal_price_mismatch={
                    "deal_final_price": deal.final_price,
                    "supplied_sale_price": payload.sale_price,
                }
            )

    await emit_event(
        db,
        event_type="inventory.sold",
        aggregate_type="inventory",
        aggregate_id=item.id,
        payload={
            "sale_price": payload.sale_price,
            "purchase_cost": item.purchase_cost,
            "sold_to": payload.sold_to,
        },
        actor_user_id=user.id,
    )
    await db.commit()
    await db.refresh(item)

    return SellResponse(
        inventory=InventoryItemResponse.model_validate(item), warnings=warnings
    )
```

- [ ] **Step 3: Verify imports — ensure `emit_event` is imported**

If not already present at top of router:

```python
from app.core.events import emit_event
```

- [ ] **Step 4: Hot-reload and smoke test**

The dev uvicorn (without `--reload`) needs restart:

```bash
pkill -f "uvicorn app.main"; sleep 1
cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &
sleep 3
# Without auth → expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8000/api/v1/inventory/00000000-0000-0000-0000-000000000000/sell -H "Content-Type: application/json" -d '{"sale_price":1,"sold_to":"b2c"}'
```

Expected: `401`.

- [ ] **Step 5: Verify endpoint appears in OpenAPI**

```bash
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import json, sys
paths = json.load(sys.stdin)['paths']
assert '/api/v1/inventory/{inventory_id}/sell' in paths, 'sell endpoint missing'
print('OK')"
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/routers/inventory.py
git commit -m "feat(api): POST /inventory/{id}/sell — close manual sale"
```

---

## Task 7: Add GET /inventory/stats endpoint

**Files:**

- Modify: `apps/api/app/routers/inventory.py`

- [ ] **Step 1: Add import for StatsResponse**

In the existing `from app.schemas.inventory import` block, add `StatsResponse`.

- [ ] **Step 2: Append the stats endpoint**

After the `sell_item` handler:

```python
@router.get("/stats", response_model=StatsResponse)
async def inventory_stats(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = Query(default="lifetime", pattern="^(lifetime|year|month)$"),
) -> StatsResponse:
    """Per-dealer rollup: active count, sold count, revenue, profit, margin,
    avg days to sell, and how many sold rows lack purchase_cost."""
    from datetime import datetime, timedelta, timezone as _tz

    _, dealer = ud
    now = datetime.now(tz=_tz.utc)
    if period == "month":
        since = now - timedelta(days=30)
    elif period == "year":
        since = now - timedelta(days=365)
    else:
        since = None  # lifetime

    # Active count — all-time, not period-bounded (active is current state)
    active_count = (
        await db.execute(
            select(func.count())
            .select_from(Inventory)
            .where(Inventory.dealer_id == dealer.id, Inventory.status == "active")
        )
    ).scalar_one()

    # Sold rows — period-bounded
    sold_conds = [Inventory.dealer_id == dealer.id, Inventory.status == "sold"]
    if since is not None:
        sold_conds.append(Inventory.sold_at >= since)

    sold_rows = (
        (
            await db.execute(
                select(
                    Inventory.sale_price,
                    Inventory.purchase_cost,
                    Inventory.sold_at,
                    Inventory.created_at,
                ).where(*sold_conds)
            )
        )
        .all()
    )

    sold_count = len(sold_rows)
    total_revenue = sum(int(r.sale_price or 0) for r in sold_rows)
    profit_rows = [
        int(r.sale_price) - int(r.purchase_cost)
        for r in sold_rows
        if r.sale_price is not None and r.purchase_cost is not None
    ]
    total_profit = sum(profit_rows)
    rows_missing_purchase_cost = sum(
        1 for r in sold_rows if r.sale_price is not None and r.purchase_cost is None
    )

    profit_margin_pct = (
        round((total_profit / total_revenue) * 100, 1) if total_revenue > 0 else 0.0
    )

    days_list = [
        (r.sold_at - r.created_at).days
        for r in sold_rows
        if r.sold_at is not None and r.created_at is not None
    ]
    avg_days_to_sell = (
        int(round(sum(days_list) / len(days_list))) if days_list else None
    )

    return StatsResponse(
        period=period,
        active_count=active_count,
        sold_count=sold_count,
        total_revenue=total_revenue,
        total_profit=total_profit,
        profit_margin_pct=profit_margin_pct,
        avg_days_to_sell=avg_days_to_sell,
        rows_missing_purchase_cost=rows_missing_purchase_cost,
    )
```

- [ ] **Step 3: Restart API and smoke test**

```bash
pkill -f "uvicorn app.main"; sleep 1
cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8000/api/v1/inventory/stats?period=lifetime"
```

Expected: `401` (no auth).

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/routers/inventory.py
git commit -m "feat(api): GET /inventory/stats — dealer KPI rollup"
```

---

## Task 8: Image hide/show — backend

**Files:**

- Modify: `apps/api/app/routers/inventory.py`

- [ ] **Step 1: Add the patch endpoint**

After the existing image-delete endpoint (search for `async def delete_image`):

```python
@router.patch("/{inventory_id}/images/{image_id}")
async def patch_image(
    inventory_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: ImagePatchRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    """Toggle a specific image's `hidden` flag. Owner-only."""
    _, dealer = ud
    img = await db.get(InventoryImage, image_id)
    if img is None or img.inventory_id != inventory_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="התמונה לא נמצאה"
        )
    if img.dealer_id != dealer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה"
        )
    img.hidden = bool(payload.hidden)
    await db.commit()
    return {"hidden": img.hidden}
```

- [ ] **Step 2: Update `_primary_image_url_for` to skip hidden**

Find the function (around line 96-107). Modify the `where` clause:

```python
async def _primary_image_url_for(
    inventory_id: uuid.UUID, db: AsyncSession
) -> str | None:
    row = (
        await db.execute(
            select(InventoryImage.url)
            .where(
                InventoryImage.inventory_id == inventory_id,
                InventoryImage.hidden.is_(False),
            )
            .order_by(InventoryImage.position)
            .limit(1)
        )
    ).scalar_one_or_none()
    return row
```

- [ ] **Step 3: Update `_primary_images_bulk` similarly**

Find this helper in `apps/api/app/routers/marketplace.py`. Add the hidden filter to the `inner` subquery `.where(...)`:

```python
.where(
    InventoryImage.inventory_id.in_(inventory_ids),
    InventoryImage.hidden.is_(False),
)
```

- [ ] **Step 4: Update images list endpoint to filter for non-owners**

Find `@router.get("/{inventory_id}/images")` in inventory.py. Add ownership check + hidden filter:

```python
@router.get("/{inventory_id}/images")
async def list_images(
    inventory_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    _, dealer = ud
    item = await db.get(Inventory, inventory_id)
    if item is None:
        raise HTTPException(status_code=404, detail="לא נמצא")

    is_owner = item.dealer_id == dealer.id
    stmt = select(InventoryImage).where(InventoryImage.inventory_id == inventory_id)
    if not is_owner:
        stmt = stmt.where(InventoryImage.hidden.is_(False))
    stmt = stmt.order_by(InventoryImage.position)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {"id": str(r.id), "url": r.url, "position": r.position, "hidden": r.hidden}
        for r in rows
    ]
```

(Adapt the existing handler shape — the project may already return a richer response; preserve the existing shape and add `hidden` to it.)

- [ ] **Step 5: Add ImagePatchRequest to import**

Add to the existing `from app.schemas.inventory import` block.

- [ ] **Step 6: Restart, smoke test**

```bash
pkill -f "uvicorn app.main"; sleep 1
cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &
sleep 3
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import json, sys
paths = json.load(sys.stdin)['paths']
key = '/api/v1/inventory/{inventory_id}/images/{image_id}'
assert key in paths and 'patch' in paths[key], 'patch missing'
print('OK')"
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/routers/inventory.py apps/api/app/routers/marketplace.py
git commit -m "feat(api): per-image hide/show + filter for non-owners"
```

---

## Task 9: Frontend — purchase_cost + warranty in InventoryFormDialog

**Files:**

- Modify: `apps/web/src/components/InventoryFormDialog.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

Submit the proposed change (purchase_cost number input next to the existing b2b/b2c price section, a new collapsible disclosure for warranty with a select + date input) to `accessibility-agents:accessibility-lead`. Note that all new inputs need `<label>` association, the disclosure follows the existing pattern with `aria-expanded` and `aria-controls`, and the date input uses `<input type="date">` (native browser).

- [ ] **Step 2: Apply lead's required changes**

Per a11y feedback, adjust labels, describedby, and disclosure markup before editing.

- [ ] **Step 3: Add fields to the zod schema**

Find the `schema` const and add to the object:

```typescript
  purchase_cost: z.string().optional(),
  warranty_type: z
    .enum(["", "manufacturer", "dealer", "extended", "none"])
    .optional(),
  warranty_until: z.string().optional(),
```

- [ ] **Step 4: Add to `InventoryPayload` type**

```typescript
export type InventoryPayload = {
  // ... existing fields
  purchase_cost: number | null;
  warranty_type: "manufacturer" | "dealer" | "extended" | "none" | null;
  warranty_until: string | null; // ISO date YYYY-MM-DD
};
```

- [ ] **Step 5: Render the purchase_cost input**

Find the b2b_price/b2c_price section and add a sibling field labelled "עלות קנייה (אופציונלי)". Use the existing `FormField` component pattern.

- [ ] **Step 6: Render the warranty disclosure**

Add a new collapsible section using the existing disclosure pattern (look at panelPlate / panelImage), titled "פרטי אחריות (אופציונלי)" containing:

- A `<select>` for `warranty_type` with options: `""` (label: "ללא בחירה"), `"manufacturer"` (יצרן), `"dealer"` (סוחר), `"extended"` (מורחבת), `"none"` (ללא אחריות).
- A `<input type="date">` for `warranty_until`.

- [ ] **Step 7: Map values in `submit`**

In the `handleSubmit` body, add to `payload`:

```typescript
purchase_cost: values.purchase_cost ? parseInt(values.purchase_cost, 10) : null,
warranty_type:
  values.warranty_type && values.warranty_type !== ""
    ? values.warranty_type
    : null,
warranty_until: values.warranty_until || null,
```

- [ ] **Step 8: Verify the build is clean**

```bash
tail -20 /tmp/autotradeil-web.log | grep -iE "error|failed" || echo "no errors"
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/InventoryFormDialog.tsx
git commit -m "feat(ui): purchase_cost + warranty fields in inventory form"
```

---

## Task 10: Frontend — auto-attach ID photo as profile image after create

**Files:**

- Modify: `apps/web/src/components/InventoryFormDialog.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

The change: after `await onSubmit(payload)` succeeds in create mode, if `imgFile` is set, POST it to `/api/v1/inventory/{id}/images`. Surface a non-blocking polite live-region toast on success/failure. Ask the lead to confirm the toast pattern matches the existing `toast` mechanism in `dashboard/inventory/page.tsx`.

- [ ] **Step 2: Modify `onSubmit` prop signature in `Props`**

Currently `onSubmit: (payload: InventoryPayload) => Promise<void>`. Change to return the created item id:

```typescript
onSubmit: (payload: InventoryPayload) => Promise<{ id: string } | void>;
```

- [ ] **Step 3: Update the create call site in `apps/web/src/app/dashboard/inventory/page.tsx`**

Make `onSubmit` return the API response in create mode so the dialog can use `id`. Find the `onSubmit={async (payload) => { ... }}` prop on `<InventoryFormDialog>` and adjust to:

```typescript
onSubmit={async (payload) => {
  if (formMode === "create") {
    const created = await apiFetch<{ id: string }>("/api/v1/inventory", {
      method: "POST",
      body: JSON.stringify(payload),
      token,
    });
    await refetch();
    setToast("הרכב נוסף ✓");
    return created;
  } else {
    await apiFetch(`/api/v1/inventory/${editingId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
      token,
    });
    await refetch();
    setToast("הרכב עודכן ✓");
  }
}}
```

(Adapt to the actual existing handler.)

- [ ] **Step 4: After-submit image upload in InventoryFormDialog**

In the dialog's `submit` handler, replace `await onSubmit(payload); onOpenChange(false); ...` with:

```typescript
const created = await onSubmit(payload);
// In create mode, if the dealer used image lookup, save that photo as
// the vehicle's primary image (best-effort).
if (mode === "create" && created?.id && imgFile && token) {
  try {
    const form = new FormData();
    form.append("file", imgFile);
    form.append("position", "0");
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/inventory/${created.id}/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    // Non-fatal — vehicle was created, dealer can upload images later.
  }
}
onOpenChange(false);
reset(toFormValues(null));
```

- [ ] **Step 5: Smoke test in browser**

In the public ngrok URL, log in as a dealer, click "הוסף רכב", upload an image via the image lookup, fill required fields, submit. Verify the new card shows the image as primary (no "no image" placeholder).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/InventoryFormDialog.tsx apps/web/src/app/dashboard/inventory/page.tsx
git commit -m "feat(ui): auto-attach ID photo as inventory primary image"
```

---

## Task 11: Frontend — SellVehicleDialog component

**Files:**

- Create: `apps/web/src/components/SellVehicleDialog.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

Submit the proposed component for review. Pattern: Radix Dialog with `dir="rtl"`, `w-screen h-[100dvh]`, dvh-based card heights — mirrors the hardened InventoryFormDialog. Form fields: number input for sale_price (required, prefilled with b2b_price ?? b2c_price ?? price), number input for purchase_cost (optional, prefilled), radio group for sold_to (b2b/b2c/external), readonly profit display that recomputes on input via `useMemo`.

- [ ] **Step 2: Apply a11y feedback, then create the file**

```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  b2b_price: number | null;
  b2c_price: number | null;
  purchase_cost: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  token: string;
  onSold: () => void;
};

export function SellVehicleDialog({ open, onOpenChange, vehicle, token, onSold }: Props) {
  const defaultSale = vehicle.b2b_price ?? vehicle.b2c_price ?? vehicle.price ?? 0;
  const [salePrice, setSalePrice] = useState<string>(String(defaultSale));
  const [purchaseCost, setPurchaseCost] = useState<string>(
    vehicle.purchase_cost != null ? String(vehicle.purchase_cost) : "",
  );
  const [soldTo, setSoldTo] = useState<"b2b" | "b2c" | "external">("b2c");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSalePrice(String(defaultSale));
      setPurchaseCost(vehicle.purchase_cost != null ? String(vehicle.purchase_cost) : "");
      setSoldTo("b2c");
      setError(null);
    }
  }, [open, defaultSale, vehicle.purchase_cost]);

  const profit = useMemo(() => {
    const sp = parseInt(salePrice, 10);
    const pc = parseInt(purchaseCost, 10);
    if (Number.isNaN(sp) || Number.isNaN(pc)) return null;
    return { abs: sp - pc, pct: sp > 0 ? ((sp - pc) / sp) * 100 : 0 };
  }, [salePrice, purchaseCost]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const sp = parseInt(salePrice, 10);
    if (!sp || sp <= 0) {
      setError("מחיר מכירה חייב להיות מספר חיובי");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/v1/inventory/${vehicle.id}/sell`, {
        method: "POST",
        body: JSON.stringify({
          sale_price: sp,
          purchase_cost: purchaseCost ? parseInt(purchaseCost, 10) : undefined,
          sold_to: soldTo,
        }),
        token,
      });
      onSold();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בסגירת המכירה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <Dialog.Content
          aria-describedby="sell-desc"
          dir="rtl"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <Dialog.Title className="text-brand-navy text-lg font-bold">
              סימון רכב כנמכר
            </Dialog.Title>
            <Dialog.Description id="sell-desc" className="text-brand-ink/70 mt-1 text-sm">
              {vehicle.make} {vehicle.model} {vehicle.year}
            </Dialog.Description>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="sell-price"
                  className="text-brand-ink mb-1 block text-sm font-semibold"
                >
                  מחיר מכירה (₪)
                </label>
                <input
                  id="sell-price"
                  type="number"
                  inputMode="numeric"
                  required
                  min={1}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="border-brand-navy/20 focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              <div>
                <label
                  htmlFor="sell-cost"
                  className="text-brand-ink mb-1 block text-sm font-semibold"
                >
                  עלות קנייה (₪) — אופציונלי
                </label>
                <input
                  id="sell-cost"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  className="border-brand-navy/20 focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              <fieldset>
                <legend className="text-brand-ink mb-2 block text-sm font-semibold">
                  לאיזה שוק נמכר
                </legend>
                <div className="flex gap-3">
                  {(["b2b", "b2c", "external"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="sold_to"
                        value={v}
                        checked={soldTo === v}
                        onChange={() => setSoldTo(v)}
                      />
                      {v === "b2b" ? "סוחרים (B2B)" : v === "b2c" ? "פרטי (B2C)" : "חיצוני"}
                    </label>
                  ))}
                </div>
              </fieldset>

              {profit ? (
                <div role="status" aria-live="polite" className="bg-brand-navy/5 rounded-md p-3">
                  <p className="text-brand-ink text-sm">
                    רווח: <strong>{formatPrice(profit.abs)}</strong> ({profit.pct.toFixed(1)}%)
                  </p>
                </div>
              ) : (
                <p className="text-brand-ink/60 text-sm">הזן עלות קנייה כדי לראות רווח</p>
              )}

              {error ? (
                <p
                  role="alert"
                  className="text-danger-text bg-danger-bg rounded-md px-3 py-2 text-sm"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close className="text-brand-navy hover:bg-brand-navy/5 inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-semibold">
                  ביטול
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 inline-flex min-h-11 items-center rounded-md px-5 py-2 text-sm font-semibold disabled:opacity-70"
                >
                  {busy ? "סוגר…" : "סגור מכירה"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 3: Verify the file compiles**

Watch `/tmp/autotradeil-web.log` for the Next.js HMR. Hit any dashboard page to trigger a recompile.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SellVehicleDialog.tsx
git commit -m "feat(ui): SellVehicleDialog — mark vehicle sold + profit calc"
```

---

## Task 12: Wire Sell button into dashboard/inventory

**Files:**

- Modify: `apps/web/src/app/dashboard/inventory/page.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

Adding a button to each active card. Confirm with lead the button's `aria-label` includes the vehicle make/model/year for context, and that the dialog's open/close cycle returns focus to the triggering button on dismiss.

- [ ] **Step 2: Add SellVehicleDialog import**

```typescript
import { SellVehicleDialog } from "@/components/SellVehicleDialog";
```

- [ ] **Step 3: Add state**

Near the other dialog state (around line 96):

```typescript
const [sellOpen, setSellOpen] = useState(false);
const [sellVehicle, setSellVehicle] = useState<Item | null>(null);
```

- [ ] **Step 4: Add the trigger button on each ACTIVE card**

In the per-card action group (find where edit/delete buttons live), add:

```tsx
{
  item.status === "active" ? (
    <button
      type="button"
      onClick={() => {
        setSellVehicle(item);
        setSellOpen(true);
      }}
      aria-label={`סמן כנמכר: ${item.make} ${item.model} ${item.year}`}
      className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md border bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      סמן כנמכר
    </button>
  ) : null;
}
```

- [ ] **Step 5: Mount the dialog**

After other dialogs at the bottom of the JSX:

```tsx
{
  sellVehicle ? (
    <SellVehicleDialog
      open={sellOpen}
      onOpenChange={setSellOpen}
      vehicle={sellVehicle}
      token={token!}
      onSold={() => {
        setToast("הרכב סומן כנמכר ✓");
        void refetch();
      }}
    />
  ) : null;
}
```

- [ ] **Step 6: Browser smoke test**

In the public URL, mark a vehicle as sold. Verify it disappears from "פעיל" filter and appears in "נמכר".

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/inventory/page.tsx
git commit -m "feat(ui): wire SellVehicleDialog into inventory list"
```

---

## Task 13: DealerStatsCards component

**Files:**

- Create: `apps/web/src/components/DealerStatsCards.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

Pattern: a `<section aria-labelledby="kpi-heading">` with an `<h2 class="sr-only">`, a `<dl>` of 4 stat tiles (each a `<div>` with `<dt>` label + `<dd>` value), and a period-toggle radiogroup above. Numbers use `formatPrice` for NIS and `toLocaleString("he-IL")` for counts. Confirm the `<dl>/dt/dd` structure is right for this kind of metric grouping.

- [ ] **Step 2: Apply a11y feedback, then create**

```tsx
"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

type Period = "lifetime" | "year" | "month";

type Stats = {
  period: Period;
  active_count: number;
  sold_count: number;
  total_revenue: number;
  total_profit: number;
  profit_margin_pct: number;
  avg_days_to_sell: number | null;
  rows_missing_purchase_cost: number;
};

const STORAGE_KEY = "autotradeil:dealer-stats-period";

export function DealerStatsCards({ token }: { token: string }) {
  const [period, setPeriod] = useState<Period>("lifetime");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = (
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    ) as Period | null;
    if (stored === "lifetime" || stored === "year" || stored === "month") {
      setPeriod(stored);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Stats>(`/api/v1/inventory/stats?period=${period}`, { token })
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "שגיאה");
      });
    return () => {
      cancelled = true;
    };
  }, [period, token]);

  const onPeriodChange = (p: Period) => {
    setPeriod(p);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, p);
    }
  };

  return (
    <section aria-labelledby="kpi-heading" className="mt-6">
      <h2 id="kpi-heading" className="sr-only">
        סטטיסטיקות מלאי ומכירות
      </h2>

      <div
        role="radiogroup"
        aria-label="טווח זמן"
        className="border-brand-navy/10 mb-3 inline-flex rounded-md border bg-white p-1"
      >
        {(
          [
            ["month", "החודש"],
            ["year", "השנה"],
            ["lifetime", "הכל"],
          ] as const
        ).map(([p, label]) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            onClick={() => onPeriodChange(p)}
            className={[
              "min-h-9 rounded-md px-3 py-1 text-sm font-semibold",
              "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
              period === p
                ? "bg-brand-navy text-brand-cream"
                : "text-brand-ink/70 hover:bg-brand-navy/5",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="bg-danger-bg text-danger-text rounded-md px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          label="במלאי"
          value={stats ? stats.active_count.toLocaleString("he-IL") : "—"}
          icon="🚗"
        />
        <Card
          label="נמכרו"
          value={stats ? stats.sold_count.toLocaleString("he-IL") : "—"}
          icon="📦"
        />
        <Card label="הכנסות" value={stats ? formatPrice(stats.total_revenue) : "—"} icon="💰" />
        <Card
          label={stats ? `רווח (${stats.profit_margin_pct}%)` : "רווח"}
          value={stats ? formatPrice(stats.total_profit) : "—"}
          icon="📈"
        />
      </dl>

      {stats && stats.rows_missing_purchase_cost > 0 ? (
        <p className="text-brand-ink/70 mt-3 text-sm">
          ל-{stats.rows_missing_purchase_cost} רכבים שנמכרו חסרה עלות קנייה — עדכן ב{" "}
          <a className="text-brand-navy underline" href="/dashboard/inventory?status=sold">
            דף הרכבים שנמכרו
          </a>
          .
        </p>
      ) : null}
    </section>
  );
}

function Card({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="border-brand-navy/10 rounded-lg border bg-white p-4">
      <dt className="text-brand-ink/70 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="text-brand-navy mt-1 text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/DealerStatsCards.tsx
git commit -m "feat(ui): DealerStatsCards — KPI tiles + period toggle"
```

---

## Task 14: Mount DealerStatsCards on dealer dashboard

**Files:**

- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

Confirm placement above the existing greeting/profile content does not disrupt the page's heading hierarchy. The KPI section uses `<h2 class="sr-only">` so it sits beneath the page `<h1>` cleanly.

- [ ] **Step 2: Import the component**

```typescript
import { DealerStatsCards } from "@/components/DealerStatsCards";
```

- [ ] **Step 3: Mount it**

In the JSX, after the `<h1>` greeting and BEFORE the profile/dl, insert:

```tsx
{
  token ? <DealerStatsCards token={token} /> : null;
}
```

- [ ] **Step 4: Browser smoke test**

Reload the dashboard. Verify the four KPI tiles appear and load real numbers (will mostly be zeros until real sales exist).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat(ui): mount DealerStatsCards on dealer dashboard"
```

---

## Task 15: Sold-archive card columns

**Files:**

- Modify: `apps/web/src/app/dashboard/inventory/page.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

Adding two `<dd>` rows to existing card markup (sale_date, profit) when `item.status === 'sold'`. No new interactive elements. Lead reviews label clarity.

- [ ] **Step 2: Render sale info on sold cards**

In the per-card markup, after the existing price/mileage rows, add:

```tsx
{
  item.status === "sold" && item.sold_at ? (
    <>
      <div className="text-brand-ink/70 text-sm">
        תאריך מכירה: {new Date(item.sold_at).toLocaleDateString("he-IL")}
      </div>
      {item.sale_price != null && item.purchase_cost != null ? (
        <div className="text-brand-ink/70 text-sm">
          רווח: {formatPrice(item.sale_price - item.purchase_cost)} (
          {(((item.sale_price - item.purchase_cost) / item.sale_price) * 100).toFixed(1)}%)
        </div>
      ) : item.sale_price != null ? (
        <div className="text-brand-ink/70 text-sm">
          מחיר מכירה: {formatPrice(item.sale_price)} — חסרה עלות קנייה לחישוב רווח
        </div>
      ) : null}
    </>
  ) : null;
}
```

- [ ] **Step 3: Update the `Item` type to include the new fields**

Find the existing `type Item = {...}` and add:

```typescript
purchase_cost: number | null;
sale_price: number | null;
sold_at: string | null;
sold_to: "b2b" | "b2c" | "external" | null;
warranty_type: "manufacturer" | "dealer" | "extended" | "none" | null;
warranty_until: string | null;
```

- [ ] **Step 4: Browser smoke test on a sold vehicle**

Mark a vehicle as sold (with purchase_cost), navigate to "נמכר" tab, verify date + profit show.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/inventory/page.tsx
git commit -m "feat(ui): sold-archive card shows sale date + profit"
```

---

## Task 16: VehicleImagesDialog — hide/show toggle

**Files:**

- Modify: `apps/web/src/components/VehicleImagesDialog.tsx`

- [ ] **Step 1: Delegate to accessibility-lead**

Adding a toggle button per image. Pattern question: button with `aria-pressed={hidden}` and label that swaps between "הסתר תמונה" / "הצג תמונה". Confirm pressed-state semantics fit better than two distinct buttons.

- [ ] **Step 2: Add per-image hidden state in the component**

The component already fetches the images list. Extend the type to include `hidden: boolean`, and add a handler:

```typescript
const toggleHidden = async (imageId: string, currentHidden: boolean) => {
  await apiFetch(`/api/v1/inventory/${vehicle.id}/images/${imageId}`, {
    method: "PATCH",
    body: JSON.stringify({ hidden: !currentHidden }),
    token,
  });
  await refetchImages();
};
```

- [ ] **Step 3: Render the toggle button on each image row**

Inside the per-image card markup, alongside the existing delete button:

```tsx
<button
  type="button"
  onClick={() => void toggleHidden(img.id, img.hidden)}
  aria-pressed={img.hidden}
  aria-label={img.hidden ? `הצג תמונה ${img.position + 1}` : `הסתר תמונה ${img.position + 1}`}
  className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 inline-flex min-h-9 items-center rounded-md border bg-white px-3 py-1 text-xs"
>
  {img.hidden ? "הצג" : "הסתר"}
</button>
```

- [ ] **Step 4: Visually mark hidden images in the dealer's view**

Add a class on the image wrapper when `img.hidden`: `opacity-50` plus a small "מוסתר" badge.

- [ ] **Step 5: Browser smoke test**

Open VehicleImagesDialog for a vehicle with multiple images. Hide one. Refresh marketplace search — confirm hidden image is not used as the card's primary image.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/VehicleImagesDialog.tsx
git commit -m "feat(ui): per-image hide/show toggle in VehicleImagesDialog"
```

---

## Task 17: End-to-end smoke verification

**Files:** none (manual verification)

- [ ] **Step 1: Restart the stack cleanly**

```bash
pkill -f "uvicorn app.main"; pkill -f "next dev"; pkill -f "next-server"; sleep 2
cd /Users/user/Desktop/autotradeil/apps/api && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/autotradeil-api.log 2>&1 &
cd /Users/user/Desktop/autotradeil/apps/web && nohup pnpm dev > /tmp/autotradeil-web.log 2>&1 &
sleep 5
```

- [ ] **Step 2: Verify all new endpoints are in OpenAPI**

```bash
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import json, sys
paths = set(json.load(sys.stdin)['paths'].keys())
must = [
  '/api/v1/inventory/{inventory_id}/sell',
  '/api/v1/inventory/stats',
  '/api/v1/inventory/{inventory_id}/images/{image_id}',
]
for p in must:
    assert p in paths, f'MISSING: {p}'
print('all 3 endpoints registered')
"
```

- [ ] **Step 3: Browser walk-through (use the public ngrok URL)**

In Safari/Chrome on phone or desktop:

1. Log in as a verified dealer.
2. `/dashboard` — confirm 4 KPI tiles appear with real data (likely zeros initially).
3. `/dashboard/inventory` — click "הוסף רכב". Use image lookup → fill form → enter purchase_cost → expand warranty disclosure → set type + date → submit. Confirm new card appears with the uploaded image as primary.
4. On that card, click "סמן כנמכר". Enter sale price. Profit displays live. Pick "B2C". Submit. Card moves to "נמכר" tab.
5. In "נמכר" tab, confirm sale date + profit show.
6. `/dashboard` reload — confirm KPI tiles updated (sold +1, revenue + sale_price, profit +(sp-pc)).
7. Open VehicleImagesDialog on any vehicle with multiple images. Click "הסתר" on one image. Confirm marketplace card uses a different primary image.

- [ ] **Step 4: Final commit if any tweaks were needed**

```bash
git status
# Address any remaining issues, commit, then:
git log --oneline -20
```

---

## Spec Coverage Check

| Spec section                                                                                | Tasks    |
| ------------------------------------------------------------------------------------------- | -------- |
| inventory cols (purchase_cost, sale_price, sold_at, sold_to, warranty_type, warranty_until) | 1, 2     |
| migration                                                                                   | 1        |
| POST /sell endpoint                                                                         | 6        |
| GET /stats endpoint                                                                         | 7        |
| Existing endpoints accept new fields                                                        | 4, 5     |
| Dashboard KPI strip                                                                         | 13, 14   |
| Inventory form purchase_cost + warranty                                                     | 9        |
| SellVehicleDialog                                                                           | 11       |
| Sell button on inventory cards                                                              | 12       |
| Sold-archive columns                                                                        | 15       |
| Deal cross-check warning                                                                    | 6        |
| Auto-attach ID photo as profile (Addendum 1)                                                | 10       |
| Per-image hide/show (Addendum 2)                                                            | 3, 8, 16 |
| End-to-end verification                                                                     | 17       |
