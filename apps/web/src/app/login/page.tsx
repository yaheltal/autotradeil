"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "@/components/BrandMark";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * Contrast audit (used across this file):
 *   bg-brand-cream (#f8f8f6) + text-brand-ink (#1a1a1a) → 17.3:1 (AAA)
 *   bg-brand-navy (#1a1a2e)  + text-brand-cream        → 15.9:1 (AAA)
 *   focus ring outline-brand-navy on cream              → 15.9:1 (AAA, passes SC 1.4.11)
 *   danger-bg #fee2e2 + danger-text #7f1d1d             → 10.6:1 (AAA)
 *   ok-bg #dcfce7    + ok-text #14532d                  → 11.0:1 (AAA)
 */

type Whoami = {
  id: string;
  email: string;
  user_type: "consumer" | "dealer" | "admin";
  verified: boolean;
};

type DealerMe = {
  verified: boolean;
  rejection_reason: string | null;
  rejected_at: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const signedOut = params.get("signedOut") === "1";
  const [resetToast, setResetToast] = useState(false);

  // Phase 4.4 — TOTP step state
  const [partialToken, setPartialToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const totpInputRef = useRef<HTMLInputElement>(null);
  const totpHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (params.get("reset") !== "1" || typeof window === "undefined") return;
    setResetToast(true);
    // Strip ?reset=1 so refresh doesn't re-announce (a11y-lead rule H).
    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    window.history.replaceState({}, "", url.toString());
  }, [params]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Move focus + announce when the TOTP step appears.
  useEffect(() => {
    if (partialToken) {
      queueMicrotask(() => totpHeadingRef.current?.focus());
    }
  }, [partialToken]);

  const submitTotp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!partialToken || totpCode.length !== 6) return;
    setTotpBusy(true);
    setError(null);
    try {
      const resp = await apiFetch<{
        access_token: string;
        refresh_token: string | null;
      }>("/api/v1/auth/login/totp", {
        method: "POST",
        body: JSON.stringify({ partial_token: partialToken, code: totpCode }),
      });
      const supabase = createClient();
      if (resp.refresh_token) {
        await supabase.auth.setSession({
          access_token: resp.access_token,
          refresh_token: resp.refresh_token,
        });
      }
      // Use the new access token to resolve where to land.
      const who = await apiFetch<Whoami>("/api/v1/auth/whoami", {
        token: resp.access_token,
      });
      if (who.user_type === "admin") {
        router.push(next || "/admin");
      } else {
        router.push(next || "/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "קוד שגוי");
      totpInputRef.current?.focus();
    } finally {
      setTotpBusy(false);
    }
  };

  const cancelTotp = () => {
    setPartialToken(null);
    setTotpCode("");
    setError(null);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Phase 4.4 — go through our backend proxy so the TOTP gate triggers.
    let loginResp: {
      access_token?: string;
      refresh_token?: string;
      requires_totp?: boolean;
      partial_token?: string;
    };
    try {
      loginResp = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שם משתמש או סיסמה שגויים");
      setLoading(false);
      return;
    }

    // If the dealer has TOTP enabled, show the second step.
    if (loginResp.requires_totp && loginResp.partial_token) {
      setPartialToken(loginResp.partial_token);
      setLoading(false);
      // Announce the step transition + move focus to the code input.
      queueMicrotask(() => totpInputRef.current?.focus());
      return;
    }

    if (!loginResp.access_token) {
      setError("תגובת שרת לא צפויה");
      setLoading(false);
      return;
    }

    // Hand the access token back to Supabase JS so the rest of the app
    // (middleware, /dashboard etc.) sees a normal session.
    const supabase = createClient();
    if (loginResp.refresh_token) {
      await supabase.auth.setSession({
        access_token: loginResp.access_token,
        refresh_token: loginResp.refresh_token,
      });
    }

    const token = loginResp.access_token;

    try {
      const who = await apiFetch<Whoami>("/api/v1/auth/whoami", { token });

      if (who.user_type === "admin") {
        router.push(next || "/admin");
        return;
      }

      if (who.user_type === "dealer") {
        try {
          const me = await apiFetch<DealerMe>("/api/v1/dealers/me", { token });
          if (me.verified) {
            router.push(next || "/dashboard");
            return;
          }
          if (me.rejected_at) {
            const reason = encodeURIComponent(me.rejection_reason ?? "other");
            router.push(`/signup/dealer/rejected?reason=${reason}`);
            return;
          }
          router.push("/signup/dealer/pending");
          return;
        } catch {
          // Dealer row may not exist yet (trigger race) — treat as pending.
          router.push("/signup/dealer/pending");
          return;
        }
      }

      setError("סוג המשתמש אינו נתמך");
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "שגיאה לא צפויה בשרת");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex justify-center">
          <BrandMark />
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy mt-10 text-center text-3xl font-bold tracking-tight focus:outline-none"
        >
          כניסה למערכת
        </h1>
        <p className="text-brand-ink/70 mt-2 text-center">היכנס עם פרטי החשבון שלך</p>

        {signedOut ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-ok-bg text-ok-text mt-6 rounded-md px-4 py-3 text-sm"
          >
            התנתקת בהצלחה. היכנס שוב כדי להמשיך.
          </div>
        ) : null}

        {partialToken ? (
          // ============================================================
          // TOTP step (Phase 4.4 Step 9). Replaces the password form.
          // role="region" + aria-live politely announces the step change.
          // ============================================================
          <section role="region" aria-live="polite" aria-label="שלב אימות דו-שלבי" className="mt-8">
            <h2
              ref={totpHeadingRef}
              tabIndex={-1}
              className="text-brand-navy text-xl font-bold focus:outline-none"
            >
              הזנת קוד 2FA
            </h2>
            <p className="text-brand-ink/70 mt-2 text-sm">
              פתח את אפליקציית Google Authenticator והזן את הקוד בן 6 הספרות.
            </p>

            <form onSubmit={submitTotp} noValidate className="mt-6 space-y-5">
              {error ? (
                <div
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="bg-danger-bg text-danger-text rounded-md px-4 py-3 text-sm focus:outline-none"
                >
                  {error}
                </div>
              ) : null}

              <div>
                <label htmlFor="totp-code" className="text-brand-navy block text-sm font-medium">
                  קוד אימות בן 6 ספרות
                </label>
                <input
                  id="totp-code"
                  ref={totpInputRef}
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-40 rounded-md border bg-white px-3 py-2 font-mono text-base tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              <button
                type="submit"
                disabled={totpBusy || totpCode.length !== 6}
                aria-busy={totpBusy || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {totpBusy ? "מאמת…" : "אמת והתחבר"}
              </button>

              <button
                type="button"
                onClick={cancelTotp}
                className="text-brand-navy focus-visible:outline-brand-navy block w-full rounded text-center text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                חזרה להתחברות
              </button>
            </form>
          </section>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
            {error ? (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="bg-danger-bg text-danger-text rounded-md px-4 py-3 text-sm focus:outline-none"
              >
                {error}
              </div>
            ) : null}

            <div>
              <label htmlFor="email" className="text-brand-navy block text-sm font-medium">
                אימייל
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-brand-navy block text-sm font-medium">
                סיסמה
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading || undefined}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-3 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? "מתחבר…" : "כניסה"}
            </button>
          </form>
        )}

        {!partialToken ? <OtpLoginSection router={router} next={next} /> : null}

        {resetToast ? (
          <p
            role="status"
            aria-live="polite"
            className="bg-ok-bg text-ok-text mt-4 rounded-md px-4 py-3 text-sm"
          >
            הסיסמה עודכנה בהצלחה — ניתן להתחבר עם הסיסמה החדשה
          </p>
        ) : null}

        <p className="text-brand-ink/70 mt-6 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy rounded-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            שכחתי סיסמה
          </Link>
        </p>

        <p className="text-brand-ink/70 mt-6 text-center text-sm">
          אין לך חשבון?{" "}
          <Link
            href="/signup/dealer"
            className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy rounded-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            הירשם כסוחר
          </Link>
        </p>
      </div>
    </main>
  );
}

