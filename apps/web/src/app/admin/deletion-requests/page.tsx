"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, Check, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DialogCloseButton } from "@/components/DialogCloseButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import * as Dialog from "@radix-ui/react-dialog";

/*
 * /admin/deletion-requests — Wave 2 admin inbox for dealer-initiated
 * hard-delete requests.
 *
 *   בקשות מחיקה
 *   ──────────
 *   {N} ממתינות לאישור · רכבים שסוחר ביקש למחוק לצמיתות
 *
 *   ── BMW X3 · 2018
 *   ── סוחר: TalCars · 052-... · talcars@example.com
 *   ── סטטוס לפני הבקשה: פעיל · הוגשה לפני 3 ימים
 *   ── סיבה: "רכב נמכר ידנית מחוץ למערכת ולא יחזור למלאי"
 *   ── [אשר מחיקה] [דחה בקשה]
 *
 * Approve → hard-deletes the inventory row + cascades through offers
 * and images (CDN cleanup is best-effort, after the DB commit).
 * Reject → restores the row to its previous_status (active or hidden)
 * and clears the pending_deletion_* fields.
 *
 * Both actions write an audit_log entry on the backend (commit 3),
 * so a forensic trail survives regardless of which path is taken.
 */

const PREVIOUS_STATUS_LABEL: Record<string, string> = {
  active: "פעיל",
  hidden: "מוסתר",
};

const PENDING_DELETION_KEY = ["admin", "inventory", "pending-deletion"] as const;

type DealerInfo = {
  id: string;
  business_name: string;
  city: string | null;
  phone: string | null;
  email: string | null;
};

type PendingRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  previous_status: string | null;
  pending_deletion_reason: string | null;
  pending_deletion_requested_at: string | null;
  dealer: DealerInfo;
};

type Resp = { items: PendingRow[]; total: number };

const MIN_REJECT_REASON_LENGTH = 10;

