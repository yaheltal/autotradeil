"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Receipt, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * /dashboard/deals — editorial ledger of closed transactions.
 *
 *   עסקאות
 *   ──────────
 *   {N} עסקאות · {S} מכירות · {P} קניות      ← dek (font-tabular)
 *
 *   ──────
 *   Toyota Camry · 2022                ₪140,000
 *   מכירה ל-Auto Center · ת"א · [gold]  14/12/2024  [צפה ברכב →]
 *   ──────
 *   Honda Civic · 2021                  ₪95,000
 *   קנייה מ-…
 *   ──────
 *
 * Hairline-separated rows, no per-row cards. The page has no accent
 * moments — completed history is past-tense, observational. Role
 * folded into the sub-line as a Hebrew noun ("מכירה ל-…" / "קנייה
 * מ-…") so SR users get the role explicitly without a separate badge.
 *
 * Silent retry pattern preserved from Phase 4: `retry: 3` with
 * exponential back-off, then a generic Hebrew error block — dealers
 * never see "Failed to fetch" / 5xx detail.
 */

type DealVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  primary_image_url: string | null;
};

type DealDealer = {
  id: string;
  business_name: string;
  city: string | null;
  tier: Tier;
};

type Deal = {
  id: string;
  offer_id: string;
  inventory_id: string;
  buyer_dealer_id: string;
  seller_dealer_id: string;
  final_price: number;
  confirmed_at: string | null;
  created_at: string;
  vehicle: DealVehicle;
  buyer: DealDealer;
  seller: DealDealer;
};

type Resp = {
  items: Deal[];
  total: number;
};

