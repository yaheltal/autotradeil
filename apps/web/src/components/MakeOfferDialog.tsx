"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/**
 * Make-offer dialog for the marketplace vehicle detail page.
 *
 * A11y:
 *   - Radix Dialog: focus trap, return focus on close, Escape, scroll lock.
 *   - Title (`Dialog.Title`) + description (`Dialog.Description`) wired
 *     automatically to `aria-labelledby` / `aria-describedby`.
 *   - Visible asking-price inline doubles as describedby target for the
 *     "מחיר מוצע" input.
 *   - Submit errors surface via `role="alert"` at the top of the form.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  inventoryId: string;
  vehicleLabel: string; // "טויוטה קורולה 2022"
  askingPrice: number;
  onSubmitted: () => void;
};

export function MakeOfferDialog({
  open,
  onOpenChange,
  token,
  inventoryId,
  vehicleLabel,
  askingPrice,
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

  const askingF = formatPrice(askingPrice);

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
      await apiFetch(`/api/v1/marketplace/vehicles/${inventoryId}/offers`, {
        method: "POST",
        token,
        body: JSON.stringify({
          offered_price: n,
          message: message.trim() || null,
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
        <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4">
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl">
            <Dialog.Title className="text-brand-navy text-lg font-bold">
              שליחת הצעת מחיר
            </Dialog.Title>
            <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
              {vehicleLabel}
            </Dialog.Description>

            <p
              id="make-offer-asking"
              className="border-brand-navy/10 text-brand-ink mt-4 rounded-md border bg-white px-3 py-2 text-sm"
            >
              <span className="text-brand-ink/60">מחיר מבוקש:&nbsp;</span>
              <span aria-hidden="true" className="font-semibold">
                {askingF.visual}
              </span>
              <span className="sr-only">{askingF.sr}</span>
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
                <label htmlFor="offer-price" className="text-brand-navy block text-sm font-medium">
                  מחיר מוצע ₪
                  <span aria-hidden="true" className="text-danger-text ms-1">
                    *
                  </span>
                </label>
                <input
                  id="offer-price"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-describedby="make-offer-asking"
                  aria-required="true"
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              <div>
                <label
                  htmlFor="offer-message"
                  className="text-brand-navy block text-sm font-medium"
                >
                  הודעה למוכר (אופציונלי)
                </label>
                <p id="offer-message-hint" className="text-brand-navy/70 mt-1 text-xs">
                  עד 2000 תווים
                </p>
                <textarea
                  id="offer-message"
                  rows={3}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-describedby="offer-message-hint"
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
                className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {busy ? "שולח…" : "שלח הצעה"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
