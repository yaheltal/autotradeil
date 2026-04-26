"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { OtpInput } from "@/components/auth/OtpInput";
import { BrandMark } from "@/components/BrandMark";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * Login (mobile-first redesign).
 *
 * Three sequential layouts driven by state:
 *   1. PASSWORD STEP — email + password + remember-me + forgot-password
 *   2. TOTP STEP     — segmented 6-slot OTP for dealers with 2FA enabled
 *   3. OTP-LOGIN     — passwordless via SMS/email code (collapsed by default)
 *
 * Visual language: cream surface with a subtle navy dot-grid backdrop
 * (matches the landing page), navy serif H1, gold focus rings on
 * inputs, a tall navy primary button. No social buttons.
 *
 * Contrast (audited):
 *   bg-brand-cream + text-brand-ink    → 17:1  (AAA)
 *   bg-brand-navy  + text-brand-cream  → 15.9:1 (AAA)
 *   focus ring brand-gold on cream     → 3.6:1 (UI element minimum 3:1 ✓)
 *
 * a11y:
 *   - H1 focused on mount; error region focusable + role=alert
 *   - Floating-label inputs use real <label> + aria-describedby for hints
 *   - Password show/hide button has dynamic aria-label
 *   - "remember me" is real <input type=checkbox>; bash session is already
 *     persistent so this is informational + future-proofing
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
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const signedOut = params.get("signedOut") === "1";
  const [resetToast, setResetToast] = useState(false);

  // Phase 4.4 — TOTP step state (dealers with 2FA)
  const [partialToken, setPartialToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const totpHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (params.get("reset") !== "1" || typeof window === "undefined") return;
    setResetToast(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    window.history.replaceState({}, "", url.toString());
  }, [params]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error && errorRef.current) errorRef.current.focus();
  }, [error]);

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
      const who = await apiFetch<Whoami>("/api/v1/auth/whoami", {
        token: resp.access_token,
      });
      router.push(who.user_type === "admin" ? next || "/admin" : next || "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "קוד שגוי");
      setTotpCode("");
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

    if (loginResp.requires_totp && loginResp.partial_token) {
      setPartialToken(loginResp.partial_token);
      setLoading(false);
      return;
    }

    if (!loginResp.access_token) {
      setError("תגובת שרת לא צפויה");
      setLoading(false);
      return;
    }

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
    <main
      id="main"
      tabIndex={-1}
      className="bg-brand-cream relative min-h-[100dvh] focus:outline-none"
    >
      {/* Decorative dot grid backdrop — same idea as the landing hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(circle, #1B2B4B 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Top-edge gold accent stripe */}
      <div aria-hidden="true" className="bg-brand-gold absolute inset-x-0 top-0 h-1" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex justify-center">
          <BrandMark />
        </div>

        {partialToken ? (
          <TotpStep
            ref={totpHeadingRef}
            code={totpCode}
            onCodeChange={setTotpCode}
            onSubmit={submitTotp}
            onCancel={cancelTotp}
            busy={totpBusy}
            error={error}
            errorRef={errorRef}
          />
        ) : (
          <PasswordStep
            ref={headingRef}
            email={email}
            password={password}
            showPassword={showPassword}
            rememberMe={rememberMe}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onShowPasswordToggle={() => setShowPassword((v) => !v)}
            onRememberMeChange={setRememberMe}
            onSubmit={onSubmit}
            busy={loading}
            error={error}
            errorRef={errorRef}
            signedOut={signedOut}
            resetToast={resetToast}
          />
        )}

        {!partialToken ? (
          <OtpLoginSection router={router} next={next} onError={setError} errorRef={errorRef} />
        ) : null}

        <p className="text-brand-ink/70 mt-10 text-center text-sm">
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
// PASSWORD STEP
// =============================================================================

import { forwardRef } from "react";

const PasswordStep = forwardRef<
  HTMLHeadingElement,
  {
    email: string;
    password: string;
    showPassword: boolean;
    rememberMe: boolean;
    onEmailChange: (v: string) => void;
    onPasswordChange: (v: string) => void;
    onShowPasswordToggle: () => void;
    onRememberMeChange: (v: boolean) => void;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    busy: boolean;
    error: string | null;
    errorRef: React.RefObject<HTMLDivElement>;
    signedOut: boolean;
    resetToast: boolean;
  }
>(function PasswordStepImpl(
  {
    email,
    password,
    showPassword,
    rememberMe,
    onEmailChange,
    onPasswordChange,
    onShowPasswordToggle,
    onRememberMeChange,
    onSubmit,
    busy,
    error,
    errorRef,
    signedOut,
    resetToast,
  },
  ref,
) {
  return (
    <>
      <h1
        ref={ref}
        tabIndex={-1}
        className="text-brand-navy mt-8 text-center font-serif text-4xl font-bold leading-tight tracking-tight focus:outline-none"
      >
        ברוך שובך
      </h1>
      <p className="text-brand-ink/70 mt-2 text-center text-sm">
        היכנס עם פרטי החשבון שלך כדי להמשיך
      </p>

      {signedOut ? (
        <div
          role="status"
          aria-live="polite"
          className="bg-ok-bg text-ok-text mt-6 rounded-md px-4 py-3 text-center text-sm"
        >
          התנתקת בהצלחה. היכנס שוב כדי להמשיך.
        </div>
      ) : null}
      {resetToast ? (
        <p
          role="status"
          aria-live="polite"
          className="bg-ok-bg text-ok-text mt-4 rounded-md px-4 py-3 text-center text-sm"
        >
          הסיסמה עודכנה — ניתן להתחבר עם הסיסמה החדשה
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        noValidate
        className="border-brand-navy/10 mt-7 flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:p-7"
      >
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

        <FloatingField
          id="email"
          type="email"
          label="אימייל"
          autoComplete="email"
          dir="ltr"
          required
          value={email}
          onChange={onEmailChange}
        />

        <FloatingField
          id="password"
          type={showPassword ? "text" : "password"}
          label="סיסמה"
          autoComplete="current-password"
          required
          value={password}
          onChange={onPasswordChange}
          trailing={
            <button
              type="button"
              onClick={onShowPasswordToggle}
              aria-label={showPassword ? "הסתרת סיסמה" : "הצגת סיסמה"}
              aria-pressed={showPassword}
              className="text-brand-navy/60 hover:text-brand-navy focus-visible:outline-brand-navy inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="text-brand-ink flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => onRememberMeChange(e.target.checked)}
              className="border-brand-navy/30 text-brand-navy focus-visible:outline-brand-navy h-4 w-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <span>זכור אותי</span>
          </label>
          <Link
            href="/forgot-password"
            className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy rounded-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            שכחתי סיסמה
          </Link>
        </div>

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy || undefined}
          className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy shadow-brand-navy/20 mt-2 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl px-5 py-3.5 text-base font-semibold shadow-md transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
        >
          {busy ? "מתחבר…" : "כניסה"}
        </button>
      </form>
    </>
  );
});

// =============================================================================
// TOTP STEP — segmented OTP for 2FA-enabled dealers
// =============================================================================

const TotpStep = forwardRef<
  HTMLHeadingElement,
  {
    code: string;
    onCodeChange: (v: string) => void;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
    busy: boolean;
    error: string | null;
    errorRef: React.RefObject<HTMLDivElement>;
  }
>(function TotpStepImpl({ code, onCodeChange, onSubmit, onCancel, busy, error, errorRef }, ref) {
  return (
    <section role="region" aria-live="polite" aria-label="שלב אימות דו-שלבי" className="mt-8">
      <h2
        ref={ref}
        tabIndex={-1}
        className="text-brand-navy text-center font-serif text-3xl font-bold tracking-tight focus:outline-none"
      >
        אימות דו-שלבי
      </h2>
      <p id="totp-hint" className="text-brand-ink/70 mt-2 text-center text-sm">
        פתח את אפליקציית Google Authenticator והזן את הקוד בן 6 הספרות
      </p>

      <form
        onSubmit={onSubmit}
        noValidate
        className="border-brand-navy/10 mt-7 flex flex-col gap-5 rounded-2xl border bg-white p-5 shadow-sm sm:p-7"
      >
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

        <OtpInput
          value={code}
          onChange={(v) => onCodeChange(v.replace(/\D/g, "").slice(0, 6))}
          onComplete={(v) => {
            // Auto-submit on full 6 digits — no extra tap needed
            if (v.length === 6 && !busy) {
              const form = (document.activeElement as HTMLElement)?.closest("form");
              form?.requestSubmit();
            }
          }}
          aria-describedby="totp-hint"
          autoFocus
        />

        <button
          type="submit"
          disabled={busy || code.length !== 6}
          aria-busy={busy || undefined}
          className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy shadow-brand-navy/20 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl px-5 py-3.5 text-base font-semibold shadow-md transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "מאמת…" : "אמת והתחבר"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="text-brand-navy focus-visible:outline-brand-navy rounded text-center text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          חזרה להתחברות
        </button>
      </form>
    </section>
  );
});

// =============================================================================
// FloatingField — input with floating label + optional trailing element
// =============================================================================

function FloatingField({
  id,
  type,
  label,
  value,
  onChange,
  autoComplete,
  required,
  dir,
  trailing,
}: {
  id: string;
  type: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  dir?: "ltr" | "rtl";
  trailing?: React.ReactNode;
}) {
  const hasValue = value.length > 0;
  return (
    <div className="border-brand-navy/15 focus-within:border-brand-gold focus-within:ring-brand-gold/25 group relative flex items-center gap-2 rounded-xl border bg-white transition-colors focus-within:ring-4">
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // peer enables the floating-label trick below
        className="text-brand-navy peer min-h-[56px] flex-1 bg-transparent px-4 pb-2 pt-5 text-base placeholder-transparent focus:outline-none"
        placeholder={label}
      />
      <label
        htmlFor={id}
        className={[
          "text-brand-ink/55 pointer-events-none absolute start-4 transition-all duration-150",
          // Floating: when input has value OR is focused, label shrinks up
          hasValue
            ? "text-brand-navy top-1.5 text-xs font-semibold"
            : "peer-focus:text-brand-navy top-4 text-base peer-focus:top-1.5 peer-focus:text-xs peer-focus:font-semibold",
        ].join(" ")}
      >
        {label}
      </label>
      {trailing ? <div className="me-2">{trailing}</div> : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0112 19c-6.5 0-10-7-10-7a18.5 18.5 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c6.5 0 10 7 10 7a18.5 18.5 0 01-3.21 4.71M1 1l22 22M9.88 9.88a3 3 0 104.24 4.24" />
    </svg>
  );
}

// =============================================================================
// OTP login section (passwordless via SMS or email).
// Uses the new <OtpInput> for the code step.
// =============================================================================

type OtpChannel = "sms" | "email";

function OtpLoginSection({
  router,
  next,
  onError,
  errorRef,
}: {
  router: ReturnType<typeof useRouter>;
  next: string;
  onError: (s: string | null) => void;
  errorRef: React.RefObject<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"identifier" | "code">("identifier");
  const [channel, setChannel] = useState<OtpChannel>("sms");
  const [actualChannel, setActualChannel] = useState<OtpChannel>("sms");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stepAnnounce, setStepAnnounce] = useState("");

  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => panelHeadingRef.current?.focus());
    }
  }, [open]);

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
      const finalChannel: OtpChannel = resp.delivery === "sms" ? "sms" : "email";
      setActualChannel(finalChannel);
      setInfo(
        finalChannel === "sms"
          ? "אם המספר קיים במערכת, נשלח אליו קוד ב-SMS."
          : "אם הכתובת קיימת במערכת, נשלח אליה קוד באימייל.",
      );
      setStep("code");
      setStepAnnounce(
        finalChannel === "sms" ? "הזן את הקוד שהתקבל ב-SMS" : "הזן את הקוד שהתקבל באימייל",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה בשליחת הקוד");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? otpCode).trim();
    if (code.length !== 6) return;
    setBusy(true);
    setErr(null);
    try {
      const body =
        actualChannel === "sms"
          ? { phone: otpPhone.trim(), code }
          : { email: otpEmail.trim(), code };
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
        router.push(next || "/dashboard");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "קוד שגוי");
      setOtpCode("");
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setStep("identifier");
    setOtpCode("");
    setErr(null);
    setInfo(null);
  };

  // Surface OTP errors to the parent so its error region focuses
  useEffect(() => {
    if (err) onError(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [err]);

  return (
    <section aria-labelledby="alt-login-heading" className="mt-6">
      <h2 id="alt-login-heading" className="sr-only">
        דרכי כניסה נוספות
      </h2>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-controls="otp-panel"
        aria-expanded={open}
        className="border-brand-navy/20 text-brand-navy hover:border-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 bg-white px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span aria-hidden="true">🔐</span>
        כניסה עם קוד חד פעמי (ללא סיסמה)
      </button>

      {open ? (
        <div
          id="otp-panel"
          role="region"
          aria-labelledby="otp-heading"
          className="border-brand-navy/15 mt-3 rounded-2xl border bg-white p-5 shadow-sm sm:p-6"
        >
          <h3
            id="otp-heading"
            ref={panelHeadingRef}
            tabIndex={-1}
            className="text-brand-navy font-serif text-xl font-bold tracking-tight focus:outline-none"
          >
            כניסה עם קוד חד פעמי
          </h3>

          {stepAnnounce ? (
            <p role="status" aria-live="polite" className="sr-only" key={stepAnnounce}>
              {stepAnnounce}
            </p>
          ) : null}

          {err ? (
            <p
              role="alert"
              className="bg-danger-bg text-danger-text mt-4 rounded-md px-3 py-2 text-sm"
            >
              {err}
            </p>
          ) : null}
          {info && step === "code" ? (
            <p className="bg-ok-bg text-ok-text mt-4 rounded-md px-3 py-2 text-sm">{info}</p>
          ) : null}

          {step === "identifier" ? (
            <form onSubmit={requestCode} noValidate className="mt-5 space-y-4">
              <fieldset>
                <legend className="text-brand-navy mb-2 block text-sm font-semibold">
                  באיזה ערוץ לקבל את הקוד?
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["sms", "📱", "SMS"],
                      ["email", "📧", "אימייל"],
                    ] as const
                  ).map(([value, icon, label]) => {
                    const selected = channel === value;
                    return (
                      <label
                        key={value}
                        className={[
                          "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition",
                          "has-[:focus-visible]:outline-brand-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                          selected
                            ? "border-brand-navy bg-brand-navy text-brand-cream"
                            : "border-brand-navy/25 text-brand-navy hover:bg-brand-navy/5 bg-white",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="otp-channel"
                          value={value}
                          checked={selected}
                          onChange={() => setChannel(value)}
                          className="sr-only"
                        />
                        <span aria-hidden="true">{icon}</span>
                        {label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {channel === "sms" ? (
                <FloatingField
                  id="otp-login-phone"
                  type="tel"
                  label="מספר טלפון"
                  autoComplete="tel"
                  dir="ltr"
                  required
                  value={otpPhone}
                  onChange={setOtpPhone}
                />
              ) : (
                <FloatingField
                  id="otp-login-email"
                  type="email"
                  label="אימייל"
                  autoComplete="email"
                  dir="ltr"
                  required
                  value={otpEmail}
                  onChange={setOtpEmail}
                />
              )}

              <button
                type="submit"
                disabled={busy || (channel === "sms" ? !otpPhone.trim() : !otpEmail.trim())}
                aria-busy={busy || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-[48px] w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
              >
                {busy ? "שולח…" : channel === "sms" ? "שלח קוד ב-SMS" : "שלח קוד באימייל"}
              </button>
            </form>
          ) : (
            <div className="mt-5 space-y-4">
              <p
                id="otp-login-code-hint"
                className="text-brand-ink/65 text-center text-xs leading-relaxed"
              >
                {actualChannel === "sms"
                  ? "הזן את הקוד בן 6 הספרות שהתקבל ב-SMS"
                  : "הזן את הקוד בן 6 הספרות שהתקבל באימייל"}
              </p>
              <OtpInput
                value={otpCode}
                onChange={(v) => setOtpCode(v.replace(/\D/g, "").slice(0, 6))}
                onComplete={(v) => void verifyCode(v)}
                aria-describedby="otp-login-code-hint"
                autoFocus
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void verifyCode()}
                  disabled={busy || otpCode.length !== 6}
                  aria-busy={busy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {busy ? "מאמת…" : "התחבר"}
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  className="border-brand-navy/25 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-[48px] items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  חזרה
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {/* Reference is reserved so parent's error focus can target this region.
          The actual error markup lives inside the panel above. */}
      <div ref={errorRef} className="sr-only" tabIndex={-1} aria-hidden="true" />
    </section>
  );
}
