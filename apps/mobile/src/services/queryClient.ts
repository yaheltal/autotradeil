import { QueryClient } from "@tanstack/react-query";

/**
 * Mobile-tuned QueryClient.
 *
 * - 60s staleTime keeps lists snappy after backgrounding.
 * - 1 retry with exponential backoff (axios already retries network errors).
 * - refetchOnReconnect captures the offline → online transition.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      retryDelay: (attempt) => Math.min(attempt * 800, 4000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});

export const queryKeys = {
  me: ["dealer", "me"] as const,
  inventory: (filters?: { status?: string; q?: string }) =>
    ["inventory", filters ?? {}] as const,
  inventoryDetail: (id: string) => ["inventory", "detail", id] as const,
  inventoryImages: (id: string) => ["inventory", "images", id] as const,
  marketplace: (filters: Record<string, unknown>) => ["marketplace", filters] as const,
  offers: (direction: "received" | "sent") => ["offers", direction] as const,
};
