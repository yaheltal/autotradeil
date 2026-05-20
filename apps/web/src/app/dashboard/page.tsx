"use client";

import {
  ArrowLeft,
  BarChart3,
  Car,
  Handshake,
  Plus,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { SuspensionBanner } from "@/components/SuspensionBanner";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * Dealer dashboard — fintech-minimalist layout.
 *
 * Structure per the design system (CLAUDE.md §4):
 *   1. Auth + admin gate (preserved — safety infrastructure, not UI)
 *   2. SuspensionBanner (preserved)
 *   3. Admin-route redirect notice (preserved)
 *   4. Page header — "Dashboard" + dealer name + locale-formatted date
 *   5. Hero card — bg-accent (oxidized bronze) + Total Inventory Value +
 *      4 primary actions with subtle glassmorphism on hover
 *   6. Two-column grid — Recent Vehicles + Recent Offers
 *
 * Chrome (sidebar / topbar / mobile bottom-nav / logout / notification
 * bell) is provided by the parent dashboard/layout.tsx (DashboardShell).
 * This page renders the content area only — no redundant per-page header.
 *
 * Data: dealer.business_name comes from the live API; the inventory value
 * and recent activity panels are stubbed against MOCK data marked below.
 * Wire to real endpoints in a follow-up commit.
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

// ---- MOCK DATA --------------------------------------------------------
// TODO(post-design): replace with real queries.
//   inventory total      → GET /api/v1/inventory/stats   (sum of values)
//   recent_vehicles      → GET /api/v1/inventory?limit=4&sort=-created_at
//   recent_offers        → GET /api/v1/marketplace/offers/received?limit=4
type RecentVehicle = {
  id: number;
  make: string;
  model: string;
  year: number;
  price: number;
  addedAt: string;
};
type RecentOffer = {
  id: number;
  vehicle: string;
  amount: number;
  status: "pending" | "accepted" | "rejected" | "countered";
  time: string;
};

const MOCK_INVENTORY_VALUE = 1_247_500;
const MOCK_INVENTORY_GROWTH = 12; // percent month-over-month

const MOCK_RECENT_VEHICLES: RecentVehicle[] = [
  { id: 1, make: "Toyota", model: "Camry", year: 2022, price: 145_000, addedAt: "לפני שעתיים" },
  { id: 2, make: "Honda", model: "Civic", year: 2021, price: 98_000, addedAt: "לפני 5 שעות" },
  { id: 3, make: "Mazda", model: "CX-5", year: 2023, price: 178_000, addedAt: "לפני יום" },
  { id: 4, make: "Kia", model: "Sportage", year: 2020, price: 115_000, addedAt: "לפני יומיים" },
];

const MOCK_RECENT_OFFERS: RecentOffer[] = [
  { id: 1, vehicle: "Toyota Camry 2022", amount: 140_000, status: "pending", time: "לפני שעה" },
  { id: 2, vehicle: "Honda Civic 2021", amount: 95_000, status: "accepted", time: "לפני 3 שעות" },
  { id: 3, vehicle: "Mazda CX-5 2023", amount: 175_000, status: "pending", time: "לפני 6 שעות" },
  { id: 4, vehicle: "Kia Sportage 2020", amount: 110_000, status: "countered", time: "אתמול" },
];

// ---- Helpers ----------------------------------------------------------

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const formatDate = (d: Date) =>
  d.toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const OFFER_STATUS_COPY: Record<RecentOffer["status"], string> = {
  pending: "ממתינה",
  accepted: "התקבלה",
  rejected: "נדחתה",
  countered: "הצעה נגדית",
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

  // -- Auth + dealer profile load ------------------------------------------
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      try {
        const who = await apiFetch<{ user_type: string }>("/api/v1/auth/whoami", {
          token: session.access_token,
        });
        if (who.user_type === "admin") {
          router.replace("/admin");
          return;
        }
      } catch {
        /* fall through; the dealer fetch will surface its own error */
      }
      try {
        const me = await apiFetch<Dealer>("/api/v1/dealers/me", {
          token: session.access_token,
        });
        if (!cancelled) {
          setDealer(me);
          setToken(session.access_token);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינת הפרופיל");
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  // Hard sign-out kept available even though the global topbar owns the
  // primary logout — surfaced only inside the error fallback below.
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
      <div
        className="px-lg py-2xl mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-muted text-sm">טוען…</p>
      </div>
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
          <p className="font-tabular text-5xl font-semibold leading-none sm:text-6xl">
            {ILS.format(MOCK_INVENTORY_VALUE)}
          </p>
          <p className="text-paper/80 mt-md gap-xxs inline-flex items-center text-sm">
            <TrendingUp aria-hidden="true" className="h-4 w-4" />
            <span className="font-tabular font-medium">+{MOCK_INVENTORY_GROWTH}%</span>
            <span className="text-paper/70">החודש</span>
          </p>
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
        <RecentVehiclesCard items={MOCK_RECENT_VEHICLES} />
        <RecentOffersCard items={MOCK_RECENT_OFFERS} />
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

function RecentVehiclesCard({ items }: { items: RecentVehicle[] }) {
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

      {items.length === 0 ? (
        <EmptyCardMessage>אין רכבים להצגה.</EmptyCardMessage>
      ) : (
        <ul className="space-y-lg">
          {items.map((v) => (
            <li key={v.id} className="gap-md flex items-center">
              <div
                aria-hidden="true"
                className="border-hairline bg-paper h-12 w-12 shrink-0 rounded-lg border"
              />
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-sm font-medium">
                  {v.make} {v.model} {v.year}
                </p>
                <p className="text-muted mt-0.5 text-xs">{v.addedAt}</p>
              </div>
              <p className="text-ink font-tabular text-sm font-semibold">{ILS.format(v.price)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentOffersCard({ items }: { items: RecentOffer[] }) {
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

      {items.length === 0 ? (
        <EmptyCardMessage>אין הצעות חדשות.</EmptyCardMessage>
      ) : (
        <ul className="space-y-lg">
          {items.map((o) => (
            <li key={o.id} className="gap-md flex items-center">
              <div
                aria-hidden="true"
                className="border-hairline bg-paper h-12 w-12 shrink-0 rounded-lg border"
              />
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-sm font-medium">{o.vehicle}</p>
                <p className="text-muted mt-0.5 text-xs">
                  {OFFER_STATUS_COPY[o.status]}
                  <span aria-hidden="true" className="mx-xxs">
                    ·
                  </span>
                  {o.time}
                </p>
              </div>
              <p className="text-ink font-tabular text-sm font-semibold">{ILS.format(o.amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyCardMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-muted py-lg text-sm">{children}</p>;
}
