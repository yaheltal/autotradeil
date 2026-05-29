"use client";

import { useQuery } from "@tanstack/react-query";
import { Car, Check, CheckCircle2, Mail, Phone } from "lucide-react";

import { OfferStatusPill, offerStatusLabel } from "@/components/OfferStatusPill";
import { type OfferStatus } from "@/components/StatusBadge";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * OfferDetailDialog — full negotiation surface for a single offer.
 *
 * Three parallel TanStack queries when the dialog opens:
 *   - marketplace/vehicles/{id}         → vehicle specs + images + seller contact
 *   - marketplace/dealer/{id}           → counterparty trust score + member_since
 *   - marketplace/offers/{id}/history   → chronological back-and-forth
 *
 * Each section renders an independent <Skeleton> while loading.
 *
 * Contact info reveal is asymmetric by design:
 *   - direction === "sent" (I'm the buyer): seller contact comes via the
 *     vehicle endpoint → phone + email are shown.
 *   - direction === "received" (I'm the seller): buyer contact is NOT
 *     exposed by any public endpoint. Silent omission — explicit choice
 *     to prevent off-platform deals at the offer stage.
 */

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
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    primary_image_url: string | null;
  };
  buyer: { id: string; business_name: string; city: string | null; tier: Tier };
  seller: { id: string; business_name: string; city: string | null; tier: Tier };
  closed_at?: string | null;
  deal_confirmed_buyer?: boolean;
  deal_confirmed_seller?: boolean;
};

type VehicleImage = { id: string; url: string; position: number };

type VehicleSeller = {
  id: string;
  business_name: string;
  contact_name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  tier: string;
  deals_completed: number;
};

type VehicleDetail = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  color: string | null;
  transmission: string | null;
  fuel_type: string | null;
  engine_volume: number | null;
  // Wave 2 — offer dialog reads the marketplace vehicle detail shape,
  // which exposes only public_notes (non-owner surface).
  public_notes: string | null;
  seller: VehicleSeller;
  images: VehicleImage[];
};

type DealerProfile = {
  id: string;
  business_name: string;
  city: string | null;
  tier: string;
  trust_score: number;
  deals_completed: number;
  member_since: string;
};

type HistoryEntry = {
  kind: "opened" | "countered" | "accepted" | "rejected" | "cancelled";
  by_role: "buyer" | "seller";
  price: number | null;
  message: string | null;
  at: string;
};

type HistoryResponse = { items: HistoryEntry[] };

type Direction = "received" | "sent";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: Offer | null;
  direction: Direction;
  token: string | null;
  onAccept: (offer: Offer) => void;
  onReject: (offer: Offer) => void;
  onCancel: (offer: Offer) => void;
  onCounter: (offer: Offer) => void;
  onConfirmDeal: (offer: Offer) => void;
};

