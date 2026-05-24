import { Check } from "lucide-react";

/**
 * AdminStatusPill — single-tone status badge for every admin list page.
 *
 * Replaces the scattered hand-rolled pills (amber/indigo Tailwind
 * defaults on /admin/dealers, /admin/kyc, etc.). Variants are
 * token-driven — no new colors enter the palette through this
 * component. Use:
 *
 *   - "neutral"  — pending / awaiting / draft. Tonal ink on paper.
 *   - "ink"      — verified / submitted / in-progress. Solid ink chip.
 *   - "accent"   — approved / completed / success. The one "win"
 *                  state per page. Accent (oxidized bronze) earns
 *                  attention without color noise; pairs with the
 *                  optional <Check> glyph.
 *   - "danger"   — rejected / suspended / failed. Danger-fg on tinted
 *                  bg, AA contrast.
 *
 * The `withCheck` prop appends a lucide <Check> for the accent
 * variant — used by KYC "approved" and similar success states so
 * the chip reads at a glance, not just by color.
 */
type Variant = "neutral" | "ink" | "accent" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  neutral: "border-hairline text-muted bg-paper",
  ink: "border-ink/15 bg-ink text-paper",
  accent: "border-accent/30 bg-accent-subtle text-accent",
  danger: "border-danger/30 bg-danger-bg text-danger-fg",
};

export function AdminStatusPill({
  variant = "neutral",
  withCheck = false,
  children,
  className,
}: {
  variant?: Variant;
  withCheck?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "gap-xxs inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASS[variant],
        className ?? "",
      ].join(" ")}
    >
      {withCheck && variant === "accent" ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}
