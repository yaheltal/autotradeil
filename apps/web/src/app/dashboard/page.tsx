"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Car, Handshake, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SuspensionBanner } from "@/components/SuspensionBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatPrice, formatRelativeTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";

/*
 * Dealer dashboard — fintech-minimalist layout.
 *
 * All numbers and lists come from real API queries:
 *   inventory value    →  sum of price on /api/v1/inventory?status=active
 *   recent vehicles    →  /api/v1/inventory?status=active (sorted DESC
 *                         by created_at client-side, top 4)
 *   recent offers      →  /api/v1/marketplace/offers/received (top 4)
 *
 * No mock data, no placeholder values. When a query has not yet
 * resolved the UI shows a <Skeleton> matching the final layout.
 *
 * Chrome (sidebar / topbar / mobile bottom-nav / logout / notification
 * bell) is provided by the parent dashboard/layout.tsx (DashboardShell).
 */

type Dealer = {
  id: string;
  business_name: string;
  city: string;
  phone: string;
  tier: string;
  trust_score: string | number;
  contact_name: string;
  lot_size: number;
  description: string | null;
  logo_url: string | null;
  license_number?: string;
};

type InventoryItem = {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  status: "active" | "sold" | "hidden";
  primary_image_url: string | null;
  created_at: string;
};

