"use client";

import { useState, type FormEvent } from "react";

import { apiFetch } from "@/lib/api";

type AssistantAction = { label: string; href: string };
type AssistantResponse = { answer: string; actions: AssistantAction[] };

/**
 * Hero AI search bar for the dealer command center.
 *
 * The visual design is intentionally distinct from any other input in the
 * app — it's the only element on the page with a navy slab background and
 * a gold sparkle icon. Treat it like the "front door" of the dashboard.
 *
 * Submission posts to /api/v1/ai/dashboard-assistant which prefetches the
 * dealer's snapshot (active inventory, sold-this-month, open offers etc.)
 * and asks Claude to answer in Hebrew. The response renders inline below
 * the bar with optional CTA buttons.
 *
 * A11y:
 *   - Native <form> + <button type="submit"> so Enter submits.
 *   - Live response region uses role="status" + aria-live="polite" so
 *     SR users hear the answer when it lands.
 *   - aria-busy on submit during the round-trip.
 *   - Empty-state placeholder is descriptive (Hebrew example query).
 */
export function AISearchBar({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<AssistantResponse>("/api/v1/ai/dashboard-assistant", {
        method: "POST",
        token,
        body: JSON.stringify({ query: q }),
      });
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בעוזר החכם");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="ai-search-heading"
      className="bg-brand-navy text-brand-cream shadow-brand-navy/15 relative overflow-hidden rounded-2xl shadow-xl"
    >
      {/* Decorative gold accent bar at the top edge */}
      <div
        aria-hidden="true"
        className="bg-brand-gold pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-80"
      />

      <div className="p-5 sm:p-7">
        <h2
          id="ai-search-heading"
          className="text-brand-gold flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <SparkIcon />
          עוזר חכם · AutoTradeIL
        </h2>

        <form onSubmit={onSubmit} className="mt-4">
          <label htmlFor="ai-q" className="sr-only">
            שאל את העוזר החכם
          </label>
          <div className="border-brand-gold/30 bg-brand-cream/5 focus-within:border-brand-gold focus-within:bg-brand-cream/10 group relative flex items-center gap-2 rounded-xl border-2 transition-colors">
            <input
              id="ai-q"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חפש רכב, סוחר, מחיר... למשל: BMW 2020 עד 80,000 ₪"
              className="placeholder:text-brand-cream/45 text-brand-cream min-h-[52px] flex-1 bg-transparent px-4 py-3 text-base focus:outline-none sm:text-lg"
            />
            <button
              type="submit"
              disabled={busy || !query.trim()}
              aria-busy={busy || undefined}
              aria-label="חפש"
              className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 focus-visible:outline-brand-gold me-2 ms-1 inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold transition hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:opacity-50 disabled:hover:scale-100"
            >
              {busy ? "…" : <ArrowIcon />}
            </button>
          </div>

          <p className="text-brand-cream/55 mt-3 text-xs leading-relaxed">
            דוגמאות: <span className="text-brand-cream/75">״מה במלאי שלי״</span> ·{" "}
            <span className="text-brand-cream/75">״הצעות פתוחות״</span> ·{" "}
            <span className="text-brand-cream/75">״רכבים מתחת ל-80 אלף״</span>
          </p>
        </form>

        {error ? (
          <p
            role="alert"
            className="bg-danger-bg/90 text-danger-text mt-4 rounded-md px-4 py-3 text-sm"
          >
            {error}
          </p>
        ) : null}

        {response ? (
          <div
            role="status"
            aria-live="polite"
            className="border-brand-gold/35 bg-brand-cream text-brand-ink mt-5 rounded-xl border-s-[3px] p-5"
          >
            <p className="text-brand-navy/70 mb-2 text-xs font-semibold uppercase tracking-[0.18em]">
              תשובת העוזר
            </p>
            <p className="text-brand-ink text-base leading-relaxed">{response.answer}</p>

            {response.actions.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {response.actions.map((a) => (
                  <a
                    key={a.href + a.label}
                    href={a.href}
                    className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span>{a.label}</span>
                    <span aria-hidden="true">←</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}
