"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/**
 * CommandCenter — the data-rich middle band of the new dashboard.
 *
 * Composition:
 *   • 4-up stat tiles (active inventory / sold-30d / open offers / revenue-30d)
 *   • Top-5 recent active vehicles list
 *
 * The tiles use BIG Frank Ruhl Libre serif numerals on cream cards with
 * a single hairline gold underline accent. No drop shadows, no sparkly
 * gradients — restraint matches the editorial landing page.
 *
 * Each datum has its own narrow GET so a single slow endpoint can't
 * block the whole dashboard. Failures degrade to "—" so the layout
 * never collapses.
 */

type InventoryStats = {
  active_count: number;
  sold_count: number;
  total_revenue: number;
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  status: "active" | "sold" | "hidden";
  created_at: string;
};

type InventoryListResponse = { items: Vehicle[]; total: number };
type OfferListResponse = { total: number };

const dayMs = 1000 * 60 * 60 * 24;
const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / dayMs));

export function CommandCenter({ token }: { token: string }) {
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [offersIn, setOffersIn] = useState<number | null>(null);
  const [recent, setRecent] = useState<Vehicle[] | null>(null);

  // Parallel fetch — each endpoint is small and independent.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiFetch<InventoryStats>("/api/v1/inventory/stats?period=30d", { token }).catch(() => null),
      apiFetch<OfferListResponse>("/api/v1/marketplace/offers/received?per_page=1", {
        token,
      }).catch(() => null),
      apiFetch<InventoryListResponse>("/api/v1/inventory?status=active&per_page=5", {
        token,
      }).catch(() => null),
    ]).then(([s, o, inv]) => {
      if (cancelled) return;
      if (s) setStats(s);
      if (o) setOffersIn(o.total);
      if (inv) setRecent(inv.items);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tiles: Array<{
    label: string;
    value: string;
    sr?: string;
    foot?: string;
  }> = [
    {
      label: "רכבים במלאי",
      value: stats ? stats.active_count.toLocaleString("he-IL") : "—",
      foot: "פעיל כרגע",
    },
    {
      label: "מכירות 30 יום",
      value: stats ? stats.sold_count.toLocaleString("he-IL") : "—",
      foot: "30 הימים האחרונים",
    },
    {
      label: "הצעות פתוחות",
      value: offersIn !== null ? offersIn.toLocaleString("he-IL") : "—",
      foot: "ממתינות לתגובה",
    },
    {
      label: "הכנסות 30 יום",
      value: stats ? formatPrice(stats.total_revenue).visual : "—",
      sr: stats ? formatPrice(stats.total_revenue).sr : undefined,
      foot: "מכירות שנסגרו",
    },
  ];

  return (
    <>
      {/* ============================================================
          STAT TILES
          ============================================================ */}
      <section aria-labelledby="kpi-heading" className="mt-8">
        <h2 id="kpi-heading" className="sr-only">
          מדדי ביצוע
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {tiles.map((t) => (
            <li
              key={t.label}
              className="border-brand-navy/12 group relative overflow-hidden rounded-xl border bg-white p-4 sm:p-5"
            >
              <p className="text-brand-navy/65 text-xs font-semibold uppercase tracking-[0.14em]">
                {t.label}
              </p>
              <p className="text-brand-navy mt-3 font-serif text-3xl font-bold tabular-nums leading-none sm:text-4xl">
                <span aria-hidden="true">{t.value}</span>
                {t.sr ? <span className="sr-only">{t.sr}</span> : null}
              </p>
              {/* Hairline gold underline accent */}
              <span
                aria-hidden="true"
                className="bg-brand-gold mt-4 inline-block h-[2px] w-8 rounded-full"
              />
              {t.foot ? <p className="text-brand-ink/55 mt-2 text-xs">{t.foot}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      {/* ============================================================
          RECENT INVENTORY
          ============================================================ */}
      <section aria-labelledby="recent-heading" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="recent-heading"
            className="text-brand-navy font-serif text-xl font-bold tracking-tight sm:text-2xl"
          >
            רכבים אחרונים במלאי
          </h2>
          <Link
            href="/dashboard/inventory"
            className="text-brand-navy hover:text-brand-navy/80 focus-visible:outline-brand-navy decoration-brand-gold inline-flex items-center gap-1 rounded text-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            כל המלאי
            <span aria-hidden="true">←</span>
          </Link>
        </div>

        {recent === null ? (
          <ul className="mt-4 grid gap-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <li
                key={i}
                aria-hidden="true"
                className="border-brand-navy/10 bg-brand-navy/5 h-16 rounded-lg border motion-safe:animate-pulse"
              />
            ))}
          </ul>
        ) : recent.length === 0 ? (
          <p className="border-brand-navy/15 bg-brand-cream/40 text-brand-ink/65 mt-4 rounded-lg border p-6 text-center text-sm">
            עדיין אין רכבים במלאי. לחץ על &quot;הוסף רכב&quot; כדי להתחיל.
          </p>
        ) : (
          <ul className="border-brand-navy/12 divide-brand-navy/10 mt-4 divide-y overflow-hidden rounded-xl border bg-white">
            {recent.map((v) => {
              const days = daysSince(v.created_at);
              const priceF = formatPrice(v.price);
              return (
                <li key={v.id}>
                  <Link
                    href={`/dashboard/inventory`}
                    className="hover:bg-brand-navy/[0.03] focus-visible:outline-brand-navy flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:gap-4 sm:px-5"
                  >
                    <div
                      aria-hidden="true"
                      className="bg-brand-navy/8 text-brand-navy/45 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-xl sm:h-14 sm:w-14"
                    >
                      🚗
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-navy text-sm font-bold sm:text-base">
                        {v.make} {v.model} · {v.year}
                      </p>
                      <p className="text-brand-ink/60 mt-0.5 text-xs sm:text-sm">
                        ב-{days === 0 ? "מלאי היום" : `מלאי ${days} ימים`}
                      </p>
                    </div>
                    <p className="text-brand-navy shrink-0 font-serif text-lg font-bold tabular-nums sm:text-xl">
                      <span aria-hidden="true">{priceF.visual}</span>
                      <span className="sr-only">{priceF.sr}</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
