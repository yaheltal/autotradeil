"use client";

import { useQuery } from "@tanstack/react-query";
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
 * Callers get `{ token }` once the session is resolved AND the role
 * check has passed. Until then the token is `null` and UI should
 * render a neutral "טוען…" state.
 *
 * The whoami call routes through TanStack (key ["auth","whoami"]) so
 * pages that mount alongside this hook share the cache.
 */
export function useDealerAuth(nextPath: string) {
  const router = useRouter();
  const [session, setSession] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!s) {
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      setSession(s.access_token);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const whoami = useQuery({
    queryKey: ["auth", "whoami"],
    queryFn: () => apiFetch<{ user_type: string }>("/api/v1/auth/whoami", { token: session! }),
    enabled: !!session,
    retry: false,
  });

  useEffect(() => {
    if (whoami.data?.user_type === "admin") router.replace("/admin");
  }, [whoami.data, router]);

  // Failing closed (refusing to expose the token) would create an
  // unrecoverable boot loop when the API is briefly down. Mirror the
  // pre-TanStack behaviour: expose the token when whoami either succeeds
  // as a non-admin OR errors out completely.
  const passedRoleCheck =
    whoami.data?.user_type === "admin" ? false : whoami.isFetched || whoami.isError;

  return { token: passedRoleCheck ? session : null };
}
