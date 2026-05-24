"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiFetch } from "@/lib/api";

/**
 * Parsed structured filters returned by /api/v1/ai/parse-dealer-filters.
 * Mirrors the backend DealerFilters schema.
 */
export type SmartDealerFilters = {
  status: "pending" | "verified" | "rejected" | null;
  tier: "bronze" | "silver" | "gold" | "platinum" | null;
  kyc_status: "pending" | "submitted" | "approved" | "rejected" | null;
  city: string | null;
  search: string | null;
};

export type ParseDealerFiltersResponse = { filters: SmartDealerFilters };

/**
 * useSmartDealerFilters — admin-only Hebrew NL parser for the dealer
 * search bar in /admin/dealers. Symmetric to useSmartFilters but
 * targets dealer-shape attributes (status / tier / KYC / city) instead
 * of vehicle-shape (make / model / year / price).
 *
 * Backend endpoint is gated by require_admin; this hook will 403 for
 * non-admins. Caller is responsible for only mounting it inside
 * admin-protected pages.
 */
export function useSmartDealerFilters(token: string | null) {
  const parseMutation = useMutation({
    mutationFn: (query: string) =>
      apiFetch<ParseDealerFiltersResponse>("/api/v1/ai/parse-dealer-filters", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ query }),
      }),
  });

  const parse = useCallback(
    async (query: string): Promise<ParseDealerFiltersResponse | null> => {
      const trimmed = query.trim();
      if (!token || !trimmed) return null;
      try {
        return await parseMutation.mutateAsync(trimmed);
      } catch {
        return {
          filters: {
            status: null,
            tier: null,
            kyc_status: null,
            city: null,
            search: trimmed,
          },
        };
      }
    },
    [token, parseMutation],
  );

  return { parse, busy: parseMutation.isPending };
}
