"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { DeleteInventoryDialog } from "@/components/DeleteInventoryDialog";
import {
  type InventoryInitial,
  type InventoryPayload,
  InventoryFormDialog,
} from "@/components/InventoryFormDialog";
import { NotificationBell } from "@/components/NotificationBell";
import { StatusBadge, type InventoryStatus } from "@/components/StatusBadge";
import { VehicleImagesDialog } from "@/components/VehicleImagesDialog";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase";

/*
 * Dealer inventory — list + create/edit/delete.
 *
 * A11y plan (approved):
 *   - Flow:  <h1 מלאי הרכבים>  →  <h2 sr-only סינון>  →  <h2 sr-only רשימת רכבים>
 *             →  <h3> per card
 *   - Card:  <article aria-labelledby="inv-{id}-title">
 *   - Numeric formatting via lib/format.ts — visual + sr-only override
 *   - Status badge label IS the signal (not color-only)
 *   - Per-card action buttons have aria-label with full car context
 *   - Empty state is a plain <p> (not role="status" — it is not a
 *     dynamic update)
 *   - Radix Dialog handles modal focus trap, Escape, scroll-lock
 *   - Post-create/edit/delete: a live region announces "נשמר" /
 *     "נמחק" once and we re-fetch the list
 *   - Post-delete focus moves to next card's edit button, or prev, or
 *     "הוסף רכב" if the list is now empty
 */

type Item = {
  id: string;
  dealer_id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  color: string | null;
  transmission: "automatic" | "manual" | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | null;
  engine_volume: number | string | null;
  notes: string | null;
  status: InventoryStatus;
  is_b2b: boolean;
  b2b_price: number | null;
  created_at: string;
  updated_at: string;
};

