"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { BrandMark } from "@/components/BrandMark";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CounterOfferDialog } from "@/components/CounterOfferDialog";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { NotificationBell } from "@/components/NotificationBell";
import { StatusBadge, type OfferStatus } from "@/components/StatusBadge";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

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
  tier: Tier;
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
  // Phase 4.2 — double-confirmation deal closing
  closed_at?: string | null;
  deal_confirmed_buyer?: boolean;
  deal_confirmed_seller?: boolean;
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
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("received");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Map<Tab, HTMLButtonElement>>(new Map());

  // Confirm dialog state (accept / reject / cancel / confirm-deal)
  const [confirm, setConfirm] = useState<null | {
    action: "accept" | "reject" | "cancel" | "confirm-deal";
    offer: Offer;
  }>(null);

  // Counter-offer dialog state
  const [counter, setCounter] = useState<null | {
    offer: Offer;
    originalPrice: number;
    originalSideLabel: string;
  }>(null);

  const receivedQuery = useQuery({
    queryKey: queryKeys.offers.list("received"),
    queryFn: () =>
      apiFetch<OfferListResponse>(`/api/v1/marketplace/offers/received`, { token: token! }),
    enabled: !!token,
  });
  const sentQuery = useQuery({
    queryKey: queryKeys.offers.list("sent"),
    queryFn: () =>
      apiFetch<OfferListResponse>(`/api/v1/marketplace/offers/sent`, { token: token! }),
    enabled: !!token,
  });

  const received = receivedQuery.data ?? null;
  const sent = sentQuery.data ?? null;

  useEffect(() => {
    if (receivedQuery.error || sentQuery.error) {
      // Generic — never leak technical detail to dealers.
      setError("אירעה שגיאה, אנא נסה שוב מאוחר יותר");
    }
  }, [receivedQuery.error, sentQuery.error]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.offers.root() });
  };

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

  const acceptMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/marketplace/offers/${id}/accept`, { method: "POST", token: token! }),
    onSuccess: () => {
      setToast("ההצעה אושרה");
      void qc.invalidateQueries({ queryKey: queryKeys.offers.root() });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/marketplace/offers/${id}/reject`, { method: "POST", token: token! }),
    onSuccess: () => {
      setToast("ההצעה נדחתה");
      void qc.invalidateQueries({ queryKey: queryKeys.offers.root() });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/marketplace/offers/${id}/cancel`, { method: "POST", token: token! }),
    onSuccess: () => {
      setToast("ההצעה בוטלה");
      void qc.invalidateQueries({ queryKey: queryKeys.offers.root() });
    },
  });
  const confirmDealMutation = useMutation({
    // The body's `agreed: true` is the digital signature on the platform's
    // terms — backend stamps timestamp + IP per side.
    mutationFn: (id: string) =>
      apiFetch<{ closed_at: string | null }>(`/api/v1/marketplace/offers/${id}/confirm-deal`, {
        method: "POST",
        token: token!,
        body: JSON.stringify({ agreed: true }),
      }),
    onSuccess: (res) => {
      setToast(
        res.closed_at
          ? "העסקה אושרה — בתהליך, צוות AutoTradeIL מלווה את הסגירה"
          : "אישורך נשמר — ממתין לצד השני",
      );
      void qc.invalidateQueries({ queryKey: queryKeys.offers.root() });
      if (res.closed_at) void qc.invalidateQueries({ queryKey: queryKeys.deals.root() });
    },
  });

  const doAccept = (id: string) => acceptMutation.mutateAsync(id);
  const doReject = (id: string) => rejectMutation.mutateAsync(id);
  const doCancel = (id: string) => cancelMutation.mutateAsync(id);
  const doConfirmDeal = async (id: string) => {
    await confirmDealMutation.mutateAsync(id);
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
          <BackLink href="/dashboard" label="חזרה ללוח הבקרה" />
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy mt-3 text-3xl font-bold tracking-tight focus:outline-none"
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
                    onConfirmDeal={() => setConfirm({ action: "confirm-deal", offer: o })}
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
                    onConfirmDeal={() => setConfirm({ action: "confirm-deal", offer: o })}
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
                : confirm.action === "cancel"
                  ? "ביטול הצעה"
                  : "אישור סגירת עסקה"
          }
          description={
            confirm.action === "accept"
              ? `האם לאשר את ההצעה על ${offerVehicleLabel(confirm.offer)}? פעולה לא ניתנת לביטול.`
              : confirm.action === "reject"
                ? `האם לדחות את ההצעה על ${offerVehicleLabel(confirm.offer)}? פעולה לא ניתנת לביטול.`
                : confirm.action === "cancel"
                  ? `האם לבטל את ההצעה שלך על ${offerVehicleLabel(confirm.offer)}? פעולה לא ניתנת לביטול.`
                  : `בלחיצה על "אשר עסקה" אני מסכים לתנאי השימוש של AutoTradeIL ומאשר את העסקה על ${offerVehicleLabel(confirm.offer)}. ` +
                    `שני הצדדים חייבים לאשר; לאחר אישור שני הצדדים הרכב ייכנס למצב "בתהליך" וצוות AutoTradeIL ילווה את הסגירה. ` +
                    `הסכמתך, חותמת זמן וכתובת ה-IP נשמרות לצורכי תיעוד.`
          }
          confirmLabel={
            confirm.action === "accept"
              ? "אישור ההצעה"
              : confirm.action === "reject"
                ? "דחיית ההצעה"
                : confirm.action === "cancel"
                  ? "ביטול ההצעה"
                  : "אשר עסקה"
          }
          // Gold/primary tone for "confirm-deal" (irreversible but positive,
          // per a11y-lead Q H). Accept = success, reject/cancel = danger.
          tone={
            confirm.action === "accept"
              ? "success"
              : confirm.action === "confirm-deal"
                ? "default"
                : "danger"
          }
          onConfirm={async () => {
            if (confirm.action === "accept") await doAccept(confirm.offer.id);
            else if (confirm.action === "reject") await doReject(confirm.offer.id);
            else if (confirm.action === "cancel") await doCancel(confirm.offer.id);
            else await doConfirmDeal(confirm.offer.id);
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

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Offer timeline — natural RTL <ol> (NO flex-row-reverse), with ← arrows
 * between steps. Current step carries aria-current="step".
 */
function OfferTimeline({ offer, myRole }: { offer: Offer; myRole: "buyer" | "seller" }) {
  type Step = { label: string; iso: string; current?: boolean };
  const steps: Step[] = [];
  steps.push({ label: `נשלח ${shortDate(offer.created_at)}`, iso: offer.created_at });

  if (offer.status === "countered" || offer.counter_price != null) {
    steps.push({
      label: `הצעה נגדית ${shortDate(offer.updated_at)}`,
      iso: offer.updated_at,
    });
  }

  const terminalLabel: Record<string, string> = {
    accepted: "אושר",
    rejected: "נדחה",
    cancelled: "בוטל",
  };
  if (terminalLabel[offer.status]) {
    steps.push({
      label: `${terminalLabel[offer.status]} ${shortDate(offer.updated_at)}`,
      iso: offer.updated_at,
      current: true,
    });
  } else {
    const waitingText =
      offer.status === "countered"
        ? myRole === "seller"
          ? "ממתין לקונה"
          : "ממתין לאישורך"
        : myRole === "seller"
          ? "ממתין לאישורך"
          : "ממתין למוכר";
    steps.push({ label: waitingText, iso: offer.updated_at, current: true });
  }

  return (
    <ol className="text-brand-ink/70 mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      {steps.map((s, i) => (
        <li
          key={i}
          aria-current={s.current ? "step" : undefined}
          className={[
            "inline-flex items-center gap-1",
            s.current ? "text-brand-navy font-semibold" : "",
          ].join(" ")}
        >
          <time dateTime={s.iso}>{s.label}</time>
          {i < steps.length - 1 ? (
            <span aria-hidden="true" className="text-brand-ink/40 mx-1">
              ←
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Double-confirmation block for accepted offers. Wrapped in aria-live so
 * the state flip after /confirm-deal is announced politely.
 */
function DealConfirmationBlock({
  offer,
  myRole,
  onConfirmClick,
}: {
  offer: Offer;
  myRole: "buyer" | "seller";
  onConfirmClick: () => void;
}) {
  if (offer.status !== "accepted") return null;
  const closed = !!offer.closed_at;
  const mineConfirmed =
    myRole === "buyer" ? !!offer.deal_confirmed_buyer : !!offer.deal_confirmed_seller;
  const theirsConfirmed =
    myRole === "buyer" ? !!offer.deal_confirmed_seller : !!offer.deal_confirmed_buyer;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-brand-navy/10 bg-brand-cream/40 mt-4 rounded-md border p-3 text-sm"
    >
      <p className="text-brand-navy font-semibold">סגירת עסקה</p>
      {closed ? (
        <p className="text-ok-text mt-1">
          <span aria-hidden="true">✓ </span>
          העסקה נסגרה משני הצדדים
        </p>
      ) : (
        <>
          <p className="text-brand-ink/80 mt-1">
            שני הצדדים צריכים לאשר.{" "}
            {mineConfirmed ? (
              <span>
                <span aria-hidden="true">✓ </span>
                אתה אישרת
              </span>
            ) : (
              <span>אתה טרם אישרת</span>
            )}
            {" | "}
            {theirsConfirmed ? (
              <span>
                <span aria-hidden="true">✓ </span>
                הצד השני אישר
              </span>
            ) : (
              <span>ממתין לצד השני</span>
            )}
          </p>
          {!mineConfirmed ? (
            <button
              type="button"
              onClick={onConfirmClick}
              className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 focus-visible:outline-brand-navy mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              אשר עסקה
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ReceivedCard({
  offer,
  onAccept,
  onReject,
  onCounter,
  onConfirmDeal,
}: {
  offer: Offer;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
  onConfirmDeal: () => void;
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
            <p className="text-brand-ink/70 mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span>
                קונה: <span className="font-semibold">{offer.buyer.business_name}</span>
                {offer.buyer.city ? ` · ${offer.buyer.city}` : ""}
              </span>
              <TrustBadge tier={offer.buyer.tier} compact />
            </p>
          </div>
          <StatusBadge status={offer.status} />
        </header>

        <OfferTimeline offer={offer} myRole="seller" />

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

        <DealConfirmationBlock offer={offer} myRole="seller" onConfirmClick={onConfirmDeal} />

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
  onConfirmDeal,
}: {
  offer: Offer;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onCounter: () => void;
  onConfirmDeal: () => void;
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
            <p className="text-brand-ink/70 mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span>
                מוכר: <span className="font-semibold">{offer.seller.business_name}</span>
                {offer.seller.city ? ` · ${offer.seller.city}` : ""}
              </span>
              <TrustBadge tier={offer.seller.tier} compact />
            </p>
          </div>
          <StatusBadge status={offer.status} />
        </header>

        <OfferTimeline offer={offer} myRole="buyer" />

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

        <DealConfirmationBlock offer={offer} myRole="buyer" onConfirmClick={onConfirmDeal} />

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
