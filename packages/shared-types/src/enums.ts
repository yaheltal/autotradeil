/**
 * Hand-written domain enums.
 *
 * Why hand-written instead of OpenAPI-generated: enum values are
 * referenced in MANY places across web + mobile (status badges,
 * filter chips, dropdowns) and are expected to be stable. A clean
 * hand-curated list avoids the verbose `components["schemas"][...]`
 * indexing that openapi-typescript output forces, and keeps a single
 * import path: `import { InventoryStatus } from "@autotradeil/shared-types"`.
 *
 * If the API ever evolves an enum, update BOTH the Pydantic literal
 * AND this file in the same PR. The OpenAPI snapshot diff caught by
 * CI (`pnpm --filter @autotradeil/shared-types generate:check`) makes
 * silent drift a build failure.
 */

// ---- People & roles -------------------------------------------------

export const USER_TYPES = ["consumer", "dealer", "admin"] as const;
export type UserType = (typeof USER_TYPES)[number];

export const DEALER_TIERS = ["bronze", "silver", "gold", "platinum"] as const;
export type DealerTier = (typeof DEALER_TIERS)[number];

export const KYC_STATUSES = ["pending", "approved", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

// ---- Inventory ------------------------------------------------------

export const INVENTORY_STATUSES = ["active", "sold", "hidden", "draft", "reserved"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const VISIBILITY_LEVELS = ["b2b", "b2c", "both", "private"] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

export const FUEL_TYPES = ["petrol", "diesel", "electric", "hybrid"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ["automatic", "manual"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

// ---- Marketplace (offers + deals) -----------------------------------

export const OFFER_STATUSES = [
  "pending",
  "countered",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const DEAL_TYPES = ["b2b", "b2c"] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_STATUSES = [
  "in_transaction",
  "completed",
  "disputed",
  "cancelled",
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

// ---- Notifications --------------------------------------------------

export const NOTIFICATION_KINDS = [
  "offer_received",
  "offer_accepted",
  "offer_rejected",
  "offer_countered",
  "deal_confirmed",
  "dealer_verified",
  "dealer_rejected",
  "system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// ---- OTP delivery ---------------------------------------------------

export const OTP_DELIVERY_METHODS = ["email", "sms"] as const;
export type OtpDeliveryMethod = (typeof OTP_DELIVERY_METHODS)[number];
