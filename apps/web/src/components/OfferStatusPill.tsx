/*
 * OfferStatusPill — the offer-state badge used in both the list card
 * and the detail dialog. Extracted from the offers page so the two
 * surfaces stay visually identical without duplicating the
 * status→color matrix.
 *
 * Color rule (CLAUDE.md §4): ink/paper everywhere except `countered`,
 * which gets the accent tint — that's the editorial moment where the
 * conversation is alive. `accepted` uses the ok palette, `rejected`
 * the danger palette; `cancelled`/`pending`/`expired` are tonal ink.
 */

import { type OfferStatus } from "@/components/StatusBadge";

export type OfferDirection = "received" | "sent";

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתינה",
  accepted: "התקבלה",
  rejected: "נדחתה",
  countered: "הצעה נגדית",
  cancelled: "בוטלה",
  expired: "פגה",
};

/**
 * Offer status badge.
 *
 * When `direction` is provided AND status is `pending`/`countered`, the
 * pill shows "whose move is next" instead of the generic status word.
 * That's the single highest-signal question a dealer asks of an open
 * offer ("is this on me?"). The color cue (accent on countered, muted
 * on pending) still separates the two states visually.
 *
 * Heuristic: counter_price on the offer row reflects only the LAST
 * counter, regardless of who made it. We infer "whose turn" from
 * direction × status — correct for one round, gracefully wrong (off by
 * one round) for multi-round counter chains. The exact who-countered-last
 * lives in the history endpoint; this pill stays cheap.
 */
export function OfferStatusPill({
  status,
  direction,
}: {
  status: OfferStatus;
  direction?: OfferDirection;
}) {
  const cls = (() => {
    switch (status) {
      case "accepted":
        return "bg-ok-bg text-ok-fg border-ok/20";
      case "rejected":
        return "bg-danger-bg text-danger-fg border-danger/20";
      case "countered":
        return "bg-accent/10 text-accent border-accent/30";
      case "cancelled":
        return "bg-muted/10 text-muted border-hairline";
      case "pending":
      default:
        return "bg-muted/10 text-muted border-hairline";
    }
  })();
  const label =
    direction && (status === "pending" || status === "countered")
      ? waitingLabel(status, direction)
      : (STATUS_LABELS[status] ?? status);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function waitingLabel(status: "pending" | "countered", direction: OfferDirection): string {
  // received + pending   → buyer just opened, my (seller's) move
  // received + countered → I (seller) just countered, buyer's move
  // sent     + pending   → I (buyer) just opened, seller's move
  // sent     + countered → seller just countered, my move
  const myMove =
    (direction === "received" && status === "pending") ||
    (direction === "sent" && status === "countered");
  return myMove ? "ממתין לאישורך" : "ממתין לצד השני";
}

export function offerStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
