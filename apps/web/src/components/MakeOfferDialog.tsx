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
 * Make-offer dialog for the marketplace vehicle detail page.
 *
 *   שליחת הצעת מחיר
 *   {vehicle label}
 *   ─────
 *   מחיר מבוקש: ₪…   ← asking-price strip, doubles as aria-describedby
 *
 *   מחיר מוצע ₪*    ← font-tabular Input
 *   הודעה (optional textarea)
 *
 *   [ביטול]  [שלח הצעה]    ← shadcn Button + accent CTA on submit
 *
 * A11y:
 *   - shadcn Dialog wraps Radix — focus trap, return focus on close,
 *     Escape, scroll lock all inherited
 *   - Title + description wired automatically to aria-labelledby /
 *     aria-describedby
 *   - Visible asking-price inline doubles as describedby for the price
 *     input
 *   - Submit errors surface via shadcn <Alert variant="destructive">
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

  const askingF = formatPrice(askingPrice);

  const submitMutation = useMutation({
    mutationFn: ({ offered_price, msg }: { offered_price: number; msg: string | null }) =>
      apiFetch(`/api/v1/marketplace/vehicles/${inventoryId}/offers`, {
        method: "POST",
        token,
        body: JSON.stringify({ offered_price, message: msg }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.offers.root() });
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
    await submitMutation.mutateAsync({ offered_price: n, msg: message.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>שליחת הצעת מחיר</DialogTitle>
          <DialogDescription>{vehicleLabel}</DialogDescription>
        </DialogHeader>

        <div
          id="make-offer-asking"
          className="border-hairline bg-paper px-md py-sm mt-sm rounded-md border text-sm"
        >
          <span className="text-muted">מחיר מבוקש</span>
          <span aria-hidden="true" className="text-subtle mx-xxs">
            ·
          </span>
          <span className="text-ink font-tabular font-medium">
            <span aria-hidden="true">{askingF.visual}</span>
            <span className="sr-only">{askingF.sr}</span>
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
            <Label htmlFor="offer-price">
              מחיר מוצע ₪{" "}
              <span aria-hidden="true" className="text-danger-fg">
                *
              </span>
            </Label>
            <Input
              id="offer-price"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-describedby="make-offer-asking"
              aria-required="true"
              className="font-tabular mt-xs"
            />
          </div>

          <div>
            <Label htmlFor="offer-message">הודעה למוכר (אופציונלי)</Label>
            <p id="offer-message-hint" className="text-muted mt-xxs text-xs">
              עד <span className="font-tabular">2000</span> תווים
            </p>
            <Textarea
              id="offer-message"
              rows={3}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby="offer-message-hint"
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
            className="bg-accent text-accent-ink hover:bg-accent/90"
          >
            {busy ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                <span>שולח…</span>
              </>
            ) : (
              "שלח הצעה"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
