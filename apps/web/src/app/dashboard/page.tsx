"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { CommandCenter } from "@/components/dashboard/CommandCenter";
import { DashboardSmartBar } from "@/components/dashboard/DashboardSmartBar";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { DealerStatsCards } from "@/components/DealerStatsCards";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileEditor } from "@/components/ProfileEditor";
import { ProfileHeader } from "@/components/ProfileHeader";
import type { Tier } from "@/components/TrustBadge";
import { SuspensionBanner } from "@/components/SuspensionBanner";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * Dealer dashboard (protected by middleware.ts).
 *
 * A11y:
 *   - <h1> carries the greeting and is focused on mount.
 *   - Profile info rendered as <dl><dt><dd> (not a table).
 *   - Logout is a real <button>; no confirmation, but we redirect
 *     with ?signedOut=1 so the login page announces the result.
 *   - If /dealers/me returns 404 (admin hit the wrong page), render
 *     an explicit error region with role="alert".
 *   - English tier keywords wrapped in <span lang="en"> so Hebrew
 *     screen readers don't mangle them.
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
  // ?error=admin_required arrives when a non-admin tries to open /admin/*
  // (useAdminAuth.ts redirects them here). Surface the cause once, then
  // strip the query param so a refresh doesn't re-announce.
  const errorCode = searchParams.get("error");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [adminGateMsg, setAdminGateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (errorCode !== "admin_required" || typeof window === "undefined") return;
    setAdminGateMsg("הדף שניסית לפתוח זמין רק למנהלי מערכת. הוחזרת ללוח שלך.");
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
  }, [errorCode]);

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [token, setToken] = useState<string | null>(null);

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
      // Admins shouldn't be on /dashboard — redirect to /admin so the page
      // doesn't 404 trying to load a non-existent dealer profile.
      try {
        const who = await apiFetch<{ user_type: string }>("/api/v1/auth/whoami", {
          token: session.access_token,
        });
        if (who.user_type === "admin") {
          router.replace("/admin");
          return;
        }
      } catch {
        // whoami failed — fall through; the dealer fetch will surface its
        // own error.
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
          const message = err instanceof Error ? err.message : "שגיאה בטעינת הפרופיל";
          setError(message);
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
    if (!loading) {
      headingRef.current?.focus();
    }
  }, [loading]);

  const handleLogout = useCallback(async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Belt-and-suspenders against cross-tenant cache leaks: drop any
    // browser-side state that could be replayed to the next user on
    // this device (sessionStorage holds in-flight form drafts; the
    // stale-while-revalidate browser cache is wiped on hard reload).
    try {
      sessionStorage.clear();
    } catch {
      /* private browsing — ignore */
    }
    // Hard-redirect (not router.push) so the SPA bundle re-mounts
    // fresh — defeats any in-memory React state still holding the
    // previous dealer's data.
    window.location.href = "/login?signedOut=1";
  }, []);

  if (loading) {
    return (
      <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
        <div
          className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-16"
          role="status"
          aria-live="polite"
        >
          <p className="text-brand-ink/70">טוען…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
        <div className="mx-auto max-w-xl px-6 py-16">
          <BrandMark />
          <div role="alert" className="bg-danger-bg text-danger-text mt-10 rounded-md px-4 py-4">
            <p className="font-semibold">לא ניתן לטעון את הפרופיל</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy mt-6 inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            התנתקות
          </button>
        </div>
      </main>
    );
  }

  if (!dealer) return null;

  // Phase 6.8.1 — show business name + license number on the cards.
  // tier + trust_score are in the combined card below.
  const stats = [
    { key: "business_name", label: "שם העסק", value: dealer.business_name },
    {
      key: "license_number",
      label: "מספר רישיון סוחר",
      value: dealer.license_number ?? "—",
    },
  ];

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <SuspensionBanner token={token} />
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <BrandMark />
          <div className="flex items-center gap-2 sm:gap-3">
            {token ? <NotificationBell token={token} /> : null}
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              aria-busy={signingOut || undefined}
              className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              {signingOut ? "מתנתק…" : "התנתקות"}
            </button>
          </div>
        </div>
      </header>

      <DashboardSubNav />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {adminGateMsg ? (
          <div
            role="alert"
            className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {adminGateMsg}
          </div>
        ) : null}

        {/* ============================================================
            COMMAND CENTER — greeting + AI bar + KPI tiles + recent inv
            ============================================================ */}
        <header>
          <p className="text-brand-navy/65 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
            <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
            לוח הפיקוד שלך
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-navy mt-3 font-serif text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl"
          >
            שלום, {dealer.business_name}.
          </h1>
        </header>

        {token ? <DashboardSmartBar token={token} /> : null}

        {token ? <CommandCenter token={token} /> : null}

        {/* ============================================================
            DETAILED ANALYTICS (period switcher + bigger trends)
            ============================================================ */}
        <section aria-labelledby="analytics-heading" className="mt-12">
          <h2
            id="analytics-heading"
            className="text-brand-navy font-serif text-xl font-bold tracking-tight sm:text-2xl"
          >
            ניתוח מפורט
          </h2>
          <div className="mt-4">{token ? <DealerStatsCards token={token} /> : null}</div>
        </section>

        {/* Profile header — circular logo, business name, tier badge.
            Sits ABOVE the read-only stats so the dealer's brand is the
            first thing they see in the profile area. */}
        {token ? (
          <div className="mt-12">
            <ProfileHeader
              token={token}
              businessName={dealer.business_name}
              city={dealer.city}
              tier={dealer.tier as Tier}
              trustScore={Number(dealer.trust_score) || 0}
              logoUrl={dealer.logo_url}
              onLogoChanged={(url) => setDealer((d) => (d ? { ...d, logo_url: url } : d))}
            />
          </div>
        ) : null}

        <section aria-labelledby="profile-heading" className="mt-8">
          <h2 id="profile-heading" className="text-brand-navy text-lg font-semibold">
            פרטי העסק
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((s) => (
              <div key={s.key} className="border-brand-navy/10 rounded-lg border bg-white p-5">
                <dt className="text-brand-ink/60 text-sm">{s.label}</dt>
                <dd className="text-brand-navy mt-1 text-xl font-semibold">{s.value}</dd>
              </div>
            ))}
            {/* Combined tier + trust_score card.
             *  Two <dt>/<dd> pairs inside one card preserves label-value
             *  semantics for screen readers (per a11y review). */}
            <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <dt className="text-brand-ink/60 text-sm">דרגה</dt>
                <dd className="text-brand-navy text-xl font-semibold">
                  <span lang="en">{dealer.tier}</span>
                </dd>
                <span aria-hidden="true" className="text-brand-ink/40 mx-1">
                  ·
                </span>
                <dt className="text-brand-ink/60 text-sm">ציון אמון</dt>
                <dd className="text-brand-navy text-xl font-semibold tabular-nums">
                  {dealer.trust_score}
                </dd>
              </div>
            </div>
          </dl>
        </section>

        {token ? (
          <div className="mt-10">
            <ProfileEditor
              token={token}
              initial={{
                business_name: dealer.business_name,
                city: dealer.city,
                phone: dealer.phone,
                description: dealer.description,
                logo_url: dealer.logo_url,
              }}
              onSaved={(next) => setDealer((d) => (d ? { ...d, ...next } : d))}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
