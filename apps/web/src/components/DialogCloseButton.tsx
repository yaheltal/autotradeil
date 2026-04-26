"use client";

import * as Dialog from "@radix-ui/react-dialog";

/*
 * DialogCloseButton — single source of truth for the X-close affordance
 * inside every Radix Dialog.Content.
 *
 * Renders a 44×44 (WCAG 2.5.5) inline-flex button positioned in the
 * dialog's start-block-end corner of the header row. Pair it with the
 * Dialog.Title in a flex row so the X aligns with the title baseline.
 *
 * A11y:
 *   - Wraps Dialog.Close so Escape + click both fire the same close.
 *   - aria-label="סגור" (Hebrew "close") — never rely on the glyph alone.
 *   - aria-hidden on the ✕ glyph so SR announces "סגור" once.
 *   - 44×44 min size + focus-visible ring.
 */
export function DialogCloseButton({ className = "" }: { className?: string }) {
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        aria-label="סגור"
        className={[
          "text-brand-ink/65 hover:bg-brand-navy/5 hover:text-brand-navy focus-visible:outline-brand-navy",
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
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
