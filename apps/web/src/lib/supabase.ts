"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-safe Supabase client.
 *
 * Only the publishable (anon) key ever reaches the browser. The
 * service_role key lives exclusively in the FastAPI backend.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept either the legacy `anon_key` naming or the new `publishable_key`
  // naming Supabase v2 introduced. Production deploys may have set one or
  // the other; this client must work regardless.
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and one of NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set",
    );
  }

  return createBrowserClient(url, anon);
}
