"use client";

import { useEffect, type RefObject } from "react";

/*
 * useDialogScrollReset — when a Radix Dialog reopens, force its
 * scrollable inner card back to scrollTop=0.
 *
 * Most dialogs in the app are conditionally mounted
 * (`{open ? <Dialog/> : null}`) so the inner DOM is fresh per open
 * and scroll naturally resets. But long forms that toggle `open`
 * without unmounting kept their previous scroll position, and a
 * dealer reopening "InventoryFormDialog" mid-fill would land at
 * the warranty fields instead of the title.
 *
 * Usage:
 *     const cardRef = useRef<HTMLDivElement>(null);
 *     useDialogScrollReset(cardRef, open);
 *     ...
 *     <div ref={cardRef} className="overflow-y-auto"> ... </div>
 *
 * Honors prefers-reduced-motion: when reduced motion is on we use
 * `scrollTo({behavior: "auto"})` (instant) so the user isn't
 * surprised by a moving viewport on open.
 */
export function useDialogScrollReset(ref: RefObject<HTMLElement>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    // queueMicrotask so the scroll happens AFTER React commits the
    // open state and Radix mounts the Portal. Without it, ref.current
    // can still be the previous (closed) Portal contents.
    queueMicrotask(() => {
      const el = ref.current;
      if (!el) return;
      try {
        el.scrollTo({ top: 0, behavior: "auto" });
      } catch {
        // Older browsers without scrollTo on element — fall back to
        // direct property assignment.
        el.scrollTop = 0;
      }
    });
  }, [open, ref]);
}
