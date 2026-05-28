"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, Check, CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CounterOfferDialog } from "@/components/CounterOfferDialog";
import { OfferDetailDialog } from "@/components/OfferDetailDialog";
import { OfferStatusPill } from "@/components/OfferStatusPill";
import { type OfferStatus } from "@/components/StatusBadge";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * /dashboard/offers — editorial offer-book.
 *
 *   הצעות
 *   ──────────
 *   {received.total} שהתקבלו · {sent.total} ששלחתי   ← dek (font-tabular)
 *
 *   הצעות שקיבלתי · N   |   הצעות ששלחתי · M       ← roving tabs
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ Toyota Camry · 2022             [countered]     │
 *   │ קונה: {name} · {city}  [TrustBadge]              │
 *   │                                                  │
 *   │ 14/12 · נשלח  ← 16/12 · הצעה נגדית  ← ממתין      │
 *   │                                                  │
 *   │ מחיר מוצע           ₪140,000                     │
 *   │ הצעה נגדית שלך      ₪145,000                     │
 *   │                                                  │
 *   │ ▎ הודעה מהקונה                                   │
 *   │   המחיר הזה מצוין…                               │
 *   │                                                  │
 *   │ [קבל] [הצע נגד] [דחה]                            │
 *   └────────────────────────────────────────────────┘
 *
 * The accent (oxidized bronze) shows up exactly twice in this page:
 *   1. on the "countered" StatusPill — the conversation-is-alive moment
 *   2. on the "אשר עסקה" double-confirmation button — the closing handshake
 *
 * Everything else is ink/paper/muted typography. ARIA tabs with roving
 * tabindex + RTL arrow keys preserved verbatim from the prior file.
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

  // Confirm-dialog state (accept / reject / cancel / confirm-deal)
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

  // Detail-dialog state — open/close keyed by offer id so the dialog
  // re-mounts cleanly between offers (avoiding stale query data leaking
  // across selections). The id is sourced; the full offer is looked up
  // from the appropriate list query so it stays in sync with mutations.
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

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

  // Resolve the currently-open detail offer from whichever list it's in.
  // Looked up live so accept/counter mutations that invalidate the lists
  // also refresh the dialog body.
  const selected = useMemo(() => {
    if (!selectedOfferId) return null;
    const fromReceived = received?.items.find((o) => o.id === selectedOfferId);
    if (fromReceived) return { offer: fromReceived, direction: "received" as const };
    const fromSent = sent?.items.find((o) => o.id === selectedOfferId);
    if (fromSent) return { offer: fromSent, direction: "sent" as const };
    return null;
  }, [selectedOfferId, received, sent]);

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

  // RTL-aware arrow-key handling: ArrowRight = previous (visually),
  // ArrowLeft = next. Preserved verbatim.
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

  // -- Mutations (preserved from Phase 4) ----------------------------------
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
  const doConfirmDeal = (id: string) => confirmDealMutation.mutateAsync(id);

  const receivedCount = received?.total ?? 0;
  const sentCount = sent?.total ?? 0;

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl focus:outline-none"
    >
      {/* ── MASTHEAD ──────────────────────────────────────────────────── */}
      <header>
        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
        >
          הצעות
        </h1>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted mt-lg font-tabular text-sm" role="status" aria-live="polite">
          {!received || !sent ? (
            <Skeleton className="inline-block h-4 w-48" />
          ) : (
            <>
              {receivedCount} שהתקבלו <span className="text-subtle mx-xxs">·</span> {sentCount}{" "}
              ששלחתי
            </>
          )}
        </p>
      </header>

      {/* Toast — sr-only announcement region for mutation results */}
      {toast ? (
        <p role="status" aria-live="polite" className="sr-only" key={toast}>
          {toast}
        </p>
      ) : null}

      {/* ── ERROR ─────────────────────────────────────────────────────── */}
      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── TABS ──────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="מיון הצעות"
        dir="rtl"
        className="border-hairline mt-2xl gap-lg flex border-b"
      >
        {TABS.map((t) => {
          const selected = t.id === tab;
          const count = t.id === "received" ? receivedCount : sentCount;
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
                "duration-fast pb-md inline-flex items-center text-sm transition-colors",
                "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4",
                selected
                  ? "text-ink border-ink -mb-px border-b-2 font-medium"
                  : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {t.label}
              <span className="text-subtle mx-xxs">·</span>
              <span className="font-tabular">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── RECEIVED TABPANEL ────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id="tabpanel-received"
        aria-labelledby="tab-received"
        hidden={tab !== "received"}
        className="mt-xl"
      >
        {!received ? (
          <OfferListSkeleton />
        ) : received.items.length === 0 ? (
          <EmptyState>עדיין לא התקבלו הצעות על המלאי שלך.</EmptyState>
        ) : (
          <ul className="space-y-xl">
            {received.items.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                direction="received"
                onOpenDetail={() => setSelectedOfferId(o.id)}
                onAccept={() => setConfirm({ action: "accept", offer: o })}
                onReject={() => setConfirm({ action: "reject", offer: o })}
                onCancel={() => setConfirm({ action: "cancel", offer: o })}
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

      {/* ── SENT TABPANEL ────────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id="tabpanel-sent"
        aria-labelledby="tab-sent"
        hidden={tab !== "sent"}
        className="mt-xl"
      >
        {!sent ? (
          <OfferListSkeleton />
        ) : sent.items.length === 0 ? (
          <EmptyState>
            לא שלחת עדיין הצעות.{" "}
            <Link
              href="/dashboard/marketplace"
              className="text-ink duration-fast hover:text-accent rounded-sm font-medium underline underline-offset-4 transition-colors"
            >
              עבור לשוק
            </Link>
          </EmptyState>
        ) : (
          <ul className="space-y-xl">
            {sent.items.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                direction="sent"
                onOpenDetail={() => setSelectedOfferId(o.id)}
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

      {/* ── DIALOGS ───────────────────────────────────────────────────── */}
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

      {counter && token ? (
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

      <OfferDetailDialog
        open={selected != null}
        onOpenChange={(v) => !v && setSelectedOfferId(null)}
        offer={selected?.offer ?? null}
        direction={selected?.direction ?? "received"}
        token={token}
        onAccept={(o) => setConfirm({ action: "accept", offer: o })}
        onReject={(o) => setConfirm({ action: "reject", offer: o })}
        onCancel={(o) => setConfirm({ action: "cancel", offer: o })}
        onCounter={(o) =>
          setCounter({
            offer: o,
            originalPrice:
              selected?.direction === "received"
                ? o.offered_price
                : (o.counter_price ?? o.offered_price),
            originalSideLabel: selected?.direction === "received" ? "הצעת הקונה" : "הצעת המוכר",
          })
        }
        onConfirmDeal={(o) => setConfirm({ action: "confirm-deal", offer: o })}
      />
    </main>
  );
}

// ============================================================================
// OfferCard — unified received/sent card. Direction prop drives which actor
// labels render and which actions are available.
// ============================================================================

function OfferCard({
  offer,
  direction,
  onOpenDetail,
  onAccept,
  onReject,
  onCancel,
  onCounter,
  onConfirmDeal,
}: {
  offer: Offer;
  direction: "received" | "sent";
  onOpenDetail: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onCounter: () => void;
  onConfirmDeal: () => void;
}) {
  const priceF = formatPrice(offer.offered_price);
  const counterF = offer.counter_price != null ? formatPrice(offer.counter_price) : null;
  const titleId = `offer-${offer.id}-title`;
  const label = offerVehicleLabel(offer);

  const myRole: "buyer" | "seller" = direction === "received" ? "seller" : "buyer";
  const counterparty = direction === "received" ? offer.buyer : offer.seller;
  const counterpartyLabel = direction === "received" ? "קונה" : "מוכר";

  // Visible action set — derived from direction × status, same matrix as
  // the prior implementation, just expressed once.
  const showAcceptReceived =
    direction === "received" && (offer.status === "pending" || offer.status === "countered");
  const showCounterReceived =
    direction === "received" && (offer.status === "pending" || offer.status === "countered");
  const showRejectReceived =
    direction === "received" && (offer.status === "pending" || offer.status === "countered");

  const showAcceptCounter = direction === "sent" && offer.status === "countered";
  const showCounterSent = direction === "sent" && offer.status === "countered";
  const showRejectCounter = direction === "sent" && offer.status === "countered";
  const showCancelSent = direction === "sent" && offer.status === "pending";

  const hasActions =
    showAcceptReceived ||
    showCounterReceived ||
    showRejectReceived ||
    showAcceptCounter ||
    showCounterSent ||
    showRejectCounter ||
    showCancelSent;

  return (
    <li className="border-hairline bg-paper px-lg py-lg hover:border-ink/30 duration-fast group relative rounded-md border transition-colors">
      {/* Overlay button — receives card-level taps to open the detail
          dialog. Sits behind the content (z-0) so visible elements
          stay readable; the content layer disables pointer events so
          taps pass through to this button. Action buttons re-enable
          pointer events for themselves so they keep working. */}
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`פתח פרטי ההצעה על ${label}`}
        className="focus-visible:outline-accent absolute inset-0 z-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      />

      <article aria-labelledby={titleId} className="pointer-events-none relative z-10">
        {/* Header: thumbnail + title + status pill */}
        <header className="gap-md flex items-start justify-between">
          <div className="gap-md flex min-w-0 items-start">
            <OfferThumbnail url={offer.vehicle.primary_image_url} />
            <h3
              id={titleId}
              className="text-ink mt-xxs font-serif text-lg font-medium leading-tight"
            >
              {offer.vehicle.make} {offer.vehicle.model}{" "}
              <span className="text-muted font-tabular font-normal">· {offer.vehicle.year}</span>
            </h3>
          </div>
          <OfferStatusPill status={offer.status} />
        </header>

        {/* Counterparty line */}
        <p className="text-muted mt-xs gap-xs flex flex-wrap items-center text-sm">
          <span>
            {counterpartyLabel}:{" "}
            <span className="text-ink font-medium">{counterparty.business_name}</span>
            {counterparty.city ? ` · ${counterparty.city}` : ""}
          </span>
          <TrustBadge tier={counterparty.tier} compact />
        </p>

        <OfferTimeline offer={offer} myRole={myRole} />

        {/* Prices */}
        <dl className="mt-lg space-y-xs text-sm">
          <div className="gap-md flex items-baseline justify-between">
            <dt className="text-muted">{direction === "received" ? "מחיר מוצע" : "ההצעה שלי"}</dt>
            <dd className="text-ink font-tabular font-medium">
              {direction === "sent" && offer.status === "countered" ? (
                <>
                  <span className="sr-only">מחיר קודם: </span>
                  <del aria-hidden="true" className="text-muted">
                    {priceF.visual}
                  </del>
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
          {counterF ? (
            <div className="gap-md flex items-baseline justify-between">
              <dt className="text-muted">
                {direction === "received" ? "ההצעה הנגדית שלך" : "הצעה נגדית מהמוכר"}
              </dt>
              <dd className="text-ink font-tabular font-medium">
                <span aria-hidden="true">{counterF.visual}</span>
                <span className="sr-only">{counterF.sr}</span>
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Message (counterparty's most recent note) */}
        {direction === "received" && offer.message ? (
          <MessageBlock label="הודעה מהקונה">{offer.message}</MessageBlock>
        ) : null}
        {direction === "sent" && offer.counter_message ? (
          <MessageBlock label="הודעה מהמוכר">{offer.counter_message}</MessageBlock>
        ) : null}

        {/* Deal-confirmation block (only when status==="accepted") */}
        <DealConfirmationBlock offer={offer} myRole={myRole} onConfirmClick={onConfirmDeal} />

        {/* Actions — re-enable pointer events so taps land here, not on
            the underlying card-open button. */}
        {hasActions ? (
          <div className="border-hairline mt-lg pt-lg gap-xs pointer-events-auto flex flex-wrap border-t">
            {showAcceptReceived ? (
              <Button type="button" onClick={onAccept} aria-label={`אישור ההצעה על ${label}`}>
                קבל
              </Button>
            ) : null}
            {showAcceptCounter ? (
              <Button type="button" onClick={onAccept} aria-label={`קבלת ההצעה הנגדית על ${label}`}>
                קבל הצעה נגדית
              </Button>
            ) : null}
            {showCounterReceived || showCounterSent ? (
              <Button
                type="button"
                variant="outline"
                onClick={onCounter}
                aria-label={`הצעה נגדית על ${label}`}
              >
                הצע נגד
              </Button>
            ) : null}
            {showRejectReceived || showRejectCounter ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onReject}
                aria-label={`דחיית ההצעה על ${label}`}
                className="text-danger-fg hover:bg-danger-bg/50 hover:text-danger-fg"
              >
                דחה
              </Button>
            ) : null}
            {showCancelSent ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                aria-label={`ביטול ההצעה שלי על ${label}`}
                className="text-danger-fg hover:bg-danger-bg/50 hover:text-danger-fg"
              >
                בטל הצעה
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>
    </li>
  );
}

// ============================================================================
// OfferThumbnail — 56px square hairline-framed vehicle photo, with a car
// glyph fallback when there's no primary image. Decorative: alt="" so SR
// users don't hear "Toyota Camry, image of Toyota Camry".
// ============================================================================

function OfferThumbnail({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div
        className="border-hairline bg-muted/5 flex h-14 w-14 shrink-0 items-center justify-center rounded-md border"
        aria-hidden="true"
      >
        <Car className="text-subtle h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="border-hairline bg-muted/5 h-14 w-14 shrink-0 overflow-hidden rounded-md border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
    </div>
  );
}

// ============================================================================
// OfferTimeline — horizontal step list. Current step in text-ink font-medium,
// past steps in text-muted, ← arrow separators between.
// ============================================================================

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
    <ol className="mt-md gap-xs flex flex-wrap items-center text-xs">
      {steps.map((s, i) => (
        <li
          key={i}
          aria-current={s.current ? "step" : undefined}
          className={[
            "gap-xxs inline-flex items-center",
            s.current ? "text-ink font-medium" : "text-muted",
          ].join(" ")}
        >
          <time dateTime={s.iso} className="font-tabular">
            {s.label}
          </time>
          {i < steps.length - 1 ? (
            <span aria-hidden="true" className="text-subtle mx-xxs">
              ←
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ============================================================================
// MessageBlock — quoted note with a 2px accent-tinted left rule.
// ============================================================================

function MessageBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-s-accent/40 mt-lg ps-md border-s-2">
      <p className="text-muted text-xs font-medium uppercase tracking-widest">{label}</p>
      <p className="text-ink mt-xxs whitespace-pre-wrap text-sm leading-relaxed">{children}</p>
    </div>
  );
}

// ============================================================================
// DealConfirmationBlock — accepted-deal double-confirmation widget.
// Both confirmed → "העסקה נסגרה". Pending → status line + "אשר עסקה" CTA
// (the second accent moment on this page).
// ============================================================================

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
    <div role="status" aria-live="polite" className="border-hairline mt-lg pt-lg border-t">
      <p className="text-muted text-xs font-medium uppercase tracking-widest">סגירת עסקה</p>
      {closed ? (
        <p className="text-ok-fg gap-xs mt-sm inline-flex items-center text-sm">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          העסקה נסגרה משני הצדדים
        </p>
      ) : (
        <>
          <p className="text-muted mt-sm text-sm">
            שני הצדדים צריכים לאשר.{" "}
            {mineConfirmed ? (
              <span className="text-ok-fg inline-flex items-center gap-1">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                אתה אישרת
              </span>
            ) : (
              <span className="text-ink">אתה טרם אישרת</span>
            )}
            <span className="text-subtle mx-xs">|</span>
            {theirsConfirmed ? (
              <span className="text-ok-fg inline-flex items-center gap-1">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                הצד השני אישר
              </span>
            ) : (
              <span className="text-muted">ממתין לצד השני</span>
            )}
          </p>
          {!mineConfirmed ? (
            <Button
              type="button"
              size="lg"
              onClick={onConfirmClick}
              className="bg-accent text-paper hover:bg-accent/90 mt-md"
            >
              אשר עסקה
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton + empty state
// ============================================================================

function OfferListSkeleton() {
  return (
    <ul className="space-y-xl" role="status" aria-live="polite">
      <span className="sr-only">טוען הצעות…</span>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          aria-hidden="true"
          className="border-hairline bg-paper px-lg py-lg space-y-md rounded-md border"
        >
          <div className="gap-md flex items-start justify-between">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="gap-xs flex">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-muted py-3xl text-center text-sm leading-relaxed">{children}</p>;
}

// ============================================================================
// Helpers
// ============================================================================

function offerVehicleLabel(o: Offer): string {
  return `${o.vehicle.make} ${o.vehicle.model} ${o.vehicle.year}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
