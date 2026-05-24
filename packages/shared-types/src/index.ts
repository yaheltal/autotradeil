/**
 * @autotradeil/shared-types — public surface.
 *
 * Three layers:
 *   * enums.ts     — hand-written domain enums (USER_TYPES, INVENTORY_STATUSES, …)
 *   * ids.ts       — branded IDs (UserId, DealerId, …) + cast helpers
 *   * api.ts       — friendly aliases over generated.ts (InventoryItem,
 *                    Dealer, Offer, …). Refresh with
 *                    `pnpm --filter @autotradeil/shared-types generate`.
 *
 * `generated.ts` is intentionally NOT re-exported here — call sites
 * should import the curated `api.ts` aliases instead. If you really
 * need the raw `components["schemas"]` form, import from
 * `@autotradeil/shared-types/api` and reach into `components` directly,
 * or extend `api.ts` with a new alias.
 */

export * from "./enums.js";
export * from "./ids.js";
export * from "./api.js";
