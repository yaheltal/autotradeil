"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

/**
 * Root TanStack Query provider for the Next.js App Router.
 *
 * Defaults chosen for the dealer/admin dashboards:
 *
 *   staleTime: 60_000        — most lists (inventory, marketplace, offers,
 *                              notifications) tolerate up to a minute of
 *                              "stale" data; reduces background refetch
 *                              chatter and Supabase row counts.
 *   gcTime: 5 * 60_000       — keep cached responses 5 min so back-nav
 *                              feels instant.
 *   retry: 1                 — apiFetch already throws `{status, message}`
 *                              shaped errors; one retry covers transient
 *                              502s from the FastAPI proxy without masking
 *                              real auth failures with infinite spinners.
 *   refetchOnWindowFocus     — off; the app is task-focused, not a
 *                              monitoring tool, and the focus refetch
 *                              caused jarring flickers on the dashboard.
 *
 * Query keys follow the convention in CLAUDE.md / Phase 4 plan:
 *   ["dealer", "me"]
 *   ["inventory"]                      list (all)
 *   ["inventory", filters]             list (filtered)
 *   ["inventory", "detail", id]        single
 *   ["marketplace"], ["marketplace", filters]
 *   ["offers", "received"], ["offers", "sent"]
 *   ["deals"], ["analytics"], ["notifications"]
 *   ["admin", "dealers", filters], ["admin", "stats"], ["admin", "kyc", "pending"]
 *
 * Mutations invalidate by the prefix of whatever they touched:
 *   onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] })
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
