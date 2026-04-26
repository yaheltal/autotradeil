"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/**
 * SellVehicleDialog v2 (Phase 6.8.4).
 *
 * Captures everything needed to close a private sale:
 *   1. Sale price + (optional) purchase cost — for profit calc
 *   2. Buyer details: name + Israeli ID + phone
 *   3. Market: B2B is the only enabled choice; B2C/external are
 *      "בקרוב" — visible but disabled, with explanatory tooltips so
 *      the dealer understands why
 *   4. Optional trade-in vehicle: make / model / year / agreed value /
 *      plate. Surfaced behind a checkbox so the form stays short for
 *      the common case (no trade-in).
 *
 * Hardened-modal pattern (dir=rtl, w-screen h-[100dvh], dvh-based card
 * max-h, p-3 mobile / p-4 sm). Live profit announcer is debounced so
 * SR users don't get shouted at every keystroke.
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
  /** Caller refreshes the inventory list and is responsible for moving
   *  focus to a stable target — the trigger card may unmount once
   *  status flips to 'sold'. */
  onSold: () => void;
};

type SoldTo = "b2b" | "b2c" | "external";

const ID_NUMBER_PATTERN = /^\d{9}$/;

export function SellVehicleDialog({ open, onOpenChange, vehicle, token, onSold }: Props) {
  const defaultSale = vehicle.b2b_price ?? vehicle.b2c_price ?? vehicle.price ?? 0;

  const [salePrice, setSalePrice] = useState<string>(String(defaultSale));
  const [purchaseCost, setPurchaseCost] = useState<string>(
    vehicle.purchase_cost != null ? String(vehicle.purchase_cost) : "",
  );
  // Only B2B is selectable in the current product phase. The other two
  // markets are rendered visibly but disabled with a "בקרוב" pill.
  const [soldTo, setSoldTo] = useState<SoldTo>("b2b");

  const [buyerName, setBuyerName] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");

  const [hasTradeIn, setHasTradeIn] = useState(false);
  const [tradeMake, setTradeMake] = useState("");
  const [tradeModel, setTradeModel] = useState("");
  const [tradeYear, setTradeYear] = useState("");
  const [tradeValue, setTradeValue] = useState("");
  const [tradePlate, setTradePlate] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced+deduped SR announcer for the live profit value.
  const [profitAnnounce, setProfitAnnounce] = useState<string>("");
  const lastAnnouncedRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setSalePrice(String(defaultSale));
      setPurchaseCost(vehicle.purchase_cost != null ? String(vehicle.purchase_cost) : "");
      setSoldTo("b2b");
      setBuyerName("");
      setBuyerId("");
      setBuyerPhone("");
      setHasTradeIn(false);
      setTradeMake("");
      setTradeModel("");
      setTradeYear("");
      setTradeValue("");
      setTradePlate("");
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

  // Debounce the profit announcement so SR users don't hear each
  // keystroke during typing.
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
    if (!buyerName.trim()) {
      setError("יש להזין את שם הקונה");
      return;
    }
    if (buyerId && !ID_NUMBER_PATTERN.test(buyerId)) {
      setError("מספר תעודת זהות חייב להיות 9 ספרות");
      return;
    }
    if (hasTradeIn) {
      if (!tradeMake.trim() || !tradeModel.trim()) {
        setError("יש להשלים יצרן ודגם של רכב הטרייד");
        return;
      }
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
          buyer_name: buyerName.trim() || undefined,
          buyer_id_number: buyerId.trim() || undefined,
          buyer_phone: buyerPhone.trim() || undefined,
          was_trade_in: hasTradeIn,
          trade_in_make: hasTradeIn ? tradeMake.trim() || undefined : undefined,
          trade_in_model: hasTradeIn ? tradeModel.trim() || undefined : undefined,
          trade_in_year: hasTradeIn && tradeYear ? parseInt(tradeYear, 10) : undefined,
          trade_in_value: hasTradeIn && tradeValue ? parseInt(tradeValue, 10) : undefined,
          trade_in_plate: hasTradeIn ? tradePlate.trim() || undefined : undefined,
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
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-xl overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-brand-navy text-lg font-bold">
                סימון רכב כנמכר
              </Dialog.Title>
              <DialogCloseButton className="-me-1 -mt-1" />
            </div>
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

            <form onSubmit={submit} className="mt-4 space-y-5">
              {/* === Pricing === */}
              <fieldset className="space-y-4">
                <legend className="text-brand-navy text-sm font-bold">פרטי מכירה</legend>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="sell-price"
                      className="text-brand-ink mb-1 block text-sm font-semibold"
                    >
                      מחיר מכירה ₪ <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="sell-price"
                      type="number"
                      inputMode="numeric"
                      required
                      min={1}
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sell-cost"
                      className="text-brand-ink mb-1 block text-sm font-semibold"
                    >
                      עלות קנייה ₪ <span className="text-brand-ink/55 text-xs">(אופציונלי)</span>
                    </label>
                    <input
                      id="sell-cost"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={purchaseCost}
                      onChange={(e) => setPurchaseCost(e.target.value)}
                      className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                  </div>
                </div>

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
                  <p className="text-brand-ink/60 text-xs">הזן עלות קנייה כדי לראות רווח מחושב.</p>
                )}
              </fieldset>

              {/* === Market selector === */}
              <fieldset>
                <legend className="text-brand-navy text-sm font-bold">לאיזה שוק נמכר</legend>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { value: "b2b", label: "סוחר (B2B)", available: true },
                      { value: "b2c", label: "פרטי (B2C)", available: false },
                      { value: "external", label: "חיצוני", available: false },
                    ] as const
                  ).map(({ value, label, available }) => {
                    const selected = soldTo === value;
                    const tooltip = available ? undefined : "השוק הזה ייפתח בקרוב";
                    return (
                      <label
                        key={value}
                        title={tooltip}
                        className={[
                          "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border-2 px-2 py-2 text-sm font-semibold transition",
                          "has-[:focus-visible]:outline-brand-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                          available
                            ? selected
                              ? "border-brand-navy bg-brand-navy text-brand-cream cursor-pointer"
                              : "border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 cursor-pointer bg-white"
                            : "border-brand-navy/15 bg-brand-navy/5 text-brand-navy/55 cursor-not-allowed",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="sold_to"
                          value={value}
                          checked={selected}
                          disabled={!available}
                          onChange={() => available && setSoldTo(value)}
                          className="sr-only"
                        />
                        <span>{label}</span>
                        {!available ? (
                          <span
                            aria-hidden="true"
                            className="bg-brand-navy/10 text-brand-navy/70 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                          >
                            בקרוב
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* === Buyer details === */}
              <fieldset className="space-y-3">
                <legend className="text-brand-navy text-sm font-bold">פרטי הקונה</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="buyer-name"
                      className="text-brand-ink mb-1 block text-sm font-semibold"
                    >
                      שם מלא <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="buyer-name"
                      type="text"
                      autoComplete="name"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-id"
                      className="text-brand-ink mb-1 block text-sm font-semibold"
                    >
                      תעודת זהות
                      <span className="text-brand-ink/55 text-xs"> (9 ספרות)</span>
                    </label>
                    <input
                      id="buyer-id"
                      type="text"
                      inputMode="numeric"
                      pattern="\d{9}"
                      maxLength={9}
                      dir="ltr"
                      value={buyerId}
                      onChange={(e) => setBuyerId(e.target.value.replace(/\D/g, ""))}
                      className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 font-mono text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="buyer-phone"
                    className="text-brand-ink mb-1 block text-sm font-semibold"
                  >
                    טלפון <span className="text-brand-ink/55 text-xs">(אופציונלי)</span>
                  </label>
                  <input
                    id="buyer-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="052-1234567"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 sm:max-w-xs"
                  />
                </div>
              </fieldset>

              {/* === Trade-in toggle === */}
              <fieldset className="border-brand-navy/15 rounded-md border bg-white/60 p-4">
                <legend className="text-brand-navy px-2 text-sm font-bold">טרייד-אין</legend>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={hasTradeIn}
                    onChange={(e) => setHasTradeIn(e.target.checked)}
                    className="border-brand-navy/30 text-brand-navy focus-visible:outline-brand-navy h-5 w-5 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
                  />
                  <span className="text-brand-ink text-sm font-semibold">
                    בעסקה הייתה החלפת רכב (טרייד-אין)
                  </span>
                </label>

                {hasTradeIn ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="trade-make"
                          className="text-brand-ink mb-1 block text-sm font-semibold"
                        >
                          יצרן הרכב <span aria-hidden="true">*</span>
                        </label>
                        <input
                          id="trade-make"
                          type="text"
                          required={hasTradeIn}
                          value={tradeMake}
                          onChange={(e) => setTradeMake(e.target.value)}
                          className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="trade-model"
                          className="text-brand-ink mb-1 block text-sm font-semibold"
                        >
                          דגם <span aria-hidden="true">*</span>
                        </label>
                        <input
                          id="trade-model"
                          type="text"
                          required={hasTradeIn}
                          value={tradeModel}
                          onChange={(e) => setTradeModel(e.target.value)}
                          className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label
                          htmlFor="trade-year"
                          className="text-brand-ink mb-1 block text-sm font-semibold"
                        >
                          שנת ייצור
                        </label>
                        <input
                          id="trade-year"
                          type="number"
                          inputMode="numeric"
                          min={1900}
                          max={2030}
                          value={tradeYear}
                          onChange={(e) => setTradeYear(e.target.value)}
                          className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="trade-value"
                          className="text-brand-ink mb-1 block text-sm font-semibold"
                        >
                          שווי מוסכם ₪
                        </label>
                        <input
                          id="trade-value"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={tradeValue}
                          onChange={(e) => setTradeValue(e.target.value)}
                          className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="trade-plate"
                          className="text-brand-ink mb-1 block text-sm font-semibold"
                        >
                          לוחית רישוי
                        </label>
                        <input
                          id="trade-plate"
                          type="text"
                          dir="ltr"
                          value={tradePlate}
                          onChange={(e) => setTradePlate(e.target.value)}
                          className="border-brand-navy/20 focus-visible:outline-brand-navy block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 font-mono text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </fieldset>

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
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-[44px] items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-[44px] items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
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
