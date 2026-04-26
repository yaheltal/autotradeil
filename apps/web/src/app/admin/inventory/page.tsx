"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import { apiFetch } from "@/lib/api";

/*
 * Admin all-inventory page (Phase 4.3).
 *
 * A11y (approved):
 *   - Real <table> with sr-only <caption> + <th scope="col"> per req #5.
 *   - Filter bar inside <form role="search"> with labeled inputs.
 *   - Only the first cell (vehicle) is a <Link>; per-row click avoided.
 *   - H1 focusable on load; pagination status has aria-live="polite".
 */

type Row = {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  b2b_price: number | null;
  b2c_price: number | null;
  visibility: "private" | "b2b" | "b2c" | "both";
  status: "active" | "sold" | "hidden";
  paused_until: string | null;
  dealer_id: string;
  dealer_business_name: string;
  dealer_city: string | null;
};

type Resp = {
  items: Row[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

const VISIBILITY_LABEL: Record<Row["visibility"], string> = {
  private: "פרטי",
  b2b: "B2B",
  b2c: "B2C",
  both: "שניהם",
};

const STATUS_LABEL: Record<Row["status"], string> = {
  active: "פעיל",
  sold: "נמכר",
  hidden: "מוסתר",
};

export default function AdminInventoryPage() {
  const { token, loading } = useAdminAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ visibility: "", status: "", make: "", model: "" });
  const [smartQuery, setSmartQuery] = useState("");
  const [pageAnnounce, setPageAnnounce] = useState("");

  const { parse: parseSmart, busy: parsingSmart } = useSmartFilters(token);

  const h1Ref = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "20" });
      if (f.visibility) qs.set("visibility", f.visibility);
      if (f.status) qs.set("status", f.status);
      if (f.make) qs.set("make", f.make);
      if (f.model) qs.set("model", f.model);
      const res = await apiFetch<Resp>(`/api/v1/admin/inventory?${qs}`, { token });
      setData(res);
      setPageAnnounce(`מציג ${res.items.length} מתוך ${res.total} רכבים`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינה");
    }
  }, [token, page, f]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data) h1Ref.current?.focus();
  }, [data]);

  if (loading || !token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Link
          href="/admin"
          className="text-brand-navy focus-visible:outline-brand-navy inline-flex items-center gap-1 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">→</span>
          חזרה ללוח ניהול
        </Link>

        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-brand-navy mt-4 text-3xl font-bold tracking-tight focus:outline-none"
        >
          כל הרכבים במערכת
        </h1>

        <p role="status" aria-live="polite" className="sr-only" key={pageAnnounce}>
          {pageAnnounce}
        </p>

        <form
          role="search"
          aria-label="סינון רכבים"
          onSubmit={async (e) => {
            e.preventDefault();
            setPage(1);
            // Smart-search: parse the free-text query and merge make/
            // model into the explicit filters before reload. Explicit
            // dropdowns win — Claude only fills gaps.
            const q = smartQuery.trim();
            if (q) {
              const parsed = await parseSmart(q);
              if (parsed) {
                setF((prev) => ({
                  ...prev,
                  make: prev.make || parsed.filters.make || "",
                  model: prev.model || parsed.filters.model || "",
                }));
              }
            }
            void load();
          }}
          className="border-brand-navy/10 mt-6 rounded-lg border bg-white p-4"
        >
          {/* Smart search row */}
          <div className="mb-3">
            <label htmlFor="f-smart" className="text-brand-navy block text-xs font-semibold">
              חיפוש חכם
              <span
                aria-hidden="true"
                title="חיפוש חופשי בעברית — Claude יזהה אוטומטית יצרן/דגם"
                className="text-brand-gold ms-1.5 text-xs"
              >
                ✦
              </span>
            </label>
            <input
              id="f-smart"
              type="search"
              autoComplete="off"
              value={smartQuery}
              onChange={(e) => setSmartQuery(e.target.value)}
              placeholder='למשל: "BMW X3" או "טויוטה היברידית"'
              aria-describedby="f-smart-hint"
              className="border-brand-navy/20 focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <p id="f-smart-hint" className="text-brand-ink/55 mt-1 text-xs">
              ניתן להזין משפט בעברית — המערכת תחלץ אוטומטית יצרן + דגם
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="f-vis" className="text-brand-navy block text-xs font-semibold">
                חשיפה
              </label>
              <select
                id="f-vis"
                dir="rtl"
                value={f.visibility}
                onChange={(e) => setF({ ...f, visibility: e.target.value })}
                className="border-brand-navy/20 focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <option value="">הכל</option>
                <option value="private">פרטי</option>
                <option value="b2b">B2B</option>
                <option value="b2c">B2C</option>
                <option value="both">שניהם</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-status" className="text-brand-navy block text-xs font-semibold">
                סטטוס
              </label>
              <select
                id="f-status"
                dir="rtl"
                value={f.status}
                onChange={(e) => setF({ ...f, status: e.target.value })}
                className="border-brand-navy/20 focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <option value="">הכל</option>
                <option value="active">פעיל</option>
                <option value="sold">נמכר</option>
                <option value="hidden">מוסתר</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-make" className="text-brand-navy block text-xs font-semibold">
                יצרן
              </label>
              <input
                id="f-make"
                type="text"
                value={f.make}
                onChange={(e) => setF({ ...f, make: e.target.value })}
                className="border-brand-navy/20 focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
            <div>
              <label htmlFor="f-model" className="text-brand-navy block text-xs font-semibold">
                דגם
              </label>
              <input
                id="f-model"
                type="text"
                value={f.model}
                onChange={(e) => setF({ ...f, model: e.target.value })}
                className="border-brand-navy/20 focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={parsingSmart}
              aria-busy={parsingSmart || undefined}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              חפש
            </button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
            {error}
          </p>
        ) : null}

        {data === null ? (
          <div role="status" aria-live="polite" className="mt-6">
            <span className="sr-only">טוען רכבים…</span>
            <div className="border-brand-navy/10 overflow-hidden rounded-lg border bg-white">
              <div className="bg-brand-navy/5 h-12" />
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="border-brand-navy/10 grid grid-cols-5 gap-4 border-t px-4 py-3"
                >
                  {[0, 1, 2, 3, 4].map((c) => (
                    <div
                      key={c}
                      className="bg-brand-navy/10 h-4 w-full rounded motion-safe:animate-pulse"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : data.items.length === 0 ? (
          <p className="border-brand-navy/10 text-brand-ink/60 mt-6 rounded-lg border bg-white p-10 text-center">
            לא נמצאו רכבים תואמים
          </p>
        ) : (
          <>
            {/* Desktop: dense table. Mobile: stacked card list — the
                table was overflow-x scrolling and the small underlined
                title was the only click target, which made admins
                think "click does nothing" on phones. */}
            <ul className="mt-6 grid gap-3 md:hidden" aria-label="כל הרכבים במערכת">
              {data.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/inventory/${r.id}`}
                    className="border-brand-navy/15 hover:border-brand-gold focus-visible:outline-brand-navy block rounded-lg border bg-white p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-brand-navy truncate text-base font-bold">
                          {r.make} {r.model} {r.year}
                        </p>
                        <p className="text-brand-ink/70 mt-0.5 truncate text-sm">
                          {r.dealer_business_name}
                          {r.dealer_city ? ` · ${r.dealer_city}` : ""}
                        </p>
                        <div className="text-brand-ink/70 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span>חשיפה: {VISIBILITY_LABEL[r.visibility]}</span>
                          <span>סטטוס: {STATUS_LABEL[r.status]}</span>
                          {r.paused_until ? (
                            <span>⏸ עד {new Date(r.paused_until).toLocaleString("he-IL")}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-brand-navy shrink-0 text-end">
                        <p className="text-base font-bold">₪ {r.price.toLocaleString("he-IL")}</p>
                        <span
                          aria-hidden="true"
                          className="text-brand-gold mt-1 inline-block text-lg"
                        >
                          ←
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="border-brand-navy/10 mt-6 hidden overflow-x-auto rounded-lg border bg-white md:block">
              <table className="w-full text-start text-sm">
                <caption className="sr-only">כל הרכבים במערכת</caption>
                <thead className="bg-brand-navy/5">
                  <tr>
                    <th scope="col" className="text-brand-navy px-4 py-2 text-start font-semibold">
                      רכב
                    </th>
                    <th scope="col" className="text-brand-navy px-4 py-2 text-start font-semibold">
                      סוחר
                    </th>
                    <th scope="col" className="text-brand-navy px-4 py-2 text-start font-semibold">
                      חשיפה
                    </th>
                    <th scope="col" className="text-brand-navy px-4 py-2 text-start font-semibold">
                      סטטוס
                    </th>
                    <th scope="col" className="text-brand-navy px-4 py-2 text-start font-semibold">
                      מחיר
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr
                      key={r.id}
                      className="border-brand-navy/10 hover:bg-brand-navy/5 border-t transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/inventory/${r.id}`}
                          className="text-brand-navy focus-visible:outline-brand-navy rounded font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {r.make} {r.model} {r.year}
                        </Link>
                      </td>
                      <td className="text-brand-ink/80 px-4 py-3">
                        {r.dealer_business_name}
                        {r.dealer_city ? ` · ${r.dealer_city}` : ""}
                      </td>
                      <td className="px-4 py-3">{VISIBILITY_LABEL[r.visibility]}</td>
                      <td className="px-4 py-3">
                        {STATUS_LABEL[r.status]}
                        {r.paused_until ? (
                          <span className="text-brand-ink/60 ms-2 text-xs">
                            ⏸ עד {new Date(r.paused_until).toLocaleString("he-IL")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ₪ {r.price.toLocaleString("he-IL")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pages > 1 ? (
              <nav aria-label="ניווט עמודים" className="mt-4 flex justify-center gap-2">
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
        )}
      </div>
    </main>
  );
}
