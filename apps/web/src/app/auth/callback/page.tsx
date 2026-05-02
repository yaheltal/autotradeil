"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * OAuth callback handler.
 *
 * Flow:
 *   1. Supabase has just completed the OAuth dance and dropped us here
 *      with the session in localStorage / cookies.
 *   2. We read the session, then ask the backend (`/api/v1/auth/oauth/check`)
 *      to classify: existing dealer vs. brand-new user.
 *   3. Existing → /dashboard (or /signup/dealer/pending if not yet verified).
 *      New      → /signup/dealer?oauth=true&email=...&full_name=...&avatar=...
 *
 * Errors land back at /login?error=oauth so the user sees a Hebrew
 * explanation and can retry.
 */

type CheckResponse = {
  existing_user: boolean;
  dealer_id: string | null;
  business_name: string | null;
  verified: boolean | null;
  rejected_at: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackSkeleton />}>
      <CallbackInner />
    </Suspense>
  );
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const ranRef = useRef(false);
  const [status, setStatus] = useState<"checking" | "error">("checking");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      const supabase = createClient();
      // The OAuth provider redirected back; Supabase has either parsed
      // the URL fragment already or it's still in window.location.hash.
      // exchangeCodeForSession() handles the modern PKCE flow; older
      // implicit flows already wrote the session before we mounted.
      try {
        const url = typeof window !== "undefined" ? window.location.href : "";
        if (url.includes("code=")) {
          await supabase.auth.exchangeCodeForSession(url);
        }
      } catch (e) {
        // Non-fatal — getSession below will surface a real failure.
        // eslint-disable-next-line no-console
        console.warn("exchangeCodeForSession:", e);
      }

      const { data: sessionResult } = await supabase.auth.getSession();
      const token = sessionResult.session?.access_token;
      if (!token) {
        router.replace("/login?error=oauth");
        return;
      }

      try {
        const resp = await apiFetch<CheckResponse>("/api/v1/auth/oauth/check", {
          method: "POST",
          token,
          body: "{}",
        });

        if (resp.existing_user) {
          // Pending dealer → wait page; rejected → rejected page; verified → dashboard
          if (resp.rejected_at) {
            router.replace("/signup/dealer/rejected");
            return;
          }
          if (resp.verified === false) {
            router.replace("/signup/dealer/pending");
            return;
          }
          router.replace(next || "/dashboard");
          return;
        }

        // New OAuth user — route to signup with prefill data.
        const qs = new URLSearchParams({ oauth: "true" });
        if (resp.email) qs.set("email", resp.email);
        if (resp.full_name) qs.set("full_name", resp.full_name);
        if (resp.avatar_url) qs.set("avatar", resp.avatar_url);
        router.replace(`/signup/dealer?${qs.toString()}`);
      } catch (e) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "שגיאה לא צפויה");
      }
    };

    void run();
  }, [router, next]);

  if (status === "error") {
    return (
      <main className="bg-brand-cream dark:bg-brand-night flex min-h-[100dvh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <BrandMark />
          <p className="text-danger-text mt-6 text-sm" role="alert">
            ההתחברות נכשלה: {errorMsg || "שגיאה לא צפויה"}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="bg-brand-navy text-brand-cream mt-6 inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold"
          >
            חזרה להתחברות
          </button>
        </div>
      </main>
    );
  }

  return <CallbackSkeleton />;
}

function CallbackSkeleton() {
  return (
    <main className="bg-brand-cream dark:bg-brand-night flex min-h-[100dvh] items-center justify-center px-4">
      <div className="text-center">
        <BrandMark />
        <p className="text-brand-ink/65 dark:text-brand-cream/65 mt-6 text-sm">מסיים התחברות…</p>
        <div className="bg-brand-navy/10 mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full">
          <div className="bg-brand-gold h-full w-1/3 motion-safe:animate-pulse" />
        </div>
      </div>
    </main>
  );
}
