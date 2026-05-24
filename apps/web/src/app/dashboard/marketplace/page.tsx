"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarketplaceCard, type MarketplaceCardVehicle } from "@/components/MarketplaceCard";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import { apiFetch } from "@/lib/api";
import { CAR_MAKES, getModelsForMake } from "@/lib/car-data";
import { queryKeys } from "@/lib/query-keys";

/*
 * /dashboard/marketplace — editorial catalogue index.
 *
 *   שוק
 *   ──────────
 *   נמצאו 47 רכבים                ← dek (font-tabular)
 *
 *   [🔍 חיפוש: BMW עד 80,000…  ]
 *   [≡ סינון מתקדם ▼]              ← collapsed by default
 *   {active filter chips, if any}
 *
 *   ┌── card ── card ── card ──┐
 *   │   ...3-col grid on lg     │
 *   └──────────────────────────┘
 *
 *   [הקודם] עמוד 1 מתוך 5 [הבא]
 *
 * Smart-search drives 80% of queries; advanced filters live behind a
 * toggle. The 320px sidebar pattern from the prior implementation was
 * too heavy for an editorial direction. Cards live on hairlines, not
 * shadows or thick borders. Whole card is a <Link>.
 *
 * TanStack filter-state machine preserved verbatim: `filters` is the
 * draft, `appliedFilters` drives the query, submit commits.
 */

type Result = MarketplaceCardVehicle & {
  seller_dealer_id: string;
  // re-stating the seller_* fields as required so the SearchResponse
  // shape stays explicit even though MarketplaceCardVehicle types them
  // optionally.
  seller_business_name: string;
  seller_city: string | null;
  seller_tier: "bronze" | "silver" | "gold" | "platinum";
  color: string | null;
  transmission: "automatic" | "manual" | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | null;
  engine_volume: number | string | null;
  created_at: string;
};

