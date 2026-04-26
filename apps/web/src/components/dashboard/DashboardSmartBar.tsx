"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

/*
 * DashboardSmartBar — natural-language command bar above the
 * CommandCenter on /dashboard.
 *
 * The dealer types a Hebrew query like:
 *   "מה במלאי שלי" → answer + button → /dashboard/inventory
 *   "רכבים מתחת ל-80 אלף בשוק" → answer + button → /dashboard/marketplace
 *     ?price_max=80000
 *   "הצעות פתוחות" → answer + button → /dashboard/offers
 *
 * Backed by the existing /api/v1/ai/dashboard-assistant endpoint
 * which prefetches the dealer's own counts and feeds them to Claude
 * as system context, returning {answer, actions[]}.
 *
 * Visual: a soft cream card with a single inline input, no navy slab.
 * The previous version used a heavy navy hero; the dealer asked for
 * something quieter that lives inside the dashboard composition.
 *
 * A11y:
 *   - <form role="search"> with aria-label
 *   - Submit button has aria-busy while parsing
 *   - Response card announced via role=status aria-live=polite
 *     so SR users hear the answer once it lands without it being
 *     re-announced on focus shifts.
 *   - Action buttons render as <Link>s — keyboard navigation works
 *     out of the box, focus-visible styling preserved.
 *   - role="dialog" intentionally NOT used; this is inline content,
 *     not a modal.
 */

type Action = { label: string; href: string };
type AssistantResponse = { answer: string; actions: Action[] };

type Suggestion = {
  label: string;
  query: string;
};

const SUGGESTIONS: Suggestion[] = [
  { label: "המלאי שלי", query: "מה במלאי שלי?" },
  { label: "רכבים בשוק עד 80K", query: "רכבים מתחת ל-80 אלף בשוק" },
  { label: "הצעות פתוחות", query: "הראה לי הצעות פתוחות" },
  { label: "מכירות החודש", query: "כמה מכרתי החודש?" },
];

export function DashboardSmartBar({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Move focus to the response card on arrival so SR + sighted
  // keyboard users land on the answer rather than staying in the
  // input.
  useEffect(() => {
    if (response) responseRef.current?.focus();
  }, [response]);

  const ask = async (q: string) => {
    if (!q.trim() || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<AssistantResponse>("/api/v1/ai/dashboard-assistant", {
        method: "POST",
        token,
        body: JSON.stringify({ query: q.trim() }),
      });
      setResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בעוזר");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void ask(query);
  };

  const dismiss = () => {
    setResponse(null);
    setQuery("");
  };

  return (
    <section
      aria-labelledby="smart-bar-heading"
      className="border-brand-navy/10 mt-6 rounded-xl border bg-white p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-brand-gold text-xl leading-none">
          ✦
        </span>
        <h2 id="smart-bar-heading" className="text-brand-navy text-base font-bold">
          שאל אותי כל דבר
        </h2>
      </div>
      <p className="text-brand-ink/70 mt-1 text-sm">חיפוש חכם בעברית — מלאי, שוק, הצעות, עסקאות.</p>

      <form
        role="search"
        aria-label="עוזר חכם לדאשבורד"
        onSubmit={onSubmit}
        className="mt-3 flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="smart-bar-input" className="sr-only">
          שאלה לעוזר
        </label>
        <input
          id="smart-bar-input"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='למשל: "מה במלאי שלי?" או "רכבים מתחת ל-80 אלף בשוק"'
          className="border-brand-navy/20 focus-visible:outline-brand-navy block w-full flex-1 rounded-md border bg-white px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          aria-busy={busy || undefined}
          className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-32"
        >
          {busy ? "שואל…" : "שאל"}
        </button>
      </form>

      {/* Suggestion chips — one-tap shortcuts, hidden once the user
          gets a response so we don't stack two layers of CTAs */}
      {!response ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s.query}>
              <button
                type="button"
                onClick={() => {
                  setQuery(s.query);
                  void ask(s.query);
                }}
                disabled={busy}
                className="border-brand-navy/15 text-brand-navy hover:bg-brand-navy/5 hover:border-brand-gold focus-visible:outline-brand-navy inline-flex min-h-9 items-center rounded-full border bg-white px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="bg-danger-bg text-danger-text mt-3 rounded-md px-4 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {response ? (
        <div
          ref={responseRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="border-brand-gold/40 bg-brand-cream/60 mt-3 rounded-lg border p-4 focus:outline-none"
          key={response.answer}
        >
          <p className="text-brand-ink whitespace-pre-line text-sm leading-relaxed">
            {response.answer}
          </p>
          {response.actions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {response.actions.map((a) => (
                <Link
                  key={`${a.label}-${a.href}`}
                  href={a.href}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-10 items-center justify-center rounded-md px-4 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {a.label}
                  <span aria-hidden="true" className="ms-1.5">
                    →
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="text-brand-ink/60 hover:text-brand-navy focus-visible:outline-brand-navy mt-3 inline-flex items-center gap-1 rounded text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            שאל משהו אחר
          </button>
        </div>
      ) : null}
    </section>
  );
}
