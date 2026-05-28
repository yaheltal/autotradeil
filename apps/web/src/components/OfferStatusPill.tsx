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

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתינה",
  accepted: "התקבלה",
  rejected: "נדחתה",
  countered: "הצעה נגדית",
  cancelled: "בוטלה",
  expired: "פגה",
};

export function OfferStatusPill({ status }: { status: OfferStatus }) {
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
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export function offerStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
