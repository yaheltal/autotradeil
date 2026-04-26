"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { FilterFABIcon, MobileFAB } from "@/components/MobileFAB";
import { NotificationBell } from "@/components/NotificationBell";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TrustBadge } from "@/components/TrustBadge";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import { apiFetch } from "@/lib/api";
import { CAR_MAKES, getModelsForMake } from "@/lib/car-data";
import { formatMileage, formatPrice } from "@/lib/format";

/*
 * B2B marketplace search page.
 *
 * A11y plan (approved):
 *   - H1 "שוק סוחרים B2B" is focusable (tabIndex -1) and focused after
 *     first load so screen readers land on the page title.
 *   - Filters live inside a <section aria-labelledby="filters-heading">
 *     with an sr-only <h2>. Numeric range pairs use a <fieldset> with a
 *     visible <legend> and per-input labels.
 *   - Mobile collapse uses a <button aria-expanded aria-controls>
 *     toggle, NOT native <details> (more predictable SR behavior).
 *   - Results list wrapped in aria-busy during fetch; completion is
 *     announced once via a role=status region "נמצאו N רכבים" with a
 *     150ms debounce against rapid filter changes.
 *   - Each result card is an <article aria-labelledby="..."> with a
 *     bold H3 vehicle title; trust-tier badge has a text label.
 *   - Numeric values render with a visual + sr-only override to keep
 *     Hebrew SRs clean.
 *   - Pagination uses <nav aria-label="ניווט עמודים"> + aria-current.
 */

