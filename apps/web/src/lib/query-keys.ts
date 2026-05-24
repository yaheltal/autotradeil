/**
 * Centralized TanStack Query key factory for the web app.
 *
 * Why this file exists
 * --------------------
 * Loose, stringified `queryKey: ["inventory"]` literals scattered across
 * 40+ pages drift fast — typos, mismatched arities, and missing
 * invalidations on mutations all become silent staleness bugs.
 * Routing every key through this factory:
 *
 *   - guarantees prefix shape (all inventory keys start with `["inventory"]`,
 *     so `invalidateQueries({ queryKey: keys.inventory.root() })` cascades),
 *   - keeps the key arity AND order under one editor sweep,
 *   - mirrors the mobile factory (`apps/mobile/src/services/queryClient.ts`)
 *     so future shared hooks can move into `@autotradeil/shared-types` or
 *     a new `packages/api-client/` without re-deriving conventions.
 *
 * Convention
 * ----------
 * Tuples are typed `as const` so TanStack's `QueryKey` inference keeps
 * literal narrowing. Filter objects are passed through; React Query
 * stable-stringifies them, so two equivalent filter objects share a key
 * even if their properties are inserted in different orders.
 *
 * Add a namespace by appending a new property here, not by writing the
 * literal in a page.
 */

export const queryKeys = {
  // ---- Dealer (logged-in user's own dealer record) -----------------
  dealer: {
    me: () => ["dealer", "me"] as const,
    stats: () => ["dealer", "stats"] as const,
  },

  // ---- Inventory (own listings) -----------------------------------
  inventory: {
    root: () => ["inventory"] as const,
    list: (filters?: Record<string, unknown>) => ["inventory", filters ?? {}] as const,
    detail: (id: string) => ["inventory", "detail", id] as const,
    images: (id: string) => ["inventory", "images", id] as const,
  },

  // ---- Marketplace (other dealers' B2B listings) ------------------
  marketplace: {
    root: () => ["marketplace"] as const,
    list: (filters?: Record<string, unknown>) => ["marketplace", filters ?? {}] as const,
    detail: (id: string) => ["marketplace", "detail", id] as const,
    dealer: (dealerId: string) => ["marketplace", "dealer", dealerId] as const,
  },

  // ---- Offers (sent + received) -----------------------------------
  offers: {
    root: () => ["offers"] as const,
    list: (direction: "received" | "sent") => ["offers", direction] as const,
  },

  // ---- Deals -----------------------------------------------------
  deals: {
    root: () => ["deals"] as const,
    list: (filters?: Record<string, unknown>) => ["deals", filters ?? {}] as const,
  },

  // ---- Analytics -------------------------------------------------
  analytics: {
    root: () => ["analytics"] as const,
  },

  // ---- Notifications ---------------------------------------------
  notifications: {
    root: () => ["notifications"] as const,
    list: () => ["notifications", "list"] as const,
    unread: () => ["notifications", "unread"] as const,
    prefs: () => ["notifications", "prefs"] as const,
  },

  // ---- Security (KYC, sessions, etc.) -----------------------------
  security: {
    root: () => ["security"] as const,
    me: () => ["security", "me"] as const,
  },

  // ---- Admin -----------------------------------------------------
  admin: {
    stats: () => ["admin", "stats"] as const,
    dealers: (filters?: Record<string, unknown>) => ["admin", "dealers", filters ?? {}] as const,
    dealer: (id: string) => ["admin", "dealers", "detail", id] as const,
    dealersArchived: () => ["admin", "dealers", "archived"] as const,
    inventory: (filters?: Record<string, unknown>) =>
      ["admin", "inventory", filters ?? {}] as const,
    inventoryDetail: (id: string) => ["admin", "inventory", "detail", id] as const,
    kycPending: () => ["admin", "kyc", "pending"] as const,
    auditLog: (filters?: Record<string, unknown>) => ["admin", "audit-log", filters ?? {}] as const,
    transactions: (filters?: Record<string, unknown>) =>
      ["admin", "transactions", filters ?? {}] as const,
    settings: () => ["admin", "settings"] as const,
  },
} as const;
