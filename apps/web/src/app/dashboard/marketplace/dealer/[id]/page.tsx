"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { MarketplaceCard, type MarketplaceCardVehicle } from "@/components/MarketplaceCard";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /dashboard/marketplace/dealer/[id] — public dealer profile.
 *
 *   → חזרה לשוק
 *   פרופיל סוחר
 *   {business_name}                       [TrustBadge]
 *   ──────────
 *   {city} · חבר מאז {member_since}
 *
 *   01 · עסקאות שהושלמו        02 · ציון אמון         03 · חבר מאז
 *   47                          87                      2022
 *
 *   רכבים זמינים · 12
 *   ──────────
 *   [MarketplaceCard hideSellerRow] × N
 *
 * Stats live on the page as a hairline-separated strip (no cards).
 * Listings use the shared <MarketplaceCard> with `hideSellerRow`
 * because the dealer is the page subject — repeating their name on
 * every card would be redundant.
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

type SearchResp = {
  items: MarketplaceCardVehicle[];
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
      <main
        id="main"
        tabIndex={-1}
        className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
      >
        <ProfileSkeleton />
      </main>
    );
  }

  const memberSinceYear = profile ? new Date(profile.member_since).getFullYear().toString() : "—";
  const memberSinceISO = profile?.member_since;

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
    >
      <Button asChild variant="link" size="sm" className="px-0">
        <Link href="/dashboard/marketplace">
          <ArrowRight aria-hidden="true" />
          חזרה לשוק
        </Link>
      </Button>

      {error ? (
        <Alert variant="destructive" className="mt-lg">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!profile ? (
        <ProfileSkeleton />
      ) : (
        <>
          {/* ── MASTHEAD ─────────────────────────────────────────────── */}
          <header className="mt-md">
            <p className="text-muted text-xs font-medium uppercase tracking-widest">פרופיל סוחר</p>
            <div className="gap-md mt-sm flex flex-wrap items-start justify-between">
              <h1
                ref={h1Ref}
                tabIndex={-1}
                className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
              >
                {profile.business_name}
              </h1>
              <TrustBadge tier={profile.tier} />
            </div>
            <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
            <p className="text-muted mt-lg text-sm">
              {profile.city ? `${profile.city} · ` : ""}
              חבר מאז{" "}
              <time dateTime={memberSinceISO} className="font-tabular">
                {memberSinceYear}
              </time>
            </p>
          </header>

          {/* ── STATS STRIP ─────────────────────────────────────────── */}
          <section
            aria-labelledby="stats-heading"
            className="mt-3xl gap-2xl grid grid-cols-1 sm:grid-cols-3"
          >
            <h2 id="stats-heading" className="sr-only">
              נתוני הסוחר
            </h2>
            <Stat number="01" label="עסקאות שהושלמו" value={String(profile.deals_completed)} />
            <Stat number="02" label="ציון אמון" value={String(profile.trust_score)} />
            <Stat number="03" label="חבר מאז" value={memberSinceYear} />
          </section>

          {/* ── LISTINGS ────────────────────────────────────────────── */}
          <section aria-labelledby="listings-heading" className="mt-3xl">
            <p className="text-muted text-xs font-medium uppercase tracking-widest">
              <span>רכבים זמינים</span>
              <span aria-hidden="true" className="text-subtle mx-xxs">
                ·
              </span>
              <span className="font-tabular">{listings?.length ?? 0}</span>
            </p>
            <h2 id="listings-heading" className="sr-only">
              רכבים זמינים של {profile.business_name}
            </h2>
            <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

            {!listings ? (
              <ListingsSkeleton />
            ) : listings.length === 0 ? (
              <p className="text-muted py-2xl text-center text-sm">
                אין כרגע רכבים פעילים בשוק של סוחר זה.
              </p>
            ) : (
              <ul className="gap-md mt-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((v) => (
                  <MarketplaceCard key={v.id} vehicle={v} hideSellerRow />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

// ============================================================================
// Stat — single stat block. Numbered eyebrow + label + tabular value.
// ============================================================================

function Stat({ number, label, value }: { number: string; label: string; value: string }) {
  return (
    <div>
      <p className="text-muted gap-xs text-xs font-medium uppercase tracking-widest">
        <span className="font-tabular">{number}</span>
        <span aria-hidden="true" className="text-subtle mx-xxs">
          ·
        </span>
        <span>{label}</span>
      </p>
      <p className="text-ink font-tabular mt-md font-serif text-3xl font-medium leading-none">
        {value}
      </p>
    </div>
  );
}

// ============================================================================
// Skeletons
// ============================================================================

function ProfileSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען פרופיל סוחר…</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-sm h-12 w-2/3" />
      <Skeleton className="mt-lg h-px w-full" />
      <Skeleton className="mt-lg h-4 w-48" />
      <div className="mt-3xl gap-2xl grid grid-cols-1 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-sm">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-9 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListingsSkeleton() {
  return (
    <ul
      className="gap-md mt-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">טוען רכבים…</span>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          aria-hidden="true"
          className="border-hairline bg-paper overflow-hidden rounded-md border"
        >
          <Skeleton className="aspect-[16/9] w-full rounded-none" />
          <div className="px-md py-md space-y-xs">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="my-md h-px w-full" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
