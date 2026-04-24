/*
 * Status badge used for both dealer-approval and inventory-item status.
 * Text labels are the primary signal; color is reinforcement (not
 * color-only, per WCAG 1.4.1).
 *
 * Contrast (all AAA, ≥ 10:1):
 *   pending  #fef3c7 / #78350f
 *   verified #dcfce7 / #14532d    (dealer approved)
 *   rejected #fee2e2 / #7f1d1d
 *   active   #dcfce7 / #14532d    (inventory active)
 *   sold     #e2e8f0 / #1e293b    (inventory sold — slate)
 *   hidden   #fef3c7 / #78350f    (inventory hidden — amber)
 */

export type DealerStatus = "pending" | "verified" | "rejected";
export type InventoryStatus = "active" | "sold" | "hidden";

type Entry = { label: string; aria: string; cls: string };

const MAP: Record<DealerStatus | InventoryStatus, Entry> = {
  pending: {
    label: "ממתין",
    aria: "סטטוס: ממתין לאישור",
    cls: "bg-amber-100 text-amber-900 ring-amber-600/30",
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
};

export function StatusBadge({ status }: { status: DealerStatus | InventoryStatus }) {
  const { label, aria, cls } = MAP[status];
  return (
    <span
      aria-label={aria}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}
    >
      {label}
    </span>
  );
}

export function deriveStatus(d: { verified: boolean; rejected_at: string | null }): DealerStatus {
  if (d.rejected_at) return "rejected";
  if (d.verified) return "verified";
  return "pending";
}
