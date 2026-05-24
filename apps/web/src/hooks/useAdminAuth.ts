"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

type Whoami = {
  id: string;
  email: string;
  user_type: "consumer" | "dealer" | "admin";
  verified: boolean;
};

type AdminAuthState = {
  user: Whoami | null;
  token: string | null;
  loading: boolean;
};

/**
 * Resolves the current Supabase session and verifies the user is an admin
 * by calling `/api/v1/auth/whoami`. Redirects to /login if not signed in
 * or not admin.
 *
 * Consumers render their own "טוען…" indicator while `loading` is true —
 * see the admin layout for the shared spinner.
 *
 * The whoami call routes through TanStack Query (key ["auth", "whoami"])
 * so admin pages that mount the hook concurrently share one in-flight
 * fetch and one cached response.
 */
export function useAdminAuth(): AdminAuthState {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.replace("/login?next=/admin");
        return;
      }
      setToken(session.access_token);
      setSessionResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const whoami = useQuery({
    queryKey: ["auth", "whoami"],
    queryFn: () => apiFetch<Whoami>("/api/v1/auth/whoami", { token: token! }),
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (whoami.isError) {
      // whoami failed (network, JWT expired, etc.) — only here do we
      // bounce to /login since the session itself is questionable.
      router.replace("/login?next=/admin");
      return;
    }
    if (whoami.data && whoami.data.user_type !== "admin") {
      // Authenticated but not an admin — sending them back to /login would
      // force a re-auth they can't satisfy and is confusing. Send them to
      // their own dashboard with an error code the dashboard surfaces in
      // a polite alert.
      router.replace("/dashboard?error=admin_required");
    }
  }, [whoami.isError, whoami.data, router]);

  const loading =
    !sessionResolved || whoami.isLoading || (whoami.data?.user_type !== "admin" && !whoami.isError);

  return {
    user: whoami.data?.user_type === "admin" ? whoami.data : null,
    token: whoami.data?.user_type === "admin" ? token : null,
    loading,
  };
}
