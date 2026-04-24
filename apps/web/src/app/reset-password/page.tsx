"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "@/components/BrandMark";
import { createClient } from "@/lib/supabase";

/*
 * Reset-password page (Phase 4.3 addendum).
 *
 * A11y (approved):
 *   - H1 focusable on mount.
 *   - Both password inputs carry autocomplete="new-password".
 *   - Mismatch error is wired via aria-describedby on the confirm field
 *     (a11y-lead required change #8) — not just visual.
 *   - Supabase consumes the reset token from the URL fragment and
 *     manages the session automatically; we call updateUser({password}).
 *   - On success we navigate to /login?reset=1 so the login page shows
 *     a one-time success toast (handled in login page).
 */

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const h1Ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    h1Ref.current?.focus();
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (password !== confirm) {
      setMismatch(true);
      setError("הסיסמאות אינן תואמות");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw new Error(authError.message);
      router.push("/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בעדכון הסיסמה");
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

        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-brand-navy mt-10 text-center text-3xl font-bold tracking-tight focus:outline-none"
        >
          קביעת סיסמה חדשה
        </h1>
        <p className="text-brand-ink/70 mt-2 text-center">
          הזן את הסיסמה החדשה פעמיים כדי לעדכן את החשבון.
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
            <label htmlFor="rp-password" className="text-brand-navy block text-sm font-medium">
              סיסמה חדשה
            </label>
            <p id="rp-password-hint" className="text-brand-navy/70 mt-1 text-xs">
              לפחות 8 תווים
            </p>
            <input
              id="rp-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setMismatch(false);
              }}
              aria-describedby="rp-password-hint"
              className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>

          <div>
            <label htmlFor="rp-confirm" className="text-brand-navy block text-sm font-medium">
              אישור סיסמה
            </label>
            <input
              id="rp-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setMismatch(false);
              }}
              aria-describedby={mismatch ? "rp-confirm-error" : undefined}
              aria-invalid={mismatch ? true : undefined}
              className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            {mismatch ? (
              <p id="rp-confirm-error" className="text-danger-text mt-1 text-sm">
                הסיסמאות אינן תואמות
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={busy}
            aria-busy={busy || undefined}
            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-3 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? "מעדכן…" : "עדכן סיסמה"}
          </button>
        </form>
      </div>
    </main>
  );
}
