"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase";

/**
 * Dealer auth bootstrap hook — loads the current Supabase session's
 * access token, or redirects to `/login?next=<nextPath>` when absent.
 *
 * Callers get `{ token }` once the session is resolved. Until then the
 * token is `null` and UI should render a neutral "טוען…" state.
 *
 * Mirrors the pattern in `useAdminAuth` so the two hooks feel symmetric.
 */
export function useDealerAuth(nextPath: string) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      setToken(session.access_token);
    })();
  }, [router, nextPath]);

  return { token };
}
