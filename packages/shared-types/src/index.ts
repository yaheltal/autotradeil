/**
 * @autotradeil/shared-types — public surface.
 *
 * Hand-written enums + branded IDs live in this barrel. API request /
 * response shapes (generated from the backend's /openapi.json) will be
 * added in a follow-up commit via:
 *
 *   pnpm --filter @autotradeil/shared-types generate
 *
 * Re-exports below are wildcard so adding a new enum or ID only
 * requires editing the relevant module — `index.ts` stays untouched.
 */

export * from "./enums.js";
export * from "./ids.js";
// export * from "./api.js";   // ← added by the codegen commit
