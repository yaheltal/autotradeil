"use client";

import { Apple, CheckCircle2, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { forwardRef, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { OtpInput } from "@/components/auth/OtpInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * /login — editorial masthead.
 *
 * Layout direction (locked per CLAUDE.md §4):
 *   masthead  (eyebrow + serif H1 + hairline + subtitle, left-aligned)
 *   ──────────
 *   form      (Label + Input pairs, ghost icon for show/hide password)
 *   ──────────
 *   alt:      OAuth (outline) + OTP login (link → inline panel)
 *
 * No card, no border, no backdrop decoration, no framer-motion. Type
 * on paper.
 *
 * Auth state machine preserved verbatim:
 *   password  → optional TOTP  → whoami  → redirect
 *                                          ├─ admin   → next || /admin
 *                                          ├─ dealer verified → next || /dashboard
 *                                          ├─ dealer rejected → /signup/dealer/rejected
 *                                          └─ dealer pending  → /signup/dealer/pending
 *
 * Auth flows (login, whoami, OTP send/verify, OAuth) stay as raw
 * apiFetch — Phase 4 explicitly skipped these because they're complex
 * one-shot user flows where TanStack adds no caching value.
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
  const oauthError = params.get("error") === "oauth";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // OAuth callback failures (e.g. user closed the Google popup) get
  // surfaced as a destructive alert and the query param is wiped.
  useEffect(() => {
    if (!oauthError) return;
    setError("ההתחברות עם הספק החיצוני נכשלה. נסה שוב.");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [oauthError]);

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
      className="bg-paper text-ink py-3xl sm:py-4xl min-h-[100dvh] focus:outline-none"
    >
      <div className="px-lg sm:px-2xl mx-auto w-full max-w-md">
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
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onShowPasswordToggle={() => setShowPassword((v) => !v)}
            onSubmit={onSubmit}
            busy={loading}
            error={error}
            errorRef={errorRef}
            signedOut={signedOut}
            resetToast={resetToast}
            router={router}
            next={next}
            onOtpError={setError}
          />
        )}
      </div>
    </main>
  );
}

// =============================================================================
// MASTHEAD — eyebrow + serif H1 + hairline + subtitle.
// The editorial signature for /login, /signup, and the auth-flow pages.
// =============================================================================

const Masthead = forwardRef<HTMLHeadingElement, { title: string; subtitle: string }>(
  function MastheadImpl({ title, subtitle }, ref) {
    return (
      <header>
        <p className="text-muted text-xs font-medium uppercase tracking-widest">AutoTradeIL</p>
        <h1
          ref={ref}
          tabIndex={-1}
          className="text-ink mt-sm tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
        >
          {title}
        </h1>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted mt-lg text-sm">{subtitle}</p>
      </header>
    );
  },
);

// =============================================================================
// PASSWORD STEP
// =============================================================================

const PasswordStep = forwardRef<
  HTMLHeadingElement,
  {
    email: string;
    password: string;
    showPassword: boolean;
    onEmailChange: (v: string) => void;
    onPasswordChange: (v: string) => void;
    onShowPasswordToggle: () => void;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    busy: boolean;
    error: string | null;
    errorRef: React.RefObject<HTMLDivElement | null>;
    signedOut: boolean;
    resetToast: boolean;
    router: ReturnType<typeof useRouter>;
    next: string;
    onOtpError: (s: string | null) => void;
  }