type SearchResponse = {
  items: Result[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

type Filters = {
  q: string;
  make: string;
  model: string;
  year_min: string;
  year_max: string;
  price_min: string;
  price_max: string;
  mileage_max: string;
  transmission: "" | "automatic" | "manual";
  fuel_type: "" | "petrol" | "diesel" | "electric" | "hybrid";
  city: string;
};

const EMPTY_FILTERS: Filters = {
  q: "",
  make: "",
  model: "",
  year_min: "",
  year_max: "",
  price_min: "",
  price_max: "",
  mileage_max: "",
  transmission: "",
  fuel_type: "",
  city: "",
};

export default function MarketplacePage() {
  const { token } = useDealerAuth("/dashboard/marketplace");

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Applied filters drive the query; the form's `filters` state is a
  // draft that only commits on submit. Without this split every input
  // would refetch — undesirable when the dealer is refining a query.
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [resultsAnnouncement, setResultsAnnouncement] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const marketplaceQuery = useQuery({
    queryKey: queryKeys.marketplace.list({ ...appliedFilters, page }),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (appliedFilters.q) qs.set("q", appliedFilters.q);
      if (appliedFilters.make) qs.set("make", appliedFilters.make);
      if (appliedFilters.model) qs.set("model", appliedFilters.model);
      if (appliedFilters.year_min) qs.set("year_min", appliedFilters.year_min);
      if (appliedFilters.year_max) qs.set("year_max", appliedFilters.year_max);
      if (appliedFilters.price_min) qs.set("price_min", appliedFilters.price_min);
      if (appliedFilters.price_max) qs.set("price_max", appliedFilters.price_max);
      if (appliedFilters.mileage_max) qs.set("mileage_max", appliedFilters.mileage_max);
      if (appliedFilters.transmission) qs.set("transmission", appliedFilters.transmission);
      if (appliedFilters.fuel_type) qs.set("fuel_type", appliedFilters.fuel_type);
      if (appliedFilters.city) qs.set("city", appliedFilters.city);
      qs.set("page", String(page));
      qs.set("per_page", "20");
      return apiFetch<SearchResponse>(`/api/v1/marketplace/search?${qs.toString()}`, {
        token: token!,
      });
    },
    enabled: !!token,
  });

  const data = marketplaceQuery.data ?? null;
  const loading = marketplaceQuery.isFetching;

  useEffect(() => {
    if (marketplaceQuery.error) {
      setError("אירעה שגיאה, אנא נסה שוב מאוחר יותר");
    } else if (data) {
      setError(null);
    }
  }, [marketplaceQuery.error, data]);

  // Debounced results-count announcement (a11y-lead: 150ms).
  useEffect(() => {
    if (!data) return;
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    announceTimerRef.current = setTimeout(() => {
      setResultsAnnouncement(
        data.total === 0 ? "לא נמצאו רכבים תואמים" : `נמצאו ${data.total} רכבים`,
      );
    }, 150);
  }, [data]);

  useEffect(() => {
    if (data) h1Ref.current?.focus();
  }, [data]);

  const { parse: parseSmart, busy: parsingSmart } = useSmartFilters(token);

  const applyFilters = async () => {
    let next = filters;
    const q = filters.q.trim();
    if (q) {
      const parsed = await parseSmart(q);
      if (parsed) {
        const f = parsed.filters;
        // Explicit dropdown values WIN — Claude only fills gaps.
        next = {
          ...filters,
          q: parsed.fallback_q ?? "",
          make: filters.make || f.make || "",
          model: filters.model || f.model || "",
          year_min: filters.year_min || (f.year_min ? String(f.year_min) : ""),
          year_max: filters.year_max || (f.year_max ? String(f.year_max) : ""),
          price_min: filters.price_min || (f.price_min ? String(f.price_min) : ""),
          price_max: filters.price_max || (f.price_max ? String(f.price_max) : ""),
          mileage_max: filters.mileage_max || (f.mileage_max ? String(f.mileage_max) : ""),
          transmission: filters.transmission || (f.transmission ?? ""),
          fuel_type: filters.fuel_type || (f.fuel_type ?? ""),
        };
        setFilters(next);
      }
    }
    setAppliedFilters(next);
    setPage(1);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await applyFilters();
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const hasAppliedFilter = !!(
    appliedFilters.q ||
    appliedFilters.make ||
    appliedFilters.model ||
    appliedFilters.year_min ||
    appliedFilters.year_max ||
    appliedFilters.price_min ||
    appliedFilters.price_max ||
    appliedFilters.mileage_max ||
    appliedFilters.transmission ||
    appliedFilters.fuel_type ||
    appliedFilters.city
  );

  const models = filters.make ? getModelsForMake(filters.make) : [];

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
    >
      {/* ── MASTHEAD ──────────────────────────────────────────────────── */}
      <header>
        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
        >
          שוק
        </h1>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted mt-lg font-tabular text-sm" role="status" aria-live="polite">
          {!data ? (
            <Skeleton className="inline-block h-4 w-32" />
          ) : data.total === 0 ? (
            "לא נמצאו רכבים"
          ) : (
            <>
              נמצאו {data.total} רכבים
              {hasAppliedFilter ? <span className="text-subtle"> · מסונן</span> : null}
            </>
          )}
        </p>
        {/* sr-only echo of the count for AT — debounced version preserved */}
        {resultsAnnouncement ? (
          <span role="status" aria-live="polite" className="sr-only" key={resultsAnnouncement}>
            {resultsAnnouncement}
          </span>
        ) : null}
      </header>

      {/* ── TOOLBAR ───────────────────────────────────────────────────── */}
      <form onSubmit={onSubmit} className="mt-3xl gap-md flex flex-col" role="search">
        {/* Primary smart search */}
        <div>
          <Label htmlFor="mkt-search" className="sr-only">
            חיפוש חכם בשוק
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2"
            />
            <Input
              id="mkt-search"
              type="search"
              autoComplete="off"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="חפש יצרן, דגם, שנה, או טווח מחירים"
              className="pe-10"
              aria-busy={parsingSmart || undefined}
            />
          </div>
        </div>

        {/* Toggle + submit row */}
        <div className="gap-sm flex flex-wrap items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-controls="advanced-filters-panel"
          >
            <SlidersHorizontal aria-hidden="true" />
            <span>סינון מתקדם</span>
            <ChevronDown
              aria-hidden="true"
              className={[
                "duration-fast h-4 w-4 transition-transform",
                advancedOpen ? "rotate-180" : "",
              ].join(" ")}
            />
          </Button>
          <Button type="submit" size="sm" disabled={parsingSmart}>
            {parsingSmart ? "מנתח…" : "חפש"}
          </Button>
          {hasAppliedFilter ? (
            <Button type="button" variant="link" size="sm" onClick={resetFilters}>
              נקה הכל
            </Button>
          ) : null}
        </div>

        {/* Advanced filter panel (collapsed by default) */}
        {advancedOpen ? (
          <div
            id="advanced-filters-panel"
            className="border-hairline pt-lg gap-lg mt-sm grid grid-cols-1 border-t sm:grid-cols-2"
          >
            <SearchableSelect
              id="f-make"
              label="יצרן"
              value={filters.make}
              onChange={(v) => setFilters({ ...filters, make: v, model: "" })}
              options={["", ...CAR_MAKES]}
              placeholder="הכל"
            />
            <SearchableSelect
              id="f-model"
              label="דגם"
              value={filters.model}
              onChange={(v) => setFilters({ ...filters, model: v })}
              options={["", ...models]}
              placeholder={filters.make ? "הכל" : "בחר יצרן תחילה"}
              disabled={!filters.make}
              disabledHint="יש לבחור יצרן תחילה"
            />

            <fieldset className="space-y-xs">
              <legend className="text-ink text-sm font-medium">טווח שנים</legend>
              <div className="gap-sm flex">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={filters.year_min}
                  onChange={(e) => setFilters({ ...filters, year_min: e.target.value })}
                  placeholder="מ-"
                  aria-label="שנה מ-"
                />
                <Input
                  type="text"
                  inputMode="numeric"
                  value={filters.year_max}
                  onChange={(e) => setFilters({ ...filters, year_max: e.target.value })}
                  placeholder="עד"
                  aria-label="שנה עד"
                />
              </div>
            </fieldset>

            <fieldset className="space-y-xs">
              <legend className="text-ink text-sm font-medium">טווח מחירים (₪)</legend>
              <div className="gap-sm flex">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={filters.price_min}
                  onChange={(e) => setFilters({ ...filters, price_min: e.target.value })}
                  placeholder="מ-"
                  aria-label="מחיר מ-"
                />
                <Input
                  type="text"
                  inputMode="numeric"
                  value={filters.price_max}
                  onChange={(e) => setFilters({ ...filters, price_max: e.target.value })}
                  placeholder="עד"
                  aria-label="מחיר עד"
                />
              </div>
            </fieldset>

            <div className="space-y-xs">
              <Label htmlFor="f-mileage-max">ק&quot;מ מקסימלי</Label>
              <Input
                id="f-mileage-max"
                type="text"
                inputMode="numeric"
                value={filters.mileage_max}
                onChange={(e) => setFilters({ ...filters, mileage_max: e.target.value })}
              />
            </div>

            <div className="space-y-xs">
              <Label htmlFor="f-transmission">תיבת הילוכים</Label>
              <select
                id="f-transmission"
                dir="rtl"
                value={filters.transmission}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    transmission: e.target.value as Filters["transmission"],
                  })
                }
                className="border-input text-ink bg-paper focus-visible:outline-accent block h-10 w-full rounded-md border px-3 py-2 text-base focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:text-sm"
              >
                <option value="">הכל</option>
                <option value="automatic">אוטומט</option>
                <option value="manual">ידני</option>
              </select>
            </div>

            <div className="space-y-xs">
              <Label htmlFor="f-fuel">סוג דלק</Label>
              <select
                id="f-fuel"
                dir="rtl"
                value={filters.fuel_type}
                onChange={(e) =>
                  setFilters({ ...filters, fuel_type: e.target.value as Filters["fuel_type"] })
                }
                className="border-input text-ink bg-paper focus-visible:outline-accent block h-10 w-full rounded-md border px-3 py-2 text-base focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:text-sm"
              >
                <option value="">הכל</option>
                <option value="petrol">בנזין</option>
                <option value="diesel">דיזל</option>
                <option value="electric">חשמלי</option>
                <option value="hybrid">היברידי</option>
              </select>
            </div>

            <div className="space-y-xs sm:col-span-2">
              <Label htmlFor="f-city">עיר</Label>
              <Input
                id="f-city"
                type="text"
                autoComplete="off"
                value={filters.city}
                onChange={(e) => setFilters({ ...filters, city: e.target.value })}
              />
            </div>
          </div>
        ) : null}

        {/* Active filter chips */}
        {hasAppliedFilter ? (
          <div className="gap-xs flex flex-wrap items-center">
            <span className="text-muted text-xs">מסונן:</span>
            {appliedFilters.make ? (
              <FilterChip onClear={() => setAppliedFilters((f) => ({ ...f, make: "", model: "" }))}>
                {appliedFilters.make}
              </FilterChip>
            ) : null}
            {appliedFilters.model ? (
              <FilterChip onClear={() => setAppliedFilters((f) => ({ ...f, model: "" }))}>
                {appliedFilters.model}
              </FilterChip>
            ) : null}
            {appliedFilters.year_min || appliedFilters.year_max ? (
              <FilterChip
                onClear={() => setAppliedFilters((f) => ({ ...f, year_min: "", year_max: "" }))}
              >
                {appliedFilters.year_min || "?"}–{appliedFilters.year_max || "?"}
              </FilterChip>
            ) : null}
            {appliedFilters.price_min || appliedFilters.price_max ? (
              <FilterChip
                onClear={() => setAppliedFilters((f) => ({ ...f, price_min: "", price_max: "" }))}
              >
                ₪{Number(appliedFilters.price_min || 0).toLocaleString("he-IL")}
                {appliedFilters.price_max
                  ? `–${Number(appliedFilters.price_max).toLocaleString("he-IL")}`
                  : "+"}
              </FilterChip>
            ) : null}
            {appliedFilters.mileage_max ? (
              <FilterChip onClear={() => setAppliedFilters((f) => ({ ...f, mileage_max: "" }))}>
                עד {Number(appliedFilters.mileage_max).toLocaleString("he-IL")} ק&quot;מ
              </FilterChip>
            ) : null}
            {appliedFilters.transmission ? (
              <FilterChip onClear={() => setAppliedFilters((f) => ({ ...f, transmission: "" }))}>
                {appliedFilters.transmission === "automatic" ? "אוטומט" : "ידני"}
              </FilterChip>
            ) : null}
            {appliedFilters.fuel_type ? (
              <FilterChip onClear={() => setAppliedFilters((f) => ({ ...f, fuel_type: "" }))}>
                {appliedFilters.fuel_type}
              </FilterChip>
            ) : null}
            {appliedFilters.city ? (
              <FilterChip onClear={() => setAppliedFilters((f) => ({ ...f, city: "" }))}>
                {appliedFilters.city}
              </FilterChip>
            ) : null}
            {appliedFilters.q ? (
              <FilterChip onClear={() => setAppliedFilters((f) => ({ ...f, q: "" }))}>
                ״{appliedFilters.q}״
              </FilterChip>
            ) : null}
          </div>
        ) : null}
      </form>

      {/* ── ERROR ─────────────────────────────────────────────────────── */}
      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── RESULTS ───────────────────────────────────────────────────── */}
      <section aria-labelledby="results-heading" className="mt-2xl">
        <h2 id="results-heading" className="sr-only">
          תוצאות חיפוש
        </h2>

        <div aria-busy={loading || undefined}>
          {loading && !data ? (
            <ResultsSkeleton />
          ) : data && data.items.length === 0 ? (
            <EmptyResults hasFilter={hasAppliedFilter} onReset={resetFilters} />
          ) : data ? (
            <>
              <ul className="gap-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((v) => (
                  <MarketplaceCard key={v.id} vehicle={v} />
                ))}
              </ul>

              {data.pages > 1 ? (
                <nav
                  aria-label="ניווט עמודים"
                  className="mt-2xl gap-sm flex items-center justify-center"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ArrowRight aria-hidden="true" />
                    הקודם
                  </Button>
                  <span className="text-muted font-tabular px-md text-sm">
                    עמוד {page} מתוך {data.pages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                    disabled={page >= data.pages}
                  >
                    הבא
                    <ArrowLeft aria-hidden="true" />
                  </Button>
                </nav>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

// ============================================================================
// FilterChip — dismissible chip for active filter values.
// ============================================================================

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <Badge variant="outline" className="gap-xxs h-7 pe-1 ps-2 text-xs font-normal">
      <span>{children}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="הסר סינון"
        className="text-muted duration-fast hover:text-ink inline-flex h-5 w-5 items-center justify-center rounded-sm transition-colors"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}

// ============================================================================
// ResultsSkeleton — mirrors the card grid while loading.
// ============================================================================

function ResultsSkeleton() {
  return (
    <ul
      className="gap-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">טוען רכבים…</span>
      {[0, 1, 2, 3, 4, 5].map((i) => (
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

// ============================================================================
// EmptyResults — two distinct empty states (no filter vs filter mismatch).
// ============================================================================

function EmptyResults({ hasFilter, onReset }: { hasFilter: boolean; onReset: () => void }) {
  return (
    <div className="py-3xl text-center">
      <p className="text-ink font-serif text-lg font-medium">
        {hasFilter ? "לא נמצאו רכבים תואמים לסינון שלך" : "אין כרגע רכבים פעילים בשוק B2B"}
      </p>
      <p className="text-muted mt-sm mx-auto max-w-md text-sm leading-relaxed">
        {hasFilter
          ? "נסה להרחיב את טווח השנים, המחיר או הק״מ — או לאפס את הסינון לקבלת רשימה מלאה."
          : "כשסוחרים נוספים יפרסמו רכבים לסחר בין-סוחרים, הם יופיעו כאן. הרכבים שלך עצמך אינם נכללים בשוק."}
      </p>
      {hasFilter ? (
        <Button type="button" variant="outline" onClick={onReset} className="mt-xl">
          איפוס סינון
        </Button>
      ) : null}
    </div>
  );
}
