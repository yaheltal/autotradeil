"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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

  const load = useCallback(async () => {
    if (!token) return;
    try {
      // /me endpoint not yet defined — fall back to reading buyer/seller ids
      // off each deal and matching by token session. We inject `myDealerId`
      // from the first "received" offer's seller_dealer_id if present, else
      // from the first "sent" offer's buyer_dealer_id. For now the dealer
      // can be inferred by which side of every deal has their id repeated.
      const res = await apiFetch<Resp>("/api/v1/marketplace/deals", { token });
      setData(res);

      // Derive my dealer id: the id that appears on every deal.
      if (res.items.length > 0) {
        const first = res.items[0]!;
        const candidates = [first.buyer_dealer_id, first.seller_dealer_id];
        const mine = candidates.find((id) =>
          res.items.every((d) => d.buyer_dealer_id === id || d.seller_dealer_id === id),
        );
        if (mine) setMyDealerId(mine);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת היסטוריית העסקאות");
    }
  }, [token]);

  useEffect(() => {
    void load();
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
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
          >
            היסטוריית עסקאות
          </h1>
          <p className="text-brand-ink/70 mt-2">כל העסקאות שנסגרו משני הצדדים — מכירות וקניות.</p>

          {error ? (
            <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
              {error}
            </p>
          ) : null}

          {data === null ? (
            <p role="status" className="text-brand-ink/60 p-8">
              טוען…
            </p>
          ) : data.items.length === 0 ? (
            <p className="border-brand-navy/10 text-brand-ink/60 mt-6 rounded-lg border bg-white p-10 text-center">
              טרם בוצעו עסקאות
            </p>
          ) : (
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
          )}
        </div>
      </main>
    </div>
  );
}
