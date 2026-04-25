"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/**
 * SellVehicleDialog — Phase 6.5 "mark as sold" flow.
 *
 * A11y notes:
 *   - Hardened modal pattern from InventoryFormDialog: dir="rtl",
 *     w-screen h-[100dvh], dvh-based card max-h, p-3 mobile / p-4 sm.
 *   - sold_to radios: native fieldset+legend, no role=radiogroup
 *     (matches the OTP delivery + inventory visibility patterns).
 *   - Live profit calculation: visible <p> updates per keystroke; SR
 *     announcement is a SEPARATE sr-only role=status that fires only on
 *     debounced settle (≥600ms idle) AND value change. Mirrors the
 *     announcePrice/lastAnnouncedPrice pattern in InventoryFormDialog.
 *   - Post-success: caller is expected to refresh + receive `onSold` —
 *     callers should move focus to a stable target since the trigger
 *     card may unmount.
 */

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  b2b_price: number | null;
  b2c_price: number | null;
  purchase_cost: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  token: string;
  /** Called after a successful sell. Caller is responsible for refresh
   *  and for moving focus to a stable target (the trigger card may
   *  unmount when status flips to 'sold'). */
  onSold: () => void;
};

type SoldTo = "b2b" | "b2c" | "external";

export function SellVehicleDialog({ open, onOpenChange, vehicle, token, onSold }: Props) {
  const defaultSale = vehicle.b2b_price ?? vehicle.b2c_price ?? vehicle.price ?? 0;
  const [salePrice, setSalePrice] = useState<string>(String(defaultSale));
  const [purchaseCost, setPurchaseCost] = useState<string>(
    vehicle.purchase_cost != null ? String(vehicle.purchase_cost) : "",
  );
  const [soldTo, setSoldTo] = useState<SoldTo>("b2c");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced+deduped SR announcer for the live profit value.
  const [profitAnnounce, setProfitAnnounce] = useState<string>("");
  const lastAnnouncedRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setSalePrice(String(defaultSale));
      setPurchaseCost(vehicle.purchase_cost != null ? String(vehicle.purchase_cost) : "");
      setSoldTo("b2c");
      setError(null);
      setProfitAnnounce("");
      lastAnnouncedRef.current = null;
    }
  }, [open, defaultSale, vehicle.purchase_cost]);

  const profit = useMemo(() => {
    const sp = parseInt(salePrice, 10);
    const pc = parseInt(purchaseCost, 10);
    if (Number.isNaN(sp) || Number.isNaN(pc)) return null;
    return { abs: sp - pc, pct: sp > 0 ? ((sp - pc) / sp) * 100 : 0 };
  }, [salePrice, purchaseCost]);

  // Debounced sr-only announcement: fires only after 600ms of idle AND
  // when the value actually changes (avoids announcement storms while
  // the dealer is typing digit-by-digit).
  useEffect(() => {
    if (profit === null) return;
    const handle = setTimeout(() => {
      if (lastAnnouncedRef.current === profit.abs) return;
      lastAnnouncedRef.current = profit.abs;
      setProfitAnnounce(
        `רווח מחושב: ${profit.abs.toLocaleString("he-IL")} שקלים, ${profit.pct.toFixed(1)} אחוז`,
      );
    }, 600);
    return () => clearTimeout(handle);
  }, [profit]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const sp = parseInt(salePrice, 10);
    if (!sp || sp <= 0) {
      setError("מחיר מכירה חייב להיות מספר חיובי");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/v1/inventory/${vehicle.id}/sell`, {
        method: "POST",
        token,
        body: JSON.stringify({
          sale_price: sp,
          purchase_cost: purchaseCost ? parseInt(purchaseCost, 10) : undefined,
          sold_to: soldTo,
        }),
      });
      onSold();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בסגירת המכירה");
    } finally {
      setBusy(false);
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
          aria-describedby="sell-desc"
          dir="rtl"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <Dialog.Title className="text-brand-navy text-lg font-bold">
              סימון רכב כנמכר
            </Dialog.Title>
            <Dialog.Description id="sell-desc" className="text-brand-ink/70 mt-1 text-sm">
              {vehicle.make} {vehicle.model} {vehicle.year}
            </Dialog.Description>

            {/* sr-only debounced announcer for the live profit value */}
            {profitAnnounce ? (
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                key={profitAnnounce}
              >
                {profitAnnounce}
              </p>
            ) : null}

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="sell-price"
                  className="text-brand-ink mb-1 block text-sm font-semibold"
                >
                  מחיר מכירה ₪
                </label>
                <input
                  id="sell-price"
                  type="number"
                  inputMode="numeric"
                  required
                  min={1}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  aria-describedby="sell-price-hint"
                  className="border-brand-navy/20 focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                <p id="sell-price-hint" className="text-brand-ink/70 mt-1 text-xs">
                  המחיר שבאמת התקבל בעסקה — ייתכן שונה מהמחיר המבוקש שהוצג בשוק
                </p>
              </div>

              <div>
                <label
                  htmlFor="sell-cost"
                  className="text-brand-ink mb-1 block text-sm font-semibold"
                >
                  עלות קנייה ₪ (אופציונלי)
                </label>
                <input
                  id="sell-cost"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  aria-describedby="sell-cost-hint"
                  className="border-brand-navy/20 focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                <p id="sell-cost-hint" className="text-brand-ink/70 mt-1 text-xs">
                  אם לא הוזן בעת ההוספה — אפשר להזין עכשיו לחישוב רווח
                </p>
              </div>

              <fieldset>
                <legend className="text-brand-ink mb-2 block text-sm font-semibold">
                  לאיזה שוק נמכר
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["b2b", "סוחר (B2B)"],
                      ["b2c", "פרטי (B2C)"],
                      ["external", "חיצוני"],
                    ] as const
                  ).map(([value, label]) => {
                    const selected = soldTo === value;
                    return (
                      <label
                        key={value}
                        className={[
                          "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border-2 px-2 py-2 text-sm font-semibold transition",
                          "has-[:focus-visible]:outline-brand-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                          selected
                            ? "border-brand-navy bg-brand-navy text-brand-cream"
                            : "border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 bg-white",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="sold_to"
                          value={value}
                          checked={selected}
                          onChange={() => setSoldTo(value)}
                          className="sr-only"
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Visible profit display (no live attrs — the sr-only
               *  region above carries the announcement, debounced). */}
              {profit !== null ? (
                <div className="bg-brand-navy/5 rounded-md p-3">
                  <p className="text-brand-ink text-sm">
                    רווח מחושב:{" "}
                    <strong className={profit.abs >= 0 ? "text-ok-text" : "text-danger-text"}>
                      <span aria-hidden="true">{formatPrice(profit.abs).visual}</span>
                      <span className="sr-only">{formatPrice(profit.abs).sr}</span>
                    </strong>{" "}
                    <span className="text-brand-ink/70">({profit.pct.toFixed(1)}%)</span>
                  </p>
                </div>
              ) : (
                <p className="text-brand-ink/60 text-sm">הזן עלות קנייה כדי לראות רווח מחושב</p>
              )}

              {error ? (
                <p
                  role="alert"
                  className="text-danger-text bg-danger-bg rounded-md px-3 py-2 text-sm"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {busy ? "סוגר…" : "סגור מכירה"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
