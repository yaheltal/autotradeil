"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-safe Supabase client. Uses the **publishable** key only.
 * The secret key (service role) MUST NEVER appear in this file or anywhere
 * on the client — it lives only in the FastAPI backend (.env SUPABASE_SECRET_KEY).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  // Throw at module load on the client so misconfigurations surface immediately
  // rather than silently producing a broken client.
  throw new Error(
    "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in apps/web/.env.local",
  );
}

export const supabase: SupabaseClient = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
