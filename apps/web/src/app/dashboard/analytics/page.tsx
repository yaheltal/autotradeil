"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * /dashboard/analytics — editorial summary report.
 *
 *   סטטיסטיקות
 *   ──────────
 *   סקירה · ציון אמון 87 · [TrustBadge]              ← dek byline
 *
 *   ביצועים
 *   ──────────
 *   רכבים פעילים    צפיות השבוע    הצעות שקיבלתי   עסקאות הושלמו
 *   3              247            12             5
 *   רכבים מושהים    רכבים שנמכרו   הצעות שלחתי     סך עסקאות ₪
 *   1              8              7              ₪450,000
 *
 *   רכבים פופולריים
 *   ──────────
 *   ┌─────────────────────────────────────────────────┐
 *   │ רכב                            צפיות   הצעות    │
 *   └─────────────────────────────────────────────────┘
 *
 * Observational page — no actions, no accent moments. KPI tiles have
 * no borders; typography and grid spacing carry the structure. The
 * trust score lives in the dek as a byline so the KPI grid stays the
 * focal element.
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

  const { data, error: rawError } = useQuery({
    queryKey: queryKeys.analytics.root(),
    queryFn: () => apiFetch<Analytics>("/api/v1/marketplace/analytics", { token: token! }),
    enabled: !!token,
  });

  const error =
    rawError instanceof Error ? rawError.message : rawError ? "שגיאה בטעינת הסטטיסטיקות" : null;

  useEffect(() => {
    if (data) h1Ref.current?.focus();
  }, [data]);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl focus:outline-none"
    >
      {/* ── MASTHEAD ──────────────────────────────────────────────────── */}
      <header>
        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
        >
          סטטיסטיקות
        </h1>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted gap-xs mt-lg flex flex-wrap items-center text-sm">
          <span>סקירה של הפעילות שלך</span>
          {!data ? (
            <Skeleton className="inline-block h-4 w-40" />
          ) : (
            <>
              <span className="text-subtle mx-xxs">·</span>
              <span>
                ציון אמון{" "}
                <span className="text-ink font-tabular font-medium">{data.trust_score}</span>
              </span>
              <span className="text-subtle mx-xxs">·</span>
              <TrustBadge tier={data.tier} compact />
            </>
          )}
        </p>
      </header>

      {/* ── ERROR ─────────────────────────────────────────────────────── */}
      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── SECTION 1: KPI GRID ──────────────────────────────────────── */}
      <section aria-labelledby="kpi-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">ביצועים</p>
        <h2 id="kpi-heading" className="sr-only">
          מדדי ביצוע
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        {!data ? (
          <KpiGridSkeleton />
        ) : (
          <dl className="gap-y-2xl gap-x-lg mt-xl grid grid-cols-2 sm:grid-cols-4">
            <Stat label="רכבים פעילים" value={data.active_vehicles} />
            <Stat label="צפיות השבוע" value={data.views_this_week} />
            <Stat label="הצעות שקיבלתי" value={data.total_offers_received} />
            <Stat label="עסקאות הושלמו" value={data.deals_completed} />
            <Stat label="רכבים מושהים" value={data.paused_vehicles} />
            <Stat label="רכבים שנמכרו" value={data.sold_vehicles} />
            <Stat label="הצעות שלחתי" value={data.total_offers_sent} />
            <Stat
              label="סך עסקאות ₪"
              value={data.deals_value}
              formatter={(n) => formatPrice(n).visual}
              srFormatter={(n) => formatPrice(n).sr}
            />
          </dl>
        )}
      </section>

      {/* ── SECTION 2: TOP VEHICLES ──────────────────────────────────── */}
      <section aria-labelledby="top-vehicles-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">רכבים פופולריים</p>
        <h2 id="top-vehicles-heading" className="sr-only">
          הרכבים הפופולריים שלי
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        {!data ? (
          <TopVehiclesSkeleton />
        ) : data.top_vehicles.length === 0 ? (
          <p className="text-muted py-2xl text-center text-sm">אין עדיין נתוני פופולריות.</p>
        ) : (
          <Table>
            <caption className="sr-only">5 הרכבים עם הכי הרבה צפיות</caption>
            <TableHeader>
              <TableRow className="border-hairline">
                <TableHead>רכב</TableHead>
                <TableHead className="text-end">צפיות</TableHead>
                <TableHead className="text-end">הצעות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.top_vehicles.map((v) => (
                <TableRow
                  key={v.id}
                  className="border-hairline hover:bg-muted/5 duration-fast transition-colors"
                >
                  <TableCell>
                    <Link
                      href={`/dashboard/marketplace/${v.id}`}
                      className="text-ink duration-fast hover:text-accent focus-visible:outline-accent rounded-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {v.make} {v.model}{" "}
                      <span className="text-muted font-tabular font-normal">· {v.year}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-end">
                    <span className="font-tabular text-sm">{v.views}</span>
                  </TableCell>
                  <TableCell className="text-end">
                    <span className="font-tabular text-sm">{v.offers}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}

// ============================================================================
// Stat — single KPI: label-above-value, no border. Frank Ruhl on the
// value gives the page its editorial weight; font-tabular keeps the
// digits aligned across the grid.
// ============================================================================

function Stat({
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
    <div>
      <dt className="text-muted text-xs font-medium uppercase tracking-widest">{label}</dt>
      <dd className="text-ink font-tabular mt-xs font-serif text-3xl font-medium leading-none">
        <span aria-hidden="true">{visual}</span>
        <span className="sr-only">{sr}</span>
      </dd>
    </div>
  );
}

// ============================================================================
// Skeletons
// ============================================================================

function KpiGridSkeleton() {
  return (
    <div
      className="gap-y-2xl gap-x-lg mt-xl grid grid-cols-2 sm:grid-cols-4"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">טוען מדדים…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} aria-hidden="true">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-xs h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

function TopVehiclesSkeleton() {
  return (
    <div className="mt-lg" role="status" aria-live="polite">
      <span className="sr-only">טוען רכבים פופולריים…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-hairline gap-md py-md flex items-center border-b last:border-b-0"
        >
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}
