"use client";

import type { ReactNode } from "react";

/**
 * MobileFAB — premium floating action button for mobile-only contexts.
 *
 * Design language:
 *   - 60×60 circle in brand-navy (#1B2B4B) with a gold (#C9A84C) hairline
 *     ring inset 2px from the edge — gives the button a "minted" quality
 *     without being decorative for its own sake
 *   - Soft drop shadow (navy/30 → no neon halo) so the button reads as
 *     elevated above page content without competing with brand color
 *   - Press scale + active translate-y for tactile feedback
 *   - Fixed bottom-end (RTL-aware: visual right on Hebrew RTL pages)
 *
 * Hidden on `md:` and up — desktop has a regular in-flow primary
 * button (e.g. "הוסף רכב" in the page header), so the FAB only needs
 * to exist on phones.
 *
 * Accessibility:
 *   - Always has an accessible name (`label` is read by SR)
 *   - `title` provides a hover tooltip on pointer devices
 *   - 60px ≥ 44px WCAG minimum touch target
 *   - aria-hidden="true" on the inline SVG icon (label carries meaning)
 *   - Respects prefers-reduced-motion (transitions become 0.01ms via
 *     globals.css already)
 */
export function MobileFAB({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="bg-brand-navy text-brand-cream focus-visible:outline-brand-navy shadow-brand-navy/35 ring-brand-gold/55 fixed bottom-6 end-6 z-40 inline-flex h-[60px] w-[60px] items-center justify-center rounded-full shadow-lg ring-1 ring-inset transition-transform duration-150 hover:-translate-y-0.5 hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[0.96] md:hidden"
    >
      {icon ?? <DefaultPlusIcon />}
    </button>
  );
}

function DefaultPlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-7 w-7"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Funnel icon for the marketplace filter FAB. */
export function FilterFABIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6"
    >
      <path d="M3 5h18l-7 9v6l-4-2v-4z" />
    </svg>
  );
}