type ListResponse = {
  items: Item[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

const FILTERS = [
  { key: "", label: "הכל" },
  { key: "active", label: "פעיל" },
  { key: "sold", label: "נמכר" },
  { key: "hidden", label: "מוסתר" },
] as const;

export default function InventoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const statusParam = params.get("status") ?? "";

  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const editBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInitial, setEditingInitial] = useState<InventoryInitial | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);

  const [imagesOpen, setImagesOpen] = useState(false);
  const [imagesVehicle, setImagesVehicle] = useState<Item | null>(null);

  // Auth bootstrap
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?next=/dashboard/inventory");
        return;
      }
      setToken(session.access_token);
    })();
  }, [router]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const qs = new URLSearchParams();
      if (statusParam) qs.set("status", statusParam);
      qs.set("per_page", "20");
      const res = await apiFetch<ListResponse>(
        `/api/v1/inventory${qs.toString() ? `?${qs.toString()}` : ""}`,
        { token },
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת המלאי");
    }
  }, [token, statusParam]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setEditingInitial(null);
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setFormMode("edit");
    setEditingId(item.id);
    setEditingInitial({
      id: item.id,
      make: item.make,
      model: item.model,
      year: item.year,
      mileage: item.mileage,
      price: item.price,
      color: item.color,
      transmission: item.transmission,
      fuel_type: item.fuel_type,
      engine_volume: item.engine_volume == null ? null : Number(item.engine_volume),
      notes: item.notes,
    });
    setFormOpen(true);
  };

  const submitItem = async (payload: InventoryPayload) => {
    if (!token) return;
    if (formMode === "create") {
      await apiFetch("/api/v1/inventory", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
      setToast("הרכב נוסף למלאי");
    } else if (editingId) {
      await apiFetch(`/api/v1/inventory/${editingId}`, {
        method: "PUT",
        token,
        body: JSON.stringify(payload),
      });
      setToast("הרכב עודכן");
    }
    await refresh();
  };

  const openDelete = (item: Item) => {
    setDeletingItem(item);
    setDeleteOpen(true);
  };

  // Optimistic B2B toggle — calls PATCH; announcement via toast region.
  // B2B price field focus-moves to the newly-revealed input per a11y req #3.
  // Focus target is resolved by id (`b2b-price-<id>`) which is unique per row.
  const b2bPriceDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const toggleB2b = async (item: Item, next: boolean) => {
    if (!token) return;
    // Optimistic local update
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, is_b2b: next } : i)) }
        : prev,
    );
    try {
      await apiFetch(`/api/v1/inventory/${item.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ is_b2b: next }),
      });
      setToast(next ? "הרכב פורסם בשוק B2B" : "הרכב הוסר משוק B2B");
      // Focus newly-revealed price input when the switch turns on.
      // Wait one tick so React has rendered the input before we reach for it.
      if (next) {
        queueMicrotask(() => {
          const el = document.getElementById(`b2b-price-${item.id}`);
          if (el instanceof HTMLInputElement) el.focus();
        });
      }
    } catch (e) {
      // Roll back
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) => (i.id === item.id ? { ...i, is_b2b: !next } : i)),
            }
          : prev,
      );
      setError(e instanceof Error ? e.message : "שגיאה בעדכון סטטוס B2B");
    }
  };

  const saveB2bPrice = (item: Item, rawValue: string) => {
    // Optimistic local update (numeric or null for empty)
    const digits = rawValue.replace(/[^\d]/g, "");
    const parsed = digits === "" ? null : parseInt(digits, 10);
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => (i.id === item.id ? { ...i, b2b_price: parsed } : i)),
          }
        : prev,
    );
    // Debounce PATCH
    const existing = b2bPriceDebounceRef.current.get(item.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      if (!token) return;
      try {
        await apiFetch(`/api/v1/inventory/${item.id}`, {
          method: "PUT",
          token,
          body: JSON.stringify({ b2b_price: parsed }),
        });
        setToast("מחיר B2B נשמר");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשמירת מחיר B2B");
      }
    }, 700);
    b2bPriceDebounceRef.current.set(item.id, timer);
  };

  const confirmDelete = async () => {
    if (!token || !deletingItem) return;
    await apiFetch(`/api/v1/inventory/${deletingItem.id}?mode=soft`, {
      method: "DELETE",
      token,
    });
    // Compute focus target BEFORE the list refreshes
    const items = data?.items ?? [];
    const idx = items.findIndex((i) => i.id === deletingItem.id);
    const targetId = items[idx + 1]?.id ?? items[idx - 1]?.id ?? null;
    setToast("הרכב נמחק");
    await refresh();
    queueMicrotask(() => {
      if (targetId && editBtnRefs.current.get(targetId)) {
        editBtnRefs.current.get(targetId)?.focus();
      } else {
        addBtnRef.current?.focus();
      }
    });
  };

  // Clear toast after announcement
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  return (
    <div className="bg-brand-cream text-brand-ink min-h-screen">
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <BrandMark />
          <NotificationBell token={token} />
        </div>
      </header>

      <DashboardSubNav />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
              >
                מלאי הרכבים
              </h1>
              <p className="text-brand-ink/70 mt-2">נהל את רשימת הרכבים הזמינים שלך.</p>
            </div>
            <button
              ref={addBtnRef}
              type="button"
              onClick={openCreate}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
            >
              הוסף רכב
            </button>
          </div>

          {/* Toast — transient live region for create/edit/delete */}
          {toast ? (
            <p role="status" aria-live="polite" className="sr-only" key={toast}>
              {toast}
            </p>
          ) : null}

          <section aria-labelledby="filter-heading" className="mt-8">
            <h2 id="filter-heading" className="sr-only">
              סינון מלאי
            </h2>
            <nav aria-label="סינון מלאי" className="border-brand-navy/10 border-b">
              <ul className="flex gap-1 overflow-x-auto">
                {FILTERS.map((f) => {
                  const isCurrent = f.key === statusParam;
                  const href = f.key
                    ? `/dashboard/inventory?status=${f.key}`
                    : "/dashboard/inventory";
                  return (
                    <li key={f.key || "all"}>
                      <Link
                        href={href}
                        aria-current={isCurrent ? "page" : undefined}
                        className={[
                          "inline-flex min-h-11 items-center rounded-t-md px-4 py-2 text-sm font-semibold",
                          "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                          isCurrent
                            ? "bg-brand-navy text-brand-cream"
                            : "text-brand-ink/70 hover:bg-brand-navy/5 hover:text-brand-navy",
                        ].join(" ")}
                      >
                        {f.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </section>

          {error ? (
            <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
              {error}
            </p>
          ) : null}

          <section aria-labelledby="list-heading" className="mt-6">
            <h2 id="list-heading" className="sr-only">
              רשימת רכבים
            </h2>

            {!data ? (
              <p role="status" className="text-brand-ink/60 p-8">
                טוען…
              </p>
            ) : data.items.length === 0 ? (
              <p className="border-brand-navy/10 text-brand-ink/60 rounded-lg border bg-white p-10 text-center">
                אין עדיין רכבים במלאי. לחץ על &quot;הוסף רכב&quot; כדי להוסיף את הרכב הראשון.
              </p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.items.map((item) => {
                  const titleId = `inv-${item.id}-title`;
                  const priceF = formatPrice(item.price);
                  const mileageF = formatMileage(item.mileage);
                  const fullLabel = `${item.make} ${item.model} שנת ${item.year}`;
                  return (
                    <li
                      key={item.id}
                      className="border-brand-navy/10 rounded-lg border bg-white p-5"
                    >
                      <article aria-labelledby={titleId}>
                        <header className="flex items-start justify-between gap-3">
                          <h3 id={titleId} className="text-brand-navy text-lg font-bold">
                            {item.make} {item.model} · {item.year}
                          </h3>
                          <StatusBadge status={item.status} />
                        </header>

                        <dl className="mt-4 space-y-2 text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-brand-ink/60">מחיר מבוקש</dt>
                            <dd>
                              <span aria-hidden="true">{priceF.visual}</span>
                              <span className="sr-only">{priceF.sr}</span>
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-brand-ink/60">קילומטראז׳</dt>
                            <dd>
                              <span aria-hidden="true">{mileageF.visual}</span>
                              <span className="sr-only">{mileageF.sr}</span>
                            </dd>
                          </div>
                          {item.color ? (
                            <div className="flex items-baseline justify-between gap-2">
                              <dt className="text-brand-ink/60">צבע</dt>
                              <dd>{item.color}</dd>
                            </div>
                          ) : null}
                        </dl>

                        {/* B2B marketplace toggle — native checkbox with role=switch */}
                        <div className="border-brand-navy/10 bg-brand-cream/40 mt-5 rounded-md border p-3">
                          <label
                            htmlFor={`b2b-${item.id}`}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="text-brand-navy text-sm font-semibold">
                              הצג בשוק B2B
                            </span>
                            <input
                              id={`b2b-${item.id}`}
                              type="checkbox"
                              role="switch"
                              checked={item.is_b2b}
                              onChange={(e) => void toggleB2b(item, e.target.checked)}
                              className="focus-visible:outline-brand-navy accent-brand-gold h-5 w-10 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                              aria-describedby={`b2b-${item.id}-desc`}
                            />
                          </label>
                          <p id={`b2b-${item.id}-desc`} className="text-brand-ink/60 mt-1 text-xs">
                            הרכב יופיע לסוחרים אחרים עם אפשרות לשלוח הצעה
                          </p>
                          {item.is_b2b ? (
                            <div className="mt-3">
                              <label
                                htmlFor={`b2b-price-${item.id}`}
                                className="text-brand-navy block text-sm font-medium"
                              >
                                מחיר B2B ₪ (אופציונלי)
                              </label>
                              <p
                                id={`b2b-price-${item.id}-hint`}
                                className="text-brand-ink/60 mt-0.5 text-xs"
                              >
                                אם לא הוזן — יוצג המחיר המבוקש הרגיל
                              </p>
                              <input
                                id={`b2b-price-${item.id}`}
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                value={item.b2b_price == null ? "" : String(item.b2b_price)}
                                onChange={(e) => saveB2bPrice(item, e.target.value)}
                                aria-describedby={`b2b-price-${item.id}-hint`}
                                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                              />
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setImagesVehicle(item);
                              setImagesOpen(true);
                            }}
                            aria-label={`ניהול תמונות של ${fullLabel}`}
                            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            ניהול תמונות
                          </button>
                          <div className="flex gap-2">
                            <button
                              ref={(el) => {
                                if (el) editBtnRefs.current.set(item.id, el);
                                else editBtnRefs.current.delete(item.id);
                              }}
                              type="button"
                              onClick={() => openEdit(item)}
                              aria-label={`עריכת ${fullLabel}`}
                              className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 flex-1 items-center justify-center rounded-md border bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              עריכה
                            </button>
                            <button
                              type="button"
                              onClick={() => openDelete(item)}
                              aria-label={`מחיקת ${fullLabel}`}
                              className="border-danger text-danger-text hover:bg-danger-bg focus-visible:outline-danger-text inline-flex min-h-11 flex-1 items-center justify-center rounded-md border bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              מחיקה
                            </button>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>

      <InventoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={submitItem}
        initial={editingInitial}
        mode={formMode}
        token={token}
        onManageImages={(vehicleId) => {
          const vehicle = data?.items.find((v) => v.id === vehicleId);
          if (!vehicle) return;
          setFormOpen(false);
          setImagesVehicle(vehicle);
          setImagesOpen(true);
        }}
      />

      <DeleteInventoryDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        label={
          deletingItem ? `${deletingItem.make} ${deletingItem.model} שנת ${deletingItem.year}` : ""
        }
      />

      {imagesVehicle ? (
        <VehicleImagesDialog
          open={imagesOpen}
          onOpenChange={(open) => {
            setImagesOpen(open);
            if (!open) setImagesVehicle(null);
          }}
          vehicle={{
            id: imagesVehicle.id,
            make: imagesVehicle.make,
            model: imagesVehicle.model,
            year: imagesVehicle.year,
          }}
          token={token}
        />
      ) : null}
    </div>
  );
}
