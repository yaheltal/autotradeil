"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "@/components/BrandMark";
import { apiFetch } from "@/lib/api";

/*
 * Forgot-password flow (Phase 4.3 addendum).
 *
 * A11y (approved):
 *   - H1 focusable on mount.
 *   - Email input carries autocomplete="email".
 *   - Success confirmation uses role="status" (polite) and moves focus
 *     to its heading per a11y-lead required change #7.
 *   - Errors surface via role="alert".
 */

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    h1Ref.current?.focus();
  }, []);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const redirect_to =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : "http://localhost:3010/reset-password";
      // Backend endpoint is always-200 — the success block wording already
      // doesn't reveal whether the email exists.
      await apiFetch("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), redirect_to }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת האימייל");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex justify-center">
          <BrandMark />
        </div>

        {done ? (
          <section
            role="status"
            aria-live="polite"
            className="border-ok/30 bg-ok-bg/50 mt-10 rounded-lg border p-6 text-center"
          >
            <h1
              ref={doneRef}
              tabIndex={-1}
              className="text-brand-navy text-2xl font-bold focus:outline-none"
            >
              נשלח אימייל לאיפוס סיסמה ✓
            </h1>
            <p className="text-brand-ink mt-3 text-sm">
              אם הכתובת שהזנת קיימת במערכת, הקישור לאיפוס נשלח אליה. הקישור תקף לפרק זמן מוגבל.
            </p>
            <p className="mt-6">
              <Link
                href="/login"
                className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy rounded-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                חזרה לעמוד הכניסה
              </Link>
            </p>
          </section>
        ) : (
          <>
            <h1
              ref={h1Ref}
              tabIndex={-1}
              className="text-brand-navy mt-10 text-center text-3xl font-bold tracking-tight focus:outline-none"
            >
              איפוס סיסמה
            </h1>
            <p className="text-brand-ink/70 mt-2 text-center">
              הזן את כתובת האימייל שלך ונשלח אליך קישור לאיפוס הסיסמה.
            </p>

            {error ? (
              <div
                role="alert"
                className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
              <div>
                <label htmlFor="fp-email" className="text-brand-navy block text-sm font-medium">
                  אימייל
                </label>
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-3 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {busy ? "שולח…" : "שלח קישור לאיפוס"}
              </button>
            </form>

            <p className="text-brand-ink/70 mt-8 text-center text-sm">
              <Link
                href="/login"
                className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy rounded-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                חזרה לעמוד הכניסה
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
