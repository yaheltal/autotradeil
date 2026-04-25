"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "@/components/BrandMark";
import { createClient } from "@/lib/supabase";

/*
 * Reset-password page (Phase 4.3 + Phase 4.4 fix).
 *
 * Supabase recovery flow:
 *   1. User clicks the link in their email.
 *   2. Supabase verifies the token and redirects to
 *      `/reset-password#access_token=…&refresh_token=…&type=recovery`.
 *   3. Supabase JS picks up the hash params on mount and fires a
 *      PASSWORD_RECOVERY event. ONLY after that does
 *      `auth.updateUser({password})` succeed.
 *
 * We listen for that event before enabling the form. If the user lands
 * here without a valid hash, we surface a clear message.
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

  // Listen for the recovery event AND check for an existing session,
  // since Supabase may have already processed the URL hash by the time
  // we mount.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setSessionState("ready");
        setReadyAnnounce("הקישור אומת — ניתן לקבוע סיסמה חדשה");
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setSessionState("ready");
        setReadyAnnounce("הקישור אומת — ניתן לקבוע סיסמה חדשה");
        return;
      }
      // Give Supabase JS one tick to parse the URL hash, then decide.
      const hasRecoveryHash =
        typeof window !== "undefined" && window.location.hash.includes("type=recovery");
      if (!hasRecoveryHash) {
        // No hash AND no session — user reached this page without a link.
        setTimeout(() => {
          if (!cancelled && sessionState === "checking") setSessionState("missing");
        }, 1500);
      }
    })();

    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <p className="font-semibold">הקישור לא תקין או שפג תוקפו</p>
            <p className="mt-1">
              ניתן לבקש קישור חדש דרך עמוד{" "}
              <a href="/forgot-password" className="underline">
                איפוס סיסמה
              </a>
              .
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
