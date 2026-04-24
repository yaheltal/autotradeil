"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { MakeOfferDialog } from "@/components/MakeOfferDialog";
import { NotificationBell } from "@/components/NotificationBell";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";

/*
 * Marketplace vehicle detail page.
 *
 * A11y plan (approved):
 *   - H1 focusable on data-ready for page landing.
 *   - Gallery: horizontal scroll with CSS scroll-snap. The scroll
 *     container is a `<div role="region" aria-label tabIndex={0}>` so
 *     keyboard users can arrow-scroll it. An external `aria-live="polite"`
 *     region + IntersectionObserver announces "תמונה 3 מתוך 8" —
 *     debounced ≥300ms, gated on document.visibilityState === "visible".
 *   - Slides focusable, Enter opens lightbox (Radix Dialog).
 *   - Specs rendered as <dl>; numeric values have visual + sr-only.
 *   - Trust tier badge carries a visible text label + color swatch
 *     (no icon required per a11y-lead answer B).
 *   - Primary CTA "שלח הצעת מחיר" is a gold button (brand: gold bg +
 *     navy text, 8.5:1 AAA).
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
};

const FUEL_LABEL: Record<string, string> = {
  petrol: "בנזין",
  diesel: "דיזל",
  electric: "חשמלי",
  hybrid: "היברידי",
};

export default function MarketplaceDetailPage() {
  const { token } = useDealerAuth(`/dashboard/marketplace`);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const vehicleId = params?.id ?? "";

  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerToast, setOfferToast] = useState<string>("");
  const [slideStatus, setSlideStatus] = useState<string>("");

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<string, HTMLElement>>(new Map());
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!token || !vehicleId) return;
    try {
      const res = await apiFetch<Detail>(`/api/v1/marketplace/vehicles/${vehicleId}`, { token });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת הרכב");
    }
  }, [token, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        // Pick the entry that is most visible
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

  if (!token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <div className="bg-brand-cream min-h-screen">
        <header className="border-brand-navy/10 border-b bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4">
            <BrandMark />
          </div>
        </header>
        <DashboardSubNav />
        <main id="main" tabIndex={-1} className="focus:outline-none">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <p role="alert" className="bg-danger-bg text-danger-text rounded-md px-4 py-3">
              {error}
            </p>
            <Link
              href="/dashboard/marketplace"
              className="text-brand-navy mt-4 inline-block underline"
            >
              ← חזרה לשוק
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען רכב…
        </p>
      </main>
    );
  }

  const priceF = formatPrice(data.b2b_price ?? data.price);
  const mileageF = formatMileage(data.mileage);
  const vehicleLabel = `${data.make} ${data.model} ${data.year}`;

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
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Link
            href="/dashboard/marketplace"
            className="text-brand-navy focus-visible:outline-brand-navy inline-flex items-center gap-1 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span aria-hidden="true">→</span>
            חזרה לשוק
          </Link>

          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy mt-4 text-3xl font-bold tracking-tight focus:outline-none"
          >
            {vehicleLabel}
          </h1>

          {/* Gallery live region (external to slides, announcement only) */}
          {slideStatus ? (
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
              key={slideStatus}
            >
              {slideStatus}
            </p>
          ) : null}

          {offerToast ? (
            <p role="status" aria-live="polite" className="sr-only" key={offerToast}>
              {offerToast}
            </p>
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* =====================================================
                Gallery
                ===================================================== */}
            <section aria-label="גלריית תמונות">
              {data.images.length > 0 ? (
                <div
                  ref={galleryRef}
                  role="region"
                  aria-label="גלריית תמונות של הרכב"
                  tabIndex={0}
                  className="border-brand-navy/10 focus-visible:outline-brand-navy flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-lg border bg-white p-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {data.images.map((img, idx) => (
                    <figure
                      key={img.id}
                      ref={(el) => {
                        if (el) slideRefs.current.set(img.id, el);
                        else slideRefs.current.delete(img.id);
                      }}
                      data-idx={idx}
                      className="aspect-[16/9] w-full shrink-0 snap-center sm:w-[85%]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`${vehicleLabel} — תמונה ${idx + 1} מתוך ${data.images.length}`}
                        loading={idx === 0 ? "eager" : "lazy"}
                        className="h-full w-full rounded-md object-cover"
                      />
                    </figure>
                  ))}
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  className="bg-brand-navy/5 text-brand-ink/30 flex aspect-[16/9] w-full items-center justify-center rounded-lg text-5xl"
                >
                  🚗
                </div>
              )}

              {/* Specs */}
              <section aria-labelledby="specs-heading" className="mt-6">
                <h2 id="specs-heading" className="text-brand-navy text-lg font-semibold">
                  מפרט הרכב
                </h2>
                <dl className="border-brand-navy/10 mt-3 grid grid-cols-1 gap-y-2 rounded-lg border bg-white p-4 sm:grid-cols-2">
                  <Spec term="יצרן" value={data.make} />
                  <Spec term="דגם" value={data.model} />
                  <Spec term="שנה" value={String(data.year)} />
                  <Spec term="קילומטראז׳">
                    <span aria-hidden="true">{mileageF.visual}</span>
                    <span className="sr-only">{mileageF.sr}</span>
                  </Spec>
                  {data.color ? <Spec term="צבע" value={data.color} /> : null}
                  {data.transmission ? (
                    <Spec
                      term="תיבת הילוכים"
                      value={data.transmission === "automatic" ? "אוטומט" : "ידני"}
                    />
                  ) : null}
                  {data.fuel_type ? (
                    <Spec term="סוג דלק" value={FUEL_LABEL[data.fuel_type] ?? data.fuel_type} />
                  ) : null}
                  {data.engine_volume != null ? (
                    <Spec term="נפח מנוע" value={`${data.engine_volume} ליטר`} />
                  ) : null}
                </dl>

                {data.notes ? (
                  <div className="border-brand-navy/10 mt-4 rounded-lg border bg-white p-4">
                    <h3 className="text-brand-navy text-sm font-semibold">הערות הסוחר</h3>
                    <p className="text-brand-ink mt-2 whitespace-pre-wrap text-sm">{data.notes}</p>
                  </div>
                ) : null}
              </section>
            </section>

            {/* =====================================================
                Side column: price + dealer + CTA
                ===================================================== */}
            <aside aria-label="פרטי מוכר ופעולות" className="space-y-4">
              <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
                <p className="text-brand-ink/60 text-xs">מחיר</p>
                <p className="text-brand-navy mt-1 text-2xl font-bold">
                  <span aria-hidden="true">{priceF.visual}</span>
                  <span className="sr-only">{priceF.sr}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setOfferOpen(true)}
                  className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 focus-visible:outline-brand-navy mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  שלח הצעת מחיר
                </button>
              </div>

              <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
                <h2 className="text-brand-navy text-sm font-semibold">פרטי המוכר</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TrustBadge tier={data.seller.tier} />
                  <span className="text-brand-ink/70 text-xs">
                    {data.seller.deals_completed} עסקאות
                  </span>
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-brand-ink/60">שם העסק</dt>
                    <dd className="text-brand-ink font-semibold">
                      <Link
                        href={`/dashboard/marketplace/dealer/${data.seller.id}`}
                        className="text-brand-navy focus-visible:outline-brand-navy rounded underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {data.seller.business_name}
                      </Link>
                    </dd>
                  </div>
                  {data.seller.city ? (
                    <div>
                      <dt className="text-brand-ink/60">עיר</dt>
                      <dd>{data.seller.city}</dd>
                    </div>
                  ) : null}
                  {data.seller.contact_name ? (
                    <div>
                      <dt className="text-brand-ink/60">איש קשר</dt>
                      <dd>{data.seller.contact_name}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="text-brand-ink/60 mt-3 text-xs">
                  פרטי קשר מלאים ייחשפו לאחר אישור ההצעה.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>

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
    </div>
  );
}

function Spec({
  term,
  value,
  children,
}: {
  term: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-brand-navy/5 flex items-baseline justify-between gap-3 border-b py-1.5 last:border-0 sm:last:border-b sm:[&:nth-last-child(2)]:border-0">
      <dt className="text-brand-ink/60 text-sm">{term}</dt>
      <dd className="text-brand-ink text-end text-sm font-medium">{children ?? value}</dd>
    </div>
  );
}
