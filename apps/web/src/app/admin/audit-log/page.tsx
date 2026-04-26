"use client";

import { useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";

type AuditItem = {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
};

type AuditResponse = { items: AuditItem[]; total: number };

const PER_PAGE = 50;

export default function AuditLogPage() {
  const { token, loading } = useAdminAuth();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<AuditResponse>(
          `/api/v1/admin/audit-log?page=${page}&per_page=${PER_PAGE}`,
          { token },
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה בטעינת הלוג");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, page]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  if (loading || (!data && !error)) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <BackLink href="/admin" label="חזרה ללוח ניהול" />
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy mt-3 text-3xl font-bold tracking-tight focus:outline-none"
        >
          לוג פעולות מנהל
        </h1>
        <p className="text-brand-ink/70 mt-2">כל פעולה של מנהל במערכת נרשמת כאן.</p>

        {error ? (
          <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
            {error}
          </p>
        ) : null}

        <div className="border-brand-navy/10 mt-8 overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[640px] text-start text-sm">
            <caption className="sr-only">רשומות לוג של פעולות מנהל</caption>
            <thead className="bg-brand-navy/5 text-brand-navy">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  מי פעל
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  פעולה
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  יעד
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  מתי
                </th>
              </tr>
            </thead>
            <tbody>
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-brand-ink/60 px-4 py-10 text-center">
                    <span role="status">אין עדיין רשומות בלוג.</span>
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => (
                  <tr key={row.id} className="border-brand-navy/10 hover:bg-brand-navy/5 border-t">
                    <td className="px-4 py-3">{row.actor_email ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs" lang="en">
                      {row.action}
                    </td>
                    <td className="text-brand-ink/80 px-4 py-3">
                      {row.target_type
                        ? `${row.target_type} · ${row.target_id?.slice(0, 8) ?? ""}`
                        : "—"}
                    </td>
                    <td className="text-brand-ink/70 px-4 py-3">
                      {new Date(row.created_at).toLocaleString("he-IL")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && pages > 1 ? (
          <nav aria-label="עימוד" className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              הקודם
            </button>
            <p className="text-brand-ink/70 text-sm">
              עמוד <span className="text-brand-navy font-semibold">{page}</span> מתוך{" "}
              <span className="text-brand-navy font-semibold">{pages}</span>
            </p>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              הבא
            </button>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
