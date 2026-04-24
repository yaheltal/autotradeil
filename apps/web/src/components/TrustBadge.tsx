/*
 * Dealer trust-tier badge (Phase 4.2).
 *
 * A11y (approved):
 *   - Emoji wrapped in `aria-hidden="true"` — decorative.
 *   - Hebrew label is the accessible name via `aria-label`.
 *   - On cramped layouts the label collapses to sr-only via the
 *     `compact` prop. `sr-only sm:not-sr-only` preserves the name in
 *     the accessibility tree at every breakpoint (NOT `hidden`).
 *   - Text/bg contrast (WCAG 1.4.11) verified ≥8:1 on white cards for
 *     all 4 palettes.
 */

export type Tier = "bronze" | "silver" | "gold" | "platinum";

type Meta = { glyph: string; label: string; cls: string };

const MAP: Record<Tier, Meta> = {
  bronze: {
    glyph: "🥉",
    label: "ברונזה",
    cls: "bg-amber-100 text-amber-900 ring-amber-700/30",
  },
  silver: {
    glyph: "🥈",
    label: "כסף",
    cls: "bg-slate-200 text-slate-800 ring-slate-400/30",
  },
  gold: {
    glyph: "🥇",
    label: "זהב",
    cls: "bg-yellow-100 text-yellow-900 ring-yellow-700/30",
  },
  platinum: {
    glyph: "💎",
    label: "פלטינה",
    cls: "bg-indigo-100 text-indigo-950 ring-indigo-700/30",
  },
};

type Props = {
  tier: Tier;
  /** When true, the Hebrew label collapses to sr-only at mobile widths. */
  compact?: boolean;
};

export function TrustBadge({ tier, compact = false }: Props) {
  const { glyph, label, cls } = MAP[tier];
  return (
    <span
      aria-label={`דרגת אמון: ${label}`}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}
    >
      <span aria-hidden="true">{glyph}</span>
      <span className={compact ? "sr-only sm:not-sr-only" : ""}>{label}</span>
    </span>
  );
}

export function tierFromScore(deals_completed: number): Tier {
  if (deals_completed >= 50) return "platinum";
  if (deals_completed >= 20) return "gold";
  if (deals_completed >= 5) return "silver";
  return "bronze";
}
