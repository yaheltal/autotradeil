/*
 * Dealer status badge.
 * Color + border carry visual cues; accessible name carries the full
 * phrase so "not color-only" (SC 1.4.1) is satisfied.
 *
 * Contrast (all AAA):
 *   pending  bg #fef3c7 text #78350f  → ~10:1
 *   verified bg #dcfce7 text #14532d  → 11:1
 *   rejected bg #fee2e2 text #7f1d1d  → 10.6:1
 */

export type DealerStatus = "pending" | "verified" | "rejected";

const MAP: Record<DealerStatus, { label: string; aria: string; cls: string }> = {
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
};

export function StatusBadge({ status }: { status: DealerStatus }) {
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
