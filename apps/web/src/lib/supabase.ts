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
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in apps/web/.env.local",
    );
  }

  return createBrowserClient(url, anon);
}
