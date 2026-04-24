"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/**
 * Counter-offer dialog. Used from both the "offers received" list (seller
 * countering a buyer) and the "offers sent" list when the offer is already
 * countered by the seller (buyer re-countering).
 *
 * A11y:
 *   - Original price shown as a VISIBLE inline `<p>` (not sr-only) that
 *     doubles as the `aria-describedby` target for the counter-price
 *     input (per the a11y-lead's preferred pattern — sighted users get
 *     context too).
 *   - Submit errors surface via `role="alert"`.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  offerId: string;
  vehicleLabel: string;
  originalPrice: number; // the price the counter is responding to
  originalSideLabel: string; // "ההצעה שלך הייתה" / "הסוחר ביקש"
  onSubmitted: () => void;
};

export function CounterOfferDialog({
  open,
  onOpenChange,
  token,
  offerId,
  vehicleLabel,
  originalPrice,
  originalSideLabel,
  onSubmitted,
}: Props) {
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPrice("");
      setMessage("");
      setError(null);
    }
  }, [open]);

  const originalF = formatPrice(originalPrice);

  const submit = async () => {
    const n = parseInt(price.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) {
      setError("חובה להזין מחיר תקין");
      return;
    }
    if (message.length > 2000) {
      setError("הודעה ארוכה מדי (מקסימום 2000 תווים)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/marketplace/offers/${offerId}/counter`, {
        method: "POST",
        token,
        body: JSON.stringify({
          counter_price: n,
          counter_message: message.trim() || null,
        }),
      });
      onSubmitted();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשליחת ההצעה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          aria-hidden="true"
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
        />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 motion-reduce:transition-none">
          <div className="bg-brand-cream w-full max-w-md rounded-xl p-6 shadow-xl">
            <Dialog.Title className="text-brand-navy text-lg font-bold">
              שליחת הצעה נגדית
            </Dialog.Title>
            <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
              {vehicleLabel}
            </Dialog.Description>

            <p
              id={`counter-ctx-${offerId}`}
              className="border-brand-navy/10 text-brand-ink mt-4 rounded-md border bg-white px-3 py-2 text-sm"
            >
              <span className="text-brand-ink/60">{originalSideLabel}:&nbsp;</span>
              <span aria-hidden="true" className="font-semibold">
                {originalF.visual}
              </span>
              <span className="sr-only">{originalF.sr}</span>
            </p>

            {error ? (
              <p
                role="alert"
                className="bg-danger-bg text-danger-text mt-4 rounded-md px-3 py-2 text-sm"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="counter-price"
                  className="text-brand-navy block text-sm font-medium"
                >
                  מחיר נגדי ₪
                  <span aria-hidden="true" className="text-danger-text ms-1">
                    *
                  </span>
                </label>
                <input
                  id="counter-price"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-describedby={`counter-ctx-${offerId}`}
                  aria-required="true"
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              <div>
                <label
                  htmlFor="counter-message"
                  className="text-brand-navy block text-sm font-medium"
                >
                  הודעה (אופציונלי)
                </label>
                <p id="counter-message-hint" className="text-brand-navy/70 mt-1 text-xs">
                  עד 2000 תווים
                </p>
                <textarea
                  id="counter-message"
                  rows={3}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-describedby="counter-message-hint"
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>
            </div>

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
                {busy ? "שולח…" : "שלח הצעה נגדית"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
