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

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.session) {
      setError(translateAuthError(authError?.message) ?? "שם משתמש או סיסמה שגויים");
      setLoading(false);
      return;
    }

    const token = data.session.access_token;

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

        <p className="text-brand-ink/70 mt-8 text-center text-sm">
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
