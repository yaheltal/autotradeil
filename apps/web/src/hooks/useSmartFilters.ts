"use client";

import { useCallback, useState } from "react";

import { apiFetch } from "@/lib/api";

/**
 * Parsed structured filters returned by /api/v1/ai/parse-filters.
 * Mirrors the backend AISearchFilters schema.
 */
export type SmartFilters = {
  make: string | null;
  model: string | null;
  year_min: number | null;
  year_max: number | null;
  price_min: number | null;
  price_max: number | null;
  mileage_max: number | null;
  transmission: "automatic" | "manual" | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | null;
  color: string | null;
};

export type ParseFiltersResponse = {
  filters: SmartFilters;
  /** Original query when Claude couldn't pull any structured field —
   *  callers can use this as a substring fallback (e.g. against make
   *  or model). */
  fallback_q: string | null;
};

/**
 * useSmartFilters — call /api/v1/ai/parse-filters with a Hebrew query
 * and get back a structured AISearchFilters object.
 *
 * Designed to be drop-in for any existing search input: take the
 * input's value on submit, await `parse(query)`, then merge the
 * returned filters into your local filter state.
 *
 * On Anthropic timeout / missing API key, the backend returns an
 * empty filters object + `fallback_q = query`, so a caller can still
 * do its old substring-on-make-or-model fallback. We never throw.
 */
export function useSmartFilters(token: string | null) {
  const [busy, setBusy] = useState(false);

  const parse = useCallback(
    async (query: string): Promise<ParseFiltersResponse | null> => {
      if (!token || !query.trim()) return null;
      setBusy(true);
      try {
        return await apiFetch<ParseFiltersResponse>("/api/v1/ai/parse-filters", {
          method: "POST",
          token,
          body: JSON.stringify({ query: query.trim() }),
        });
      } catch {
        // Don't break the page on a parser error — let the caller
        // fall back to literal substring search.
        return {
          filters: {
            make: null,
            model: null,
            year_min: null,
            year_max: null,
            price_min: null,
            price_max: null,
            mileage_max: null,
            transmission: null,
            fuel_type: null,
            color: null,
          },
          fallback_q: query.trim(),
        };
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  return { parse, busy };
}
