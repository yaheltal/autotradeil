"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Car, Star, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MakeOfferDialog } from "@/components/MakeOfferDialog";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * /dashboard/marketplace/[id] — vehicle detail.
 *
 *   → חזרה לשוק
 *   Toyota Camry · 2022
 *   ──────────
 *   אוטומט · בנזין · 87,500 ק"מ · לבן
 *
 *   ┌────────────────────────────┬──────────────┐
 *   │ [scroll-snap gallery]      │ מחיר          │
 *   │                            │ ₪145,000      │
 *   │ מפרט                       │ [שלח הצעה]    │
 *   │ ──────                     │ ──────        │
 *   │ <dl> spec rows             │ פרטי המוכר    │
 *   │                            │ TrustBadge    │
 *   │ הערות הסוחר                │ business_name │
 *   │ ──────                     │ city          │
 *   │ <p>…</p>                   │               │
 *   └────────────────────────────┴──────────────┘
 *
 * Hairline-based section dividers, no bordered cards. The price block
 * spends the editorial accent on its primary CTA — this is the one
 * "buy" moment in the catalogue.
 */

type Seller = {
  id: string;
  business_name: string;
  contact_name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  tier: Tier;
  deals_completed: number;
};

type VehicleImage = {
  id: string;
  url: string;
  position: number;
};

type Detail = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  b2b_price: number | null;
  color: string | null;
  transmission: "automatic" | "manual" | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | null;
  engine_volume: number | string | null;
  notes: string | null;
  status: string;
  created_at: string;
  seller: Seller;
  images: VehicleImage[];
  is_own?: boolean;
};

const FUEL_LABELS: Record<string, string> = {
  petrol: "בנזין",
  diesel: "דיזל",
  electric: "חשמלי",
  hybrid: "היברידי",
};

const TRANSMISSION_LABELS: Record<string, string> = {
  automatic: "אוטומט",
  manual: "ידני",
};

