"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CounterOfferDialog } from "@/components/CounterOfferDialog";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { NotificationBell } from "@/components/NotificationBell";
import { StatusBadge, type OfferStatus } from "@/components/StatusBadge";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/*
 * Offers management page.
 *
 * A11y plan (approved):
 *   - ARIA tabs pattern: role=tablist with role=tab buttons, role=tabpanel
 *     panels. Selected tab has aria-selected=true + tabIndex=0; others
 *     tabIndex=-1. Arrow keys move; in RTL, ArrowRight = previous,
 *     ArrowLeft = next (mapped explicitly so browsers/AT see the VISUAL
 *     next/previous consistently).
 *   - Terminal/destructive actions (reject/cancel) use a ConfirmDialog
 *     carrying a Dialog.Description ("פעולה לא ניתנת לביטול") that Radix
 *     wires to aria-describedby.
 *   - Action result announced via a single dashboard `role="status"`.
 *   - Sent-offers "price comparison" uses <del> + sr-only prefixes to
 *     avoid color/style-only meaning.
 */

type OfferVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  primary_image_url: string | null;
};

type OfferDealer = {
  id: string;
  business_name: string;
  city: string | null;
};

type Offer = {
  id: string;
  inventory_id: string;
  buyer_dealer_id: string;
  seller_dealer_id: string;
  offered_price: number;
  message: string | null;
  status: OfferStatus;
  counter_price: number | null;
  counter_message: string | null;
  created_at: string;
  updated_at: string;
  vehicle: OfferVehicle;
  buyer: OfferDealer;
  seller: OfferDealer;
};

