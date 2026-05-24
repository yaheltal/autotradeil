"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminStatsResponse as Stats } from "@autotradeil/shared-types";
import {
  ArrowLeft,
  FileClock,
  Settings,
  ShieldCheck,
  ShoppingBag,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin — editorial operator dashboard.
 *
 *   לוח ניהול
 *   ──────────
 *   סקירה מהירה של מצב המערכת · 5 ממתינים לאישור   ← dek + pending byline
 *
 *   סוחרים
 *   ──────────
 *   סך סוחרים  ממתינים   מאושרים   נדחו                 ← Stat tiles (no borders)
 *
 *   תובנות השבוע
 *   ──────────
 *   חדשים השבוע  · אושרו השבוע  · זמן ממוצע לאישור
 *
 *   [if pending > 0] Alert callout with link to /admin/dealers?status=pending
 *
 *   ניהול נוסף
 *   ──────────
 *   ── אימות זהות (KYC)
 *   ── כל הרכבים במערכת
 *   ── הגדרות מערכת
 *   ── יומן פעולות
 *
 * Typography-only Stat tiles (mirrors /dashboard/analytics) — no
 * per-tile borders, no color-tinted "tones". The pending count
 * earns the dek byline (one operator-relevant number always visible).
 */

export default function AdminHomePage() {
  const { token, loading } = useAdminAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const statsQuery = useQuery({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => apiFetch<Stats>("/api/v1/admin/stats", { token: token! }),
    enabled: !!token,
  });
  const stats = statsQuery.data ?? null;
  const error =
    statsQuery.error instanceof Error
      ? statsQuery.error.message
      : statsQuery.error
        ? "שגיאה בטעינת הסטטיסטיקות"
        : null;

  useEffect(() => {
    if (!loading && stats) headingRef.current?.focus();
  }, [loading, stats]);

  const pendingActive = (stats?.pending ?? 0) > 0;

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl">
      <AdminMasthead
        title="לוח ניהול"
        dek={<span>סקירה מהירה של מצב המערכת</span>}
        loading={loading || !stats}
        count={
          stats ? `${stats.pending} ${stats.pending === 1 ? "ממתין" : "ממתינים"} לאישור` : undefined
        }
        headingRef={headingRef}
      />

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── SECTION 1: KPI GRID ──────────────────────────────────────── */}
      <section aria-labelledby="kpi-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">סוחרים</p>
        <h2 id="kpi-heading" className="sr-only">
          סטטיסטיקת סוחרים
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        {!stats ? (
          <KpiGridSkeleton />
        ) : (
          <dl className="gap-y-2xl gap-x-lg mt-xl grid grid-cols-2 sm:grid-cols-4">
            <Stat label="סך סוחרים" value={stats.total_dealers} href="/admin/dealers" />
            <Stat
              label="ממתינים לאישור"
              value={stats.pending}
              href="/admin/dealers?status=pending"
            />
            <Stat label="מאושרים" value={stats.verified} href="/admin/dealers?status=verified" />
            <Stat label="נדחו" value={stats.rejected} href="/admin/dealers?status=rejected" />
          </dl>
        )}
      </section>

      {/* ── SECTION 2: INSIGHTS ──────────────────────────────────────── */}
      <section aria-labelledby="insights-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">תובנות השבוע</p>
        <h2 id="insights-heading" className="sr-only">
          תובנות השבוע
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        {!stats ? (
          <InsightsSkeleton />
        ) : (
          <dl className="gap-y-xl gap-x-2xl mt-xl grid grid-cols-1 sm:grid-cols-3">
            <Insight label="חדשים השבוע" value={String(stats.new_this_week)} />
            <Insight label="אושרו השבוע" value={String(stats.verified_this_week)} />
            <Insight
              label="זמן ממוצע לאישור (שעות)"
              value={
                stats.avg_hours_to_verify === null ? "—" : stats.avg_hours_to_verify.toFixed(1)
              }
            />
          </dl>
        )}
      </section>

      {/* ── PENDING CTA ──────────────────────────────────────────────── */}
      {pendingActive ? (
        <section
          aria-labelledby="pending-cta-heading"
          className="border-accent/30 bg-accent-subtle p-xl mt-3xl rounded-md border"
        >
          <p id="pending-cta-heading" className="text-ink font-serif text-lg font-medium">
            יש סוחרים שממתינים לאישור
          </p>
          <p className="text-muted mt-xs text-sm">עבור לעמוד הסוחרים ופעל לפי הצורך.</p>
          <Button asChild className="mt-lg">
            <Link href="/admin/dealers?status=pending">
              <span>צפה בסוחרים ממתינים</span>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        </section>
      ) : null}

      {/* ── SECTION 3: ADMIN LINKS ───────────────────────────────────── */}
      <section aria-labelledby="links-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">ניהול נוסף</p>
        <h2 id="links-heading" className="sr-only">
          ניהול נוסף
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <ul className="mt-md">
          <AdminLinkRow
            href="/admin/kyc"
            icon={ShieldCheck}
            title="אימות זהות (KYC)"
            description="בקשות ממתינות לבדיקת מסמכים"
          />
          <AdminLinkRow
            href="/admin/inventory"
            icon={ShoppingBag}
            title="כל הרכבים במערכת"
            description="מלאי מכלל הסוחרים — סינון לפי חשיפה, סטטוס, יצרן"
          />
          <AdminLinkRow
            href="/admin/settings"
            icon={Settings}
            title="הגדרות מערכת"
            description="שם המערכת, אימייל תמיכה, ניהול אדמינים"
          />
          <AdminLinkRow
            href="/admin/audit-log"
            icon={FileClock}
            title="יומן פעולות"
            description="היסטוריית פעולות מנהל מלאה"
          />
        </ul>
      </section>
    </div>
  );
}

