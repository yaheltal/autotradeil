"""Seed two demo dealer accounts for mobile testing.

Why this script exists
----------------------
The two admin accounts (talyahel4, talniv93) own the only verified phone
numbers we have access to (Twilio sends real SMS to them). To exercise the
dealer-side flows on the mobile app — inventory, marketplace, offers — we
need a *dealer* account whose login phone reaches one of those handsets.

Mobile login is `users.phone` + `users.id_number`, and `phone` has a
partial-unique index. So we:
    1. Strip phone from the admin rows (admins keep email+password on Web).
    2. Create demo dealers and reassign those phones to them.
    3. Set id_number = "000000000" — passes the Israeli checksum (sum of
       all-zero digits is 0, mod 10 = 0) and serves as an obvious test
       sentinel.
    4. Drop ~5 sample inventory rows so the screens are no longer empty.

Usage
-----
    cd apps/api
    .\\venv\\Scripts\\python.exe scripts/seed_demo_dealers.py

Idempotent — re-running updates instead of duplicating.

Cleanup
-------
    .\\venv\\Scripts\\python.exe scripts/seed_demo_dealers.py --revert

That deletes the two demo dealers + their inventory and restores the admin
phones to the original values.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid as uuid_pkg
from datetime import datetime, timezone

import httpx
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

# Make `app.*` imports work when running this file directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Dealer, User  # noqa: E402
from app.models.inventory import Inventory  # noqa: E402

DEMO_PASSWORD = "Demo!Password2026"
DEMO_ID_NUMBER = "000000000"

# (admin_email_to_strip_phone, admin_phone, demo_dealer_email, demo_business_name)
DEMOS = [
    {
        "admin_email": "talyahel4@gmail.com",
        "admin_phone": "0584201306",
        "demo_email": "demo1@autotradeil-test.com",
        "business_name": "אוטו דמו 1 בע״מ",
        "city": "תל אביב",
        "business_id": "100000001",
        "license_number": "DEMO-001",
        "contact_name": "דמו אחד",
    },
    {
        "admin_email": "talniv93@gmail.com",
        "admin_phone": "0542142358",
        "demo_email": "demo2@autotradeil-test.com",
        "business_name": "אוטו דמו 2 בע״מ",
        "city": "ירושלים",
        "business_id": "100000002",
        "license_number": "DEMO-002",
        "contact_name": "דמו שתיים",
    },
]

# Five toy vehicles per dealer. Real make/model/year so the UI looks alive.
SAMPLE_VEHICLES = [
    {"make": "Toyota", "model": "Corolla", "year": 2022, "mileage": 45000, "price": 95000, "b2b_price": 88000, "color": "לבן", "fuel_type": "petrol", "transmission": "automatic"},
    {"make": "Mazda", "model": "3", "year": 2021, "mileage": 67000, "price": 105000, "b2b_price": 98000, "color": "אפור", "fuel_type": "petrol", "transmission": "automatic"},
    {"make": "Hyundai", "model": "Ioniq", "year": 2023, "mileage": 18000, "price": 145000, "b2b_price": 138000, "color": "כחול", "fuel_type": "electric", "transmission": "automatic"},
    {"make": "Kia", "model": "Sportage", "year": 2020, "mileage": 92000, "price": 115000, "b2b_price": 108000, "color": "שחור", "fuel_type": "diesel", "transmission": "automatic"},
    {"make": "Skoda", "model": "Octavia", "year": 2022, "mileage": 38000, "price": 132000, "b2b_price": 125000, "color": "כסף", "fuel_type": "petrol", "transmission": "manual"},
]


# ─── Supabase admin helpers ────────────────────────────────────────────


async def _supabase_find_user(client: httpx.AsyncClient, email: str) -> str | None:
    """Look up a Supabase auth user by email — needed because admin-create
    400's on duplicate email and we want idempotency."""
    url = f"{settings.supabase_url}/auth/v1/admin/users"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
    }
    resp = await client.get(url, headers=headers, params={"email": email}, timeout=15.0)
    if resp.status_code != 200:
        return None
    body = resp.json()
    users = body.get("users") or body if isinstance(body, list) else body.get("users", [])
    for u in users:
        if u.get("email", "").lower() == email.lower():
            return u["id"]
    return None


