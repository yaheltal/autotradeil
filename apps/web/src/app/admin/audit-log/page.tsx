"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { TablePagination } from "@/components/admin/TablePagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/audit-log — editorial admin action log.
 *
 *   לוג פעולות מנהל
 *   ──────────
 *   כל פעולה של מנהל במערכת נרשמת כאן · {total} רשומות
 *
 *   ┌── מי פעל · פעולה · יעד · מתי ──────────────────────┐
 *   │  hairline-separated rows, font-tabular timestamps   │
 *   └─────────────────────────────────────────────────────┘
 *
 *   הקודם · עמוד N מתוך M · הבא      ← TablePagination primitive
 *
 * Validates the masthead + shadcn Table + TablePagination contract
 * with the lightest payload. Every later list page follows the same
 * shape. No filters / no search — the log is append-only and the
 * page is operator-read-only.
 */

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
  const [page, setPage] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const auditQuery = useQuery({
    queryKey: queryKeys.admin.auditLog({ page, per_page: PER_PAGE }),
    queryFn: () =>
      apiFetch<AuditResponse>(`/api/v1/admin/audit-log?page=${page}&per_page=${PER_PAGE}`, {
        token: token!,
      }),
    enabled: !!token,
  });
  const data = auditQuery.data ?? null;
  const error =
    auditQuery.error instanceof Error
      ? auditQuery.error.message
      : auditQuery.error
        ? "שגיאה בטעינת הלוג"
        : null;

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl">
      <AdminMasthead
        title="לוג פעולות מנהל"
        dek={<span>כל פעולה של מנהל במערכת נרשמת כאן</span>}
        loading={loading || !data}
        count={data ? `${data.total.toLocaleString("he-IL")} רשומות` : undefined}
        headingRef={headingRef}
      />

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="log-heading" className="mt-2xl">
        <h2 id="log-heading" className="sr-only">
          רשומות הלוג
        </h2>

        {!data ? (
          <LogSkeleton />
        ) : data.items.length === 0 ? (
          <p className="text-muted py-3xl text-center text-sm" role="status">
            אין עדיין רשומות בלוג.
          </p>
        ) : (
          <Table>
            <caption className="sr-only">רשומות לוג של פעולות מנהל</caption>
            <TableHeader>
              <TableRow className="border-hairline">
                <TableHead>מי פעל</TableHead>
                <TableHead>פעולה</TableHead>
                <TableHead>יעד</TableHead>
                <TableHead>מתי</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-hairline hover:bg-muted/5 duration-fast transition-colors"
                >
                  <TableCell className="text-ink text-sm">{row.actor_email ?? "—"}</TableCell>
                  <TableCell>
                    <span lang="en" className="font-tabular text-ink text-xs">
                      {row.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted text-sm">
                    {row.target_type ? (
                      <>
                        <span>{row.target_type}</span>
                        <span aria-hidden="true" className="text-subtle mx-xxs">
                          ·
                        </span>
                        <span className="font-tabular">{row.target_id?.slice(0, 8) ?? ""}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted text-xs">
                    <time dateTime={row.created_at} className="font-tabular">
                      {new Date(row.created_at).toLocaleString("he-IL")}
                    </time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {data && pages > 1 ? (
        <TablePagination
          page={page}
          pages={pages}
          onGo={(p) => setPage(Math.max(1, Math.min(pages, p)))}
        />
      ) : null}
    </div>
  );
}

function LogSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען רשומות לוג…</span>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-hairline gap-md py-md flex items-center border-b last:border-b-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ms-auto h-4 w-28" />
        </div>
      ))}
    </div>
  );
}
