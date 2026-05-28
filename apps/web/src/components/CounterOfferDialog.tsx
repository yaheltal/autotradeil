"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/**
 * Counter-offer dialog. Used from both the "offers received" list (seller
 * countering a buyer) and the "offers sent" list when the offer is already
 * countered by the seller (buyer re-countering).
 *
 *   שליחת הצעה נגדית
 *   {vehicle label}
 *   ─────
 *   {originalSideLabel}: ₪…   ← context strip
 *
 *   מחיר נגדי ₪*    ← font-tabular Input
 *   הודעה (optional textarea)
 *
 *   [ביטול]  [שלח הצעה נגדית]
 *
 * A11y:
 *   - Original price shown as a visible inline strip that doubles as the
 *     aria-describedby target for the counter-price input (sighted users
 *     get context too)
 *   - Submit errors surface via shadcn <Alert variant="destructive">
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  offerId: string;
  vehicleLabel: string;
  originalPrice: number;
  originalSideLabel: string;
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
  const qc = useQueryClient();
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPrice("");
      setMessage("");
      setError(null);
    }
  }, [open]);

  const originalF = formatPrice(originalPrice);
  const ctxId = `counter-ctx-${offerId}`;

  const submitMutation = useMutation({
    mutationFn: ({
      counter_price,
      counter_message,
    }: {
      counter_price: number;
      counter_message: string | null;
    }) =>
      apiFetch(`/api/v1/marketplace/offers/${offerId}/counter`, {
        method: "POST",
        token,
        body: JSON.stringify({ counter_price, counter_message }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.offers.root() });
      // Defensive — root() prefix already covers history(), but listing
      // it explicitly survives a refactor that narrows the root key.
      void qc.invalidateQueries({ queryKey: queryKeys.offers.history(offerId) });
      onSubmitted();
      onOpenChange(false);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "שגיאה בשליחת ההצעה"),
  });
  const busy = submitMutation.isPending;

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
    setError(null);
    await submitMutation.mutateAsync({
      counter_price: n,
      counter_message: message.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>שליחת הצעה נגדית</DialogTitle>
          <DialogDescription>{vehicleLabel}</DialogDescription>
        </DialogHeader>

        <div
          id={ctxId}
          className="border-hairline bg-paper px-md py-sm mt-sm rounded-md border text-sm"
        >
          <span className="text-muted">{originalSideLabel}</span>
          <span aria-hidden="true" className="text-subtle mx-xxs">
            ·
          </span>
          <span className="text-ink font-tabular font-medium">
            <span aria-hidden="true">{originalF.visual}</span>
            <span className="sr-only">{originalF.sr}</span>
          </span>
        </div>

        {error ? (
          <Alert variant="destructive" className="mt-md">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-md space-y-lg">
          <div>
            <Label htmlFor="counter-price">
              מחיר נגדי ₪{" "}
              <span aria-hidden="true" className="text-danger-fg">
                *
              </span>
            </Label>
            <Input
              id="counter-price"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-describedby={ctxId}
              aria-required="true"
              className="font-tabular mt-xs"
            />
          </div>

          <div>
            <Label htmlFor="counter-message">הודעה (אופציונלי)</Label>
            <p id="counter-message-hint" className="text-muted mt-xxs text-xs">
              עד <span className="font-tabular">2000</span> תווים
            </p>
            <Textarea
              id="counter-message"
              rows={3}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby="counter-message-hint"
              className="mt-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            ביטול
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                <span>שולח…</span>
              </>
            ) : (
              "שלח הצעה נגדית"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