async def _supabase_create_user(client: httpx.AsyncClient, email: str, password: str) -> str:
    url = f"{settings.supabase_url}/auth/v1/admin/users"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {"email": email, "password": password, "email_confirm": True}
    resp = await client.post(url, headers=headers, json=payload, timeout=15.0)
    if resp.status_code in (200, 201):
        return resp.json()["id"]
    if resp.status_code in (400, 422):
        # Already exists — find and return.
        existing = await _supabase_find_user(client, email)
        if existing:
            return existing
    resp.raise_for_status()
    raise RuntimeError(f"Supabase create user failed: {resp.text}")


async def _supabase_delete_user(client: httpx.AsyncClient, user_id: str) -> None:
    url = f"{settings.supabase_url}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
    }
    await client.delete(url, headers=headers, timeout=15.0)


# ─── Seed / revert ─────────────────────────────────────────────────────


async def _strip_admin_phone(db: AsyncSession, admin_email: str) -> str | None:
    """Remove `users.phone` from an admin row. Returns the previous value
    so a revert run can restore it."""
    res = await db.execute(select(User).where(User.email == admin_email))
    admin = res.scalar_one_or_none()
    if admin is None:
        print(f"  [warn] admin {admin_email} not found in users table")
        return None
    prev = admin.phone
    admin.phone = None
    await db.flush()
    print(f"  cleared phone from admin {admin_email} (was {prev or '(none)'})")
    return prev


async def _wait_for_user_row(db: AsyncSession, user_uuid: uuid_pkg.UUID) -> User:
    """The on_auth_user_created trigger mirrors auth.users → public.users
    asynchronously; poll a few times before giving up."""
    for _ in range(20):
        res = await db.execute(select(User).where(User.id == user_uuid))
        user = res.scalar_one_or_none()
        if user is not None:
            return user
        await asyncio.sleep(0.25)
    raise RuntimeError(f"public.users row never appeared for {user_uuid}")


async def _get_any_admin_id(db: AsyncSession) -> uuid_pkg.UUID:
    """The dealers.verified_by column requires a non-null FK to users when
    verified=true (ck_dealers_verification_consistency). Use any admin's id
    as the actor — for demo data this is fine."""
    res = await db.execute(select(User.id).where(User.user_type == "admin").limit(1))
    admin_id = res.scalar_one_or_none()
    if admin_id is None:
        raise RuntimeError("No admin user exists — can't satisfy verified_by")
    return admin_id


