import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { z } from "zod";

import {
  analyticsSchema,
  inventoryItemSchema,
  inventoryListSchema,
  offerListSchema,
  offerSchema,
  whoamiSchema,
  type Analytics,
  type InventoryList,
  type Whoami,
} from "@/types/schemas";

import { api } from "./api";
import { queryKeys } from "./queryClient";

/**
 * For list endpoints, treat 403/404 as "no data yet" so screens render
 * the empty state instead of a hard error. Surface other errors so
 * Sentry / the error boundary can pick them up.
 */
function isEmptyError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return status === 403 || status === 404;
}

const EMPTY_INVENTORY: InventoryList = { items: [], total: 0, page: 1, pages: 1, per_page: 20 };

// Marketplace items carry seller info on each row (we want to render
// "Toyota Corolla · אוטו דמו 1 בע״מ · תל אביב" without a per-card fetch).
const marketplaceItemSchema = z.object({
  id: z.string().uuid(),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  mileage: z.number().int(),
  price: z.number().int(),
  b2b_price: z.number().int().nullable(),
  color: z.string().nullable().optional(),
  transmission: z.string().nullable().optional(),
  fuel_type: z.string().nullable().optional(),
  engine_volume: z.number().nullable().optional(),
  seller_dealer_id: z.string().uuid(),
  seller_business_name: z.string(),
  seller_city: z.string(),
  seller_tier: z.string().optional(),
  primary_image_url: z.string().url().nullable().optional(),
  created_at: z.string().optional(),
  is_own: z.boolean().optional().default(false),
});
export type MarketplaceItem = z.infer<typeof marketplaceItemSchema>;

const marketplaceSearchSchema = z.object({
  items: z.array(marketplaceItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pages: z.number().int(),
  per_page: z.number().int(),
});
export type MarketplaceSearch = z.infer<typeof marketplaceSearchSchema>;
const EMPTY_MARKETPLACE: MarketplaceSearch = { items: [], total: 0, page: 1, pages: 1, per_page: 20 };

const offersListSchemaCompat = offerListSchema.extend({
  items: z.array(offerSchema),
});
const EMPTY_OFFERS = { items: [], total: 0 };

export function useMe() {
  return useQuery<Whoami>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const r = await api.get("/api/v1/auth/whoami");
      return whoamiSchema.parse(r.data);
    },
  });
}

export function useAnalytics() {
  return useQuery<Analytics | null>({
    queryKey: ["analytics"],
    queryFn: async () => {
      try {
        const r = await api.get("/api/v1/marketplace/analytics");
        return analyticsSchema.parse(r.data);
      } catch (err) {
        if (isEmptyError(err)) return null;
        throw err;
      }
    },
  });
}

export type InventoryFilters = { status?: string; q?: string };

export function useInventory(filters: InventoryFilters = {}) {
  return useQuery<InventoryList>({
    queryKey: queryKeys.inventory(filters),
    queryFn: async () => {
      try {
        const params: Record<string, string> = {};
        if (filters.status) params.status = filters.status;
        if (filters.q?.trim()) params.q = filters.q.trim();
        const r = await api.get("/api/v1/inventory", {
          params: Object.keys(params).length ? params : undefined,
        });
        return inventoryListSchema.parse(r.data);
      } catch (err) {
        if (isEmptyError(err)) return EMPTY_INVENTORY;
        throw err;
      }
    },
    // Keep previous data while a filter change is in flight — avoids the
    // "list goes blank → repopulates" flash when typing in the search box.
    placeholderData: (prev) => prev,
  });
}

const imageSchema = z.object({
  id: z.string(),
  inventory_id: z.string(),
  url: z.string(),
  position: z.number().int(),
  is_hidden: z.boolean().optional().default(false),
});
const imageListSchema = z.object({
  items: z.array(imageSchema),
});
export type InventoryImage = z.infer<typeof imageSchema>;

/** Full image gallery for a single inventory item (list endpoint only
 * returns the primary thumbnail). Lazy — only enabled when an id is set. */
export function useInventoryImages(inventoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventoryImages(inventoryId ?? ""),
    enabled: !!inventoryId,
    queryFn: async () => {
      const r = await api.get(`/api/v1/inventory/${inventoryId}/images`);
      // Backend may return either {items:[...]} or a bare array.
      const parsed = Array.isArray(r.data) ? { items: r.data } : r.data;
      return imageListSchema.parse(parsed);
    },
  });
}

export type MarketplaceFilters = {
  q?: string;
  make?: string;
  year_min?: number;
  year_max?: number;
  price_min?: number;
  price_max?: number;
  fuel_type?: "petrol" | "diesel" | "electric" | "hybrid";
  transmission?: "automatic" | "manual";
};

export function useMarketplace(filters: MarketplaceFilters = {}) {
  return useQuery<MarketplaceSearch>({
    queryKey: queryKeys.marketplace(filters as Record<string, unknown>),
    queryFn: async () => {
      try {
        // Drop empty / falsy params so the server isn't passed q="".
        const params: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(filters)) {
          if (v === undefined || v === null || v === "") continue;
          params[k] = v as string | number;
        }
        const r = await api.get("/api/v1/marketplace/search", {
          params: Object.keys(params).length ? params : undefined,
        });
        return marketplaceSearchSchema.parse(r.data);
      } catch (err) {
        if (isEmptyError(err)) return EMPTY_MARKETPLACE;
        throw err;
      }
    },
    placeholderData: (prev) => prev,
  });
}

export function useOffers(direction: "received" | "sent") {
  return useQuery({
    queryKey: queryKeys.offers(direction),
    queryFn: async () => {
      try {
        const r = await api.get(`/api/v1/marketplace/offers/${direction}`);
        return offersListSchemaCompat.parse(r.data);
      } catch (err) {
        if (isEmptyError(err)) return EMPTY_OFFERS;
        throw err;
      }
    },
  });
}