export default function MarketplaceDetailPage() {
  const { token } = useDealerAuth(`/dashboard/marketplace`);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const vehicleId = params?.id ?? "";

  const [offerOpen, setOfferOpen] = useState(false);
  const [offerToast, setOfferToast] = useState<string>("");
  const [slideStatus, setSlideStatus] = useState<string>("");

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<string, HTMLElement>>(new Map());
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detailQuery = useQuery({
    queryKey: queryKeys.marketplace.detail(vehicleId),
    queryFn: () => apiFetch<Detail>(`/api/v1/marketplace/vehicles/${vehicleId}`, { token: token! }),
    enabled: !!token && !!vehicleId,
  });

  const data = detailQuery.data ?? null;
  const error =
    detailQuery.error instanceof Error
      ? detailQuery.error.message
      : detailQuery.error
        ? "שגיאה בטעינת הרכב"
        : null;

  useEffect(() => {
    if (data) h1Ref.current?.focus();
  }, [data]);

  // Gallery IntersectionObserver — announce slide position politely.
  useEffect(() => {
    if (!data || data.images.length <= 1) return;
    const root = galleryRef.current;
    if (!root) return;

    const total = data.images.length;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const idxAttr = (best.target as HTMLElement).dataset.idx;
        if (!idxAttr) return;
        const idx = parseInt(idxAttr, 10) + 1;
        if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
        announceTimerRef.current = setTimeout(() => {
          if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
          setSlideStatus(`תמונה ${idx} מתוך ${total}`);
        }, 300);
      },
      { root, threshold: [0.5, 0.75, 1] },
    );

    slideRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  // -- Frames ---------------------------------------------------------------

  if (!token) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
      >
        <DetailSkeleton />
      </main>
    );
  }

  if (error) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
      >
        <BackToMarketplace />
        <Alert variant="destructive" className="mt-lg">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!data) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
      >
        <DetailSkeleton />
      </main>
    );
  }

  const priceF = formatPrice(data.b2b_price ?? data.price);
  const mileageF = formatMileage(data.mileage);
  const vehicleLabel = `${data.make} ${data.model} ${data.year}`;
  const subMeta = [
    data.transmission ? TRANSMISSION_LABELS[data.transmission] : null,
    data.fuel_type ? FUEL_LABELS[data.fuel_type] : null,
    mileageF.visual + " ק״מ",
    data.color,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
    >
      <BackToMarketplace />

      {/* ── MASTHEAD ──────────────────────────────────────────────────── */}
      <header className="mt-md">
        <div className="gap-md flex flex-wrap items-baseline">
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
          >
            {vehicleLabel}
          </h1>
          {data.is_own ? (
            <span className="bg-accent text-paper gap-xxs inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
              <Star aria-hidden="true" className="h-3 w-3" />
              הרכב שלך
            </span>
          ) : null}
        </div>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted mt-lg font-tabular text-sm">{subMeta}</p>
      </header>

      {/* sr-only gallery + offer announcers */}
      {slideStatus ? (
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          key={slideStatus}
        >
          {slideStatus}
        </span>
      ) : null}
      {offerToast ? (
        <span role="status" aria-live="polite" className="sr-only" key={offerToast}>
          {offerToast}
        </span>
      ) : null}

      {/* ── 2-col layout ──────────────────────────────────────────────── */}
      <div className="gap-2xl mt-3xl grid grid-cols-1 lg:grid-cols-[1fr_320px]">
        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div className="space-y-2xl">
          {/* Gallery */}
          <section aria-label="גלריית תמונות">
            {data.images.length > 0 ? (
              <div
                ref={galleryRef}
                role="region"
                aria-label="גלריית תמונות של הרכב"
                tabIndex={0}
                className="border-hairline gap-sm focus-visible:outline-accent flex snap-x snap-mandatory overflow-x-auto rounded-md border focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {data.images.map((img, idx) => (
                  <figure
                    key={img.id}
                    ref={(el) => {
                      if (el) slideRefs.current.set(img.id, el);
                      else slideRefs.current.delete(img.id);
                    }}
                    data-idx={idx}
                    className="aspect-[16/9] w-full shrink-0 snap-center sm:w-[90%]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={`${vehicleLabel} — תמונה ${idx + 1} מתוך ${data.images.length}`}
                      loading={idx === 0 ? "eager" : "lazy"}
                      className="h-full w-full object-cover"
                    />
                  </figure>
                ))}
              </div>
            ) : (
              <div
                aria-hidden="true"
                className="border-hairline bg-muted/5 text-subtle flex aspect-[16/9] w-full items-center justify-center rounded-md border"
              >
                <Car className="h-12 w-12" />
              </div>
            )}
          </section>

          {/* Specs */}
          <section aria-labelledby="specs-heading">
            <p className="text-muted text-xs font-medium uppercase tracking-widest">מפרט</p>
            <h2 id="specs-heading" className="sr-only">
              מפרט הרכב
            </h2>
            <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
            <dl className="mt-lg gap-y-md gap-x-2xl grid grid-cols-1 sm:grid-cols-2">
              <SpecRow term="יצרן" value={data.make} />
              <SpecRow term="דגם" value={data.model} />
              <SpecRow term="שנה" value={String(data.year)} tabular />
              <SpecRow term="קילומטראז׳">
                <span aria-hidden="true">{mileageF.visual}</span>
                <span className="sr-only">{mileageF.sr}</span>
              </SpecRow>
              {data.color ? <SpecRow term="צבע" value={data.color} /> : null}
              {data.transmission ? (
                <SpecRow
                  term="תיבת הילוכים"
                  value={TRANSMISSION_LABELS[data.transmission] ?? data.transmission}
                />
              ) : null}
              {data.fuel_type ? (
                <SpecRow term="סוג דלק" value={FUEL_LABELS[data.fuel_type] ?? data.fuel_type} />
              ) : null}
              {data.engine_volume != null ? (
                <SpecRow term="נפח מנוע" value={`${data.engine_volume} ליטר`} tabular />
              ) : null}
            </dl>
          </section>

          {/* Notes */}
          {data.notes ? (
            <section aria-labelledby="notes-heading">
              <p className="text-muted text-xs font-medium uppercase tracking-widest">
                הערות הסוחר
              </p>
              <h2 id="notes-heading" className="sr-only">
                הערות הסוחר
              </h2>
              <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
              <p className="text-ink mt-lg whitespace-pre-wrap text-sm leading-relaxed">
                {data.notes}
              </p>
            </section>
          ) : null}
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
        <aside aria-label="פרטי מוכר ופעולות" className="space-y-2xl">
          {/* Price block */}
          <section>
            <p className="text-muted text-xs font-medium uppercase tracking-widest">מחיר</p>
            <p className="text-ink font-tabular mt-sm text-3xl font-medium leading-none">
              <span aria-hidden="true">{priceF.visual}</span>
              <span className="sr-only">{priceF.sr}</span>
            </p>
            {data.is_own ? (
              <Alert className="mt-lg">
                <Star aria-hidden="true" />
                <AlertDescription>הרכב שלך — אינך יכול להציע על עצמך</AlertDescription>
              </Alert>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={() => setOfferOpen(true)}
                className="bg-accent text-paper hover:bg-accent/90 mt-lg w-full"
              >
                שלח הצעת מחיר
              </Button>
            )}
          </section>

          {/* Dealer block */}
          <section>
            <p className="text-muted text-xs font-medium uppercase tracking-widest">פרטי המוכר</p>
            <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
            <div className="mt-lg gap-sm flex flex-wrap items-center">
              <TrustBadge tier={data.seller.tier} />
              <span className="text-muted font-tabular text-xs">
                {data.seller.deals_completed} עסקאות
              </span>
            </div>
            <dl className="mt-md space-y-sm text-sm">
              <div>
                <dt className="text-muted text-xs">שם העסק</dt>
                <dd className="mt-xxs">
                  <Link
                    href={`/dashboard/marketplace/dealer/${data.seller.id}`}
                    className="text-ink duration-fast hover:text-accent focus-visible:outline-accent rounded-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                  >
                    {data.seller.business_name}
                  </Link>
                </dd>
              </div>
              {data.seller.city ? (
                <div>
                  <dt className="text-muted text-xs">עיר</dt>
                  <dd className="text-ink mt-xxs">{data.seller.city}</dd>
                </div>
              ) : null}
              {data.seller.contact_name ? (
                <div>
                  <dt className="text-muted text-xs">איש קשר</dt>
                  <dd className="text-ink mt-xxs">{data.seller.contact_name}</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-subtle mt-lg text-xs">פרטי קשר מלאים ייחשפו לאחר אישור ההצעה.</p>
          </section>
        </aside>
      </div>

      <MakeOfferDialog
        open={offerOpen}
        onOpenChange={setOfferOpen}
        token={token}
        inventoryId={vehicleId}
        vehicleLabel={vehicleLabel}
        askingPrice={data.b2b_price ?? data.price}
        onSubmitted={() => {
          setOfferToast("ההצעה נשלחה");
          router.push("/dashboard/offers");
        }}
      />
    </main>
  );
}