async def _seed_one(
    client: httpx.AsyncClient, db: AsyncSession, demo: dict, admin_id: uuid_pkg.UUID
) -> None:
    print(f"\n* Seeding {demo['demo_email']} (phone {demo['admin_phone']})")

    # 1) free the phone on the admin row
    await _strip_admin_phone(db, demo["admin_email"])

    # 2) Supabase auth user (idempotent)
    auth_id_str = await _supabase_create_user(client, demo["demo_email"], DEMO_PASSWORD)
    user_uuid = uuid_pkg.UUID(auth_id_str)

    # 3) wait for the trigger and elevate to dealer
    user = await _wait_for_user_row(db, user_uuid)
    user.user_type = "dealer"
    user.verified = True
    user.phone = demo["admin_phone"]
    user.id_number = DEMO_ID_NUMBER
    user.first_name = "דמו"
    user.last_name = demo["demo_email"].split("@")[0]
    await db.flush()

    # 4) dealers row — upsert by user_id
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user_uuid))
    ).scalar_one_or_none()
    if dealer is None:
        dealer = Dealer(
            user_id=user_uuid,
            business_name=demo["business_name"],
            business_id=demo["business_id"],
            license_number=demo["license_number"],
            phone=demo["admin_phone"],
            city=demo["city"],
            lot_size=10,
            contact_name=demo["contact_name"],
            verified=True,
            verified_at=datetime.now(timezone.utc),
            verified_by=admin_id,
            kyc_status="approved",
        )
        db.add(dealer)
        await db.flush()
        print(f"  created dealer row {dealer.id}")
    else:
        dealer.business_name = demo["business_name"]
        dealer.phone = demo["admin_phone"]
        dealer.verified = True
        dealer.verified_at = dealer.verified_at or datetime.now(timezone.utc)
        dealer.verified_by = dealer.verified_by or admin_id
        dealer.kyc_status = "approved"
        await db.flush()
        print(f"  reused dealer row {dealer.id}")

    # 5) sample inventory — wipe and reseed for repeatability
    await db.execute(delete(Inventory).where(Inventory.dealer_id == dealer.id))
    for spec in SAMPLE_VEHICLES:
        item = Inventory(
            dealer_id=dealer.id,
            make=spec["make"],
            model=spec["model"],
            year=spec["year"],
            mileage=spec["mileage"],
            price=spec["price"],
            b2b_price=spec["b2b_price"],
            color=spec["color"],
            fuel_type=spec["fuel_type"],
            transmission=spec["transmission"],
            status="active",
        )
        db.add(item)
    await db.flush()
    print(f"  seeded {len(SAMPLE_VEHICLES)} inventory rows")


async def _revert_one(client: httpx.AsyncClient, db: AsyncSession, demo: dict) -> None:
    print(f"\n* Reverting {demo['demo_email']}")
    # Find the demo user
    user = (
        await db.execute(select(User).where(User.email == demo["demo_email"]))
    ).scalar_one_or_none()
    if user is None:
        print("  no demo user found — skipping")
    else:
        # Delete dealer (cascades inventory via FK on dealer_id? Probably not —
        # delete inventory first to be safe.)
        dealer = (
            await db.execute(select(Dealer).where(Dealer.user_id == user.id))
        ).scalar_one_or_none()
        if dealer is not None:
            await db.execute(delete(Inventory).where(Inventory.dealer_id == dealer.id))
            await db.execute(delete(Dealer).where(Dealer.id == dealer.id))
            print(f"  deleted dealer + inventory")
        await db.execute(delete(User).where(User.id == user.id))
        # Delete from Supabase auth too — requires admin api
        await _supabase_delete_user(client, str(user.id))
        print(f"  deleted user + auth.users row")

    # Restore admin phone
    res = await db.execute(select(User).where(User.email == demo["admin_email"]))
    admin = res.scalar_one_or_none()
    if admin is not None:
        admin.phone = demo["admin_phone"]
        await db.flush()
        print(f"  restored admin phone {demo['admin_email']} → {demo['admin_phone']}")


async def main(revert: bool) -> None:
    if not settings.supabase_secret_key:
        print("ERROR: SUPABASE_SECRET_KEY not set in apps/api/.env", file=sys.stderr)
        sys.exit(1)

    async with httpx.AsyncClient() as client, SessionLocal() as db:
        try:
            admin_id = None if revert else await _get_any_admin_id(db)
            for demo in DEMOS:
                if revert:
                    await _revert_one(client, db, demo)
                else:
                    assert admin_id is not None
                    await _seed_one(client, db, demo, admin_id)
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    if revert:
        print("\n[OK] Demo dealers removed. Admin phones restored.")
        return

    print("\n" + "=" * 60)
    print("[OK] Demo dealers ready. Login from the app:")
    print("=" * 60)
    for demo in DEMOS:
        print(
            f"  • phone {demo['admin_phone']}  +  ID {DEMO_ID_NUMBER}  →  {demo['business_name']}"
        )
    print(
        "\nThe SMS goes to the same phone as before (yahel / niv handset),\n"
        "but the user resolved by phone is now the dealer demo, not the admin.\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--revert", action="store_true", help="undo the seed")
    args = parser.parse_args()
    asyncio.run(main(revert=args.revert))
