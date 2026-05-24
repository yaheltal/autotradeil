"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/dealers/archived — editorial archive view.
 *
 *   ארכיון סוחרים
 *   ──────────
 *   סוחרים שנמחקו ע"י אדמין · ההיסטוריה נשמרת · {N} סוחרים
 *
 *   ── שם עסק                                      [שחזר]
 *   ── ארכוב 12 מאי 2025 · סיבה
 *   ── איש קשר · עיר · email                       [שחזר]
 *
 * Hairline-separated rows, NOT cards. Restore is gated behind a
 * window.prompt for the admin password — preserved verbatim from
 * the legacy implementation since changing the prompt to a dialog
 * is behavior change, not visual rework, and the operator team
 * relies on the current confirmation cadence.
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
  const qc = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const archivedQuery = useQuery({
    queryKey: queryKeys.admin.dealersArchived(),
    queryFn: () =>
      apiFetch<ListResponse>("/api/v1/admin/dealers/archived?per_page=50", { token: token! }),
    enabled: !!token,
  });
  const data = archivedQuery.data ?? null;

  useEffect(() => {
    if (archivedQuery.error) {
      setError(
        archivedQuery.error instanceof Error
          ? archivedQuery.error.message
          : "שגיאה בטעינת ארכיון הסוחרים",
      );
    }
  }, [archivedQuery.error]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const restoreMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiFetch(`/api/v1/admin/dealers/${id}/unarchive`, {
        method: "POST",
        token: token!,
        body: JSON.stringify({ admin_password: password }),
      }),
    onSuccess: () => {
      setToast("הסוחר שוחזר מהארכיון");
      void qc.invalidateQueries({ queryKey: queryKeys.admin.dealersArchived() });
      void qc.invalidateQueries({ queryKey: ["admin", "dealers"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "שגיאה בשחזור"),
  });
  const restoringId = restoreMutation.isPending ? (restoreMutation.variables?.id ?? null) : null;

  const restore = async (id: string) => {
    if (!token) return;
    const pw = window.prompt("סיסמת המנהל שלך לשחזור הסוחר מהארכיון:");
    if (!pw) return;
    await restoreMutation.mutateAsync({ id, password: pw });
  };

  if (authLoading) return null;

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl">
      <AdminMasthead
        title="ארכיון סוחרים"
        dek={<span>סוחרים שנמחקו ע&quot;י אדמין. ההיסטוריה שלהם נשמרת</span>}
        loading={!data}
        count={data ? `${data.total.toLocaleString("he-IL")} סוחרים` : undefined}
        headingRef={headingRef}
      />

      {toast ? (
        <p role="status" aria-live="polite" className="sr-only" key={toast}>
          {toast}
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="archive-heading" className="mt-2xl">
        <h2 id="archive-heading" className="sr-only">
          רשימת סוחרים בארכיון
        </h2>

        {!data ? (
          <ArchiveSkeleton />
        ) : data.items.length === 0 ? (
          <p className="text-muted py-3xl text-center text-sm" role="status">
            אין סוחרים בארכיון כרגע.
          </p>
        ) : (
          <ul>
            {data.items.map((d) => (
              <li
                key={d.id}
                className="border-hairline py-lg flex flex-col gap-3 border-b last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-ink font-serif text-lg font-medium">{d.business_name}</h3>
                  <p className="text-muted mt-xxs text-sm">
                    {d.contact_name}
                    <span aria-hidden="true" className="text-subtle mx-xxs">
                      ·
                    </span>
                    {d.city}
                    <span aria-hidden="true" className="text-subtle mx-xxs">
                      ·
                    </span>
                    <span dir="ltr">{d.email}</span>
                  </p>
                  {d.archived_at ? (
                    <p className="text-subtle mt-xs text-xs">
                      ארכוב:{" "}
                      <time dateTime={d.archived_at} className="font-tabular">
                        {new Date(d.archived_at).toLocaleString("he-IL")}
                      </time>
                      {d.archived_reason ? (
                        <>
                          <span aria-hidden="true" className="text-subtle mx-xxs">
                            ·
                          </span>
                          {d.archived_reason}
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void restore(d.id)}
                  disabled={restoringId === d.id}
                  aria-busy={restoringId === d.id || undefined}
                  className="shrink-0"
                >
                  {restoringId === d.id ? "משחזר…" : "שחזר"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ArchiveSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען ארכיון סוחרים…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-hairline py-lg flex items-center justify-between gap-3 border-b last:border-b-0"
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-10 w-20" />
        </div>
      ))}
    </div>
  );
}
