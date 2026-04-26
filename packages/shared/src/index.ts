export type UserType = "consumer" | "dealer" | "admin";

export type DealerTier = "bronze" | "silver" | "gold" | "platinum";

export type InventoryStatus = "draft" | "active" | "reserved" | "sold" | "archived";

export type OfferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "countered"
  | "expired"
  | "withdrawn";

export type DealType = "b2b" | "b2c";
