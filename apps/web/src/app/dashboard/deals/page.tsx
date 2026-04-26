"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { NotificationBell } from "@/components/NotificationBell";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/*
 * Deal history (Phase 4.2).
 *
 * A11y (approved):
 *   - H1 focusable on data-ready.
 *   - Explicit "התפקיד שלי" tag per card so SR users don't rely on
 *     verb conjugation alone (a11y-lead required change #3).
 *   - Close date uses <time datetime="ISO">…</time>.
 *   - Empty state is a plain <p> (not dynamic → not role=status).
 *   - TrustBadge attached to counterparty business name.
 */

type DealVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  primary_image_url: string | null;
};

type DealDealer = {
  id: string;
  business_name: string;
  city: string | null;
  tier: Tier;
};

type Deal = {
  id: string;
  offer_id: string;
  inventory_id: string;
  buyer_dealer_id: string;
  seller_dealer_id: string;
  final_price: number;
  confirmed_at: string | null;
  created_at: string;
  vehicle: DealVehicle;
  buyer: DealDealer;
  seller: DealDealer;
};

type Resp = {
  items: Deal[];
  total: number;
};

export default function DealsPage() {
  const { token } = useDealerAuth("/dashboard/deals");
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myDealerId, setMyDealerId] = useState<string | null>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  // Dealer-facing error policy: NEVER show technical messages
  // ("Failed to fetch", "השרת מתעורר משינה", etc.). Only two states
  // are user-visible:
  //   · `loadingMode === "retrying"` — silent spinner, no text
  //   · `loadingMode === "failed"` — generic Hebrew message after
  //     ~30s of attempts; admins debugging the API see the technical
  //     reason in DevTools, not on the page.
  // Total retry budget is ~30s (3s + 6s + 9s + 12s back-off) before
  // the failed UI takes over.
  type LoadingMode = "idle" | "retrying" | "failed";
  const [loadingMode, setLoadingMode] = useState<LoadingMode>("idle");

  const load = useCallback(
    async (attempt = 1) => {
      if (!token) return;
      setError(null);
      try {
        // Backend `/marketplace/deals` filters by buyer_dealer_id ==
        // me OR seller_dealer_id == me — strict tenant isolation,
        // no dealer ever sees another dealer's deal history.
        const [me, res] = await Promise.all([
          apiFetch<{ id: string }>("/api/v1/dealers/me", { token }).catch(() => null),
          apiFetch<Resp>("/api/v1/marketplace/deals", { token }),
        ]);
        setData(res);
        setLoadingMode("idle");
        if (me?.id) setMyDealerId(me.id);
      } catch {
        // Treat ALL failures the same from the dealer's POV — there
        // is no actionable difference between "network down" and
        // "5xx" for them. Keep retrying silently up to 4 attempts
        // (cumulative ~30s back-off), then show the generic failed
        // state with a manual retry button.
        if (attempt < 4) {
          setLoadingMode("retrying");
          setTimeout(() => void load(attempt + 1), 3000 * attempt);
          return;
        }
        setError("אירעה שגיאה, אנא נסה שוב מאוחר יותר");
        setLoadingMode("failed");
      }
    },
    [token],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    if (data) h1Ref.current?.focus();
  }, [data]);

  if (!token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  const formatDate = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

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
          <BackLink href="/dashboard" label="חזרה ללוח הבקרה" />
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy mt-3 text-3xl font-bold tracking-tight focus:outline-none"
          >
            היסטוריית עסקאות
          </h1>
          <p className="text-brand-ink/70 mt-2">כל העסקאות שנסגרו משני הצדדים — מכירות וקניות.</p>

          {/* Silent retry indicator — spinner only, no error text.
              Dealers don't need (or want) to know the API is sleeping. */}
          {loadingMode === "retrying" ? (
            <div
              role="status"
              aria-live="polite"
              aria-label="טוען"
              className="mt-6 flex items-center justify-center py-8"
            >
              <span
                aria-hidden="true"
                className="border-brand-gold inline-block h-8 w-8 animate-spin rounded-full border-2 border-t-transparent motion-reduce:animate-none"
              />
              <span className="sr-only">טוען</span>
            </div>
          ) : null}

          {/* Generic failed state — only after the silent retries
              are exhausted. No technical detail leaks to the dealer. */}
          {loadingMode === "failed" && error ? (
            <div role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
              <p className="font-semibold">{error}</p>
              <button
                type="button"
                onClick={() => void load(1)}
                className="text-danger-text mt-2 inline-flex min-h-9 items-center rounded-md bg-white px-3 py-1.5 text-xs font-bold underline"
              >
                נסה שוב
              </button>
            </div>
          ) : null}

          {data === null && loadingMode === "idle" ? (
            // Skeleton loader — three placeholder cards so the page
            // doesn't collapse and the user sees activity.
            <ul className="mt-6 space-y-4" aria-busy="true" aria-label="טוען עסקאות">
              {[0, 1, 2].map((i) => (
                <li key={i} className="border-brand-navy/10 rounded-lg border bg-white p-5">
                  <div className="bg-brand-navy/10 h-5 w-1/2 rounded motion-safe:animate-pulse" />
                  <div className="bg-brand-navy/10 mt-3 h-4 w-1/3 rounded motion-safe:animate-pulse" />
                  <div className="bg-brand-navy/10 mt-4 h-4 w-2/3 rounded motion-safe:animate-pulse" />
                </li>
              ))}
            </ul>
          ) : data && data.items.length === 0 ? (
            <div className="border-brand-navy/15 mt-6 rounded-lg border bg-white p-10 text-center">
              <p aria-hidden="true" className="text-brand-ink/30 mx-auto text-5xl">
                ✓
              </p>
              <p className="text-brand-navy mt-3 font-bold">אין עסקאות עדיין</p>
              <p className="text-brand-ink/65 mt-2 text-sm">
                עסקאות יופיעו כאן לאחר סגירת הצעות בהצלחה.
              </p>
            </div>
          ) : data ? (
            <ul className="mt-6 space-y-4">
              {data.items.map((d) => {
                const iAmBuyer = myDealerId === d.buyer_dealer_id;
                const counterparty = iAmBuyer ? d.seller : d.buyer;
                const roleLabel = iAmBuyer ? "קונה" : "מוכר";
                const priceF = formatPrice(d.final_price);
                const titleId = `deal-${d.id}-title`;
                const closeIso = d.confirmed_at ?? d.created_at;
                const vehicleLabel = `${d.vehicle.make} ${d.vehicle.model} ${d.vehicle.year}`;

                return (
                  <li key={d.id} className="border-brand-navy/10 rounded-lg border bg-white p-5">
                    <article aria-labelledby={titleId}>
                      <header className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 id={titleId} className="text-brand-navy text-lg font-bold">
                            {vehicleLabel}
                          </h3>
                          <p className="text-brand-ink/60 mt-1 text-xs font-semibold uppercase tracking-wide">
                            התפקיד שלי: {roleLabel}
                          </p>
                        </div>
                        <p className="text-brand-navy text-lg font-bold">
                          <span aria-hidden="true">{priceF.visual}</span>
                          <span className="sr-only">{priceF.sr}</span>
                        </p>
                      </header>

                      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-brand-ink/60">{iAmBuyer ? "מכר לי" : "קנה ממני"}</dt>
                          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                            <Link
                              href={`/dashboard/marketplace/dealer/${counterparty.id}`}
                              className="text-brand-navy focus-visible:outline-brand-navy rounded font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              {counterparty.business_name}
                            </Link>
                            {counterparty.city ? (
                              <span className="text-brand-ink/70">· {counterparty.city}</span>
                            ) : null}
                            <TrustBadge tier={counterparty.tier} compact />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-brand-ink/60">תאריך סגירה</dt>
                          <dd className="mt-0.5">
                            <time dateTime={closeIso}>{formatDate(closeIso)}</time>
                          </dd>
                        </div>
                        <div className="flex items-start justify-start sm:justify-end">
                          <Link
                            href={`/dashboard/marketplace/${d.inventory_id}`}
                            className="text-brand-navy focus-visible:outline-brand-navy mt-0.5 rounded text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            צפה ברכב
                          </Link>
                        </div>
                      </dl>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </main>
    </div>
  );
}
