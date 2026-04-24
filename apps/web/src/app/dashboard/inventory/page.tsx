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
import { PauseDialog } from "@/components/PauseDialog";
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
  visibility: "private" | "b2b" | "b2c" | "both";
  b2c_price: number | null;
  paused_until: string | null;
  pause_reason: string | null;
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

  // Phase 4.3: pause dialog state
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseVehicle, setPauseVehicle] = useState<Item | null>(null);

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
      visibility: item.visibility,
      b2b_price: item.b2b_price,
      b2c_price: item.b2c_price,
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

  // Phase 4.3 superseded the B2B boolean toggle + inline price with a
  // visibility radio group in InventoryFormDialog (edit a vehicle to change).

  const unpauseVehicle = async (item: Item) => {
    if (!token) return;
    try {
      await apiFetch(`/api/v1/inventory/${item.id}/unpause`, {
        method: "POST",
        token,
      });
      setToast("הרכב חודש");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בחידוש הרכב");
    }
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

                        {/* Phase 4.3: visibility chip + pause controls */}
                        <div className="border-brand-navy/10 bg-brand-cream/40 mt-5 rounded-md border p-3">
                          <p className="text-brand-navy text-sm font-semibold">
                            חשיפה:&nbsp;
                            <span className="text-brand-ink font-normal">
                              {item.visibility === "private"
                                ? "פרטי"
                                : item.visibility === "b2b"
                                  ? "סוחרים (B2B)"
                                  : item.visibility === "b2c"
                                    ? "לקוחות (B2C)"
                                    : "סוחרים + לקוחות"}
                            </span>
                          </p>
                          {item.paused_until || item.pause_reason ? (
                            <p className="text-brand-ink/70 mt-1 text-xs">
                              <span aria-hidden="true">⏸ </span>
                              מושהה
                              {item.paused_until
                                ? ` עד ${new Date(item.paused_until).toLocaleString("he-IL")}`
                                : " ללא הגבלה"}
                              {item.pause_reason ? ` · ${item.pause_reason}` : ""}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.status === "active" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPauseVehicle(item);
                                  setPauseOpen(true);
                                }}
                                aria-label={`השהיית ${fullLabel}`}
                                className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                <span aria-hidden="true">⏸</span>
                                השהה זמנית
                              </button>
                            ) : item.paused_until !== null || item.pause_reason !== null ? (
                              <button
                                type="button"
                                onClick={() => void unpauseVehicle(item)}
                                aria-label={`חידוש ${fullLabel}`}
                                className="bg-ok hover:bg-ok/90 focus-visible:outline-ok inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                <span aria-hidden="true">▶</span>
                                חדש כעת
                              </button>
                            ) : null}
                          </div>
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

      {pauseVehicle ? (
        <PauseDialog
          open={pauseOpen}
          onOpenChange={(v) => {
            setPauseOpen(v);
            if (!v) setPauseVehicle(null);
          }}
          token={token}
          inventoryId={pauseVehicle.id}
          vehicleLabel={`${pauseVehicle.make} ${pauseVehicle.model} ${pauseVehicle.year}`}
          onDone={() => {
            setToast("הרכב הושהה");
            void refresh();
          }}
        />
      ) : null}

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
