import { Skeleton } from "@/components/ui/skeleton";

/**
 * AdminMasthead — uniform page header for every /admin/* page.
 *
 *   {title}                                       [actions]
 *   ─────────────────────────────────────────────────────
 *   {dek copy} · {count byline} · {filter byline}        ← font-tabular numbers
 *
 * Structure mirrors the dashboard's editorial masthead (analytics,
 * offers, deals, security): Frank Ruhl H1 + hairline + muted dek with
 * tonal-ink separators. The `count` slot is the admin analog of the
 * dashboard's "trust score" / "KYC status" byline — pending count,
 * total row count, filter summary — whatever is the single most
 * scannable indicator for the page.
 *
 * The `actions` slot lives on the trailing end of the title row so
 * table-style pages (dealers, inventory) can hang a primary CTA
 * ("ארכיון", "ייצוא", "הוסף") at masthead height without breaking
 * the editorial rhythm.
 */
export function AdminMasthead({
  title,
  dek,
  count,
  loading = false,
  actions,
  headingRef,
}: {
  title: string;
  /** Lead copy under the hairline — describes the page in one sentence. */
  dek?: React.ReactNode;
  /**
   * Optional count / status byline appended after the dek with a
   * separator. Pass plain text or a small inline component (status
   * pill, tabular count). Hidden when `loading` is true — replaced
   * by a skeleton bar so the byline width doesn't reflow on data
   * arrival.
   */
  count?: React.ReactNode;
  loading?: boolean;
  /** Trailing-edge content at the title row (primary CTA, link, etc.). */
  actions?: React.ReactNode;
  /**
   * Caller-supplied ref so pages can move keyboard focus to the H1.
   * Typed as `React.Ref<T>` — the union type JSX `ref={}` accepts
   * directly. Works across @types/react 18 and 19 where `useRef<T>(null)`
   * narrows to either `RefObject<T>` or `RefObject<T | null>`.
   */
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <header>
      <div className="gap-md flex items-end justify-between">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
        >
          {title}
        </h1>
        {actions ? <div className="gap-sm flex shrink-0 items-center">{actions}</div> : null}
      </div>
      <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
      {dek || count || loading ? (
        <p className="text-muted gap-xs mt-lg flex flex-wrap items-center text-sm">
          {dek}
          {loading ? (
            <Skeleton className="inline-block h-4 w-32" />
          ) : count ? (
            <>
              {dek ? (
                <span aria-hidden="true" className="text-subtle mx-xxs">
                  ·
                </span>
              ) : null}
              <span className="font-tabular">{count}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </header>
  );
}
