"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { DeleteInventoryDialog } from "@/components/DeleteInventoryDialog";
import type { InventoryInitial, InventoryPayload } from "@/components/InventoryFormDialog";
import { MobileFAB } from "@/components/MobileFAB";
import { NotificationBell } from "@/components/NotificationBell";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import { PauseDialog } from "@/components/PauseDialog";
import { StatusBadge, type InventoryStatus } from "@/components/StatusBadge";

/*
 * Lazy-loaded heavy dialogs — these are click-triggered and bring in
 * ~2,200 lines of form/image/upload code. Splitting them out trims the
 * initial inventory bundle ≈30-40% per Lighthouse mobile.
 *
 * ssr:false because dialogs are post-hydration UI and Radix portals
 * can't render on the server anyway.
 */
const InventoryFormDialog = dynamic(
  () => import("@/components/InventoryFormDialog").then((m) => m.InventoryFormDialog),
  { ssr: false },
);
const SellVehicleDialog = dynamic(
  () => import("@/components/SellVehicleDialog").then((m) => m.SellVehicleDialog),
  { ssr: false },
);
const VehicleImagesDialog = dynamic(
  () => import("@/components/VehicleImagesDialog").then((m) => m.VehicleImagesDialog),
  { ssr: false },
);
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
  // Phase 6.5 — sale lifecycle + warranty
  purchase_cost: number | null;
  sale_price: number | null;
  sold_at: string | null;
  sold_to: "b2b" | "b2c" | "external" | null;
  warranty_type: "manufacturer" | "dealer" | "extended" | "none" | null;
  warranty_until: string | null;
  created_at: string;
  updated_at: string;
  // Lowest-position non-hidden image — auto-promoted as the
  // thumbnail. First upload becomes the primary by virtue of
  // getting position 0.
  primary_image_url: string | null;
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
  return (
    <Suspense fallback={null}>
      <InventoryPageInner />
    </Suspense>
  );
}

