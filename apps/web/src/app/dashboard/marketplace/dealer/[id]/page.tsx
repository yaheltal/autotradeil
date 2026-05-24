"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { NotificationBell } from "@/components/NotificationBell";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * Public dealer profile (Phase 4.2).
 *
 * A11y (approved):
 *   - H1 dealer name, focusable on data-ready.
 *   - Stats grid uses <dl>. "חבר מאז" uses <time datetime>.
 *   - Listings from this dealer reuse the marketplace card pattern,
 *     with `hideSellerRow=true` to avoid duplicated seller info
 *     (a11y-lead required change #6).
 *   - TrustBadge carries the tier as its accessible name; no color-only.
 */

type Profile = {
  id: string;
  business_name: string;
  city: string | null;
  tier: Tier;
  trust_score: number;
  deals_completed: number;
  member_since: string;
};

type Listing = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  b2b_price: number | null;
  primary_image_url: string | null;
  seller_business_name: string;
  seller_city: string | null;
};

type SearchResp = {
  items: Listing[];
  total: number;
};

export default function DealerProfilePage() {
  const { token } = useDealerAuth("/dashboard/marketplace");
  const params = useParams<{ id: string }>();
  const dealerId = params?.id ?? "";

  const h1Ref = useRef<HTMLHeadingElement>(null);

  const profileQuery = useQuery({
    queryKey: queryKeys.marketplace.dealer(dealerId),
    queryFn: () =>
      apiFetch<Profile>(`/api/v1/marketplace/dealers/${dealerId}/profile`, { token: token! }),
    enabled: !!token && !!dealerId,
  });
  const listingsQuery = useQuery({
    queryKey: ["marketplace", "dealer", dealerId, "listings"] as const,
    queryFn: () =>
      apiFetch<SearchResp>(`/api/v1/marketplace/search?seller_dealer_id=${dealerId}&per_page=50`, {
        token: token!,
      }),
    enabled: !!token && !!dealerId,
  });

  const profile = profileQuery.data ?? null;
  const listings = listingsQuery.data?.items ?? null;
  const error =
    profileQuery.error instanceof Error
      ? profileQuery.error.message
      : listingsQuery.error instanceof Error
        ? listingsQuery.error.message
        : profileQuery.error || listingsQuery.error
          ? "שגיאה בטעינת פרופיל הסוחר"
          : null;

  useEffect(() => {
    if (profile) h1Ref.current?.focus();
  }, [profile]);

  if (!token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  const fmtDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { year: "numeric", month: "long" });
  };

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

          {error ? (
            <p role="alert" className="bg-danger-bg text-danger-text mt-4 rounded-md px-4 py-3">
              {error}
            </p>
          ) : null}

          {!profile ? (
            <p role="status" className="text-brand-ink/60 p-8">
              טוען…
            </p>
          ) : (
            <>
              <section
                aria-labelledby="dealer-heading"
                className="border-brand-navy/10 mt-4 rounded-lg border bg-white p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1
                      id="dealer-heading"
                      ref={h1Ref}
                      tabIndex={-1}
                      className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
                    >
                      {profile.business_name}
                    </h1>
                    {profile.city ? <p className="text-brand-ink/70 mt-1">{profile.city}</p> : null}
                  </div>
                  <TrustBadge tier={profile.tier} />
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-brand-ink/60 text-xs">עסקאות שהושלמו</dt>
                    <dd className="text-brand-navy mt-1 text-2xl font-bold">
                      {profile.deals_completed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-brand-ink/60 text-xs">ציון אמון</dt>
                    <dd className="text-brand-navy mt-1 text-2xl font-bold">
                      {profile.trust_score}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-brand-ink/60 text-xs">חבר מאז</dt>
                    <dd className="text-brand-navy mt-1 text-lg font-semibold">
                      <time dateTime={profile.member_since}>{fmtDate(profile.member_since)}</time>
                    </dd>
                  </div>
                </dl>
              </section>

              <section aria-labelledby="listings-heading" className="mt-8">
                <h2 id="listings-heading" className="text-brand-navy text-lg font-semibold">
                  רכבים זמינים ({listings?.length ?? 0})
                </h2>

                {listings === null ? (
                  <p role="status" className="text-brand-ink/60 p-8">
                    טוען…
                  </p>
                ) : listings.length === 0 ? (
                  <p className="border-brand-navy/10 text-brand-ink/60 mt-4 rounded-lg border bg-white p-10 text-center">
                    אין כרגע רכבים פעילים בשוק של סוחר זה
                  </p>
                ) : (
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                    {listings.map((v) => {
                      const priceF = formatPrice(v.b2b_price ?? v.price);
                      const mileageF = formatMileage(v.mileage);
                      const fullLabel = `${v.make} ${v.model} שנת ${v.year}`;
                      const titleId = `dvl-${v.id}-title`;
                      return (
                        <li
                          key={v.id}
                          className="border-brand-navy/10 overflow-hidden rounded-lg border bg-white"
                        >
                          <article aria-labelledby={titleId}>
                            <div className="bg-brand-navy/5 aspect-[16/9] w-full">
                              {v.primary_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={v.primary_image_url}
                                  alt={`תמונת ${fullLabel}`}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div
                                  aria-hidden="true"
                                  className="text-brand-ink/30 flex h-full w-full items-center justify-center text-4xl"
                                >
                                  🚗
                                </div>
                              )}
                            </div>
                            <div className="p-4">
                              <h3 id={titleId} className="text-brand-navy text-lg font-bold">
                                {v.make} {v.model} · {v.year}
                              </h3>
                              <dl className="mt-3 space-y-1.5 text-sm">
                                <div className="flex items-baseline justify-between gap-2">
                                  <dt className="text-brand-ink/60">מחיר</dt>
                                  <dd className="text-brand-navy font-bold">
                                    <span aria-hidden="true">{priceF.visual}</span>
                                    <span className="sr-only">{priceF.sr}</span>
                                  </dd>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                  <dt className="text-brand-ink/60">קילומטראז׳</dt>
                                  <dd>
                                    <span aria-hidden="true">{mileageF.visual}</span>
                                    <span className="sr-only">{mileageF.sr}</span>
                                  </dd>
                                </div>
                              </dl>
                              <Link
                                href={`/dashboard/marketplace/${v.id}`}
                                aria-label={`פרטים נוספים על ${fullLabel}`}
                                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                פרטים נוספים
                              </Link>
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
