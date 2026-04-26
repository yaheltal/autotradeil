"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/**
 * Dealer auth bootstrap hook — loads the current Supabase session's
 * access token, or redirects to `/login?next=<nextPath>` when absent.
 *
 * Also enforces role: an admin who lands on a /dashboard page is
 * silently redirected to /admin. Without this, admins hitting any
 * dashboard URL would see a half-broken page (dealers/me 404 + empty
 * dealer-scoped lists). The mirror redirect (dealer → /admin → /dashboard)
 * already lives in useAdminAuth.
 *
 * Callers get `{ token }` once the session is resolved. Until then the
 * token is `null` and UI should render a neutral "טוען…" state.
 */
export function useDealerAuth(nextPath: string) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      // Role check before exposing the token. If whoami fails (network,
      // 401, etc.) we still expose the token so the page can attempt
      // its own load — failing closed here would create an unrecoverable
      // boot loop when the API is briefly down.
      try {
        const who = await apiFetch<{ user_type: string }>("/api/v1/auth/whoami", {
          token: session.access_token,
        });
        if (cancelled) return;
        if (who.user_type === "admin") {
          router.replace("/admin");
          return;
        }
      } catch {
        // proceed — page will surface its own error if relevant
      }

      if (!cancelled) setToken(session.access_token);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  return { token };
}
