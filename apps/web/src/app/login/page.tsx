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

function translateAuthError(msg?: string): string | null {
  if (!msg) return null;
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login")) return "שם משתמש או סיסמה שגויים";
  if (lower.includes("email not confirmed")) return "המייל עדיין לא אומת";
  if (lower.includes("rate limit")) return "יותר מדי ניסיונות — נסה שוב מאוחר יותר";
  return msg;
}
