"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/**
 * DealerStatsCards — Phase 6.5 KPI tiles for the dealer dashboard.
 *
 * 4 tiles: in-stock count, sold count, total revenue, total profit.
 * Period toggle (month / year / lifetime) persisted in localStorage so a
 * dealer's preferred lens survives reloads.
 *
 * A11y:
 *   - <section aria-labelledby="kpi-heading"> with sr-only <h2>
 *   - Period buttons in a real radiogroup (role="radiogroup" + aria-checked)
 *   - <dl><dt><dd> for the metrics — semantic for "term + value" pairs
 *   - Numbers use tabular-nums + Hebrew locale formatting
 *   - Loading state announces via role="status" aria-live="polite"
 *   - Missing-cost nudge is a plain link, not an aggressive alert
 */

type Period = "lifetime" | "year" | "month";

type Stats = {
  period: Period;
  active_count: number;
  sold_count: number;
  total_revenue: number;
  total_profit: number;
  profit_margin_pct: number;
  avg_days_to_sell: number | null;
  rows_missing_purchase_cost: number;
};

const STORAGE_KEY = "autotradeil:dealer-stats-period";
const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "החודש" },
  { value: "year", label: "השנה" },
  { value: "lifetime", label: "הכל" },
];

export function DealerStatsCards({ token }: { token: string }) {
  const [period, setPeriod] = useState<Period>("lifetime");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Period | null;
    if (stored === "lifetime" || stored === "year" || stored === "month") {
      setPeriod(stored);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Stats>(`/api/v1/inventory/stats?period=${period}`, { token })
      .then((s) => {
        if (!cancelled) {
          setStats(s);
          setError(null);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה בטעינת הסטטיסטיקות");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period, token]);

  const onPeriodChange = (p: Period) => {
    setPeriod(p);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, p);
    }
  };

  return (
    <section aria-labelledby="kpi-heading" className="mt-6">
      <h2 id="kpi-heading" className="sr-only">
        סטטיסטיקות מלאי ומכירות
      </h2>

      {/* Period radiogroup */}
      <div
        role="radiogroup"
        aria-label="טווח זמן לסטטיסטיקות"
        className="border-brand-navy/15 mb-3 inline-flex rounded-md border bg-white p-1"
      >
        {PERIODS.map((p) => {
          const selected = period === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPeriodChange(p.value)}
              className={[
                "min-h-9 rounded-md px-4 py-1 text-sm font-semibold transition",
                "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                selected
                  ? "bg-brand-navy text-brand-cream"
                  : "text-brand-ink/70 hover:bg-brand-navy/5",
              ].join(" ")}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="bg-danger-bg text-danger-text mb-3 rounded-md px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {loading && !stats ? (
        <p role="status" aria-live="polite" className="text-brand-ink/60 text-sm">
          טוען סטטיסטיקות…
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          icon="🚗"
          label="במלאי"
          value={stats ? stats.active_count.toLocaleString("he-IL") : "—"}
        />
        <Card
          icon="📦"
          label={
            period === "month" ? "נמכרו החודש" : period === "year" ? "נמכרו השנה" : "סה״כ נמכרו"
          }
          value={stats ? stats.sold_count.toLocaleString("he-IL") : "—"}
        />
        <Card icon="💰" label="הכנסות" value={stats ? formatPrice(stats.total_revenue) : "—"} />
        <Card
          icon="📈"
          label={stats ? `רווח (${stats.profit_margin_pct}%)` : "רווח"}
          value={stats ? formatPrice(stats.total_profit) : "—"}
          tone={stats && stats.total_profit < 0 ? "negative" : "neutral"}
        />
      </dl>

      {stats && stats.rows_missing_purchase_cost > 0 ? (
        <p className="text-brand-ink/70 mt-3 text-sm">
          <span aria-hidden="true">💡 </span>
          ל-{stats.rows_missing_purchase_cost} רכבים שנמכרו חסרה עלות קנייה — עדכן ב{" "}
          <a
            className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/dashboard/inventory?status=sold"
          >
            דף הרכבים שנמכרו
          </a>{" "}
          כדי לראות רווח אמיתי.
        </p>
      ) : null}
    </section>
  );
}

function Card({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone?: "neutral" | "negative";
}) {
  return (
    <div className="border-brand-navy/10 rounded-lg border bg-white p-4">
      <dt className="text-brand-ink/70 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd
        className={[
          "mt-1 text-xl font-bold tabular-nums",
          tone === "negative" ? "text-danger-text" : "text-brand-navy",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
