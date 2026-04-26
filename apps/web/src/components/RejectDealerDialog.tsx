"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
  businessName: string;
};

/*
 * Reject-dealer dialog.
 * Radix handles focus trap, focus return, Escape, scroll-lock,
 * aria-modal, and inert background.
 *
 * A11y:
 *   - <Dialog.Title id="reject-title"> referenced by aria-labelledby
 *   - <Dialog.Description id="reject-desc"> referenced by aria-describedby
 *   - textarea has aria-invalid when in error, and its aria-describedby
 *     extends to include the error message id
 *   - minLength=10, maxLength=500; Hebrew error strings
 *   - confirm button shows aria-busy while submitting
 *   - motion-reduce:transition-none on overlay + content
 */

export function RejectDealerDialog({ open, onOpenChange, onSubmit, businessName }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError("הסיבה חייבת להכיל לפחות 10 תווים");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setReason("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשליחה");
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
          aria-describedby="reject-desc"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="relative max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <DialogCloseButton />
            <Dialog.Title className="text-brand-navy pe-12 text-lg font-bold">
              דחיית סוחר
            </Dialog.Title>
            <Dialog.Description id="reject-desc" className="text-brand-ink/70 mt-1 text-sm">
              נדחה את הבקשה של <span className="text-brand-navy font-semibold">{businessName}</span>
              . הזן סיבה, לפחות 10 תווים. הסיבה תישלח במייל לסוחר.
            </Dialog.Description>

            <div className="mt-4">
              <label htmlFor="reject-reason" className="text-brand-navy block text-sm font-medium">
                סיבת הדחייה
              </label>
              <textarea
                id="reject-reason"
                required
                minLength={10}
                maxLength={500}
                rows={5}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "reject-desc reject-error" : "reject-desc"}
                className={[
                  "text-brand-ink mt-2 block w-full rounded-md border px-3 py-2 text-base",
                  "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                  error ? "border-danger-text bg-danger-bg" : "border-brand-navy/20 bg-white",
                ].join(" ")}
              />
              {error ? (
                <p id="reject-error" role="alert" className="text-danger-text mt-1 text-sm">
                  {error}
                </p>
              ) : null}
              <p className="text-brand-ink/60 mt-1 text-xs">{reason.length} / 500</p>
            </div>

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
                onClick={handleSubmit}
                disabled={submitting}
                aria-busy={submitting || undefined}
                className="bg-danger hover:bg-danger-text focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? "שולח…" : "אישור דחייה"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
