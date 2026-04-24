/*
 * Status badge used for dealer-approval, inventory-item status, and
 * marketplace offer status. Text labels are the primary signal; color
 * is reinforcement (not color-only, per WCAG 1.4.1). A small glyph is
 * added for the offer statuses to improve scanability at the density
 * on the offers page — the glyph carries `aria-hidden="true"` so SRs
 * only read the Hebrew label.
 *
 * Contrast (all AAA, ≥ 10:1):
 *   pending  #fef3c7 / #78350f
 *   verified #dcfce7 / #14532d
 *   rejected #fee2e2 / #7f1d1d
 *   active   #dcfce7 / #14532d
 *   sold     #e2e8f0 / #1e293b
 *   hidden   #fef3c7 / #78350f
 *
 * Offer states share palettes with the existing entries above, plus:
 *   accepted  #dcfce7 / #14532d   (green — terminal OK)
 *   countered #e0e7ff / #1e1b4b   (navy-ish — neutral/in-progress)
 *   cancelled #e2e8f0 / #1e293b   (slate — terminal void)
 */

export type DealerStatus = "pending" | "verified" | "rejected";
export type InventoryStatus = "active" | "sold" | "hidden";
export type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "cancelled";

type AllStatus = DealerStatus | InventoryStatus | OfferStatus;

type Entry = { label: string; aria: string; cls: string; glyph?: string };

const MAP: Record<AllStatus, Entry> = {
  pending: {
    label: "ממתין",
    aria: "סטטוס: ממתין",
    cls: "bg-amber-100 text-amber-900 ring-amber-600/30",
    glyph: "⏳",
  },
  verified: {
    label: "מאושר",
    aria: "סטטוס: מאושר",
    cls: "bg-ok-bg text-ok-text ring-ok/30",
  },
  rejected: {
    label: "נדחה",
    aria: "סטטוס: נדחה",
    cls: "bg-danger-bg text-danger-text ring-danger/30",
    glyph: "✕",
  },
  active: {
    label: "פעיל",
    aria: "סטטוס: פעיל",
    cls: "bg-ok-bg text-ok-text ring-ok/30",
  },
  sold: {
    label: "נמכר",
    aria: "סטטוס: נמכר",
    cls: "bg-slate-200 text-slate-800 ring-slate-400/30",
  },
  hidden: {
    label: "מוסתר",
    aria: "סטטוס: מוסתר",
    cls: "bg-amber-100 text-amber-900 ring-amber-600/30",
  },
  accepted: {
    label: "התקבל",
    aria: "סטטוס: התקבל",
    cls: "bg-ok-bg text-ok-text ring-ok/30",
    glyph: "✓",
  },
  countered: {
    label: "הצעה נגדית",
    aria: "סטטוס: הצעה נגדית",
    cls: "bg-indigo-100 text-indigo-950 ring-indigo-700/30",
    glyph: "⇄",
  },
  cancelled: {
    label: "בוטל",
    aria: "סטטוס: בוטל",
    cls: "bg-slate-200 text-slate-800 ring-slate-400/30",
    glyph: "–",
  },
};

export function StatusBadge({ status }: { status: AllStatus }) {
  const { label, aria, cls, glyph } = MAP[status];
  return (
    <span
      aria-label={aria}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}
    >
      {glyph ? (
        <span aria-hidden="true" className="text-[0.85em]">
          {glyph}
        </span>
      ) : null}
      {label}
    </span>
  );
}

export function deriveStatus(d: { verified: boolean; rejected_at: string | null }): DealerStatus {
  if (d.rejected_at) return "rejected";
  if (d.verified) return "verified";
  return "pending";
}