// ============================================================================
// Stat — single KPI: label above value, no border. Frank Ruhl on the
// value gives the page editorial weight; font-tabular keeps digits
// aligned across the grid. Optional href turns the whole tile into a
// link to the relevant filtered list.
// ============================================================================

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <>
      <dt className="text-muted text-xs font-medium uppercase tracking-widest">{label}</dt>
      <dd className="text-ink font-tabular mt-xs font-serif text-3xl font-medium leading-none">
        {value}
      </dd>
    </>
  );
  if (href) {
    return (
      <div>
        <Link
          href={href}
          className="duration-fast hover:text-accent focus-visible:outline-accent group block rounded-sm transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          aria-label={`${label} — ${value}. פתיחת רשימה.`}
        >
          {inner}
        </Link>
      </div>
    );
  }
  return <div>{inner}</div>;
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted text-xs font-medium uppercase tracking-widest">{label}</dt>
      <dd className="text-ink font-tabular mt-xs font-serif text-2xl font-medium leading-none">
        {value}
      </dd>
    </div>
  );
}

// ============================================================================
// AdminLinkRow — hairline-separated row in the "ניהול נוסף" list.
// Replaces the bordered card pattern; typography + chevron carry it.
// ============================================================================

function AdminLinkRow({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="gap-md border-hairline py-lg duration-fast hover:bg-muted/5 focus-visible:outline-accent group flex items-center border-b transition-colors last:border-b-0 focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon
          className="text-muted group-hover:text-ink duration-fast h-5 w-5 shrink-0 transition-colors"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-ink text-sm font-medium">{title}</p>
          <p className="text-muted mt-xxs text-xs">{description}</p>
        </div>
        <ArrowLeft
          className="text-subtle group-hover:text-ink duration-fast h-4 w-4 shrink-0 transition-all group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </li>
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
      <span className="sr-only">טוען סטטיסטיקות…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} aria-hidden="true">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-xs h-8 w-12" />
        </div>
      ))}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div
      className="gap-y-xl gap-x-2xl mt-xl grid grid-cols-1 sm:grid-cols-3"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">טוען תובנות…</span>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} aria-hidden="true">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-xs h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
