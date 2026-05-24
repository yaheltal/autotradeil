/**
 * Branded ID types.
 *
 * Plain `string` works at runtime but lets you accidentally pass a
 * dealer's id where the API wants an inventory id. Branding catches
 * those mistakes at compile time without runtime cost — the brand is
 * a phantom type that disappears after `tsc`.
 *
 * Usage:
 *   import { DealerId, toDealerId } from "@autotradeil/shared-types";
 *
 *   function fetchDealer(id: DealerId) { ... }
 *
 *   fetchDealer("abc");                  // ❌ type error — not branded
 *   fetchDealer(toDealerId("abc"));      // ✓ explicit brand at boundary
 *   fetchDealer(response.dealer_id as DealerId);  // ✓ when API hands you one
 *
 * Convention: brand at the network boundary (where the value first
 * arrives from the API). Internal code passes branded values without
 * further casts.
 */

declare const __brand: unique symbol;
type Brand<TBase, TBrand extends string> = TBase & { readonly [__brand]: TBrand };

export type UserId = Brand<string, "UserId">;
export type DealerId = Brand<string, "DealerId">;
export type InventoryId = Brand<string, "InventoryId">;
export type OfferId = Brand<string, "OfferId">;
export type DealId = Brand<string, "DealId">;
export type NotificationId = Brand<string, "NotificationId">;
export type EventId = Brand<string, "EventId">;

// ---- Cast helpers ---------------------------------------------------
// One-line helpers so call sites read like `toDealerId(raw)` rather
// than `raw as DealerId`. Both compile to the same nothing.

export const toUserId = (s: string): UserId => s as UserId;
export const toDealerId = (s: string): DealerId => s as DealerId;
export const toInventoryId = (s: string): InventoryId => s as InventoryId;
export const toOfferId = (s: string): OfferId => s as OfferId;
export const toDealId = (s: string): DealId => s as DealId;
export const toNotificationId = (s: string): NotificationId => s as NotificationId;
export const toEventId = (s: string): EventId => s as EventId;