type OfferListResponse = {
  items: Offer[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

type Tab = "received" | "sent";

const TABS: { id: Tab; label: string }[] = [
  { id: "received", label: "הצעות שקיבלתי" },
  { id: "sent", label: "הצעות ששלחתי" },
];

export default function OffersPage() {
  const { token } = useDealerAuth("/dashboard/offers");

  const [tab, setTab] = useState<Tab>("received");
  const [received, setReceived] = useState<OfferListResponse | null>(null);
  const [sent, setSent] = useState<OfferListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Map<Tab, HTMLButtonElement>>(new Map());

  // Confirm dialog state (accept / reject / cancel)
  const [confirm, setConfirm] = useState<null | {
    action: "accept" | "reject" | "cancel";
    offer: Offer;
  }>(null);

  // Counter-offer dialog state
  const [counter, setCounter] = useState<null | {
    offer: Offer;
    originalPrice: number;
    originalSideLabel: string;
  }>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [r, s] = await Promise.all([
        apiFetch<OfferListResponse>(`/api/v1/marketplace/offers/received`, { token }),
        apiFetch<OfferListResponse>(`/api/v1/marketplace/offers/sent`, { token }),
      ]);
      setReceived(r);
      setSent(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת ההצעות");
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (received || sent) h1Ref.current?.focus();
  }, [received, sent]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // RTL-aware arrow-key handling: ArrowRight = previous (visually), ArrowLeft = next.
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let nextIdx = idx;
    if (e.key === "ArrowLeft") nextIdx = (idx + 1) % TABS.length;
    else if (e.key === "ArrowRight") nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TABS.length - 1;
    else return;
    e.preventDefault();
    const nextTab = TABS[nextIdx];
    if (!nextTab) return;
    setTab(nextTab.id);
    queueMicrotask(() => tabRefs.current.get(nextTab.id)?.focus());
  };

  const doAccept = async (id: string) => {
    if (!token) return;
    await apiFetch(`/api/v1/marketplace/offers/${id}/accept`, {
      method: "POST",
      token,
    });
    setToast("ההצעה אושרה");
    await refresh();
  };
  const doReject = async (id: string) => {
    if (!token) return;
    await apiFetch(`/api/v1/marketplace/offers/${id}/reject`, {
      method: "POST",
      token,
    });
    setToast("ההצעה נדחתה");
    await refresh();
  };
  const doCancel = async (id: string) => {
    if (!token) return;
    await apiFetch(`/api/v1/marketplace/offers/${id}/cancel`, {
      method: "POST",
      token,
    });
    setToast("ההצעה בוטלה");
    await refresh();
  };

  if (!token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  return (
    <div className="bg-brand-cream text-brand-ink min-h-screen">
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <BrandMark />
          <NotificationBell token={token} />
        </div>
      </header>

      <DashboardSubNav />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
          >
            ניהול הצעות
          </h1>

          {toast ? (
            <p role="status" aria-live="polite" className="sr-only" key={toast}>
              {toast}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="bg-danger-bg text-danger-text mt-4 rounded-md px-4 py-3">
              {error}
            </p>
          ) : null}

          <div
            role="tablist"
            aria-label="מיון הצעות"
            dir="rtl"
            className="border-brand-navy/10 mt-6 flex gap-1 border-b"
          >
            {TABS.map((t) => {
              const selected = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(t.id, el);
                    else tabRefs.current.delete(t.id);
                  }}
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`tabpanel-${t.id}`}
                  id={`tab-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={onTabKeyDown}
                  className={[
                    "inline-flex min-h-11 items-center px-4 py-2 text-sm font-semibold",
                    "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                    selected
                      ? "text-brand-navy border-brand-gold border-b-2"
                      : "text-brand-ink/60 hover:text-brand-navy",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id="tabpanel-received"
            aria-labelledby="tab-received"
            hidden={tab !== "received"}
            className="mt-6"
          >
            {received == null ? (
              <p role="status" className="text-brand-ink/60 p-8">
                טוען…
              </p>
            ) : received.items.length === 0 ? (
              <p className="border-brand-navy/10 text-brand-ink/60 rounded-lg border bg-white p-10 text-center">
                עדיין לא התקבלו הצעות על המלאי שלך
              </p>
            ) : (
              <ul className="space-y-4">
                {received.items.map((o) => (
                  <ReceivedCard
                    key={o.id}
                    offer={o}
                    onAccept={() => setConfirm({ action: "accept", offer: o })}
                    onReject={() => setConfirm({ action: "reject", offer: o })}
                    onCounter={() =>
                      setCounter({
                        offer: o,
                        originalPrice: o.offered_price,
                        originalSideLabel: "הצעת הקונה",
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </div>

          <div
            role="tabpanel"
            id="tabpanel-sent"
            aria-labelledby="tab-sent"
            hidden={tab !== "sent"}
            className="mt-6"
          >
            {sent == null ? (
              <p role="status" className="text-brand-ink/60 p-8">
                טוען…
              </p>
            ) : sent.items.length === 0 ? (
              <p className="border-brand-navy/10 text-brand-ink/60 rounded-lg border bg-white p-10 text-center">
                לא שלחת עדיין הצעות.{" "}
                <Link href="/dashboard/marketplace" className="text-brand-navy underline">
                  עבור לשוק
                </Link>
              </p>
            ) : (
              <ul className="space-y-4">
                {sent.items.map((o) => (
                  <SentCard
                    key={o.id}
                    offer={o}
                    onAccept={() => setConfirm({ action: "accept", offer: o })}
                    onReject={() => setConfirm({ action: "reject", offer: o })}
                    onCancel={() => setConfirm({ action: "cancel", offer: o })}
                    onCounter={() =>
                      setCounter({
                        offer: o,
                        originalPrice: o.counter_price ?? o.offered_price,
                        originalSideLabel: "הצעת המוכר",
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      {confirm ? (
        <ConfirmDialog
          open={true}
          onOpenChange={(v) => !v && setConfirm(null)}
          title={
            confirm.action === "accept"
              ? "אישור הצעה"
              : confirm.action === "reject"
                ? "דחיית הצעה"
                : "ביטול הצעה"
          }
          description={
            confirm.action === "accept"
              ? `האם לאשר את ההצעה על ${offerVehicleLabel(confirm.offer)}? פעולה לא ניתנת לביטול.`
              : confirm.action === "reject"
                ? `האם לדחות את ההצעה על ${offerVehicleLabel(confirm.offer)}? פעולה לא ניתנת לביטול.`
                : `האם לבטל את ההצעה שלך על ${offerVehicleLabel(confirm.offer)}? פעולה לא ניתנת לביטול.`
          }
          confirmLabel={
            confirm.action === "accept"
              ? "אישור ההצעה"
              : confirm.action === "reject"
                ? "דחיית ההצעה"
                : "ביטול ההצעה"
          }
          tone={confirm.action === "accept" ? "success" : "danger"}
          onConfirm={async () => {
            if (confirm.action === "accept") await doAccept(confirm.offer.id);
            else if (confirm.action === "reject") await doReject(confirm.offer.id);
            else await doCancel(confirm.offer.id);
            setConfirm(null);
          }}
        />
      ) : null}

      {counter ? (
        <CounterOfferDialog
          open={true}
          onOpenChange={(v) => !v && setCounter(null)}
          token={token}
          offerId={counter.offer.id}
          vehicleLabel={offerVehicleLabel(counter.offer)}
          originalPrice={counter.originalPrice}
          originalSideLabel={counter.originalSideLabel}
          onSubmitted={() => {
            setToast("הצעה נגדית נשלחה");
            void refresh();
            setCounter(null);
          }}
        />
      ) : null}
    </div>
  );
}

function offerVehicleLabel(o: Offer): string {
  return `${o.vehicle.make} ${o.vehicle.model} ${o.vehicle.year}`;
}

function ReceivedCard({
  offer,
  onAccept,
  onReject,
  onCounter,
}: {
  offer: Offer;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
}) {
  const canAct = offer.status === "pending" || offer.status === "countered";
  const priceF = formatPrice(offer.offered_price);
  const titleId = `offer-${offer.id}-title`;
  const label = offerVehicleLabel(offer);

  return (
    <li className="border-brand-navy/10 rounded-lg border bg-white p-5">
      <article aria-labelledby={titleId}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-brand-navy text-lg font-bold">
              {label}
            </h3>
            <p className="text-brand-ink/70 mt-1 text-sm">
              קונה: <span className="font-semibold">{offer.buyer.business_name}</span>
              {offer.buyer.city ? ` · ${offer.buyer.city}` : ""}
            </p>
          </div>
          <StatusBadge status={offer.status} />
        </header>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-brand-ink/60">מחיר מוצע</dt>
            <dd className="text-brand-navy font-bold">
              <span aria-hidden="true">{priceF.visual}</span>
              <span className="sr-only">{priceF.sr}</span>
            </dd>
          </div>
          {offer.counter_price != null ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-brand-ink/60">ההצעה הנגדית שלך</dt>
              <dd>
                <span aria-hidden="true">{formatPrice(offer.counter_price).visual}</span>
                <span className="sr-only">{formatPrice(offer.counter_price).sr}</span>
              </dd>
            </div>
          ) : null}
        </dl>

        {offer.message ? (
          <p className="border-brand-navy/10 text-brand-ink border-s-brand-gold bg-brand-cream/40 mt-3 whitespace-pre-wrap rounded-md border-s-4 p-3 text-sm">
            <span className="text-brand-ink/60 block text-xs font-semibold">הודעה מהקונה:</span>
            {offer.message}
          </p>
        ) : null}

        {canAct ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAccept}
              aria-label={`אישור ההצעה על ${label}`}
              className="bg-ok hover:bg-ok/90 focus-visible:outline-ok inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">✓</span>
              קבל
            </button>
            <button
              type="button"
              onClick={onReject}
              aria-label={`דחיית ההצעה על ${label}`}
              className="bg-danger hover:bg-danger/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">✕</span>
              דחה
            </button>
            <button
              type="button"
              onClick={onCounter}
              aria-label={`הצעה נגדית על ${label}`}
              className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center gap-1.5 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">⇄</span>
              הצע נגד
            </button>
          </div>
        ) : null}
      </article>
    </li>
  );
}

function SentCard({
  offer,
  onAccept,
  onReject,
  onCancel,
  onCounter,
}: {
  offer: Offer;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onCounter: () => void;
}) {
  const priceF = formatPrice(offer.offered_price);
  const titleId = `offer-${offer.id}-title`;
  const label = offerVehicleLabel(offer);

  const isCountered = offer.status === "countered";
  const isPending = offer.status === "pending";

  return (
    <li className="border-brand-navy/10 rounded-lg border bg-white p-5">
      <article aria-labelledby={titleId}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-brand-navy text-lg font-bold">
              {label}
            </h3>
            <p className="text-brand-ink/70 mt-1 text-sm">
              מוכר: <span className="font-semibold">{offer.seller.business_name}</span>
              {offer.seller.city ? ` · ${offer.seller.city}` : ""}
            </p>
          </div>
          <StatusBadge status={offer.status} />
        </header>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-brand-ink/60">ההצעה שלי</dt>
            <dd className={isCountered ? "text-brand-ink/60" : "text-brand-navy font-bold"}>
              {isCountered ? (
                <>
                  <span className="sr-only">מחיר קודם: </span>
                  <del aria-hidden="true">{priceF.visual}</del>
                  <span className="sr-only">{priceF.sr}</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">{priceF.visual}</span>
                  <span className="sr-only">{priceF.sr}</span>
                </>
              )}
            </dd>
          </div>
          {isCountered && offer.counter_price != null ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-brand-ink/60">הצעה נגדית מהמוכר</dt>
              <dd className="text-brand-navy font-bold">
                <span className="sr-only">הצעה נגדית: </span>
                <span aria-hidden="true">{formatPrice(offer.counter_price).visual}</span>
                <span className="sr-only">{formatPrice(offer.counter_price).sr}</span>
              </dd>
            </div>
          ) : null}
        </dl>

        {offer.counter_message ? (
          <p className="border-brand-navy/10 text-brand-ink border-s-brand-gold bg-brand-cream/40 mt-3 whitespace-pre-wrap rounded-md border-s-4 p-3 text-sm">
            <span className="text-brand-ink/60 block text-xs font-semibold">הודעה מהמוכר:</span>
            {offer.counter_message}
          </p>
        ) : null}

        {isCountered ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAccept}
              aria-label={`קבלת ההצעה הנגדית על ${label}`}
              className="bg-ok hover:bg-ok/90 focus-visible:outline-ok inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">✓</span>
              קבל הצעה נגדית
            </button>
            <button
              type="button"
              onClick={onCounter}
              aria-label={`הצעה נגדית חדשה על ${label}`}
              className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center gap-1.5 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">⇄</span>
              הצע נגד
            </button>
            <button
              type="button"
              onClick={onReject}
              aria-label={`דחיית ההצעה הנגדית על ${label}`}
              className="border-danger text-danger-text hover:bg-danger-bg focus-visible:outline-danger-text inline-flex min-h-11 items-center gap-1.5 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">✕</span>
              דחה
            </button>
          </div>
        ) : null}

        {isPending ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={onCancel}
              aria-label={`ביטול ההצעה שלי על ${label}`}
              className="border-danger text-danger-text hover:bg-danger-bg focus-visible:outline-danger-text inline-flex min-h-11 items-center gap-1.5 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              בטל הצעה
            </button>
          </div>
        ) : null}
      </article>
    </li>
  );
}
