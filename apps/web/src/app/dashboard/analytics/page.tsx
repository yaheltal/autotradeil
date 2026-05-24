"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { BackLink } from "@/components/BackLink";
import { BrandMark } from "@/components/BrandMark";
import { NotificationBell } from "@/components/NotificationBell";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * Dealer self-analytics (Phase 4.3).
 *
 * A11y (approved):
 *   - H1 focusable on data-ready.
 *   - KPI cards rendered as a <dl> with <div> wrappers around <dt>/<dd>
 *     pairs so SR users hear "רכבים פעילים: 3".
 *   - "Top vehicles" rendered as a real <table> with <caption> (sr-only)
 *     + <th scope="col">; first cell is a <Link> (no whole-row click).
 *   - TrustBadge for the dealer's own tier.
 */

type TopVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  views: number;
  offers: number;
};

type Analytics = {
  total_vehicles: number;
  active_vehicles: number;
  paused_vehicles: number;
  sold_vehicles: number;
  total_views: number;
  views_this_week: number;
  total_offers_received: number;
  total_offers_sent: number;
  deals_completed: number;
  deals_value: number;
  trust_score: number;
  tier: Tier;
  top_vehicles: TopVehicle[];
};

export default function AnalyticsPage() {
  const { token } = useDealerAuth("/dashboard/analytics");
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const { data: data, error: rawError } = useQuery({
    queryKey: queryKeys.analytics.root(),
    queryFn: () => apiFetch<Analytics>("/api/v1/marketplace/analytics", { token: token! }),
    enabled: !!token,
  });

  const error =
    rawError instanceof Error ? rawError.message : rawError ? "שגיאה בטעינת הסטטיסטיקות" : null;

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

  return (
    <div className="bg-brand-cream text-brand-ink min-h-screen">
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <BrandMark />
          <NotificationBell token={token} />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <BackLink href="/dashboard" label="חזרה ללוח הבקרה" />
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy mt-3 text-3xl font-bold tracking-tight focus:outline-none"
          >
            סטטיסטיקות
          </h1>
          <p className="text-brand-ink/70 mt-2">סקירה של הפעילות שלך במערכת.</p>

          {error ? (
            <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
              {error}
            </p>
          ) : null}

          {!data ? (
            <p role="status" className="text-brand-ink/60 p-8">
              טוען…
            </p>
          ) : (
            <>
              {/* Tier badge */}
              <div className="border-brand-navy/10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-5">
                <div>
                  <p className="text-brand-ink/60 text-xs">דרגת אמון נוכחית</p>
                  <p className="text-brand-navy mt-1 text-2xl font-bold">
                    {data.trust_score} נקודות
                  </p>
                </div>
                <TrustBadge tier={data.tier} />
              </div>

              {/* KPI cards as <dl> */}
              <section aria-labelledby="kpi-heading" className="mt-6">
                <h2 id="kpi-heading" className="sr-only">
                  מדדי ביצוע
                </h2>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <KpiCard label="רכבים פעילים" value={data.active_vehicles} />
                  <KpiCard label="צפיות השבוע" value={data.views_this_week} />
                  <KpiCard label="הצעות שקיבלתי" value={data.total_offers_received} />
                  <KpiCard label="עסקאות הושלמו" value={data.deals_completed} />
                  <KpiCard label="רכבים מושהים" value={data.paused_vehicles} />
                  <KpiCard label="רכבים שנמכרו" value={data.sold_vehicles} />
                  <KpiCard label="הצעות שלחתי" value={data.total_offers_sent} />
                  <KpiCard
                    label="סך עסקאות ₪"
                    value={data.deals_value}
                    formatter={(n) => formatPrice(n).visual}
                    srFormatter={(n) => formatPrice(n).sr}
                  />
                </dl>
              </section>

              {/* Top vehicles */}
              <section aria-labelledby="top-vehicles-heading" className="mt-8">
                <h2 id="top-vehicles-heading" className="text-brand-navy text-lg font-semibold">
                  הרכבים הפופולריים שלי
                </h2>

                {data.top_vehicles.length === 0 ? (
                  <p className="border-brand-navy/10 text-brand-ink/60 mt-4 rounded-lg border bg-white p-8 text-center">
                    אין עדיין נתוני פופולריות
                  </p>
                ) : (
                  <div className="border-brand-navy/10 mt-4 overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-start text-sm">
                      <caption className="sr-only">5 הרכבים עם הכי הרבה צפיות</caption>
                      <thead className="bg-brand-navy/5">
                        <tr>
                          <th
                            scope="col"
                            className="text-brand-navy px-4 py-2 text-start font-semibold"
                          >
                            רכב
                          </th>
                          <th
                            scope="col"
                            className="text-brand-navy px-4 py-2 text-start font-semibold"
                          >
                            צפיות
                          </th>
                          <th
                            scope="col"
                            className="text-brand-navy px-4 py-2 text-start font-semibold"
                          >
                            הצעות
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.top_vehicles.map((v) => (
                          <tr key={v.id} className="border-brand-navy/10 border-t">
                            <td className="px-4 py-3">
                              <Link
                                href={`/dashboard/marketplace/${v.id}`}
                                className="text-brand-navy focus-visible:outline-brand-navy rounded font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                {v.make} {v.model} {v.year}
                              </Link>
                            </td>
                            <td className="px-4 py-3">{v.views}</td>
                            <td className="px-4 py-3">{v.offers}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  formatter,
  srFormatter,
}: {
  label: string;
  value: number;
  formatter?: (n: number) => string;
  srFormatter?: (n: number) => string;
}) {
  const visual = formatter ? formatter(value) : String(value);
  const sr = srFormatter ? srFormatter(value) : `${label}: ${value}`;
  return (
    <div className="border-brand-navy/10 rounded-lg border bg-white p-4">
      <dt className="text-brand-ink/60 text-sm">{label}</dt>
      <dd className="text-brand-navy mt-2 text-2xl font-bold tracking-tight">
        <span aria-hidden="true">{visual}</span>
        <span className="sr-only">{sr}</span>
      </dd>
    </div>
  );
}
