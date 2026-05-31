"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "@/components/BrandMark";
import { createClient } from "@/lib/supabase";

/*
 * Reset-password page.
 *
 * Supabase recovery flow:
 *   1. User clicks the link in their email.
 *   2. Supabase verifies the token and redirects to
 *      `/reset-password#access_token=…&refresh_token=…&type=recovery`
 *      (or `#error=…&error_code=otp_expired&…` on a stale/tampered link).
 *
 * We DON'T wait for `onAuthStateChange("PASSWORD_RECOVERY")` — that
 * proved unreliable in production; the event sometimes never fires
 * even with a valid hash, leaving users on the verifying spinner
 * forever. Instead, on mount we parse window.location.hash directly,
 * call `supabase.auth.setSession({ access_token, refresh_token })`
 * ourselves, and flip state to "ready" the moment that promise
 * resolves. After setSession resolves we strip the tokens from the
 * URL via history.replaceState so they don't end up in history /
 * referrer headers / autofill.
 *
 * A11y (approved):
 *   - H1 focusable on mount.
 *   - Both password inputs carry autocomplete="new-password".
 *   - Mismatch error wired via aria-describedby on the confirm field.
 *   - Form is disabled until session is ready — disabled state is
 *     announced as "dimmed" by VoiceOver.
 *   - "Session ready" transition announced via role="status" so SR
 *     users know they can now interact.
 */

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  // Recovery-session state — start "checking", flip to "ready" once
  // Supabase fires PASSWORD_RECOVERY (or we find an existing session).
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "missing">("checking");
  const [readyAnnounce, setReadyAnnounce] = useState("");

  const h1Ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    h1Ref.current?.focus();
  }, []);

  // Recovery handler — parses window.location.hash directly and calls
  // setSession ourselves. We don't subscribe to onAuthStateChange
  // because the PASSWORD_RECOVERY event was missing in production
  // even when the hash carried valid tokens; the UI hung on the
  // verifying spinner indefinitely.
  //
  // Deps are intentionally empty: this runs exactly once on mount.
  // Re-running on every render would re-call setSession and clobber
  // the URL clean-up that already happened.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createClient();
    let cancelled = false;

    const failMissing = () => {
      if (!cancelled) setSessionState("missing");
    };

    void (async () => {
      const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(rawHash);

      // Supabase puts `error=…&error_code=…&error_description=…` on
      // the hash when the link has expired (otp_expired) or been
      // tampered with. Show the actionable message immediately.
      if (params.get("error") || params.get("error_code")) {
        failMissing();
        return;
      }

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (accessToken && refreshToken && type === "recovery") {
        try {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (cancelled) return;
          if (setErr) {
            failMissing();
            return;
          }
          setSessionState("ready");
          setReadyAnnounce("הקישור אומת — ניתן לקבוע סיסמה חדשה");
          // Strip the tokens from the URL so they don't leak via
          // history, referrer headers, or browser autocomplete.
          window.history.replaceState(null, "", window.location.pathname);
        } catch {
          failMissing();
        }
        return;
      }

      // No recovery tokens on the URL — maybe the tab already has a
      // session (e.g. user navigated back). Honor it; otherwise the
      // user reached this page without clicking a real link.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setSessionState("ready");
        setReadyAnnounce("הקישור אומת — ניתן לקבוע סיסמה חדשה");
        return;
      }
      failMissing();
    })();

    return () => {
      cancelled = true;
    };
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

  const formDisabled = sessionState !== "ready" || busy;

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

        {readyAnnounce ? (
          <p role="status" aria-live="polite" className="sr-only" key={readyAnnounce}>
            {readyAnnounce}
          </p>
        ) : null}

        {sessionState === "checking" ? (
          <p
            role="status"
            aria-live="polite"
            className="text-brand-ink/70 mt-6 text-center text-sm"
          >
            מאמת את הקישור…
          </p>
        ) : null}

        {sessionState === "missing" ? (
          <div
            role="alert"
            className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3 text-sm"
          >
            <p className="font-semibold">הקישור פג או אינו תקין</p>
            <p className="mt-1">
              <a href="/forgot-password" className="font-semibold underline">
                בקש איפוס חדש
              </a>
            </p>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3 text-sm"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
          <fieldset disabled={formDisabled} className="space-y-5 border-0 p-0">
            <legend className="sr-only">סיסמה חדשה</legend>
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
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
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
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
              />
              {mismatch ? (
                <p id="rp-confirm-error" className="text-danger-text mt-1 text-sm">
                  הסיסמאות אינן תואמות
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={formDisabled}
              aria-busy={busy || undefined}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-3 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "מעדכן…" : "עדכן סיסמה"}
            </button>
          </fieldset>
        </form>
      </div>
    </main>
  );
}
