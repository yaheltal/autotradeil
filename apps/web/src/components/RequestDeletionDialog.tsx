"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";

/**
 * RequestDeletionDialog — Wave 2 dealer-initiated deletion request.
 *
 * The dealer types a reason and confirms. The request flips the row to
 * status='pending_deletion' on the backend, which hides it from the
 * marketplace and routes it to the admin deletion-request inbox. Until
 * an admin approves or rejects, the dealer can withdraw the request
 * via /cancel-deletion (the kebab still exposes the row in their
 * inventory under "בקשות בטיפול").
 *
 * Validation: reason is trimmed and must be at least MIN_REASON_LENGTH
 * characters — short reasons are useless to the admin reviewer.
 *
 * The parent owns close-on-success. This dialog runs onSubmit, surfaces
 * errors, and trusts the parent to set open=false when the mutation
 * completes. The external `busy` prop drives the disabled + aria-busy
 * states (sourced from the mutation's isPending) so the buttons can't
 * be re-clicked mid-flight.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
  vehicleLabel: string;
  busy: boolean;
};

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 2000;

export function RequestDeletionDialog({ open, onOpenChange, onSubmit, vehicleLabel, busy }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const trimmed = reason.trim();
  const isShort = trimmed.length < MIN_REASON_LENGTH;
  const showValidationError = touched && isShort;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (isShort) return;
    setError(null);
    try {
      await onSubmit(trimmed);
      // Parent closes on success; we still wipe local state so the
      // next open starts clean if the parent forgets.
      setReason("");
      setTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת הבקשה");
    }
  };

  // Wipe local state every time the dialog closes — sidesteps the
  // "previous reason hangs around on next open" trap.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReason("");
      setError(null);
      setTouched(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          aria-hidden="true"
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
        />
        <Dialog.Content
          aria-describedby="req-del-desc"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream relative max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl">
            <DialogCloseButton />
            <Dialog.Title className="text-brand-navy pe-12 text-lg font-bold">
              בקשת מחיקה
            </Dialog.Title>
            <Dialog.Description id="req-del-desc" className="text-brand-ink/80 mt-2 text-sm">
              מחיקת <span className="text-brand-navy font-semibold">{vehicleLabel}</span> דורשת
              אישור אדמין. הרכב יוסתר מהמרקטפלייס בזמן ההמתנה ותוכל לבטל את הבקשה כל עוד היא לא
              טופלה.
            </Dialog.Description>

            <form onSubmit={handleSubmit} className="mt-4">
              <label
                htmlFor="req-del-reason"
                className="text-brand-navy block text-sm font-semibold"
              >
                סיבה למחיקה
              </label>
              <p id="req-del-reason-hint" className="text-brand-ink/60 mt-1 text-xs">
                לפחות {MIN_REASON_LENGTH} תווים. תוצג לאדמין יחד עם פרטי הרכב.
              </p>
              <textarea
                id="req-del-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={busy}
                rows={4}
                maxLength={MAX_REASON_LENGTH}
                aria-invalid={showValidationError || undefined}
                aria-describedby={
                  showValidationError
                    ? "req-del-reason-hint req-del-reason-error"
                    : "req-del-reason-hint"
                }
                className="border-brand-navy/30 focus:border-brand-navy focus:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-offset-0 disabled:opacity-60"
                placeholder="לדוגמה: רכב נמכר ידנית מחוץ למערכת ולא יחזור למלאי"
              />
              {showValidationError ? (
                <p id="req-del-reason-error" role="alert" className="text-danger-text mt-2 text-xs">
                  נדרשים לפחות {MIN_REASON_LENGTH} תווים
                </p>
              ) : null}

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
                    disabled={busy}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={busy || isShort}
                  aria-busy={busy || undefined}
                  className="bg-danger hover:bg-danger-text focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {busy ? "שולח…" : "שלח בקשה"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