type InventoryListResponse = {
  items: InventoryItem[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

type Offer = {
  id: string;
  inventory_id: string;
  offered_price: number;
  status: string;
  created_at: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    primary_image_url: string | null;
  };
};

type OfferListResponse = {
  items: Offer[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

const formatDate = (d: Date) =>
  d.toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const OFFER_STATUS_COPY: Record<string, string> = {
  pending: "ממתינה",
  accepted: "התקבלה",
  rejected: "נדחתה",
  countered: "הצעה נגדית",
  cancelled: "בוטלה",
  expired: "פגה",
};

// ============================================================================
// Page wrapper — Suspense around useSearchParams (Next 14 / app router).
// ============================================================================

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageInner />
    </Suspense>
  );
}

function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // ?error=admin_required arrives when a non-admin tries to open /admin/*.
  // Surface once, then strip so a refresh doesn't re-announce.
  const errorCode = searchParams.get("error");
  const [adminGateMsg, setAdminGateMsg] = useState<string | null>(null);
  useEffect(() => {
    if (errorCode !== "admin_required" || typeof window === "undefined") return;
    setAdminGateMsg("הדף שניסית לפתוח זמין רק למנהלי מערכת. הוחזרת ללוח שלך.");
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
  }, [errorCode]);

  // -- Auth bootstrap (Supabase isn't a TanStack resource) -----------------
  const [token, setToken] = useState<string | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.push("/login");
        return;
      }
      setToken(session.access_token);
      setSessionResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Admin-redirect gate. Cheap query, runs on every mount.
  const whoami = useQuery({
    queryKey: ["auth", "whoami"],
    queryFn: () => apiFetch<{ user_type: string }>("/api/v1/auth/whoami", { token: token! }),
    enabled: !!token,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (whoami.data?.user_type === "admin") router.replace("/admin");
  }, [whoami.data, router]);

  const isAdmin = whoami.data?.user_type === "admin";

  // -- Dealer profile ------------------------------------------------------
  const dealerQuery = useQuery({
    queryKey: queryKeys.dealer.me(),
    queryFn: () => apiFetch<Dealer>("/api/v1/dealers/me", { token: token! }),
    enabled: !!token && whoami.isFetched && !isAdmin,
  });

  // -- Active inventory (drives hero value + recent-vehicles list) ---------
  const activeInventoryQuery = useQuery({
    queryKey: queryKeys.inventory.list({ status: "active", per_page: 200 }),
    queryFn: () =>
      apiFetch<InventoryListResponse>("/api/v1/inventory?status=active&per_page=200", {
        token: token!,
      }),
    enabled: !!token && whoami.isFetched && !isAdmin,
  });

  // -- Received offers (drives recent-offers list). Shares the cache key
  // with /dashboard/offers so the two pages don't double-fetch.
  const offersQuery = useQuery({
    queryKey: queryKeys.offers.list("received"),
    queryFn: () =>
      apiFetch<OfferListResponse>("/api/v1/marketplace/offers/received", { token: token! }),
    enabled: !!token && whoami.isFetched && !isAdmin,
  });

  const dealer = dealerQuery.data ?? null;
  const inventoryValue = useMemo(() => {
    const items = activeInventoryQuery.data?.items ?? [];
    return items.reduce((sum, item) => sum + item.price, 0);
  }, [activeInventoryQuery.data]);
  const inventoryCount = activeInventoryQuery.data?.items.length ?? 0;
  const recentVehicles = useMemo(() => {
    const items = activeInventoryQuery.data?.items ?? [];
    // Backend default order is created_at DESC, but sort defensively
    // in case that changes.
    return [...items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4);
  }, [activeInventoryQuery.data]);
  const recentOffers = useMemo(() => {
    const items = offersQuery.data?.items ?? [];
    return [...items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4);
  }, [offersQuery.data]);

  const loading = !sessionResolved || whoami.isLoading || (!isAdmin && dealerQuery.isLoading);
  const error = dealerQuery.error
    ? dealerQuery.error instanceof Error
      ? dealerQuery.error.message
      : "שגיאה בטעינת הפרופיל"
    : null;

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      sessionStorage.clear();
    } catch {
      /* private browsing — ignore */
    }
    window.location.href = "/login?signedOut=1";
  }, []);

  // -- Loading / error states ----------------------------------------------
  if (loading) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="px-lg pb-3xl pt-2xl sm:px-2xl mx-auto max-w-5xl focus:outline-none"
        role="status"
        aria-live="polite"
        aria-label="טוען לוח בקרה"
      >
        <header className="mb-2xl">
          <Skeleton className="h-10 w-48 sm:h-12" />
          <Skeleton className="mt-sm h-4 w-72" />
        </header>
        <Skeleton className="mb-xl h-[260px] w-full rounded-2xl" />
        <div className="gap-xl grid grid-cols-1 sm:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <div className="px-lg py-2xl mx-auto max-w-xl">
        <div role="alert" className="border-hairline bg-paper p-xl rounded-xl border">
          <p className="text-ink font-serif text-xl font-medium">לא ניתן לטעון את הפרופיל</p>
          <p className="text-muted mt-sm text-sm">{error}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-lg border-hairline bg-paper px-md text-ink duration-fast hover:bg-ink hover:text-paper focus-visible:outline-accent inline-flex h-11 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            התנתקות
          </button>
        </div>
      </div>
    );
  }

  if (!dealer) return null;

  // ========================================================================
  // CONTENT
  // ========================================================================
  const inventoryF = formatPrice(inventoryValue);
  const inventoryReady = !activeInventoryQuery.isLoading;
  const offersReady = !offersQuery.isLoading;

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg pb-3xl pt-2xl sm:px-2xl mx-auto max-w-5xl focus:outline-none"
    >
      <SuspensionBanner token={token} />

      {adminGateMsg ? (
        <div
          role="alert"
          className="mb-xl border-warn-fg/20 bg-warn-bg px-lg py-md text-warn-fg rounded-xl border text-sm"
        >
          {adminGateMsg}
        </div>
      ) : null}

      {/* ── PAGE HEADER ────────────────────────────────────────────────── */}
      <header className="mb-2xl">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-ink tracking-editorial font-serif text-3xl font-medium focus:outline-none sm:text-4xl"
        >
          Dashboard
        </h1>
        <p className="text-muted mt-sm text-sm">
          <span className="text-ink font-medium">{dealer.business_name}</span>
          <span aria-hidden="true" className="mx-md text-muted">
            ·
          </span>
          <time dateTime={new Date().toISOString()}>{formatDate(new Date())}</time>
        </p>
      </header>

      {/* ── HERO — TOTAL INVENTORY VALUE + 4 ACTIONS ────────────────────── */}
      <section
        aria-labelledby="inventory-value-label"
        className="mb-xl bg-accent px-xl py-2xl text-paper sm:px-3xl sm:py-3xl rounded-2xl"
      >
        <div className="mb-xl">
          <p
            id="inventory-value-label"
            className="text-paper/75 mb-sm text-sm font-medium uppercase tracking-wide"
          >
            סך שווי המלאי
          </p>
          {inventoryReady ? (
            <>
              <p className="font-tabular text-5xl font-semibold leading-none sm:text-6xl">
                <span aria-hidden="true">{inventoryF.visual}</span>
                <span className="sr-only">{inventoryF.sr}</span>
              </p>
              <p className="text-paper/80 mt-md text-sm">
                <span className="font-tabular font-medium">{inventoryCount}</span>{" "}
                {inventoryCount === 1 ? "רכב פעיל" : "רכבים פעילים"}
              </p>
            </>
          ) : (
            <>
              <Skeleton className="bg-paper/20 h-14 w-64 sm:h-16" />
              <Skeleton className="bg-paper/20 mt-md h-4 w-32" />
            </>
          )}
        </div>

        <div className="gap-md sm:gap-lg grid grid-cols-2 sm:grid-cols-4">
          <HeroAction icon={Plus} label="הוסף רכב" href="/dashboard/inventory" />
          <HeroAction icon={Handshake} label="הצעות" href="/dashboard/offers" />
          <HeroAction icon={Car} label="עסקאות" href="/dashboard/deals" />
          <HeroAction icon={BarChart3} label="סטטיסטיקות" href="/dashboard/analytics" />
        </div>
      </section>

      {/* ── TWO-COLUMN — RECENT VEHICLES + RECENT OFFERS ────────────────── */}
      <div className="gap-xl grid grid-cols-1 sm:grid-cols-2">
        <RecentVehiclesCard items={recentVehicles} ready={inventoryReady} />
        <RecentOffersCard items={recentOffers} ready={offersReady} />
      </div>
    </main>
  );
}

