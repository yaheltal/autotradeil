"use client";

import * as Dialog from "@radix-ui/react-dialog";

/*
 * DialogCloseButton — single source of truth for the X-close affordance.
 *
 * Default mode (variant="absolute"): positions itself in the start
 * block-end corner of its containing relatively-positioned card so it
 * stays visible even when the inner content scrolls. The parent dialog
 * card MUST be `position: relative` (className includes "relative").
 *
 * variant="inline" keeps the legacy behavior (renders inline so callers
 * can place it in a flex row with the title). Used only by dialogs that
 * have specific layout needs (kept for backward compat — most dialogs
 * should use the default absolute variant).
 *
 * A11y:
 *   - Wraps Dialog.Close so Escape + click both fire the same close.
 *   - aria-label="סגור" (Hebrew "close") — never rely on the glyph alone.
 *   - aria-hidden on the ✕ glyph so SR announces "סגור" once.
 *   - 44×44 min size + focus-visible ring.
 *   - bg-white background (not transparent) so it stays legible over
 *     scrolling content beneath it.
 */
export function DialogCloseButton({
  className = "",
  variant = "absolute",
}: {
  className?: string;
  variant?: "absolute" | "inline";
}) {
  const positionCls =
    variant === "absolute"
      ? "absolute end-3 top-3 z-20 bg-white shadow-sm border border-brand-navy/10"
      : "";
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        aria-label="סגור"
        className={[
          "text-brand-ink/70 hover:bg-brand-navy/5 hover:text-brand-navy focus-visible:outline-brand-navy",
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          positionCls,
          className,
        ].join(" ")}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ✕
        </span>
      </button>
    </Dialog.Close>
  );
}
