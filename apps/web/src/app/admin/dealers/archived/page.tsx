"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";

/**
 * /admin/dealers/archived — Phase 6.7. List of soft-deleted dealers
 * with their archive metadata + a restore button.
 *
 * Restore is a 2-click prompt for the admin password (uses /unarchive).
 * The auth user was deleted on archive, so a restored dealer would still
 * need to re-register with their email — this page restores the row only.
 */

type ArchivedItem = {
  id: string;
  email: string;
  business_name: string;
  contact_name: string;
  city: string;
  archived_at?: string | null;
  archived_reason?: string | null;
  created_at: string;
};

type ListResponse = {
  items: ArchivedItem[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

export default function ArchivedDealersPage() {
  const { token, loading: authLoading } = useAdminAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    try {
      const res = await apiFetch<ListResponse>("/api/v1/admin/dealers/archived?per_page=50", {
        token,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת ארכיון הסוחרים");
    }
  };

  useEffect(() => {
    if (token) void load();
  }, [token]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  const restore = async (id: string) => {
    if (!token) return;
    const pw = window.prompt("סיסמת המנהל שלך לשחזור הסוחר מהארכיון:");
    if (!pw) return;
    setRestoringId(id);
    try {
      await apiFetch(`/api/v1/admin/dealers/${id}/unarchive`, {
        method: "POST",
        token,
        body: JSON.stringify({ admin_password: pw }),
      });
      setToast("הסוחר שוחזר מהארכיון");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשחזור");
    } finally {
      setRestoringId(null);
    }
  };

  if (authLoading) return null;

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <nav aria-label="ניווט פנימי" className="text-sm">
          <Link
            href="/admin/dealers"
            className="text-brand-navy decoration-brand-gold underline decoration-2 underline-offset-4"
          >
            ← חזרה לרשימת הסוחרים
          </Link>
        </nav>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy mt-6 text-3xl font-bold focus:outline-none"
        >
          ארכיון סוחרים
        </h1>
        <p className="text-brand-ink/70 mt-2">
          סוחרים שנמחקו ע&quot;י אדמין. ההיסטוריה שלהם (מלאי, הצעות, עסקאות) נשמרת.
        </p>

        {toast ? (
          <p
            role="status"
            aria-live="polite"
            className="bg-ok-bg text-ok-text mt-4 rounded-md px-4 py-3 text-sm"
            key={toast}
          >
            {toast}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="bg-danger-bg text-danger-text mt-4 rounded-md px-4 py-3 text-sm"
          >
            {error}
          </p>
        ) : null}

        {data?.items.length === 0 ? (
          <p className="text-brand-ink/60 mt-8">אין סוחרים בארכיון כרגע.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {data?.items.map((d) => (
              <li key={d.id} className="border-brand-navy/10 rounded-lg border bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-brand-navy text-lg font-bold">{d.business_name}</h2>
                    <p className="text-brand-ink/70 mt-1 text-sm">
                      {d.contact_name} · {d.city} · <span dir="ltr">{d.email}</span>
                    </p>
                    {d.archived_at ? (
                      <p className="text-brand-ink/60 mt-2 text-xs">
                        ארכוב:{" "}
                        <time dateTime={d.archived_at}>
                          {new Date(d.archived_at).toLocaleString("he-IL")}
                        </time>
                        {d.archived_reason ? ` — ${d.archived_reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void restore(d.id)}
                    disabled={restoringId === d.id}
                    aria-busy={restoringId === d.id || undefined}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                  >
                    {restoringId === d.id ? "משחזר…" : "שחזר"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