// ============================================================================
// HERO ACTION — glassmorphism pill over the accent surface.
// Custom hover (bg-tone shift) — never the default Tailwind ring (CLAUDE.md §4).
// ============================================================================

function HeroAction({
  icon: Icon,
  label,
  href,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="gap-sm border-paper/15 bg-paper/10 px-md py-lg text-paper duration-fast hover:border-paper/30 hover:bg-paper/20 focus-visible:outline-paper group flex flex-col items-center justify-center rounded-xl border backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Icon aria-hidden="true" className="h-6 w-6 stroke-[1.5]" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

// ============================================================================
// SECONDARY CARDS — Recent Vehicles & Recent Offers
// ============================================================================

function RecentVehiclesCard({ items, ready }: { items: InventoryItem[]; ready: boolean }) {
  return (
    <section
      aria-labelledby="recent-vehicles-heading"
      className="border-hairline bg-paper p-xl rounded-xl border"
    >
      <header className="mb-lg gap-md flex items-baseline justify-between">
        <h2 id="recent-vehicles-heading" className="text-ink font-serif text-xl font-medium">
          מלאי אחרון
        </h2>
        <Link
          href="/dashboard/inventory"
          className="gap-xxs text-muted duration-fast hover:text-ink focus-visible:outline-accent group inline-flex items-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          הצג הכל
          <ArrowLeft
            aria-hidden="true"
            className="duration-fast h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
          />
        </Link>
      </header>

      {!ready ? (
        <RecentRowSkeleton count={4} />
      ) : items.length === 0 ? (
        <EmptyCardMessage>אין עדיין רכבים פעילים במלאי.</EmptyCardMessage>
      ) : (
        <ul className="space-y-lg">
          {items.map((v) => {
            const priceF = formatPrice(v.price);
            const rel = formatRelativeTime(v.created_at);
            return (
              <li key={v.id} className="gap-md flex items-center">
                {v.primary_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.primary_image_url}
                    alt=""
                    loading="lazy"
                    className="border-hairline h-12 w-12 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="border-hairline bg-paper text-subtle flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
                  >
                    <Car className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-medium">
                    {v.make} {v.model}{" "}
                    <span className="text-muted font-tabular font-normal">· {v.year}</span>
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    <time dateTime={rel.iso}>{rel.visual}</time>
                  </p>
                </div>
                <p className="text-ink font-tabular text-sm font-semibold">
                  <span aria-hidden="true">{priceF.visual}</span>
                  <span className="sr-only">{priceF.sr}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentOffersCard({ items, ready }: { items: Offer[]; ready: boolean }) {
  return (
    <section
      aria-labelledby="recent-offers-heading"
      className="border-hairline bg-paper p-xl rounded-xl border"
    >
      <header className="mb-lg gap-md flex items-baseline justify-between">
        <h2 id="recent-offers-heading" className="text-ink font-serif text-xl font-medium">
          הצעות אחרונות
        </h2>
        <Link
          href="/dashboard/offers"
          className="gap-xxs text-muted duration-fast hover:text-ink focus-visible:outline-accent group inline-flex items-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          הצג הכל
          <ArrowLeft
            aria-hidden="true"
            className="duration-fast h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
          />
        </Link>
      </header>

      {!ready ? (
        <RecentRowSkeleton count={4} />
      ) : items.length === 0 ? (
        <EmptyCardMessage>אין הצעות חדשות.</EmptyCardMessage>
      ) : (
        <ul className="space-y-lg">
          {items.map((o) => {
            const amountF = formatPrice(o.offered_price);
            const rel = formatRelativeTime(o.created_at);
            const statusLabel = OFFER_STATUS_COPY[o.status] ?? o.status;
            return (
              <li key={o.id} className="gap-md flex items-center">
                {o.vehicle.primary_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.vehicle.primary_image_url}
                    alt=""
                    loading="lazy"
                    className="border-hairline h-12 w-12 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="border-hairline bg-paper text-subtle flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
                  >
                    <Car className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-medium">
                    {o.vehicle.make} {o.vehicle.model}{" "}
                    <span className="text-muted font-tabular font-normal">· {o.vehicle.year}</span>
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    {statusLabel}
                    <span aria-hidden="true" className="mx-xxs">
                      ·
                    </span>
                    <time dateTime={rel.iso}>{rel.visual}</time>
                  </p>
                </div>
                <p className="text-ink font-tabular text-sm font-semibold">
                  <span aria-hidden="true">{amountF.visual}</span>
                  <span className="sr-only">{amountF.sr}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ============================================================================
// RecentRowSkeleton — placeholder rows that mirror the final layout shape.
// ============================================================================

function RecentRowSkeleton({ count }: { count: number }) {
  return (
    <ul className="space-y-lg">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} aria-hidden="true" className="gap-md flex items-center">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}

function EmptyCardMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-muted py-lg text-sm">{children}</p>;
}
