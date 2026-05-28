/**
 * Friendly aliases over `generated.ts`.
 *
 * Why this file exists
 * --------------------
 * `openapi-typescript` produces a deeply nested namespace shape:
 *
 *   components["schemas"]["InventoryItemResponse"]
 *
 * That's awkward in call sites. This module exposes a curated set of
 * short names (`InventoryItem`, `Dealer`, `Offer`, …) so app code can
 * write:
 *
 *   import type { InventoryItem, Offer } from "@autotradeil/shared-types";
 *
 * Rules:
 *   - Only re-export shapes the apps actually consume. Don't dump every
 *     schema — the goal is a tight, human-readable surface, not a mirror.
 *   - If a request body and a response share a name in the API, alias
 *     them with `*Request` / `*Response` suffixes here. Don't bake those
 *     suffixes into the Pydantic models if you can help it; let this
 *     file translate.
 *   - If the API gets a new schema you need shared, add a line here
 *     AND run `pnpm --filter @autotradeil/shared-types generate` in the
 *     same PR. CI fails when drift sneaks in (`generate:check`).
 */

import type { components } from "./generated.js";

type Schemas = components["schemas"];

// ---- Auth & users --------------------------------------------------

export type AdminLoginVerifyResponse = Schemas["AdminLoginVerifyResponse"];
export type OtpRequestBody = Schemas["OtpRequestBody"];
export type OtpSendBody = Schemas["OtpSendBody"];
export type OtpMethodBody = Schemas["OtpMethodBody"];

// ---- Dealers -------------------------------------------------------

export type Dealer = Schemas["DealerResponse"];
export type DealerListItem = Schemas["DealerListItem"];
export type DealerListResponse = Schemas["DealerListResponse"];
export type DealerFilters = Schemas["DealerFilters"];
export type DealerPublicProfile = Schemas["DealerPublicProfile"];
export type DealerProfileUpdate = Schemas["DealerProfileUpdate"];
export type DealerSignupRequest = Schemas["DealerSignupRequest"];

// ---- Inventory -----------------------------------------------------

export type InventoryItem = Schemas["InventoryItemResponse"];
export type InventoryItemCreate = Schemas["InventoryItemCreate"];
export type InventoryItemUpdate = Schemas["InventoryItemUpdate"];
export type InventoryListResponse = Schemas["InventoryListResponse"];

// ---- Marketplace ---------------------------------------------------

export type MarketplaceVehicleDetail = Schemas["MarketplaceVehicleDetail"];
export type MarketplaceVehicleImage = Schemas["MarketplaceVehicleImage"];
export type MarketplaceSellerInfo = Schemas["MarketplaceSellerInfo"];

// ---- Offers & deals ------------------------------------------------

export type Offer = Schemas["OfferResponse"];
export type OfferCreate = Schemas["OfferCreate"];
export type OfferListResponse = Schemas["OfferListResponse"];
export type OfferDealerSummary = Schemas["OfferDealerSummary"];
export type OfferVehicleSummary = Schemas["OfferVehicleSummary"];
export type OfferHistoryEntry = Schemas["OfferHistoryEntry"];
export type OfferHistoryResponse = Schemas["OfferHistoryResponse"];

export type Deal = Schemas["DealResponse"];
export type DealListResponse = Schemas["DealListResponse"];

// ---- Notifications -------------------------------------------------

export type Notification = Schemas["NotificationResponse"];
export type NotificationListResponse = Schemas["NotificationListResponse"];

// ---- Admin / KYC ---------------------------------------------------

export type AdminStatsResponse = Schemas["AdminStatsResponse"];
export type KycRejectBody = Schemas["KycRejectBody"];