export function OfferDetailDialog(props: Props) {
  const { open, onOpenChange, offer, ...rest } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        aria-describedby="offer-detail-desc"
        className="max-h-[92dvh] max-w-2xl overflow-y-auto"
      >
        {offer ? <Body offer={offer} {...rest} /> : null}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Body — only mounts when offer is non-null, so query hooks are gated and
// queryKeys never see a stub id.
// ============================================================================

type BodyProps = Omit<Props, "open" | "onOpenChange" | "offer"> & { offer: Offer };

function Body({
  offer,
  direction,
  token,
  onAccept,
  onReject,
  onCancel,
  onCounter,
  onConfirmDeal,
}: BodyProps) {
  const myRole: "buyer" | "seller" = direction === "received" ? "seller" : "buyer";
  const counterparty = direction === "received" ? offer.buyer : offer.seller;
  const counterpartyLabel = direction === "received" ? "הקונה" : "המוכר";

  const vehicleQuery = useQuery({
    queryKey: queryKeys.marketplace.detail(offer.inventory_id),
    queryFn: () =>
      apiFetch<VehicleDetail>(`/api/v1/marketplace/vehicles/${offer.inventory_id}`, {
        token: token!,
      }),
    enabled: !!token,
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.marketplace.dealer(counterparty.id),
    queryFn: () =>
      apiFetch<DealerProfile>(`/api/v1/marketplace/dealers/${counterparty.id}/profile`, {
        token: token!,
      }),
    enabled: !!token,
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.offers.history(offer.id),
    queryFn: () =>
      apiFetch<HistoryResponse>(`/api/v1/marketplace/offers/${offer.id}/history`, {
        token: token!,
      }),
    enabled: !!token,
  });

  const vehicle = vehicleQuery.data ?? null;
  const profile = profileQuery.data ?? null;
  const history = historyQuery.data?.items ?? null;

  // Action matrix — preserved from OfferCard so the dialog and list stay
  // in lockstep on what's available when.
  const isReceived = direction === "received";
  const showAccept =
    (isReceived && (offer.status === "pending" || offer.status === "countered")) ||
    (!isReceived && offer.status === "countered");
  const showCounter =
    (isReceived && (offer.status === "pending" || offer.status === "countered")) ||
    (!isReceived && offer.status === "countered");
  const showReject =
    (isReceived && (offer.status === "pending" || offer.status === "countered")) ||
    (!isReceived && offer.status === "countered");
  const showCancel = !isReceived && offer.status === "pending";
  const showConfirmDeal =
    offer.status === "accepted" &&
    !offer.closed_at &&
    !(myRole === "buyer" ? offer.deal_confirmed_buyer : offer.deal_confirmed_seller);
  const hasActions = showAccept || showCounter || showReject || showCancel || showConfirmDeal;

  const vehicleLabel = `${offer.vehicle.make} ${offer.vehicle.model}`;

  return (
    <>
      <DialogHeader>
        <p className="text-muted text-xs font-medium uppercase tracking-widest">פרטי הצעה</p>
        <div className="gap-md mt-xxs flex flex-wrap items-start justify-between">
          <DialogTitle className="text-ink tracking-editorial font-serif text-2xl font-medium leading-tight">
            {vehicleLabel}{" "}
            <span className="text-muted font-tabular font-normal">· {offer.vehicle.year}</span>
          </DialogTitle>
          <OfferStatusPill status={offer.status} direction={direction} />
        </div>
        <DialogDescription id="offer-detail-desc" className="sr-only">
          פרטי הצעה על {vehicleLabel} {offer.vehicle.year}, כולל פרטי הרכב, פרטי {counterpartyLabel}{" "}
          והיסטוריית המשא ומתן.
        </DialogDescription>
      </DialogHeader>

      <ImageGallery
        images={vehicle?.images ?? []}
        fallback={offer.vehicle.primary_image_url}
        loading={vehicleQuery.isPending}
      />

      <Section heading="הרכב">
        {vehicle ? <VehicleSpecs vehicle={vehicle} /> : <SpecsSkeleton />}
      </Section>

      <Section heading={counterpartyLabel}>
        <CounterpartyBlock
          counterparty={counterparty}
          direction={direction}
          profile={profile}
          profileLoading={profileQuery.isPending}
          sellerContact={vehicle?.seller ?? null}
        />
      </Section>

      <Section heading="המחיר">
        <PriceCompare
          offer={offer}
          direction={direction}
          myRole={myRole}
          history={history}
          historyLoading={historyQuery.isPending}
        />
      </Section>

      <Section heading="המשא ומתן">
        {history ? <Timeline entries={history} myRole={myRole} /> : <TimelineSkeleton />}
      </Section>

      <DealConfirmation offer={offer} myRole={myRole} />

      {hasActions ? (
        <div className="border-hairline mt-2xl pt-lg gap-xs flex flex-wrap border-t">
          {showAccept ? (
            <Button type="button" onClick={() => onAccept(offer)}>
              {offer.status === "countered" && !isReceived ? "קבל הצעה נגדית" : "קבל"}
            </Button>
          ) : null}
          {showCounter ? (
            <Button type="button" variant="outline" onClick={() => onCounter(offer)}>
              הצע נגד
            </Button>
          ) : null}
          {showReject ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onReject(offer)}
              className="text-danger-fg hover:bg-danger-bg/50 hover:text-danger-fg"
            >
              דחה
            </Button>
          ) : null}
          {showCancel ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onCancel(offer)}
              className="text-danger-fg hover:bg-danger-bg/50 hover:text-danger-fg"
            >
              בטל הצעה
            </Button>
          ) : null}
          {showConfirmDeal ? (
            <Button
              type="button"
              onClick={() => onConfirmDeal(offer)}
              className="bg-accent text-paper hover:bg-accent/90"
            >
              אשר עסקה
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

// ============================================================================
// Section — repeating kicker + hairline pattern. Same shape as the
// InventoryFormDialog wizard sections.
// ============================================================================

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-2xl">
      <p className="text-muted text-xs font-medium uppercase tracking-widest">{heading}</p>
      <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
      <div className="mt-md">{children}</div>
    </section>
  );
}

// ============================================================================
// ImageGallery — CSS scroll-snap carousel. No JS library. On touch devices,
// natural swipe; on desktop, mouse-drag or arrow keys via the snap container.
// Falls back to the offer's primary thumbnail while the vehicle endpoint
// is loading, then swaps in the full ordered set when available.
// ============================================================================

function ImageGallery({
  images,
  fallback,
  loading,
}: {
  images: VehicleImage[];
  fallback: string | null;
  loading: boolean;
}) {
  const ordered = [...images].sort((a, b) => a.position - b.position);
  const list: { id: string; url: string }[] =
    ordered.length > 0
      ? ordered.map((i) => ({ id: i.id, url: i.url }))
      : fallback
        ? [{ id: "primary", url: fallback }]
        : [];

  if (loading && list.length === 0) {
    return <Skeleton className="mt-lg aspect-video w-full rounded-md" />;
  }

  if (list.length === 0) {
    return (
      <div className="border-hairline bg-muted/5 mt-lg flex aspect-video w-full items-center justify-center rounded-md border">
        <Car aria-hidden="true" className="text-subtle h-12 w-12" />
        <span className="sr-only">אין תמונות לרכב זה</span>
      </div>
    );
  }

  return (
    <div className="mt-lg">
      <ul
        role="list"
        aria-label="תמונות הרכב"
        className="border-hairline flex snap-x snap-mandatory gap-px overflow-x-auto rounded-md border"
      >
        {list.map((img, i) => (
          <li key={img.id} className="w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={`תמונה ${i + 1} מתוך ${list.length}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="aspect-video w-full object-cover"
            />
          </li>
        ))}
      </ul>
      {list.length > 1 ? (
        <p className="text-muted mt-xs text-xs">
          <span className="font-tabular">{list.length}</span> תמונות · החלק לתמונה הבאה
        </p>
      ) : null}
    </div>
  );
}

// ============================================================================
// VehicleSpecs — two-column definition list. Numbers font-tabular.
// ============================================================================

function VehicleSpecs({ vehicle }: { vehicle: VehicleDetail }) {
  return (
    <>
      <dl className="gap-x-lg gap-y-sm grid grid-cols-2 text-sm">
        <SpecRow label="קילומטראז'" value={formatMileage(vehicle.mileage).visual} tabular />
        <SpecRow label="צבע" value={vehicle.color ?? "—"} />
        <SpecRow label="תיבת הילוכים" value={transmissionLabel(vehicle.transmission)} />
        <SpecRow label="סוג דלק" value={fuelLabel(vehicle.fuel_type)} />
        {vehicle.engine_volume != null ? (
          <SpecRow label="נפח מנוע" value={`${vehicle.engine_volume} ליטר`} tabular />
        ) : null}
      </dl>
      {vehicle.public_notes ? (
        <div className="border-s-hairline mt-md ps-md border-s-2">
          <p className="text-muted text-xs font-medium uppercase tracking-widest">הערות מהמוכר</p>
          <p className="text-ink mt-xxs whitespace-pre-wrap text-sm leading-relaxed">
            {vehicle.public_notes}
          </p>
        </div>
      ) : null}
    </>
  );
}

function SpecRow({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="gap-md border-hairline pb-xs flex items-baseline justify-between border-b">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-ink text-end ${tabular ? "font-tabular" : ""}`}>{value}</dd>
    </div>
  );
}

function SpecsSkeleton() {
  return (
    <div className="gap-x-lg gap-y-sm grid grid-cols-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

function transmissionLabel(t: string | null): string {
  if (t === "automatic") return "אוטומט";
  if (t === "manual") return "ידני";
  return "—";
}

function fuelLabel(f: string | null): string {
  if (f === "petrol") return "בנזין";
  if (f === "diesel") return "דיזל";
  if (f === "electric") return "חשמלי";
  if (f === "hybrid") return "היברידי";
  return "—";
}

// ============================================================================
// CounterpartyBlock — business name + TrustBadge + public profile metrics.
// Contact info (phone/email) is rendered ONLY when direction === "sent",
// i.e. when the counterparty is the SELLER and we have their contact via
// the vehicle endpoint. For received offers, the buyer's contact is not
// exposed by any public endpoint — see file-level comment.
// ============================================================================

function CounterpartyBlock({
  counterparty,
  direction,
  profile,
  profileLoading,
  sellerContact,
}: {
  counterparty: { business_name: string; city: string | null; tier: Tier };
  direction: Direction;
  profile: DealerProfile | null;
  profileLoading: boolean;
  sellerContact: VehicleSeller | null;
}) {
  const showContact = direction === "sent" && sellerContact != null;

  return (
    <>
      <div className="gap-md flex items-start justify-between">
        <div>
          <p className="text-ink text-base font-medium">{counterparty.business_name}</p>
          {counterparty.city ? (
            <p className="text-muted mt-xxs text-sm">{counterparty.city}</p>
          ) : null}
        </div>
        <TrustBadge tier={counterparty.tier} />
      </div>

      <dl className="gap-x-lg gap-y-sm mt-md grid grid-cols-2 text-sm">
        <SpecRow
          label="ציון אמון"
          value={profile ? `${profile.trust_score} / 100` : profileLoading ? "…" : "—"}
          tabular
        />
        <SpecRow
          label="עסקאות הושלמו"
          value={profile ? String(profile.deals_completed) : profileLoading ? "…" : "—"}
          tabular
        />
        <SpecRow
          label="חבר מאז"
          value={profile ? formatMemberSince(profile.member_since) : profileLoading ? "…" : "—"}
          tabular
        />
      </dl>

      {showContact ? (
        <div className="border-hairline mt-md pt-md border-t">
          <p className="text-muted text-xs font-medium uppercase tracking-widest">יצירת קשר</p>
          <div className="mt-xs space-y-xs">
            {sellerContact!.phone ? (
              <a
                href={`tel:${sellerContact!.phone}`}
                className="text-ink hover:text-accent duration-fast gap-xs inline-flex items-center text-sm transition-colors"
              >
                <Phone aria-hidden="true" className="h-4 w-4" />
                <span className="font-tabular" dir="ltr">
                  {sellerContact!.phone}
                </span>
              </a>
            ) : null}
            {sellerContact!.email ? (
              <a
                href={`mailto:${sellerContact!.email}`}
                className="text-ink hover:text-accent duration-fast gap-xs flex items-center text-sm transition-colors"
              >
                <Mail aria-hidden="true" className="h-4 w-4" />
                <span dir="ltr">{sellerContact!.email}</span>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// ============================================================================
// PriceCompare — THE editorial moment of the dialog. Two-column card:
// "my last price" vs "their last price", large serif numerals in tabular
// numbers. When status === "accepted", collapses to a single agreed-price
// card with accent underline.
//
// "Last price per side" is derived from history when available (the
// authoritative source — counter_price on the row gets overwritten each
// round). Falls back to the simple offered/counter pair when history is
// loading or errored.
// ============================================================================

function PriceCompare({
  offer,
  direction,
  myRole,
  history,
  historyLoading,
}: {
  offer: Offer;
  direction: Direction;
  myRole: "buyer" | "seller";
  history: HistoryEntry[] | null;
  historyLoading: boolean;
}) {
  // Closed/accepted state — single agreed price.
  if (offer.status === "accepted" || offer.closed_at) {
    const agreed = offer.counter_price ?? offer.offered_price;
    const agreedF = formatPrice(agreed);
    return (
      <div className="border-hairline px-lg py-lg rounded-md border text-center">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">מחיר מוסכם</p>
        <p className="text-ink tracking-editorial font-tabular mt-sm font-serif text-3xl font-medium">
          <span aria-hidden="true">{agreedF.visual}</span>
          <span className="sr-only">{agreedF.sr}</span>
        </p>
        <span aria-hidden="true" className="bg-accent mt-sm mx-auto block h-px w-12" />
      </div>
    );
  }

  // Derive my/their last prices from history when available.
  let myPrice: number | null = null;
  let theirPrice: number | null = null;
  if (history) {
    for (const entry of history) {
      if (entry.price == null) continue;
      if (entry.by_role === myRole) myPrice = entry.price;
      else theirPrice = entry.price;
    }
  } else {
    // Fallback while history loads OR if it errors: use the row.
    if (direction === "received") {
      theirPrice = offer.offered_price;
      myPrice = offer.counter_price;
    } else {
      myPrice = offer.offered_price;
      theirPrice = offer.counter_price;
    }
  }

  const theirsLabel = direction === "received" ? "הצעת הקונה" : "הצעת המוכר";

  // Only one side has moved (no counter yet).
  if (theirPrice == null && myPrice != null) {
    const mineF = formatPrice(myPrice);
    return (
      <div className="border-hairline px-lg py-lg rounded-md border">
        <p className="text-muted text-center text-xs font-medium uppercase tracking-widest">
          {direction === "sent" ? "ההצעה שלי" : theirsLabel}
        </p>
        <p className="text-ink tracking-editorial font-tabular mt-sm text-center font-serif text-3xl font-medium">
          <span aria-hidden="true">{mineF.visual}</span>
          <span className="sr-only">{mineF.sr}</span>
        </p>
      </div>
    );
  }

  // Both sides have moved — show side by side.
  return (
    <div className="border-hairline grid grid-cols-2 overflow-hidden rounded-md border">
      <PriceColumn
        label="ההצעה שלי"
        price={myPrice}
        loading={historyLoading && myPrice == null}
        className="border-hairline border-e"
      />
      <PriceColumn label={theirsLabel} price={theirPrice} loading={historyLoading} />
      {myPrice != null && theirPrice != null ? (
        <p className="text-muted px-lg pb-md -mt-xs font-tabular col-span-2 text-center text-xs">
          הפרש{" "}
          <span className="text-ink font-medium">
            {formatPrice(Math.abs(myPrice - theirPrice)).visual}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function PriceColumn({
  label,
  price,
  loading,
  className = "",
}: {
  label: string;
  price: number | null;
  loading: boolean;
  className?: string;
}) {
  return (
    <div className={`px-md py-lg sm:px-lg ${className}`}>
      <p className="text-muted text-center text-xs font-medium uppercase tracking-widest">
        {label}
      </p>
      <p className="text-ink tracking-editorial font-tabular mt-sm text-center font-serif text-2xl font-medium leading-tight sm:text-3xl">
        {loading ? (
          <Skeleton className="mx-auto h-8 w-32" />
        ) : price != null ? (
          (() => {
            const f = formatPrice(price);
            return (
              <>
                <span aria-hidden="true">{f.visual}</span>
                <span className="sr-only">{f.sr}</span>
              </>
            );
          })()
        ) : (
          <span className="text-subtle text-base">—</span>
        )}
      </p>
    </div>
  );
}

// ============================================================================
// Timeline — vertical activity log of the back-and-forth. Accent dots
// connected by hairline rails. Each entry: by_role · price · date, optional
// message in muted text. Older counters with null message show "(אין הודעה)".
// ============================================================================

function Timeline({ entries, myRole }: { entries: HistoryEntry[]; myRole: "buyer" | "seller" }) {
  if (entries.length === 0) {
    return <p className="text-muted text-sm">אין נתוני היסטוריה.</p>;
  }
  return (
    <ol className="space-y-md relative">
      {entries.map((e, i) => (
        <TimelineRow
          key={`${e.kind}-${e.at}-${i}`}
          entry={e}
          isLast={i === entries.length - 1}
          isMine={e.by_role === myRole}
        />
      ))}
    </ol>
  );
}

function TimelineRow({
  entry,
  isLast,
  isMine,
}: {
  entry: HistoryEntry;
  isLast: boolean;
  isMine: boolean;
}) {
  const sideLabel = entry.by_role === "buyer" ? "הקונה" : "המוכר";
  const youSuffix = isMine ? " (אתה)" : "";
  const priceF = entry.price != null ? formatPrice(entry.price) : null;
  const kindLabel = kindLabelHebrew(entry.kind);

  return (
    <li className="gap-md ps-lg relative flex items-start">
      {/* dot — sits in the padding-inline-start gutter, at the RIGHT in
          RTL. The accent color is the second of only-two accent moments
          on the page (the other is the "אשר עסקה" CTA when accepted). */}
      <span
        aria-hidden="true"
        className="bg-accent absolute start-0 top-1 h-2.5 w-2.5 rounded-full"
      />
      {/* rail — hairline connecting this dot to the next. */}
      {!isLast ? (
        <span
          aria-hidden="true"
          className="bg-hairline absolute bottom-[-1rem] start-[5px] top-4 w-px"
        />
      ) : null}

      <div className="flex-1">
        <div className="gap-xs flex flex-wrap items-baseline">
          <span className="text-ink text-sm font-medium">
            {sideLabel}
            {youSuffix}
          </span>
          {priceF ? (
            <span className="text-ink font-tabular text-sm">
              <span aria-hidden="true">· {priceF.visual}</span>
              <span className="sr-only">{priceF.sr}</span>
            </span>
          ) : null}
          <span className="text-muted text-xs">
            <span className="text-subtle mx-xxs">·</span>
            <time dateTime={entry.at} className="font-tabular">
              {formatHistoryDate(entry.at)}
            </time>
          </span>
          {entry.kind !== "opened" ? (
            <span className="text-accent border-accent/30 bg-accent/10 px-xs ms-auto inline-flex items-center rounded-md border py-0.5 text-[11px] font-medium">
              {kindLabel}
            </span>
          ) : null}
        </div>
        {entry.message ? (
          <p className="text-ink mt-xxs whitespace-pre-wrap text-sm leading-relaxed">
            “{entry.message}”
          </p>
        ) : entry.kind === "countered" ? (
          <p className="text-subtle mt-xxs text-xs italic">(אין הודעה)</p>
        ) : null}
      </div>
    </li>
  );
}

function TimelineSkeleton() {
  return (
    <ol className="space-y-md">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="ps-lg">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-xs h-3 w-1/2" />
        </li>
      ))}
    </ol>
  );
}

function kindLabelHebrew(kind: HistoryEntry["kind"]): string {
  switch (kind) {
    case "opened":
      return "הצעה ראשונה";
    case "countered":
      return "הצעה נגדית";
    case "accepted":
      return "התקבלה";
    case "rejected":
      return "נדחתה";
    case "cancelled":
      return "בוטלה";
    default:
      return offerStatusLabel(kind);
  }
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

// ============================================================================
// DealConfirmation — mirror of the same widget on the list card. Renders
// only when status === "accepted". Keeps the second accent CTA reachable
// from the dialog when one side still owes their signature.
// ============================================================================

function DealConfirmation({ offer, myRole }: { offer: Offer; myRole: "buyer" | "seller" }) {
  if (offer.status !== "accepted") return null;
  const closed = !!offer.closed_at;
  const mineConfirmed =
    myRole === "buyer" ? !!offer.deal_confirmed_buyer : !!offer.deal_confirmed_seller;
  const theirsConfirmed =
    myRole === "buyer" ? !!offer.deal_confirmed_seller : !!offer.deal_confirmed_buyer;

  return (
    <div role="status" aria-live="polite" className="border-hairline mt-2xl pt-lg border-t">
      <p className="text-muted text-xs font-medium uppercase tracking-widest">סגירת עסקה</p>
      {closed ? (
        <p className="text-ok-fg gap-xs mt-sm inline-flex items-center text-sm">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          העסקה נסגרה משני הצדדים
        </p>
      ) : (
        <p className="text-muted mt-sm text-sm">
          שני הצדדים צריכים לאשר.{" "}
          {mineConfirmed ? (
            <span className="text-ok-fg gap-xxs inline-flex items-center">
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              אתה אישרת
            </span>
          ) : (
            <span className="text-ink">אתה טרם אישרת</span>
          )}
          <span className="text-subtle mx-xs">|</span>
          {theirsConfirmed ? (
            <span className="text-ok-fg gap-xxs inline-flex items-center">
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              הצד השני אישר
            </span>
          ) : (
            <span className="text-muted">ממתין לצד השני</span>
          )}
        </p>
      )}
    </div>
  );
}