// =============================================================================
// OTP login section (Phase 4.4 fix) — passwordless via email code.
// Collapsed-by-default <details>; on toggle-open we move focus to email.
// =============================================================================

type OtpChannel = "sms" | "email";

function OtpLoginSection({ router, next }: { router: ReturnType<typeof useRouter>; next: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"identifier" | "code">("identifier");
  // Channel = how the user is identifying themselves AND the delivery method.
  // SMS is the default and primary path per product request.
  const [channel, setChannel] = useState<OtpChannel>("sms");
  const [actualChannel, setActualChannel] = useState<OtpChannel>("sms");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stepAnnounce, setStepAnnounce] = useState("");
  const [channelAnnounce, setChannelAnnounce] = useState("");

  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // a11y-lead req #3: focus moves into the panel on disclosure expand so
  // keyboard/SR users don't get stranded on the trigger.
  useEffect(() => {
    if (open) {
      queueMicrotask(() => panelHeadingRef.current?.focus());
    }
  }, [open]);

  const onChannelChange = (next: OtpChannel) => {
    setChannel(next);
    setChannelAnnounce(
      next === "sms" ? "הזן מספר טלפון לקבלת קוד ב-SMS" : "הזן אימייל לקבלת קוד באימייל",
    );
    queueMicrotask(() => {
      if (next === "sms") phoneInputRef.current?.focus();
      else emailInputRef.current?.focus();
    });
  };

  const requestCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const body =
        channel === "sms"
          ? { phone: otpPhone.trim(), delivery: "sms" }
          : { email: otpEmail.trim(), delivery: "email" };
      const resp = await apiFetch<{ message: string; delivery: OtpChannel }>(
        "/api/v1/auth/otp/request",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      // Backend may downgrade sms → email if Twilio fails or no phone on
      // file. Echo the actual channel so step 2 hint stays accurate.
      const finalChannel: OtpChannel = resp.delivery === "sms" ? "sms" : "email";
      setActualChannel(finalChannel);
      setInfo(
        finalChannel === "sms"
          ? "אם המספר קיים במערכת, נשלח אליו קוד ב-SMS."
          : "אם הכתובת קיימת במערכת, נשלח אליה קוד באימייל.",
      );
      setStep("code");
      queueMicrotask(() => {
        codeInputRef.current?.focus();
        setStepAnnounce(
          finalChannel === "sms" ? "הזן את הקוד שהתקבל ב-SMS" : "הזן את הקוד שהתקבל באימייל",
        );
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה בשליחת הקוד");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (otpCode.length !== 6) return;
    setBusy(true);
    setErr(null);
    try {
      const body =
        actualChannel === "sms"
          ? { phone: otpPhone.trim(), code: otpCode }
          : { email: otpEmail.trim(), code: otpCode };
      const resp = await apiFetch<{
        access_token: string;
        refresh_token: string | null;
      }>("/api/v1/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const supabase = createClient();
      if (resp.refresh_token) {
        await supabase.auth.setSession({
          access_token: resp.access_token,
          refresh_token: resp.refresh_token,
        });
      }
      // Same routing logic the password login uses — admin → /admin,
      // dealer → /dashboard or pending/rejected based on verification status.
      try {
        const who = await apiFetch<Whoami>("/api/v1/auth/whoami", {
          token: resp.access_token,
        });
        if (who.user_type === "admin") {
          router.push(next || "/admin");
          return;
        }
        if (who.user_type === "dealer") {
          try {
            const me = await apiFetch<DealerMe>("/api/v1/dealers/me", {
              token: resp.access_token,
            });
            if (me.verified) {
              router.push(next || "/dashboard");
            } else if (me.rejected_at) {
              const reason = encodeURIComponent(me.rejection_reason ?? "other");
              router.push(`/signup/dealer/rejected?reason=${reason}`);
            } else {
              router.push("/signup/dealer/pending");
            }
            return;
          } catch {
            router.push("/signup/dealer/pending");
            return;
          }
        }
        setErr("סוג המשתמש אינו נתמך");
      } catch {
        // whoami failed — fall back to /dashboard.
        router.push(next || "/dashboard");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "קוד שגוי");
      codeInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setStep("identifier");
    setOtpCode("");
    setErr(null);
    setInfo(null);
    queueMicrotask(() => {
      if (channel === "sms") phoneInputRef.current?.focus();
      else emailInputRef.current?.focus();
    });
  };

  return (
    <section aria-labelledby="alt-login-heading" className="mt-8">
      <h2 id="alt-login-heading" className="sr-only">
        דרכי כניסה נוספות
      </h2>

      {/* Promoted "passwordless OTP" entry point — replaces the old <details>.
       *  Disclosure pattern: aria-controls/aria-expanded on the trigger; the
       *  panel below is hidden until expanded, and focus moves to the panel
       *  heading on expand (a11y-lead req #3). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-controls="otp-panel"
        aria-expanded={open}
        className="border-brand-navy/30 text-brand-navy hover:border-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 bg-white px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span aria-hidden="true">🔐</span>
        כניסה עם קוד חד פעמי (ללא סיסמה)
      </button>

      {open ? (
        <div
          id="otp-panel"
          role="region"
          aria-labelledby="otp-heading"
          className="border-brand-navy/15 bg-brand-cream/40 mt-4 rounded-lg border-2 p-5"
        >
          <h3
            id="otp-heading"
            ref={panelHeadingRef}
            tabIndex={-1}
            className="text-brand-navy text-base font-bold focus:outline-none"
          >
            כניסה עם קוד חד פעמי
          </h3>

          {/* Step indicator — semantic list, not navigation. */}
          <ol
            aria-label="שלבי הכניסה"
            className="text-brand-navy/70 mb-4 mt-2 flex list-none gap-2 text-xs"
          >
            <li
              aria-current={step === "identifier" ? "step" : undefined}
              className={step === "identifier" ? "text-brand-navy font-bold" : ""}
            >
              1. בחירת ערוץ
            </li>
            <li aria-hidden="true">›</li>
            <li
              aria-current={step === "code" ? "step" : undefined}
              className={step === "code" ? "text-brand-navy font-bold" : ""}
            >
              2. הזנת הקוד
            </li>
          </ol>

          {/* Polite announcers — sr-only, keyed so each new value re-announces. */}
          {stepAnnounce ? (
            <p role="status" aria-live="polite" className="sr-only" key={stepAnnounce}>
              {stepAnnounce}
            </p>
          ) : null}
          {channelAnnounce ? (
            <p role="status" aria-live="polite" className="sr-only" key={channelAnnounce}>
              {channelAnnounce}
            </p>
          ) : null}

          {err ? (
            <p
              role="alert"
              className="bg-danger-bg text-danger-text mb-3 rounded-md px-3 py-2 text-sm"
            >
              {err}
            </p>
          ) : null}
          {info && step === "code" ? (
            <p className="bg-ok-bg text-ok-text mb-3 rounded-md px-3 py-2 text-sm">{info}</p>
          ) : null}

          {step === "identifier" ? (
            <form onSubmit={requestCode} noValidate className="space-y-4">
              {/* Channel = identifier type + delivery method. SMS is primary. */}
              <fieldset>
                <legend className="text-brand-navy block text-sm font-medium">
                  באיזה ערוץ לקבל את הקוד?
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["sms", "📱", "SMS לטלפון"],
                      ["email", "📧", "אימייל"],
                    ] as const
                  ).map(([value, icon, label]) => {
                    const selected = channel === value;
                    return (
                      <label
                        key={value}
                        className={[
                          "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-semibold transition",
                          "has-[:focus-visible]:outline-brand-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                          selected
                            ? "border-brand-navy bg-brand-navy text-brand-cream"
                            : "border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 bg-white",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="otp-channel"
                          value={value}
                          checked={selected}
                          onChange={() => onChannelChange(value)}
                          className="sr-only"
                        />
                        <span aria-hidden="true">{icon}</span>
                        {label}
                        {selected ? <span aria-hidden="true">✓</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {channel === "sms" ? (
                <div>
                  <label
                    htmlFor="otp-login-phone"
                    className="text-brand-navy block text-sm font-medium"
                  >
                    מספר טלפון
                  </label>
                  <input
                    id="otp-login-phone"
                    ref={phoneInputRef}
                    type="tel"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    placeholder="052-1234567"
                    value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value)}
                    className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                  />
                  <p className="text-brand-navy/70 mt-1 text-xs">
                    הזן את מספר הטלפון השמור בפרופיל הסוחר
                  </p>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="otp-login-email"
                    className="text-brand-navy block text-sm font-medium"
                  >
                    אימייל
                  </label>
                  <input
                    id="otp-login-email"
                    ref={emailInputRef}
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    required
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={busy || (channel === "sms" ? !otpPhone.trim() : !otpEmail.trim())}
                aria-busy={busy || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
              >
                {busy ? "שולח…" : channel === "sms" ? "שלח קוד ב-SMS" : "שלח קוד באימייל"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} noValidate className="space-y-3">
              <div>
                <label
                  htmlFor="otp-login-code"
                  className="text-brand-navy block text-sm font-medium"
                >
                  קוד אימות
                </label>
                <p id="otp-login-code-hint" className="text-brand-navy/70 mt-1 text-xs">
                  {actualChannel === "sms"
                    ? "הזן את הקוד בן 6 הספרות שהתקבל ב-SMS"
                    : "הזן את הקוד בן 6 הספרות שהתקבל באימייל"}
                </p>
                <input
                  id="otp-login-code"
                  ref={codeInputRef}
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  aria-describedby="otp-login-code-hint"
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-40 rounded-md border bg-white px-3 py-2 font-mono text-base tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={busy || otpCode.length !== 6}
                  aria-busy={busy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {busy ? "מאמת…" : "התחבר"}
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  חזרה
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}

function translateAuthError(msg?: string): string | null {
  if (!msg) return null;
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login")) return "שם משתמש או סיסמה שגויים";
  if (lower.includes("email not confirmed")) return "המייל עדיין לא אומת";
  if (lower.includes("rate limit")) return "יותר מדי ניסיונות — נסה שוב מאוחר יותר";
  return msg;
}
