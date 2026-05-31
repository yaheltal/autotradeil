"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase";

/**
 * App-shell Supabase auth listener — silences the recurring
 * "Invalid Refresh Token" console error.
 *
 * Symptom: console fills with red `AuthApiError: Invalid Refresh
 * Token: Refresh Token Not Found` (or `Already Used`) on routes
 * that probe the session. The error originates in the Supabase JS
 * SDK's auto-refresh path: every page mount calls `getSession()`,
 * which finds a stale or invalidated refresh token in the cookie
 * jar, attempts a refresh, fails, and logs. The next page mount
 * does the same thing — the bad token stays in storage between
 * mounts and the cycle repeats.
 *
 * Cleanup: subscribe to onAuthStateChange at the app shell. When
 * Supabase emits `SIGNED_OUT` (which fires both on explicit signOut
 * AND when the SDK gives up on a refresh), call
 * `signOut({ scope: "local" })` to clear cookies + localStorage so
 * subsequent page mounts boot with a clean null session instead of
 * re-trying the bad refresh token.
 *
 * `signOut({ scope: "local" })` is idempotent — calling it on an
 * already-signed-out client is a no-op and doesn't re-emit
 * SIGNED_OUT, so we won't loop.
 *
 * Mount once at the layout level (alongside ImpersonationBanner) —
 * one listener for the whole app.
 */
export function AuthSync() {
  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT with a null session is the SDK's signal that
      // the stored credentials can't be honored. Belt-and-braces
      // clear so we don't loop on the next mount.
      if (event === "SIGNED_OUT" && !session) {
        void supabase.auth.signOut({ scope: "local" }).catch(() => {
          /* signOut on an already-empty session is a no-op; the
             catch is purely defensive in case the cookie store
             throws under private-browsing modes. */
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}
