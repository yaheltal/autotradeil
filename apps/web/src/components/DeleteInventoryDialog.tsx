"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  label: string; // "{make} {model} שנת {year}"
};

export function DeleteInventoryDialog({ open, onOpenChange, onConfirm, label }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה במחיקה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <Dialog.Content
          aria-describedby="del-inv-desc"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="max-h-[95dvh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-brand-navy text-lg font-bold">מחיקת רכב</Dialog.Title>
              <DialogCloseButton className="-me-1 -mt-1" />
            </div>
            <Dialog.Description id="del-inv-desc" className="text-brand-ink/80 mt-2 text-sm">
              האם למחוק את <span className="text-brand-navy font-semibold">{label}</span> מהמלאי?
              הרכב יעבור למצב &quot;מוסתר&quot; וניתן לשחזר מאוחר יותר.
            </Dialog.Description>

            {error ? (
              <p
                role="alert"
                className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={submitting}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  ביטול
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={run}
                disabled={submitting}
                aria-busy={submitting || undefined}
                className="bg-danger hover:bg-danger-text focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? "מוחק…" : "מחיקה"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
