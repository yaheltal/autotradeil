"use client";

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
 */
export function useAdminAuth(): AdminAuthState {
  const router = useRouter();
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    token: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login?next=/admin");
        return;
      }

      try {
        const who = await apiFetch<Whoami>("/api/v1/auth/whoami", {
          token: session.access_token,
        });
        if (cancelled) return;

        if (who.user_type !== "admin") {
          router.replace("/login?next=/admin");
          return;
        }

        setState({
          user: who,
          token: session.access_token,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          router.replace("/login?next=/admin");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return state;
}