function InventoryPageInner() {
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

  // Phase 6.5: sell dialog state
  const [sellOpen, setSellOpen] = useState(false);
  const [sellVehicle, setSellVehicle] = useState<Item | null>(null);

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

  // Phase 6.10 — smart filters extracted from the search bar
  const [smartQuery, setSmartQuery] = useState("");
  const [smartMake, setSmartMake] = useState("");
  const [smartModel, setSmartModel] = useState("");
  const [smartYearMin, setSmartYearMin] = useState<number | null>(null);
  const [smartYearMax, setSmartYearMax] = useState<number | null>(null);
  const [smartPriceMax, setSmartPriceMax] = useState<number | null>(null);
  const [smartFallbackQ, setSmartFallbackQ] = useState("");
  const { parse: parseSmart, busy: parsingSmart } = useSmartFilters(token);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const qs = new URLSearchParams();
      if (statusParam) qs.set("status", statusParam);
      if (smartMake) qs.set("make", smartMake);
      if (smartModel) qs.set("model", smartModel);
      if (smartYearMin !== null) qs.set("year_min", String(smartYearMin));
      if (smartYearMax !== null) qs.set("year_max", String(smartYearMax));
      if (smartPriceMax !== null) qs.set("price_max", String(smartPriceMax));
      if (smartFallbackQ) qs.set("q", smartFallbackQ);
      qs.set("per_page", "20");
      const res = await apiFetch<ListResponse>(
        `/api/v1/inventory${qs.toString() ? `?${qs.toString()}` : ""}`,
        { token },
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת המלאי");
    }
  }, [
    token,
    statusParam,
    smartMake,
    smartModel,
    smartYearMin,
    smartYearMax,
    smartPriceMax,
    smartFallbackQ,
  ]);

  const onSmartSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = smartQuery.trim();
    if (!q) {
      setSmartMake("");
      setSmartModel("");
      setSmartYearMin(null);
      setSmartYearMax(null);
      setSmartPriceMax(null);
      setSmartFallbackQ("");
      return;
    }
    const parsed = await parseSmart(q);
    if (parsed) {
      setSmartMake(parsed.filters.make ?? "");
      setSmartModel(parsed.filters.model ?? "");
      setSmartYearMin(parsed.filters.year_min);
      setSmartYearMax(parsed.filters.year_max);
      setSmartPriceMax(parsed.filters.price_max);
      setSmartFallbackQ(parsed.fallback_q ?? "");
    }
  };

  const clearSmartSearch = () => {
    setSmartQuery("");
    setSmartMake("");
    setSmartModel("");
    setSmartYearMin(null);
    setSmartYearMax(null);
    setSmartPriceMax(null);
    setSmartFallbackQ("");
  };

  const hasActiveSmartFilter = !!(
    smartMake ||
    smartModel ||
    smartYearMin ||
    smartYearMax ||
    smartPriceMax ||
    smartFallbackQ
  );

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
      const created = await apiFetch<{ id: string }>("/api/v1/inventory", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
      setToast("הרכב נוסף למלאי");
      await refresh();
      // Returned so the dialog can attach the just-captured ID photo as
      // the new vehicle's primary image (Phase 6.5 task 10).
      return created;
    }
    if (editingId) {
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

          {/* Smart search bar — Phase 6.10. Submit on Enter parses
              the Hebrew query through Claude → make/model/year/price
              filters that the backend now accepts. Status pills below
              still work as before; smart filters AND status filter
              compose. */}
          <form
            role="search"
            aria-label="חיפוש חכם במלאי"
            onSubmit={onSmartSearch}
            className="mt-8"
          >
            <label htmlFor="inv-smart" className="text-brand-navy block text-sm font-medium">
              חיפוש חכם
              <span
                aria-hidden="true"
                title="ניתן להזין משפט בעברית — Claude יזהה יצרן, דגם, שנה, מחיר"
                className="text-brand-gold ms-1.5 text-xs"
              >
                ✦
              </span>
            </label>
            <p id="inv-smart-hint" className="text-brand-ink/55 mt-1 text-xs">
              דוגמאות: ״BMW 2020״, ״רכבים מתחת ל-50 אלף״, ״סוזוקי״ — או חיפוש חופשי
            </p>
            <div className="mt-2 flex gap-2">
              <input
                id="inv-smart"
                type="search"
                autoComplete="off"
                value={smartQuery}
                onChange={(e) => setSmartQuery(e.target.value)}
                aria-describedby="inv-smart-hint"
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy block min-h-11 flex-1 rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <button
                type="submit"
                disabled={parsingSmart || !smartQuery.trim()}
                aria-busy={parsingSmart || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                {parsingSmart ? "מנתח…" : "חפש"}
              </button>
              {hasActiveSmartFilter ? (
                <button
                  type="button"
                  onClick={clearSmartSearch}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  נקה
                </button>
              ) : null}
            </div>
            {hasActiveSmartFilter ? (
              <p role="status" aria-live="polite" className="text-brand-navy/70 mt-2 text-xs">
                מסונן לפי:
                {smartMake ? ` יצרן=${smartMake}` : ""}
                {smartModel ? ` · דגם=${smartModel}` : ""}
                {smartYearMin && smartYearMax && smartYearMin === smartYearMax
                  ? ` · שנה=${smartYearMin}`
                  : smartYearMin || smartYearMax
                    ? ` · שנים=${smartYearMin ?? "?"}-${smartYearMax ?? "?"}`
                    : ""}
                {smartPriceMax ? ` · מחיר עד ${smartPriceMax.toLocaleString("he-IL")}₪` : ""}
                {smartFallbackQ ? ` · ״${smartFallbackQ}״` : ""}
              </p>
            ) : null}
          </form>

          <section aria-labelledby="filter-heading" className="mt-6">
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
              // Skeleton grid that mirrors the eventual card layout —
              // prevents layout jump when the data lands. role=status
              // so SR users hear "loading" once.
              <div role="status" aria-live="polite" className="mt-2">
                <span className="sr-only">טוען רכבים…</span>
                <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <li
                      key={i}
                      aria-hidden="true"
                      className="border-brand-navy/10 rounded-lg border bg-white p-5"
                    >
                      <div className="bg-brand-navy/10 h-5 w-2/3 rounded motion-safe:animate-pulse" />
                      <div className="bg-brand-navy/10 mt-2 h-4 w-1/3 rounded motion-safe:animate-pulse" />
                      <div className="bg-brand-navy/10 mt-5 h-3 w-full rounded motion-safe:animate-pulse" />
                      <div className="bg-brand-navy/10 mt-2 h-3 w-4/5 rounded motion-safe:animate-pulse" />
                      <div className="bg-brand-navy/10 mt-6 h-10 w-full rounded motion-safe:animate-pulse" />
                    </li>
                  ))}
                </ul>
              </div>
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
                        <header className="flex items-start gap-3">
                          {item.primary_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.primary_image_url}
                              alt=""
                              loading="lazy"
                              className="border-brand-navy/10 h-20 w-28 shrink-0 rounded border object-cover sm:h-24 sm:w-32"
                            />
                          ) : (
                            <div
                              aria-hidden="true"
                              className="bg-brand-navy/5 border-brand-navy/10 text-brand-ink/40 flex h-20 w-28 shrink-0 items-center justify-center rounded border text-2xl sm:h-24 sm:w-32"
                            >
                              🚗
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3 id={titleId} className="text-brand-navy text-lg font-bold">
                                {item.make} {item.model} · {item.year}
                              </h3>
                              <StatusBadge status={item.status} />
                            </div>
                          </div>
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
                          {/* Phase 6.5 — sale info on sold cards */}
                          {item.status === "sold" && item.sold_at ? (
                            <>
                              <div className="flex items-baseline justify-between gap-2">
                                <dt className="text-brand-ink/60">תאריך מכירה</dt>
                                <dd>
                                  <time dateTime={item.sold_at}>
                                    {new Date(item.sold_at).toLocaleDateString("he-IL")}
                                  </time>
                                </dd>
                              </div>
                              {item.sale_price != null ? (
                                <div className="flex items-baseline justify-between gap-2">
                                  <dt className="text-brand-ink/60">מחיר מכירה</dt>
                                  <dd className="font-semibold">
                                    {formatPrice(item.sale_price).visual}
                                  </dd>
                                </div>
                              ) : null}
                              {item.sale_price != null && item.purchase_cost != null ? (
                                <div className="flex items-baseline justify-between gap-2">
                                  <dt className="text-brand-ink/60">רווח</dt>
                                  <dd
                                    className={
                                      item.sale_price - item.purchase_cost >= 0
                                        ? "text-ok-text font-semibold"
                                        : "text-danger-text font-semibold"
                                    }
                                  >
                                    {formatPrice(item.sale_price - item.purchase_cost).visual}{" "}
                                    <span className="text-brand-ink/60 text-xs font-normal">
                                      (
                                      {(
                                        ((item.sale_price - item.purchase_cost) / item.sale_price) *
                                        100
                                      ).toFixed(1)}
                                      %)
                                    </span>
                                  </dd>
                                </div>
                              ) : item.sale_price != null && item.purchase_cost == null ? (
                                <div className="text-brand-ink/60 text-xs">
                                  💡 חסרה עלות קנייה לחישוב רווח —{" "}
                                  <button
                                    type="button"
                                    onClick={() => openEdit(item)}
                                    aria-label={`הוסף עלות קנייה ל-${fullLabel}`}
                                    className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                                  >
                                    ערוך
                                  </button>
                                </div>
                              ) : null}
                            </>
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
                                  setSellVehicle(item);
                                  setSellOpen(true);
                                }}
                                aria-label={`סמן כנמכר: ${fullLabel}`}
                                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                <span aria-hidden="true">💰</span>
                                סמן כנמכר
                              </button>
                            ) : null}
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

      {formOpen ? (
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
      ) : null}

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

      {/* Phase 6.5 — sell dialog */}
      {sellVehicle && token ? (
        <SellVehicleDialog
          open={sellOpen}
          onOpenChange={(v) => {
            setSellOpen(v);
            if (!v) setSellVehicle(null);
          }}
          token={token}
          vehicle={{
            id: sellVehicle.id,
            make: sellVehicle.make,
            model: sellVehicle.model,
            year: sellVehicle.year,
            price: sellVehicle.price,
            b2b_price: sellVehicle.b2b_price,
            b2c_price: sellVehicle.b2c_price,
            purchase_cost:
              (sellVehicle as Item & { purchase_cost?: number | null }).purchase_cost ?? null,
          }}
          onSold={() => {
            setToast("הרכב סומן כנמכר ✓");
            void refresh();
            // Move focus to the heading to avoid stranding it on the
            // unmounted "סמן כנמכר" trigger button (a11y-lead req).
            queueMicrotask(() => headingRef.current?.focus());
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

      {/* Mobile FAB — duplicates the in-flow "הוסף רכב" button so phone
          users have a thumb-reachable add action. Hidden on md+. */}
      <MobileFAB label="הוסף רכב" onClick={openCreate} />
    </div>
  );
}
