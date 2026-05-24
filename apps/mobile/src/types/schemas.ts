import { z } from "zod";

/**
 * Zod schemas mirror the FastAPI response shapes. Parsing at the
 * network boundary means components can trust the data type and
 * regressions surface as a clean Zod error rather than runtime crashes.
 */

export const dealerSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string(),
  city: z.string(),
  tier: z.enum(["bronze", "silver", "gold", "platinum"]),
  trust_score: z.number(),
  deals_completed: z.number().int(),
  total_views: z.number().int().nullable().optional(),
});
export type Dealer = z.infer<typeof dealerSchema>;

export const whoamiSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  user_type: z.string(),
  verified: z.boolean(),
});
export type Whoami = z.infer<typeof whoamiSchema>;

export const analyticsSchema = z.object({
  total_vehicles: z.number().int(),
  active_vehicles: z.number().int(),
  paused_vehicles: z.number().int(),
  sold_vehicles: z.number().int(),
  total_views: z.number().int(),
  views_this_week: z.number().int(),
  total_offers_received: z.number().int(),
  total_offers_sent: z.number().int(),
  deals_completed: z.number().int(),
  deals_value: z.number().int(),
  trust_score: z.number(),
  tier: z.string(),
  top_vehicles: z.array(
    z.object({
      id: z.string(),
      make: z.string(),
      model: z.string(),
      year: z.number().int(),
      views: z.number().int(),
      offers: z.number().int(),
    })
  ),
});
export type Analytics = z.infer<typeof analyticsSchema>;

export const exposureOptionSchema = z.enum(["B2B", "B2C", "PRIVATE"]);
export type ExposureOption = z.infer<typeof exposureOptionSchema>;

export const inventoryItemCreateSchema = z.object({
  license_plate: z.string().optional(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1980).max(2100),
  mileage: z.number().int().min(0),
  price: z.number().int().min(0),
  b2b_price: z.number().int().min(0).nullable().optional(),
  color: z.string().optional(),
  transmission: z.enum(["automatic", "manual"]).optional(),
  fuel_type: z.enum(["petrol", "diesel", "electric", "hybrid"]).optional(),
  notes: z.string().optional(),
  exposure: z.array(exposureOptionSchema).optional(),
  is_private: z.boolean().optional(),
});
export type InventoryItemCreate = z.infer<typeof inventoryItemCreateSchema>;

export const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  mileage: z.number().int(),
  price: z.number().int(),
  b2b_price: z.number().int().nullable(),
  status: z.string(),
  primary_image_url: z.string().url().nullable().optional(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const inventoryListSchema = z.object({
  items: z.array(inventoryItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pages: z.number().int(),
  per_page: z.number().int(),
});
export type InventoryList = z.infer<typeof inventoryListSchema>;

export const offerSchema = z.object({
  id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  offered_price: z.number().int(),
  status: z.enum(["pending", "countered", "accepted", "rejected", "cancelled"]),
  counter_price: z.number().int().nullable(),
  created_at: z.string(),
  vehicle: z.object({
    id: z.string().uuid(),
    make: z.string(),
    model: z.string(),
    year: z.number().int(),
    primary_image_url: z.string().url().nullable().optional(),
  }),
});
export type Offer = z.infer<typeof offerSchema>;

export const offerListSchema = z.object({
  items: z.array(offerSchema),
  total: z.number().int(),
});
