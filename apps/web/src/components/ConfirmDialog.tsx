"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

/**
 * Generic confirm dialog for terminal offer actions (accept/reject).
 *
 * A11y (pre-write plan):
 *   - Radix Dialog handles focus trap, return focus, Escape, scroll-lock.
 *   - `Dialog.Description` is wired to `aria-describedby` — used to
 *     carry the "פעולה לא ניתנת לביטול" warning for destructive/terminal
 *     actions so SR users hear it before the confirm button.
 *   - We do NOT autofocus the destructive confirm (per APG AlertDialog
 *     guidance). Radix's default first-focusable = Cancel, which is the
 *     safer landing point for irreversible actions.
 *   - RTL centering uses the `fixed inset-0 flex items-center justify-
 *     center` pattern (`start-1/2` breaks in RTL).
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger" | "success";
};

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "ביטול",
  tone = "default",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בביצוע הפעולה");
    } finally {
      setBusy(false);
    }
  };

  const confirmClass =
    tone === "danger"
      ? "bg-danger text-white hover:bg-danger/90 focus-visible:outline-danger-text"
      : tone === "success"
        ? "bg-ok text-white hover:bg-ok/90 focus-visible:outline-ok"
        : "bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          aria-hidden="true"
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
        />
        <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4">
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl">
            <Dialog.Title className="text-brand-navy text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Description className="text-brand-ink/80 mt-2 text-sm">
              {description}
            </Dialog.Description>

            {error ? (
              <p
                role="alert"
                className="bg-danger-bg text-danger-text mt-4 rounded-md px-3 py-2 text-sm"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  {cancelLabel}
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy}
                aria-busy={busy || undefined}
                className={`inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70 ${confirmClass}`}
              >
                {busy ? "מבצע…" : confirmLabel}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