// ============================================================================
// SpecRow — one row inside the specs <dl>. `tabular` toggles font-tabular
// on the value (for numeric specs like year + engine volume).
// ============================================================================

function SpecRow({
  term,
  value,
  children,
  tabular,
}: {
  term: string;
  value?: string;
  children?: React.ReactNode;
  tabular?: boolean;
}) {
  return (
    <div className="border-hairline gap-md pb-xs flex items-baseline justify-between border-b">
      <dt className="text-muted text-sm">{term}</dt>
      <dd className={`text-ink text-sm font-medium ${tabular ? "font-tabular" : ""}`}>
        {children ?? value}
      </dd>
    </div>
  );
}

// ============================================================================
// BackToMarketplace — link variant button used in all frames.
// ============================================================================

function BackToMarketplace() {
  return (
    <Button asChild variant="link" size="sm" className="px-0">
      <Link href="/dashboard/marketplace">
        <ArrowRight aria-hidden="true" />
        חזרה לשוק
      </Link>
    </Button>
  );
}

// ============================================================================
// DetailSkeleton — placeholder mirroring the final 2-col layout.
// ============================================================================

function DetailSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען רכב…</span>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-md h-12 w-2/3" />
      <Skeleton className="mt-lg h-px w-full" />
      <Skeleton className="mt-lg h-4 w-1/3" />
      <div className="gap-2xl mt-3xl grid grid-cols-1 lg:grid-cols-[1fr_320px]">
        <div className="space-y-2xl">
          <Skeleton className="aspect-[16/9] w-full rounded-md" />
          <div className="space-y-md">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
        <div className="space-y-2xl">
          <div className="space-y-md">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-md">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
