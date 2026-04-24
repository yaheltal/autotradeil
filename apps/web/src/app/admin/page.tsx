"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type Stats = {
  total_dealers: number;
  pending: number;
  verified: number;
  rejected: number;
  new_this_week: number;
  verified_this_week: number;
  avg_hours_to_verify: number | null;
};

/*
 * Admin home — stats dashboard.
 *
 * A11y:
 *   - <main id="main" tabIndex={-1}>
 *   - <h1> receives focus on first render so screen readers announce
 *     the admin landing
 *   - Stat cards are <div aria-labelledby> (NOT <article> — plan
 *     correction: they aren't syndicatable)
 *   - Numbers are explicit digits even when zero
 *   - `role="status"` for loading (implicit aria-live — don't duplicate)
 */

export default function AdminHomePage() {
  const { token, loading } = useAdminAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<Stats>("/api/v1/admin/stats", { token });
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה בטעינת הסטטיסטיקות");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!loading && stats) headingRef.current?.focus();
  }, [loading, stats]);

  if (loading || (!stats && !error)) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="p-10" role="alert">
          <p className="bg-danger-bg text-danger-text rounded-md px-4 py-3">{error}</p>
        </div>
      </main>
    );
  }

  if (!stats) return null;

  const pendingActive = stats.pending > 0;

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
        >
          לוח בקרה
        </h1>
        <p className="text-brand-ink/70 mt-2">סקירה מהירה של מצב הסוחרים במערכת.</p>

        <section aria-labelledby="stats-heading" className="mt-10">
          <h2 id="stats-heading" className="sr-only">
            סטטיסטיקת סוחרים
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard id="total" label="סך סוחרים" value={stats.total_dealers} />
            <StatCard
              id="pending"
              label="ממתינים לאישור"
              value={stats.pending}
              tone={pendingActive ? "gold" : "muted"}
            />
            <StatCard id="verified" label="מאושרים" value={stats.verified} tone="ok" />
            <StatCard id="rejected" label="נדחו" value={stats.rejected} tone="danger" />
          </ul>
        </section>

        <section aria-labelledby="insights-heading" className="mt-10">
          <h2 id="insights-heading" className="text-brand-navy text-lg font-semibold">
            תובנות השבוע
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <InsightRow label="חדשים השבוע" value={String(stats.new_this_week)} />
            <InsightRow label="אושרו השבוע" value={String(stats.verified_this_week)} />
            <InsightRow
              label="זמן ממוצע לאישור (שעות)"
              value={
                stats.avg_hours_to_verify === null ? "—" : stats.avg_hours_to_verify.toFixed(1)
              }
            />
          </dl>
        </section>

        {pendingActive ? (
          <div className="border-brand-gold/50 mt-10 rounded-lg border bg-amber-50 p-5">
            <p className="text-brand-navy font-semibold">יש סוחרים שממתינים לאישור.</p>
            <p className="text-brand-ink/80 mt-1 text-sm">אנא עבור לעמוד הסוחרים ופעל לפי הצורך.</p>
            <Link
              href="/admin/dealers?status=pending"
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              צפה בסוחרים ממתינים
            </Link>
          </div>
        ) : null}

        <section aria-labelledby="admin-links-heading" className="mt-10">
          <h2 id="admin-links-heading" className="text-brand-navy text-lg font-semibold">
            ניהול נוסף
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            <li>
              <Link
                href="/admin/kyc"
                className="border-brand-navy/10 hover:bg-brand-navy/5 focus-visible:outline-brand-navy block rounded-lg border bg-white p-5 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <p className="text-brand-navy font-semibold">אימות זהות (KYC)</p>
                <p className="text-brand-ink/70 mt-1 text-sm">בקשות ממתינות לבדיקת מסמכים</p>
              </Link>
            </li>
            <li>
              <Link
                href="/admin/audit-log"
                className="border-brand-navy/10 hover:bg-brand-navy/5 focus-visible:outline-brand-navy block rounded-lg border bg-white p-5 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <p className="text-brand-navy font-semibold">יומן פעולות</p>
                <p className="text-brand-ink/70 mt-1 text-sm">היסטוריית פעולות מנהל מלאה</p>
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}

type Tone = "muted" | "gold" | "ok" | "danger";

function StatCard({
  id,
  label,
  value,
  tone = "muted",
}: {
  id: string;
  label: string;
  value: number;
  tone?: Tone;
}) {
  const toneClasses: Record<Tone, string> = {
    muted: "border-brand-navy/10 bg-white",
    gold: "border-brand-gold/60 bg-amber-50",
    ok: "border-ok/30 bg-ok-bg/50",
    danger: "border-danger/30 bg-danger-bg/60",
  };
  return (
    <li
      aria-labelledby={`stat-${id}-label`}
      className={`rounded-lg border p-5 ${toneClasses[tone]}`}
    >
      <p id={`stat-${id}-label`} className="text-brand-ink/70 text-sm">
        {label}
      </p>
      <p className="text-brand-navy mt-2 text-4xl font-bold tracking-tight">{value}</p>
    </li>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
      <dt className="text-brand-ink/70 text-sm">{label}</dt>
      <dd className="text-brand-navy mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
