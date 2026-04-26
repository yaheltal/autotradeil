"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";
import { apiFetch } from "@/lib/api";

/*
 * Pause-inventory dialog (Phase 4.3).
 *
 * A11y plan (approved):
 *   - <fieldset> + <legend> around the duration radio group.
 *   - Duration required — on submit without a selection we show an inline
 *     error, focus the fieldset, and wire aria-describedby from the
 *     legend's parent <fieldset> to the error node.
 *   - Reason textarea has a visible <label> (not placeholder), max 100
 *     chars, with a polite live-region counter that announces only when
 *     ≤ 10 chars remain (not every keystroke).
 *   - Radix Dialog: focus trap + return focus to trigger on close.
 */

type Option = { value: string; label: string; hours: number | null };

const DURATIONS: Option[] = [
  { value: "1", label: "שעה אחת", hours: 1 },
  { value: "3", label: "3 שעות", hours: 3 },
  { value: "24", label: "24 שעות", hours: 24 },
  { value: "inf", label: "ללא הגבלה", hours: null },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  inventoryId: string;
  vehicleLabel: string;
  onDone: () => void;
};

export function PauseDialog({
  open,
  onOpenChange,
  token,
  inventoryId,
  vehicleLabel,
  onDone,
}: Props) {
  const [duration, setDuration] = useState<string>("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDuration("");
      setReason("");
      setErr(null);
    }
  }, [open]);

  const submit = async () => {
    const chosen = DURATIONS.find((d) => d.value === duration);
    if (!chosen) {
      setErr("יש לבחור משך השהיה");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/v1/inventory/${inventoryId}/pause`, {
        method: "POST",
        token,
        body: JSON.stringify({
          hours: chosen.hours,
          reason: reason.trim() || null,
        }),
      });
      onDone();
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה בהשהיית הרכב");
    } finally {
      setBusy(false);
    }
  };

  const remaining = 100 - reason.length;
  const countAnnounce = remaining <= 10 ? `נותרו ${remaining} תווים` : "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          aria-hidden="true"
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
        />
        <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4">
          <div className="bg-brand-cream relative max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl">
            <DialogCloseButton />
            <Dialog.Title className="text-brand-navy pe-12 text-lg font-bold">
              השהיית רכב
            </Dialog.Title>
            <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
              {vehicleLabel} — הרכב יוסתר זמנית משוק B2B ומתצוגת לקוחות.
            </Dialog.Description>

            <fieldset
              className="mt-4 border-0 p-0"
              aria-describedby={err ? "pause-error" : undefined}
            >
              <legend className="text-brand-navy text-sm font-medium">כמה זמן?</legend>
              <div className="mt-2 space-y-1.5">
                {DURATIONS.map((d) => (
                  <label
                    key={d.value}
                    className="border-brand-navy/20 hover:bg-brand-navy/5 flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2"
                  >
                    <input
                      type="radio"
                      name="pause-duration"
                      value={d.value}
                      checked={duration === d.value}
                      onChange={() => setDuration(d.value)}
                      className="accent-brand-navy"
                    />
                    <span className="text-brand-navy text-sm font-medium">{d.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-4">
              <label htmlFor="pause-reason" className="text-brand-navy block text-sm font-medium">
                סיבה (אופציונלי)
              </label>
              <p id="pause-reason-hint" className="text-brand-navy/70 mt-1 text-xs">
                עד 100 תווים
              </p>
              <textarea
                id="pause-reason"
                rows={2}
                maxLength={100}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-describedby="pause-reason-hint pause-reason-count"
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <p
                id="pause-reason-count"
                aria-live="polite"
                className="text-brand-ink/60 mt-1 text-xs"
              >
                {countAnnounce}
              </p>
            </div>

            {err ? (
              <p
                id="pause-error"
                role="alert"
                className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm"
              >
                {err}
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
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                aria-busy={busy || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {busy ? "משהה…" : "השהה רכב"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