>(function PasswordStepImpl(
  {
    email,
    password,
    showPassword,
    onEmailChange,
    onPasswordChange,
    onShowPasswordToggle,
    onSubmit,
    busy,
    error,
    errorRef,
    signedOut,
    resetToast,
    router,
    next,
    onOtpError,
  },
  ref,
) {
  return (
    <>
      <Masthead ref={ref} title="כניסה" subtitle="התחבר עם חשבון הסוחר או האדמין שלך." />

      <div className="mt-3xl space-y-md">
        {signedOut ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>התנתקת בהצלחה. היכנס שוב כדי להמשיך.</AlertDescription>
          </Alert>
        ) : null}
        {resetToast ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>הסיסמה עודכנה — ניתן להתחבר עם הסיסמה החדשה.</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert
            variant="destructive"
            ref={errorRef as React.RefObject<HTMLDivElement>}
            tabIndex={-1}
            className="focus:outline-none"
          >
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-2xl space-y-lg">
        <div className="space-y-xs">
          <Label htmlFor="email">אימייל</Label>
          <Input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </div>

        <div className="space-y-xs">
          <Label htmlFor="password">סיסמה</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="pe-12"
            />
            <button
              type="button"
              onClick={onShowPasswordToggle}
              aria-label={showPassword ? "הסתרת סיסמה" : "הצגת סיסמה"}
              aria-pressed={showPassword}
              className="text-muted duration-fast hover:text-ink focus-visible:outline-accent absolute end-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-start">
          <Link
            href="/forgot-password"
            className="text-muted duration-fast hover:text-ink focus-visible:outline-accent rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            שכחתי סיסמה
          </Link>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          aria-busy={busy || undefined}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              <span>מתחבר…</span>
            </>
          ) : (
            "כניסה"
          )}
        </Button>
      </form>

      <div className="my-2xl gap-md flex items-center">
        <Separator className="flex-1" />
        <span className="text-muted text-xs font-medium uppercase tracking-widest">או</span>
        <Separator className="flex-1" />
      </div>

      <SocialSignInButtons />

      <div className="mt-xl">
        <OtpLoginSection router={router} next={next} onError={onOtpError} />
      </div>

      <p className="text-muted mt-3xl text-center text-sm">
        אין לך חשבון?{" "}
        <Link
          href="/signup/dealer"
          className="text-ink duration-fast hover:text-accent focus-visible:outline-accent rounded-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          הירשם כסוחר
        </Link>
      </p>
    </>
  );
});

// =============================================================================
// TOTP STEP — 6-slot one-time code for 2FA-enabled dealers.
// Reuses the masthead so the page reads as the same surface, just a
// different chapter.
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
    errorRef: React.RefObject<HTMLDivElement | null>;
  }
>(function TotpStepImpl({ code, onCodeChange, onSubmit, onCancel, busy, error, errorRef }, ref) {
  return (
    <>
      <Masthead
        ref={ref}
        title="אימות דו-שלבי"
        subtitle="פתח את Google Authenticator והזן את הקוד בן 6 הספרות."
      />

      <form onSubmit={onSubmit} noValidate className="mt-3xl space-y-xl">
        {error ? (
          <Alert
            variant="destructive"
            ref={errorRef as React.RefObject<HTMLDivElement>}
            tabIndex={-1}
            className="focus:outline-none"
          >
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <OtpInput
          value={code}
          onChange={(v) => onCodeChange(v.replace(/\D/g, "").slice(0, 6))}
          onComplete={(v) => {
            if (v.length === 6 && !busy) {
              const form = (document.activeElement as HTMLElement)?.closest("form");
              form?.requestSubmit();
            }
          }}
          state={error ? "error" : "idle"}
          aria-describedby="totp-hint"
          autoFocus
        />

        <Button
          type="submit"
          size="lg"
          disabled={busy || code.length !== 6}
          aria-busy={busy || undefined}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              <span>מאמת…</span>
            </>
          ) : (
            "אמת והתחבר"
          )}
        </Button>

        <div className="text-center">
          <Button type="button" variant="link" onClick={onCancel}>
            חזרה להתחברות
          </Button>
        </div>
      </form>
    </>
  );
});

// =============================================================================
// SocialSignInButtons — Google + Apple via Supabase OAuth.
// =============================================================================