type Result = {
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
  seller_dealer_id: string;
  seller_business_name: string;
  seller_city: string | null;
  seller_tier: "bronze" | "silver" | "gold" | "platinum";
  primary_image_url: string | null;
  created_at: string;
  is_own?: boolean;
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
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultsAnnouncement, setResultsAnnouncement] = useState<string>("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (reqPage: number, reqFilters: Filters) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (reqFilters.q) qs.set("q", reqFilters.q);
        if (reqFilters.make) qs.set("make", reqFilters.make);
        if (reqFilters.model) qs.set("model", reqFilters.model);
        if (reqFilters.year_min) qs.set("year_min", reqFilters.year_min);
        if (reqFilters.year_max) qs.set("year_max", reqFilters.year_max);
        if (reqFilters.price_min) qs.set("price_min", reqFilters.price_min);
        if (reqFilters.price_max) qs.set("price_max", reqFilters.price_max);
        if (reqFilters.mileage_max) qs.set("mileage_max", reqFilters.mileage_max);
        if (reqFilters.transmission) qs.set("transmission", reqFilters.transmission);
        if (reqFilters.fuel_type) qs.set("fuel_type", reqFilters.fuel_type);
        if (reqFilters.city) qs.set("city", reqFilters.city);
        qs.set("page", String(reqPage));
        qs.set("per_page", "20");

        const res = await apiFetch<SearchResponse>(`/api/v1/marketplace/search?${qs.toString()}`, {
          token,
        });
        setData(res);

        // Debounced results-count announcement (a11y-lead: 150ms)
        if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
        announceTimerRef.current = setTimeout(() => {
          setResultsAnnouncement(
            res.total === 0 ? "לא נמצאו רכבים תואמים" : `נמצאו ${res.total} רכבים`,
          );
        }, 150);
      } catch {
        // Generic message — never leak fetch / 5xx detail to dealers.
        setError("אירעה שגיאה, אנא נסה שוב מאוחר יותר");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void refresh(page, filters);
    // only react to token ready / page change — filter changes require submit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page]);

  useEffect(() => {
    if (data) h1Ref.current?.focus();
  }, [data]);

  const { parse: parseSmart, busy: parsingSmart } = useSmartFilters(token);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMobileFiltersOpen(false);
    setPage(1);

    // Smart-search: if the free-text box has content, route through
    // Claude to extract structured filters, then merge them on top of
    // any explicit filter the user already set in the dropdowns. The
    // explicit dropdown values WIN — Claude only fills in gaps so we
    // don't override an intentional choice.
    let next = filters;
    const q = filters.q.trim();
    if (q) {
      const parsed = await parseSmart(q);
      if (parsed) {
        const f = parsed.filters;
        next = {
          ...filters,
          // Keep the original q — backend can use it as substring fallback
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
    void refresh(1, next);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    void refresh(1, EMPTY_FILTERS);
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

  const models = filters.make ? getModelsForMake(filters.make) : [];

  return (
    <div className="bg-brand-cream text-brand-ink min-h-screen">
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <BrandMark />
          <NotificationBell token={token} />
        </div>
      </header>

      <DashboardSubNav />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
          >
            שוק סוחרים B2B
          </h1>
          <p className="text-brand-ink/70 mt-2">רכבים שהוצעו לסחר בין סוחרים רשומים.</p>

          {/* Results-count live region */}
          {resultsAnnouncement ? (
            <p role="status" aria-live="polite" className="sr-only" key={resultsAnnouncement}>
              {resultsAnnouncement}
            </p>
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* =====================================================
                Filters
                ===================================================== */}
            <section aria-labelledby="filters-heading">
              <h2 id="filters-heading" className="sr-only">
                סינון חיפוש
              </h2>

              {/* Mobile toggle */}
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="filters-panel"
                className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-between rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
              >
                <span>{mobileFiltersOpen ? "הסתר סינון" : "הצג סינון"}</span>
                <span aria-hidden="true">{mobileFiltersOpen ? "▲" : "▼"}</span>
              </button>

              <form
                id="filters-panel"
                onSubmit={onSubmit}
                className={[
                  "border-brand-navy/10 mt-2 rounded-lg border bg-white p-4",
                  mobileFiltersOpen ? "block" : "hidden",
                  "lg:mt-0 lg:block",
                ].join(" ")}
              >
                <div className="space-y-4">
                  <div>
                    <label htmlFor="f-q" className="text-brand-navy block text-sm font-medium">
                      חיפוש חכם
                      <span
                        aria-hidden="true"
                        title="חיפוש חופשי בעברית — Claude יזהה אוטומטית יצרן, מחיר, שנה, ק״מ"
                        className="text-brand-gold ms-1.5 text-xs"
                      >
                        ✦
                      </span>
                    </label>
                    <input
                      id="f-q"
                      type="search"
                      autoComplete="off"
                      value={filters.q}
                      onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                      placeholder='למשל: "BMW עד 80,000" או "סוזוקי 2020"'
                      aria-describedby="f-q-hint"
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    <p id="f-q-hint" className="text-brand-ink/55 mt-1 text-xs">
                      ✦ ניתן להזין משפט בעברית — המערכת תחלץ אוטומטית פילטרים
                    </p>
                  </div>

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

                  <fieldset className="border-0 p-0">
                    <legend className="text-brand-navy text-sm font-medium">טווח שנים</legend>
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1">
                        <label htmlFor="f-year-min" className="sr-only">
                          שנה מ-
                        </label>
                        <input
                          id="f-year-min"
                          type="text"
                          inputMode="numeric"
                          value={filters.year_min}
                          onChange={(e) => setFilters({ ...filters, year_min: e.target.value })}
                          placeholder="מ-"
                          className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                      <div className="flex-1">
                        <label htmlFor="f-year-max" className="sr-only">
                          שנה עד
                        </label>
                        <input
                          id="f-year-max"
                          type="text"
                          inputMode="numeric"
                          value={filters.year_max}
                          onChange={(e) => setFilters({ ...filters, year_max: e.target.value })}
                          placeholder="עד"
                          className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="border-0 p-0">
                    <legend className="text-brand-navy text-sm font-medium">טווח מחירים (₪)</legend>
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1">
                        <label htmlFor="f-price-min" className="sr-only">
                          מחיר מ-
                        </label>
                        <input
                          id="f-price-min"
                          type="text"
                          inputMode="numeric"
                          value={filters.price_min}
                          onChange={(e) => setFilters({ ...filters, price_min: e.target.value })}
                          placeholder="מ-"
                          className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                      <div className="flex-1">
                        <label htmlFor="f-price-max" className="sr-only">
                          מחיר עד
                        </label>
                        <input
                          id="f-price-max"
                          type="text"
                          inputMode="numeric"
                          value={filters.price_max}
                          onChange={(e) => setFilters({ ...filters, price_max: e.target.value })}
                          placeholder="עד"
                          className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>
                    </div>
                  </fieldset>

                  <div>
                    <label
                      htmlFor="f-mileage-max"
                      className="text-brand-navy block text-sm font-medium"
                    >
                      ק&quot;מ מקסימלי
                    </label>
                    <input
                      id="f-mileage-max"
                      type="text"
                      inputMode="numeric"
                      value={filters.mileage_max}
                      onChange={(e) => setFilters({ ...filters, mileage_max: e.target.value })}
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="f-transmission"
                      className="text-brand-navy block text-sm font-medium"
                    >
                      תיבת הילוכים
                    </label>
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
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <option value="">הכל</option>
                      <option value="automatic">אוטומט</option>
                      <option value="manual">ידני</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="f-fuel" className="text-brand-navy block text-sm font-medium">
                      סוג דלק
                    </label>
                    <select
                      id="f-fuel"
                      dir="rtl"
                      value={filters.fuel_type}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          fuel_type: e.target.value as Filters["fuel_type"],
                        })
                      }
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <option value="">הכל</option>
                      <option value="petrol">בנזין</option>
                      <option value="diesel">דיזל</option>
                      <option value="electric">חשמלי</option>
                      <option value="hybrid">היברידי</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="f-city" className="text-brand-navy block text-sm font-medium">
                      עיר
                    </label>
                    <input
                      id="f-city"
                      type="text"
                      autoComplete="off"
                      value={filters.city}
                      onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="submit"
                    disabled={parsingSmart}
                    aria-busy={parsingSmart || undefined}
                    className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                  >
                    {parsingSmart ? "מנתח…" : "חפש"}
                  </button>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    נקה
                  </button>
                </div>
              </form>
            </section>

            {/* =====================================================
                Results
                ===================================================== */}
            <section aria-labelledby="results-heading">
              <h2 id="results-heading" className="sr-only">
                תוצאות חיפוש
              </h2>

              {error ? (
                <p role="alert" className="bg-danger-bg text-danger-text rounded-md px-4 py-3">
                  {error}
                </p>
              ) : null}

              <div aria-busy={loading || undefined}>
                {loading && !data ? (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {[0, 1, 2, 3].map((i) => (
                      <li
                        key={i}
                        aria-hidden="true"
                        className="border-brand-navy/10 rounded-lg border bg-white p-4"
                      >
                        <div className="bg-brand-navy/10 aspect-[16/9] w-full rounded-md motion-safe:animate-pulse" />
                        <div className="bg-brand-navy/10 mt-3 h-5 w-2/3 rounded motion-safe:animate-pulse" />
                        <div className="bg-brand-navy/10 mt-2 h-4 w-1/2 rounded motion-safe:animate-pulse" />
                      </li>
                    ))}
                  </ul>
                ) : data && data.items.length === 0 ? (
                  // Two distinct empty cases — be explicit about which:
                  //  • no filters set → there genuinely is no B2B inventory
                  //    from other dealers right now (or you're the only
                  //    dealer with B2B listings — the API self-excludes)
                  //  • any filter set → your filter combination matched
                  //    nothing; suggest broadening
                  (() => {
                    const hasAnyFilter = Boolean(
                      filters.q ||
                      filters.make ||
                      filters.model ||
                      filters.year_min ||
                      filters.year_max ||
                      filters.price_min ||
                      filters.price_max ||
                      filters.mileage_max ||
                      filters.transmission ||
                      filters.fuel_type ||
                      filters.city,
                    );
                    return (
                      <div className="border-brand-navy/10 mx-auto max-w-md rounded-lg border bg-white p-10 text-center">
                        <p className="text-brand-navy text-base font-bold">
                          {hasAnyFilter
                            ? "לא נמצאו רכבים תואמים לסינון שלך"
                            : "אין כרגע רכבים פעילים בשוק B2B"}
                        </p>
                        <p className="text-brand-ink/65 mt-2 text-sm leading-relaxed">
                          {hasAnyFilter
                            ? "נסה להרחיב את טווח השנים, המחיר או הק״מ — או לאפס את הסינון לקבלת רשימה מלאה."
                            : "כשסוחרים נוספים יפרסמו רכבים לסחר בין-סוחרים, הם יופיעו כאן. הרכבים שלך עצמך אינם נכללים בשוק."}
                        </p>
                        {hasAnyFilter ? (
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy mt-5 inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            איפוס סינון
                          </button>
                        ) : null}
                      </div>
                    );
                  })()
                ) : data ? (
                  <>
                    <ul className="grid gap-4 sm:grid-cols-2">
                      {data.items.map((v) => (
                        <ResultCard key={v.id} v={v} />
                      ))}
                    </ul>

                    {data.pages > 1 ? (
                      <nav aria-label="ניווט עמודים" className="mt-6 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                          className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                        >
                          הקודם
                        </button>
                        <span className="text-brand-ink/70 inline-flex items-center px-3 text-sm">
                          עמוד {page} מתוך {data.pages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                          disabled={page >= data.pages}
                          className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                        >
                          הבא
                        </button>
                      </nav>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Mobile FAB — opens the filters panel on phones where the
          inline "הצג סינון" toggle is hidden under the results list. */}
      <MobileFAB
        label="פתח סינון"
        icon={<FilterFABIcon />}
        onClick={() => setMobileFiltersOpen(true)}
      />
    </div>
  );
}

function ResultCard({ v }: { v: Result }) {
  const titleId = `mkt-${v.id}-title`;
  const priceF = formatPrice(v.b2b_price ?? v.price);
  const mileageF = formatMileage(v.mileage);
  const fullLabel = `${v.make} ${v.model} שנת ${v.year}`;

  return (
    <li
      className={[
        "overflow-hidden rounded-lg border bg-white",
        v.is_own ? "border-ok ring-ok/30 ring-2" : "border-brand-navy/10",
      ].join(" ")}
    >
      <article aria-labelledby={titleId}>
        <div className="bg-brand-navy/5 relative aspect-[16/9] w-full">
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
          {v.is_own ? (
            <span className="bg-ok absolute end-2 top-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-white shadow">
              <span aria-hidden="true" className="me-1">
                ★
              </span>
              הרכב שלך
            </span>
          ) : null}
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
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-brand-ink/60">סוחר</dt>
              <dd className="text-brand-ink flex flex-wrap items-center gap-2 text-end">
                <span>
                  {v.seller_business_name}
                  {v.seller_city ? ` · ${v.seller_city}` : ""}
                </span>
                <TrustBadge tier={v.seller_tier} compact />
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
}
