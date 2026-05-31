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
 * Form-unlock policy — IMMEDIATE on hash detection. The form unlocks
 * the moment we have plausibly-valid tokens. setSession is fired in
 * the background; if it fails the error surfaces via `linkError`
 * state, and the submit handler also catches "Auth session missing"
 * from updateUser if the user beats setSession to the punch. Earlier
 * versions awaited setSession before unlocking and the form sat
 * disabled forever in production tabs where setSession never returned.
 *
 * The ONLY state that gates the form is `verifying || busy`:
 *   - `verifying` flips to false synchronously inside the mount effect
 *     (no awaits before it gets flipped).
 *   - `busy` toggles only during the submit's updateUser round-trip.
 *
 * A11y:
 *   - H1 focusable on mount.
 *   - Both password inputs carry autocomplete="new-password".
 *   - Mismatch error wired via aria-describedby on the confirm field.
 *   - Form is disabled only while verifying or while busy submitting.
 *   - "Form unlocked" transition announced via role="status".
 */

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  // verifying — historically gated the fieldset while the mount effect
  // verified the recovery hash. Initial value is now FALSE so the form
  // is interactive on the first paint: any setSession failure surfaces
  // via linkError, and a submit-before-setSession-lands path is already
  // handled by the "auth session missing" branch in onSubmit below.
  // The mount effect still runs and still fires setSession in the
  // background — the variable + setter stay so the existing flow can
  // explicitly null this gate out in the future without re-introducing
  // it everywhere.
  const [verifying, setVerifying] = useState(false);

  // Two error surfaces:
  //   - linkError fires when the URL itself can't carry the recovery
  //     flow (expired token, missing tokens, setSession failure, or
  //     "Auth session missing" from updateUser). Renders with the
  //     "בקש איפוס חדש" link to /forgot-password.
  //   - submitError fires for in-form validation + generic submit
  //     failures. Renders without the link (the user just needs to
  //     fix their input).
  const [linkError, setLinkError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [readyAnnounce, setReadyAnnounce] = useState("");

  const h1Ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    h1Ref.current?.focus();
  }, []);

  // Recovery handler — parses window.location.hash, flips verifying
  // OFF synchronously the moment we have plausibly-valid tokens, then
  // fires setSession as fire-and-forget. The submit handler will
  // surface "Auth session missing" if the user races setSession to
  // the finish line.
  //
  // Deps intentionally empty — this MUST run exactly once on mount.
  // Re-running would re-trigger setSession and clobber the URL
  // clean-up that already happened.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createClient();

    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(rawHash);

    // Supabase puts `error=…&error_code=otp_expired&…` on the hash
    // when the link has expired or been tampered with.
    const hashError = params.get("error") || params.get("error_code");
    if (hashError) {
      setLinkError("הקישור פג או אינו תקין. בקש איפוס חדש.");
      setVerifying(false);
      return;
    }

    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");

    if (access_token && refresh_token && type === "recovery") {
      // Unlock the form IMMEDIATELY. No await before this point —
      // every state that disables the form is now flipped off.
      setVerifying(false);
      setReadyAnnounce("הקישור אומת — ניתן לקבוע סיסמה חדשה");

      // Fire setSession in the background. If it succeeds, strip the
      // tokens from the URL so they don't leak via history, referrer,
      // or autofill. If it fails, surface the error — the submit
      // handler will also catch "Auth session missing" from
      // updateUser if the user races us to the finish line.
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error: setErr }) => {
          if (setErr) {
            setLinkError("שגיאה באימות הקישור: " + setErr.message);
            return;
          }
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          setLinkError("שגיאה באימות הקישור: " + msg);
        });
      return;
    }

    // No recovery tokens on the URL — the user reached this page
    // without clicking a real link.
    setLinkError("לא נמצא קישור איפוס תקין בכתובת.");
    setVerifying(false);
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (password !== confirm) {
      setMismatch(true);
      setSubmitError("הסיסמאות אינן תואמות");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        // "Auth session missing!" means setSession never landed (or
        // got invalidated). Nudge the user to request a fresh reset
        // by routing the error into linkError so the "בקש איפוס חדש"
        // link is the visible CTA.
        if (authError.message.toLowerCase().includes("auth session missing")) {
          setLinkError("אימות הקישור נכשל. בקש איפוס חדש דרך עמוד 'שכחתי סיסמה'.");
          return;
        }
        throw new Error(authError.message);
      }
      router.push("/login?reset=1");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "שגיאה בעדכון הסיסמה");
    } finally {
      setBusy(false);
    }
  };

  // verifying || busy — and ONLY these two — gate the fieldset.
  const formDisabled = verifying || busy;

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

        {verifying ? (
          <p
            role="status"
            aria-live="polite"
            className="text-brand-ink/70 mt-6 text-center text-sm"
          >
            מאמת את הקישור…
          </p>
        ) : null}

        {linkError ? (
          <div
            role="alert"
            className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3 text-sm"
          >
            <p className="font-semibold">{linkError}</p>
            <p className="mt-1">
              <a href="/forgot-password" className="font-semibold underline">
                בקש איפוס חדש
              </a>
            </p>
          </div>
        ) : null}

        {submitError ? (
          <div
            role="alert"
            className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3 text-sm"
          >
            {submitError}
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