export default function DealsPage() {
  const { token } = useDealerAuth("/dashboard/deals");
  const h1Ref = useRef<HTMLHeadingElement>(null);

  // Backend `/marketplace/deals` filters by buyer_dealer_id == me OR
  // seller_dealer_id == me — strict tenant isolation, no dealer sees
  // another dealer's deal history.
  //
  // Dealer-facing error policy: NEVER show technical messages.
  // Retry silently up to 3 times with exponential back-off; only after
  // all retries fail does the generic Hebrew error block show.
  const dealsQuery = useQuery({
    queryKey: queryKeys.deals.root(),
    queryFn: () => apiFetch<Resp>("/api/v1/marketplace/deals", { token: token! }),
    enabled: !!token,
    retry: 3,
    retryDelay: (attempt) => 3000 * (attempt + 1),
  });
  const dealerQuery = useQuery({
    queryKey: queryKeys.dealer.me(),
    queryFn: () => apiFetch<{ id: string }>("/api/v1/dealers/me", { token: token! }),
    enabled: !!token,
  });

  const data = dealsQuery.data ?? null;
  const myDealerId = dealerQuery.data?.id ?? null;
  const loadingMode: "idle" | "retrying" | "failed" =
    dealsQuery.isError && !dealsQuery.isFetching
      ? "failed"
      : dealsQuery.failureCount > 0
        ? "retrying"
        : "idle";
  const error = loadingMode === "failed" ? "אירעה שגיאה, אנא נסה שוב מאוחר יותר" : null;

  // Sales / purchases breakdown for the dek. Requires both `data` and
  // `myDealerId` — until both resolve, we render just the total + a
  // Skeleton for the breakdown.
  const { salesCount, purchasesCount } = useMemo(() => {
    if (!data || !myDealerId) return { salesCount: 0, purchasesCount: 0 };
    let sales = 0;
    let purchases = 0;
    for (const d of data.items) {
      if (d.seller_dealer_id === myDealerId) sales += 1;
      else if (d.buyer_dealer_id === myDealerId) purchases += 1;
    }
    return { salesCount: sales, purchasesCount: purchases };
  }, [data, myDealerId]);

  useEffect(() => {
    if (data) h1Ref.current?.focus();
  }, [data]);

  const breakdownReady = !!data && !!myDealerId;

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
          עסקאות
        </h1>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted mt-lg font-tabular text-sm" role="status" aria-live="polite">
          {!data ? (
            <Skeleton className="inline-block h-4 w-56" />
          ) : (
            <>
              {data.total} עסקאות
              <span className="text-subtle mx-xxs">·</span>
              {breakdownReady ? (
                <>
                  {salesCount} מכירות
                  <span className="text-subtle mx-xxs">·</span>
                  {purchasesCount} קניות
                </>
              ) : (
                <Skeleton className="inline-block h-4 w-32" />
              )}
            </>
          )}
        </p>
      </header>

      {/* ── SILENT RETRY INDICATOR ────────────────────────────────────── */}
      {loadingMode === "retrying" ? (
        <div
          role="status"
          aria-live="polite"
          aria-label="טוען"
          className="py-2xl flex items-center justify-center"
        >
          <Loader2 aria-hidden="true" className="text-muted h-5 w-5 animate-spin" />
          <span className="sr-only">טוען</span>
        </div>
      ) : null}

      {/* ── FAILED STATE ─────────────────────────────────────────────── */}
      {loadingMode === "failed" && error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="gap-md flex items-baseline justify-between">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void dealsQuery.refetch()}
            >
              נסה שוב
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ── DEAL LIST ────────────────────────────────────────────────── */}
      {!data && loadingMode === "idle" ? (
        <DealListSkeleton />
      ) : data && data.items.length === 0 ? (
        <EmptyState />
      ) : data ? (
        <ul className="mt-2xl">
          {data.items.map((d, i) => (
            <DealRow key={d.id} deal={d} myDealerId={myDealerId} isFirst={i === 0} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}

// ============================================================================
// DealRow — hairline-separated editorial row.
//
// Single-line on md+, 2-line stack on mobile. Role is folded into the
// sub-line as a Hebrew noun ("מכירה ל-…" / "קנייה מ-…") so the sentence
// itself carries the direction — no separate role badge.
// ============================================================================

function DealRow({
  deal,
  myDealerId,
  isFirst,
}: {
  deal: Deal;
  myDealerId: string | null;
  isFirst: boolean;
}) {
  const iAmBuyer = myDealerId === deal.buyer_dealer_id;
  const counterparty = iAmBuyer ? deal.seller : deal.buyer;
  const priceF = formatPrice(deal.final_price);
  const titleId = `deal-${deal.id}-title`;
  const closeIso = deal.confirmed_at ?? deal.created_at;
  const vehicleLabel = `${deal.vehicle.make} ${deal.vehicle.model} ${deal.vehicle.year}`;
  // "מכירה ל-X" if I sold; "קנייה מ-X" if I bought. Hebrew nouns
  // unambiguously carry direction for SR users — no separate role badge.
  const rolePhrase = iAmBuyer ? "קנייה מ-" : "מכירה ל-";

  return (
    <li className={["py-lg", isFirst ? "" : "border-hairline border-t"].join(" ")}>
      <article
        aria-labelledby={titleId}
        className="gap-md lg:gap-xl grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] lg:items-baseline"
      >
        {/* Left — title + counterparty sub-line */}
        <div className="min-w-0">
          <h3 id={titleId} className="text-ink font-serif text-lg font-medium leading-tight">
            {deal.vehicle.make} {deal.vehicle.model}{" "}
            <span className="text-muted font-tabular font-normal">· {deal.vehicle.year}</span>
          </h3>
          <p className="text-muted gap-xs mt-xxs flex flex-wrap items-center text-sm">
            <span>
              {rolePhrase}
              <Link
                href={`/dashboard/marketplace/dealer/${counterparty.id}`}
                className="text-ink duration-fast hover:text-accent focus-visible:outline-accent rounded-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                {counterparty.business_name}
              </Link>
              {counterparty.city ? (
                <span className="text-muted"> · {counterparty.city}</span>
              ) : null}
            </span>
            <TrustBadge tier={counterparty.tier} compact />
          </p>
        </div>

        {/* Middle — price + date stack */}
        <div className="text-end">
          <p className="text-ink font-tabular text-lg font-medium leading-none">
            <span aria-hidden="true">{priceF.visual}</span>
            <span className="sr-only">{priceF.sr}</span>
          </p>
          <p className="text-muted font-tabular mt-xxs text-xs">
            <time dateTime={closeIso}>{formatDate(closeIso)}</time>
          </p>
        </div>

        {/* Trailing — "view vehicle" link button */}
        <div className="text-end">
          <Button asChild variant="link" size="sm" className="px-0">
            <Link
              href={`/dashboard/marketplace/${deal.inventory_id}`}
              aria-label={`צפייה ברכב ${vehicleLabel}`}
            >
              <span>צפה ברכב</span>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </article>
    </li>
  );
}

// ============================================================================
// DealListSkeleton — placeholder rows that mirror the final layout.
// ============================================================================

function DealListSkeleton() {
  return (
    <ul className="mt-2xl" aria-busy="true" aria-label="טוען עסקאות">
      {[0, 1, 2].map((i) => (
        <li key={i} className={["py-lg", i > 0 ? "border-hairline border-t" : ""].join(" ")}>
          <div className="gap-md lg:gap-xl grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] lg:items-baseline">
            <div className="space-y-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="space-y-2 text-end">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// EmptyState — Receipt lucide + editorial copy, no emoji, no CTA.
//
// Deals arrive in this list ONLY after both parties confirmed a sealed
// offer — there's no "go to marketplace" affordance because clicking
// around the marketplace doesn't create deals.
// ============================================================================

function EmptyState() {
  return (
    <div className="py-3xl flex flex-col items-center text-center">
      <div
        aria-hidden="true"
        className="border-hairline bg-paper text-subtle flex h-16 w-16 items-center justify-center rounded-md border"
      >
        <Receipt className="h-7 w-7" />
      </div>
      <p className="text-ink mt-lg font-serif text-lg font-medium">אין עסקאות עדיין</p>
      <p className="text-muted mt-xs max-w-sm text-sm">
        עסקאות יופיעו כאן לאחר סגירת הצעות בהצלחה משני הצדדים.
      </p>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
