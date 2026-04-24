"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
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
};

export default function DashboardPage() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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
        const me = await apiFetch<Dealer>("/api/v1/dealers/me", {
          token: session.access_token,
        });
        if (!cancelled) {
          setDealer(me);
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
    router.push("/login?signedOut=1");
  }, [router]);

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

  const stats = [
    { key: "city", label: "עיר", value: dealer.city },
    { key: "phone", label: "טלפון", value: dealer.phone },
    { key: "tier", label: "דרגה", value: dealer.tier, lang: "en" as const },
    {
      key: "trust_score",
      label: "ציון אמון",
      value: String(dealer.trust_score),
    },
  ];

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <BrandMark />
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
      </header>

      <DashboardSubNav />

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
        >
          שלום, {dealer.business_name}!
        </h1>
        <p className="text-brand-ink/70 mt-2">החשבון שלך מאושר — להלן פרטי הפרופיל.</p>

        <section aria-labelledby="profile-heading" className="mt-10">
          <h2 id="profile-heading" className="text-brand-navy text-lg font-semibold">
            פרטי העסק
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.key} className="border-brand-navy/10 rounded-lg border bg-white p-5">
                <dt className="text-brand-ink/60 text-sm">{s.label}</dt>
                <dd
                  {...("lang" in s ? { lang: s.lang } : {})}
                  className="text-brand-navy mt-1 text-xl font-semibold"
                >
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="soon-heading" className="mt-10">
          <h2 id="soon-heading" className="text-brand-navy text-lg font-semibold">
            בקרוב
          </h2>
          <div className="border-brand-navy/10 bg-brand-cream mt-4 flex items-start gap-4 rounded-lg border p-6">
            <div
              aria-hidden="true"
              className="bg-brand-navy text-brand-gold flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
              >
                <path d="M3 13l2-5h14l2 5v5a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H7v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-5z" />
                <circle cx="7" cy="16" r="1.3" />
                <circle cx="17" cy="16" r="1.3" />
              </svg>
            </div>
            <div>
              <p className="text-brand-navy font-semibold">ניהול מלאי הרכבים שלך</p>
              <p className="text-brand-ink/70 mt-1 text-sm">
                בשלב הבא: הוספת רכבים, ניהול מלאי, וקבלת הצעות מסוחרים אחרים.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