export default function AdminDeletionRequestsPage() {
  const { token, loading: authLoading } = useAdminAuth();
  const qc = useQueryClient();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [approveTarget, setApproveTarget] = useState<PendingRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingRow | null>(null);

  const listQuery = useQuery({
    queryKey: PENDING_DELETION_KEY,
    queryFn: () => apiFetch<Resp>("/api/v1/admin/inventory/pending-deletion", { token: token! }),
    enabled: !!token,
  });

  const data = listQuery.data ?? null;

  useEffect(() => {
    if (listQuery.error) {
      setError(
        listQuery.error instanceof Error ? listQuery.error.message : "שגיאה בטעינת בקשות המחיקה",
      );
    }
  }, [listQuery.error]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Approve = hard delete the row. Cascades through offers + images on
  // the backend; Cloudinary cleanup runs after the DB commit and is
  // best-effort.
  const approveMutation = useMutation({
    mutationFn: (row: PendingRow) =>
      apiFetch<{ ok: boolean; id: string; images_cleaned: number; images_failed: number }>(
        `/api/v1/admin/inventory/${row.id}/approve-deletion`,
        { method: "POST", token: token! },
      ),
    onSuccess: async (_res, row) => {
      setToast(`הרכב נמחק: ${row.make} ${row.model} ${row.year}`);
      await qc.invalidateQueries({ queryKey: PENDING_DELETION_KEY });
      await qc.invalidateQueries({ queryKey: queryKeys.admin.auditLog() });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "שגיאה באישור המחיקה"),
  });

  // Reject = restore previous_status, clear pending fields, record the
  // admin's reason in the event log so the dealer can be told why.
  const rejectMutation = useMutation({
    mutationFn: ({ row, reason }: { row: PendingRow; reason: string }) =>
      apiFetch<{ id: string; status: string }>(
        `/api/v1/admin/inventory/${row.id}/reject-deletion`,
        {
          method: "POST",
          token: token!,
          body: JSON.stringify({ reason }),
        },
      ),
    onSuccess: async (_res, vars) => {
      setToast(`הבקשה נדחתה: ${vars.row.make} ${vars.row.model} ${vars.row.year}`);
      await qc.invalidateQueries({ queryKey: PENDING_DELETION_KEY });
      await qc.invalidateQueries({ queryKey: queryKeys.admin.auditLog() });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "שגיאה בדחיית הבקשה"),
  });

  const handleReject = async (row: PendingRow, reason: string) => {
    await rejectMutation.mutateAsync({ row, reason });
    setRejectTarget(null);
  };

  const loading = authLoading || (!data && !error);
  const total = data?.total ?? 0;

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl">
      <AdminMasthead
        title="בקשות מחיקה"
        dek={
          loading ? null : total === 0 ? (
            <span>אין בקשות ממתינות לאישור</span>
          ) : (
            <span>
              <span className="font-tabular">{total}</span>{" "}
              {total === 1 ? "בקשה ממתינה" : "בקשות ממתינות"} · רכבים שסוחר ביקש למחוק לצמיתות
            </span>
          )
        }
        loading={loading}
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

      <section aria-labelledby="list-heading" className="mt-3xl">
        <h2 id="list-heading" className="sr-only">
          רשימת בקשות מחיקה ממתינות
        </h2>

        {loading ? (
          <ListSkeleton />
        ) : !data || data.items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-xl">
            {data.items.map((row) => (
              <li key={row.id}>
                <RequestRow
                  row={row}
                  onApprove={() => setApproveTarget(row)}
                  onReject={() => setRejectTarget(row)}
                  busy={
                    (approveMutation.isPending && approveMutation.variables?.id === row.id) ||
                    (rejectMutation.isPending && rejectMutation.variables?.row.id === row.id)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Approve confirm — hard delete is irreversible. ConfirmDialog's
          danger tone surfaces that. */}
      {approveTarget ? (
        <ConfirmDialog
          open={true}
          onOpenChange={(v) => !v && setApproveTarget(null)}
          title="אישור מחיקה"
          description={
            `מחיקת ${approveTarget.make} ${approveTarget.model} ${approveTarget.year} ` +
            `של ${approveTarget.dealer.business_name} היא פעולה לא ניתנת לביטול. ` +
            `הרכב ימחק לצמיתות יחד עם כל ההצעות שנקשרו אליו.`
          }
          confirmLabel="אשר מחיקה"
          tone="danger"
          onConfirm={async () => {
            await approveMutation.mutateAsync(approveTarget);
            setApproveTarget(null);
          }}
        />
      ) : null}

      {/* Reject dialog — admin types a reason that gets recorded in the
          event log so the dealer can be told why. */}
      {rejectTarget ? (
        <RejectDialog
          row={rejectTarget}
          busy={rejectMutation.isPending}
          onSubmit={(reason) => handleReject(rejectTarget, reason)}
          onClose={() => setRejectTarget(null)}
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// RequestRow — one card per pending request.
// ============================================================================

function RequestRow({
  row,
  onApprove,
  onReject,
  busy,
}: {
  row: PendingRow;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const submittedDate = row.pending_deletion_requested_at
    ? new Date(row.pending_deletion_requested_at).toLocaleString("he-IL")
    : "—";
  const prevLabel =
    row.previous_status && PREVIOUS_STATUS_LABEL[row.previous_status]
      ? PREVIOUS_STATUS_LABEL[row.previous_status]
      : row.previous_status || "—";

  return (
    <article className="border-hairline bg-paper px-lg py-lg space-y-md rounded-md border">
      <header className="gap-md flex items-start justify-between">
        <div className="gap-md flex items-start">
          <div
            aria-hidden="true"
            className="border-hairline bg-muted/5 text-subtle flex h-12 w-16 shrink-0 items-center justify-center rounded-md border"
          >
            <Car className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-ink font-serif text-lg font-medium leading-tight">
              {row.make} {row.model}{" "}
              <span className="text-muted font-tabular font-normal">· {row.year}</span>
            </p>
            <p className="text-muted mt-xxs text-xs">
              סוחר: <span className="text-ink font-medium">{row.dealer.business_name}</span>
              {row.dealer.city ? <span> · {row.dealer.city}</span> : null}
            </p>
          </div>
        </div>
      </header>

      <dl className="gap-xs grid grid-cols-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted text-xs">סטטוס לפני הבקשה</dt>
          <dd className="text-ink font-tabular mt-xxs">{prevLabel}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">הוגשה</dt>
          <dd className="text-ink font-tabular mt-xxs">{submittedDate}</dd>
        </div>
        {row.dealer.phone ? (
          <div>
            <dt className="text-muted text-xs">טלפון סוחר</dt>
            <dd className="text-ink font-tabular mt-xxs" dir="ltr">
              {row.dealer.phone}
            </dd>
          </div>
        ) : null}
        {row.dealer.email ? (
          <div>
            <dt className="text-muted text-xs">אימייל סוחר</dt>
            <dd className="text-ink mt-xxs truncate" dir="ltr">
              {row.dealer.email}
            </dd>
          </div>
        ) : null}
      </dl>

      {row.pending_deletion_reason ? (
        <div className="border-s-accent/40 ps-md border-s-2">
          <p className="text-muted text-xs font-medium uppercase tracking-widest">סיבת הבקשה</p>
          <p className="text-ink mt-xxs whitespace-pre-wrap text-sm leading-relaxed">
            {row.pending_deletion_reason}
          </p>
        </div>
      ) : null}

      <div className="border-hairline pt-md gap-xs flex flex-wrap border-t">
        <Button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="bg-danger text-paper hover:bg-danger/90"
          aria-label={`אישור מחיקת ${row.make} ${row.model} ${row.year}`}
        >
          <Trash2 aria-hidden="true" />
          <span>אשר מחיקה</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onReject}
          aria-label={`דחיית הבקשה על ${row.make} ${row.model} ${row.year}`}
        >
          <X aria-hidden="true" />
          <span>דחה בקשה</span>
        </Button>
      </div>
    </article>
  );
}

// ============================================================================
// RejectDialog — inline reason-input dialog. Admin must type at least
// MIN_REJECT_REASON_LENGTH chars; reason is shown to the dealer in the
// audit / event log on the backend.
// ============================================================================

function RejectDialog({
  row,
  busy,
  onSubmit,
  onClose,
}: {
  row: PendingRow;
  busy: boolean;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const isShort = trimmed.length < MIN_REJECT_REASON_LENGTH;
  const showValidationError = touched && isShort;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (isShort) return;
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בדחיית הבקשה");
    }
  };

  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          aria-hidden="true"
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
        />
        <Dialog.Content
          aria-describedby="reject-desc"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream relative max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl">
            <DialogCloseButton />
            <Dialog.Title className="text-brand-navy pe-12 text-lg font-bold">
              דחיית בקשת מחיקה
            </Dialog.Title>
            <Dialog.Description id="reject-desc" className="text-brand-ink/80 mt-2 text-sm">
              הסיבה תועבר לסוחר ביחד עם פרטי{" "}
              <span className="text-brand-navy font-semibold">
                {row.make} {row.model} {row.year}
              </span>
              . הרכב יחזור לסטטוס שהיה לפני הבקשה.
            </Dialog.Description>

            <form onSubmit={handleSubmit} className="mt-4">
              <label
                htmlFor="reject-reason"
                className="text-brand-navy block text-sm font-semibold"
              >
                סיבת הדחייה
              </label>
              <p id="reject-reason-hint" className="text-brand-ink/60 mt-1 text-xs">
                לפחות {MIN_REJECT_REASON_LENGTH} תווים. תוצג לסוחר ולוג העריכה.
              </p>
              <textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={busy}
                rows={4}
                maxLength={2000}
                aria-invalid={showValidationError || undefined}
                aria-describedby={
                  showValidationError
                    ? "reject-reason-hint reject-reason-error"
                    : "reject-reason-hint"
                }
                className="border-brand-navy/30 focus:border-brand-navy focus:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-offset-0 disabled:opacity-60"
                placeholder="לדוגמה: הרכב עדיין מופיע בעסקה פעילה — לא ניתן למחוק."
              />
              {showValidationError ? (
                <p id="reject-reason-error" role="alert" className="text-danger-text mt-2 text-xs">
                  נדרשים לפחות {MIN_REJECT_REASON_LENGTH} תווים
                </p>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm"
                >
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={busy}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={busy || isShort}
                  aria-busy={busy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {busy ? "שולח…" : "שלח דחייה"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ============================================================================
// Skeleton + empty state
// ============================================================================

function ListSkeleton() {
  return (
    <ul className="space-y-xl" role="status" aria-live="polite">
      <span className="sr-only">טוען בקשות מחיקה…</span>
      {[0, 1].map((i) => (
        <li
          key={i}
          aria-hidden="true"
          className="border-hairline bg-paper px-lg py-lg space-y-md rounded-md border"
        >
          <div className="gap-md flex items-start">
            <Skeleton className="h-12 w-16 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-12 w-full" />
          <div className="gap-xs flex">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="py-3xl flex flex-col items-center text-center">
      <div
        aria-hidden="true"
        className="border-hairline bg-paper text-subtle flex h-16 w-16 items-center justify-center rounded-md border"
      >
        <Check className="h-7 w-7" />
      </div>
      <p className="text-ink mt-lg font-serif text-lg font-medium">אין כרגע בקשות ממתינות</p>
      <p className="text-muted mt-xs max-w-sm text-sm">
        כשסוחר מבקש למחוק רכב לצמיתות, הבקשה תופיע כאן עם פרטי הסוחר והסיבה שמסר.
      </p>
    </div>
  );
}