function SocialSignInButtons() {
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const start = async (provider: "google" | "apple") => {
    setBusy(provider);
    setErr(null);
    try {
      const supabase = createClient();
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) throw error;
      // Supabase performs a full-page redirect; nothing else to do here.
    } catch (e) {
      // Translate the most common Supabase OAuth errors to Hebrew so the
      // dealer-side message is actionable.
      const raw = e instanceof Error ? e.message : "";
      const lower = raw.toLowerCase();
      let hebrew: string;
      if (lower.includes("not enabled") || lower.includes("unsupported provider")) {
        hebrew =
          provider === "google"
            ? "התחברות עם Google אינה מופעלת. נדרשת הגדרה ב-Supabase Dashboard → Authentication → Providers → Google."
            : "התחברות עם Apple אינה מופעלת. נדרשת הגדרה ב-Supabase Dashboard → Authentication → Providers → Apple.";
      } else if (lower.includes("redirect")) {
        hebrew =
          "כתובת ה-redirect לא מאושרת. הוסף את http://localhost:3000 ל-Supabase → Authentication → URL Configuration → Redirect URLs.";
      } else {
        hebrew = raw || "שגיאה לא צפויה";
      }
      // eslint-disable-next-line no-console
      console.error(`[oauth:${provider}]`, raw);
      setErr(hebrew);
      setBusy(null);
    }
  };

  return (
    <div className="space-y-sm">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => void start("google")}
        disabled={busy !== null}
        aria-busy={busy === "google" || undefined}
        className="w-full"
      >
        <GoogleIcon />
        <span>{busy === "google" ? "מתחבר עם Google…" : "המשך עם Google"}</span>
      </Button>
      <Button
        type="button"
        size="lg"
        onClick={() => void start("apple")}
        disabled={busy !== null}
        aria-busy={busy === "apple" || undefined}
        // Apple's brand guidelines require black surface for Sign-in-with-Apple
        // buttons. Documented deviation from the 2-color palette.
        className="w-full bg-black text-white hover:bg-black/90"
      >
        <Apple aria-hidden="true" />
        <span>{busy === "apple" ? "מתחבר עם Apple…" : "המשך עם Apple"}</span>
      </Button>
      {err ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    // lucide-react has no brand glyphs; the Google G stays as a small
    // inline SVG (documented deviation in docs/<login>.md).
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0012 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 015.5 12c0-.73.13-1.43.34-2.1V7.07H2.18a10.99 10.99 0 000 9.86l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

// =============================================================================
// OTP login (passwordless via SMS or email) — inline panel toggled by a
// quiet "link"-variant trigger. State machine unchanged from the previous
// implementation; styling rebuilt against ink/paper/accent + shadcn.
// =============================================================================

type OtpChannel = "sms" | "email";

function OtpLoginSection({
  router,
  next,
  onError,
}: {
  router: ReturnType<typeof useRouter>;
  next: string;
  onError: (s: string | null) => void;
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
  const [resendIn, setResendIn] = useState(0);

  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) queueMicrotask(() => panelHeadingRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

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
        { method: "POST", body: JSON.stringify(body) },
      );
      const finalChannel: OtpChannel = resp.delivery === "sms" ? "sms" : "email";
      setActualChannel(finalChannel);
      setInfo(
        finalChannel === "sms"
          ? "אם המספר קיים במערכת, נשלח אליו קוד ב-SMS."
          : "אם הכתובת קיימת במערכת, נשלח אליה קוד באימייל.",
      );
      setStep("code");
      setResendIn(60);
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
      }>("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify(body) });
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
            if (me.verified) router.push(next || "/dashboard");
            else if (me.rejected_at) {
              const reason = encodeURIComponent(me.rejection_reason ?? "other");
              router.push(`/signup/dealer/rejected?reason=${reason}`);
            } else router.push("/signup/dealer/pending");
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

  // Surface OTP errors to the parent so its alert region focuses.
  useEffect(() => {
    if (err) onError(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [err]);

  if (!open) {
    return (
      <div className="text-center">
        <Button
          type="button"
          variant="link"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls="otp-panel"
        >
          כניסה עם קוד חד-פעמי
        </Button>
      </div>
    );
  }

  return (
    <section
      id="otp-panel"
      aria-labelledby="otp-heading"
      className="border-hairline pt-xl mt-xl border-t"
    >
      <h2
        id="otp-heading"
        ref={panelHeadingRef}
        tabIndex={-1}
        className="text-ink font-serif text-xl font-medium focus:outline-none"
      >
        כניסה עם קוד חד-פעמי
      </h2>

      <div className="mt-md space-y-md">
        {err ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}
        {info && step === "code" ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {step === "identifier" ? (
        <form onSubmit={requestCode} noValidate className="mt-lg space-y-lg">
          <fieldset>
            <legend className="text-ink text-sm font-medium">באיזה ערוץ לקבל את הקוד?</legend>
            <div className="gap-sm mt-sm grid grid-cols-2">
              {(
                [
                  ["sms", "SMS"],
                  ["email", "אימייל"],
                ] as const
              ).map(([value, label]) => {
                const selected = channel === value;
                return (
                  <label
                    key={value}
                    className={[
                      "inline-flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors",
                      "duration-fast",
                      "has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                      selected
                        ? "border-ink bg-ink text-paper"
                        : "border-hairline bg-paper text-ink hover:border-ink",
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
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {channel === "sms" ? (
            <div className="space-y-xs">
              <Label htmlFor="otp-login-phone">מספר טלפון</Label>
              <Input
                id="otp-login-phone"
                type="tel"
                dir="ltr"
                autoComplete="tel"
                required
                value={otpPhone}
                onChange={(e) => setOtpPhone(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-xs">
              <Label htmlFor="otp-login-email">אימייל</Label>
              <Input
                id="otp-login-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
              />
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={busy || (channel === "sms" ? !otpPhone.trim() : !otpEmail.trim())}
            aria-busy={busy || undefined}
            className="w-full"
          >
            {busy ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                <span>שולח…</span>
              </>
            ) : channel === "sms" ? (
              "שלח קוד ב-SMS"
            ) : (
              "שלח קוד באימייל"
            )}
          </Button>
        </form>
      ) : (
        <div className="mt-lg space-y-lg">
          <p id="otp-login-code-hint" className="text-muted text-center text-sm leading-relaxed">
            {actualChannel === "sms" ? (
              <>
                שלחנו קוד בן 6 ספרות ב-SMS אל
                <br />
                <span className="text-ink font-tabular font-medium" dir="ltr">
                  {otpPhone}
                </span>
              </>
            ) : (
              <>
                שלחנו קוד בן 6 ספרות לכתובת
                <br />
                <span className="text-ink font-medium" dir="ltr">
                  {otpEmail}
                </span>
              </>
            )}
          </p>
          <OtpInput
            value={otpCode}
            onChange={(v) => setOtpCode(v.replace(/\D/g, "").slice(0, 6))}
            onComplete={(v) => void verifyCode(v)}
            state={err ? "error" : "idle"}
            aria-describedby="otp-login-code-hint"
            autoFocus
          />
          <div className="text-center text-sm">
            <span className="text-muted">לא קיבלת קוד? </span>
            {resendIn > 0 ? (
              <span className="text-muted font-tabular">שליחה חוזרת בעוד {resendIn} שניות</span>
            ) : (
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  const fakeEvent = {
                    preventDefault: () => undefined,
                  } as unknown as FormEvent<HTMLFormElement>;
                  void requestCode(fakeEvent);
                }}
                disabled={busy}
              >
                שלח לי שוב
              </Button>
            )}
          </div>
          <div className="gap-sm flex flex-col sm:flex-row">
            <Button
              type="button"
              size="lg"
              onClick={() => void verifyCode()}
              disabled={busy || otpCode.length !== 6}
              aria-busy={busy || undefined}
              className="flex-1"
            >
              {busy ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  <span>מאמת…</span>
                </>
              ) : (
                "התחבר"
              )}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={goBack}>
              חזרה
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
