"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/kyc — editorial review queue.
 *
 *   אימות זהות
 *   ──────────
 *   בקשות ממתינות לבדיקת מסמכים · {N} בקשות
 *
 *   ── שם עסק                         [אשר] [דחה]
 *   ── email · עיר
 *   [3 thumbnails: id_front · id_back · license]
 *   ─────────────────────────────────────────────────
 *
 * Hairline-separated dealer rows (not cards). Each row hosts the 3
 * doc thumbnails inline. Approve/Reject buttons sit on the trailing
 * edge of the row header so operators can act without scrolling.
 *
 * Both dialogs (image viewer + reject reason) ported from inline
 * Radix Dialog to shadcn <Dialog>.
 */

type Pending = {
  id: string;
  business_name: string;
  email: string;
  city: string | null;
  id_card_front_url: string | null;
  id_card_back_url: string | null;
  dealer_license_url: string | null;
};

const DOC_KEYS = ["id_card_front_url", "id_card_back_url", "dealer_license_url"] as const;

const DOC_LABEL: Record<(typeof DOC_KEYS)[number], string> = {
  id_card_front_url: "תעודת זהות — צד קדמי",
  id_card_back_url: "תעודת זהות — צד אחורי",
  dealer_license_url: "רישיון סוחר רכבים",
};

export default function AdminKycPage() {
  const { token, loading } = useAdminAuth();
  const qc = useQueryClient();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const [viewer, setViewer] = useState<{ label: string; url: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Pending | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const pendingQuery = useQuery({
    queryKey: queryKeys.admin.kycPending(),
    queryFn: () => apiFetch<Pending[]>("/api/v1/security/kyc/pending", { token: token! }),
    enabled: !!token,
  });
  const rows = pendingQuery.data ?? null;

  useEffect(() => {
    if (pendingQuery.error) {
      setError(
        pendingQuery.error instanceof Error ? pendingQuery.error.message : "שגיאה בטעינת הבקשות",
      );
    }
  }, [pendingQuery.error]);

  useEffect(() => {
    if (rows !== null) headingRef.current?.focus();
  }, [rows]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const approveMutation = useMutation({
    mutationFn: (dealerId: string) =>
      apiFetch(`/api/v1/security/kyc/${dealerId}/approve`, { method: "POST", token: token! }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.admin.kycPending() });
      queueMicrotask(() => listHeadingRef.current?.focus());
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "שגיאה באישור"),
  });
  const approve = async (dealer: Pending) => {
    await approveMutation.mutateAsync(dealer.id);
    setToast(`${dealer.business_name} — אימות אושר`);
  };

  const rejectMutation = useMutation({
    mutationFn: ({ dealerId, reason }: { dealerId: string; reason: string }) =>
      apiFetch(`/api/v1/security/kyc/${dealerId}/reject`, {
        method: "POST",
        token: token!,
        body: JSON.stringify({ reason }),
      }),
    onSuccess: async () => {
      setRejectTarget(null);
      setRejectReason("");
      await qc.invalidateQueries({ queryKey: queryKeys.admin.kycPending() });
      queueMicrotask(() => listHeadingRef.current?.focus());
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "שגיאה בדחייה"),
  });
  const rejectBusy = rejectMutation.isPending;
  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    await rejectMutation.mutateAsync({ dealerId: rejectTarget.id, reason });
    setToast(`${rejectTarget.business_name} — אימות נדחה`);
  };

  const remaining = 500 - rejectReason.length;

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl">
      <AdminMasthead
        title="אימות זהות"
        dek={<span>בקשות ממתינות לבדיקת מסמכים</span>}
        loading={loading || rows === null}
        count={rows ? `${rows.length} ${rows.length === 1 ? "בקשה" : "בקשות"}` : undefined}
        headingRef={headingRef}
      />

      {toast ? (
        <p
          role="status"
          aria-live="polite"
          aria-label="סטטוס פעולה"
          className="sr-only"
          key={toast}
        >
          {toast}
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <h2 ref={listHeadingRef} tabIndex={-1} className="sr-only focus:outline-none">
        רשימת בקשות
      </h2>

      {rows === null ? (
        <KycListSkeleton />
      ) : rows.length === 0 ? (
        <p className="text-muted py-3xl text-center text-sm" role="status">
          אין בקשות אימות ממתינות.
        </p>
      ) : (
        <ul className="mt-2xl">
          {rows.map((d) => {
            const titleId = `kyc-${d.id}-title`;
            const businessId = `kyc-${d.id}-business`;
            return (
              <li key={d.id} className="border-hairline py-xl border-b last:border-b-0">
                <article aria-labelledby={titleId}>
                  <header className="gap-md flex flex-wrap items-start justify-between">
                    <div>
                      <h3 id={titleId} className="text-ink font-serif text-lg font-medium">
                        <span id={businessId}>{d.business_name}</span>
                      </h3>
                      <p className="text-muted mt-xxs text-sm">
                        <span dir="ltr">{d.email}</span>
                        {d.city ? (
                          <>
                            <span aria-hidden="true" className="text-subtle mx-xxs">
                              ·
                            </span>
                            {d.city}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="gap-xs flex shrink-0">
                      <Button
                        type="button"
                        onClick={() => void approve(d)}
                        disabled={approveMutation.isPending}
                        aria-describedby={businessId}
                      >
                        <Check aria-hidden="true" />
                        <span>אשר</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setRejectTarget(d);
                          setRejectReason("");
                        }}
                        aria-describedby={businessId}
                        className="text-danger-fg border-danger/30 hover:bg-danger-bg"
                      >
                        <X aria-hidden="true" />
                        <span>דחה</span>
                      </Button>
                    </div>
                  </header>

                  <ul className="gap-md mt-lg grid grid-cols-1 sm:grid-cols-3">
                    {DOC_KEYS.map((key) => {
                      const url = d[key];
                      const label = DOC_LABEL[key];
                      return (
                        <li key={key}>
                          <p className="text-muted mb-xs text-xs">{label}</p>
                          {url ? (
                            <button
                              type="button"
                              onClick={() => setViewer({ label, url })}
                              aria-label={`הצג ${label} של ${d.business_name}`}
                              className="border-hairline duration-fast hover:border-ink focus-visible:outline-accent bg-paper block aspect-[4/3] w-full overflow-hidden rounded-md border transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <p className="border-hairline text-subtle bg-paper flex aspect-[4/3] items-center justify-center rounded-md border text-xs">
                              חסר
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── DOC VIEWER DIALOG ──────────────────────────────────────── */}
      <Dialog open={!!viewer} onOpenChange={(v) => !v && setViewer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewer?.label}</DialogTitle>
          </DialogHeader>
          {viewer ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewer.url}
                alt={viewer.label}
                className="mt-md max-h-[70vh] w-full rounded-md object-contain"
              />
              <a
                href={viewer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink duration-fast hover:text-accent focus-visible:outline-accent mt-sm inline-block text-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                פתח בכרטיסייה חדשה
              </a>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── REJECT DIALOG ──────────────────────────────────────────── */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => !v && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>דחיית אימות זהות</DialogTitle>
            <DialogDescription>הסוחר יקבל את הסיבה במייל. פעולה לא ניתנת לביטול.</DialogDescription>
          </DialogHeader>

          <div className="mt-md">
            <Label htmlFor="reject-reason">
              סיבת הדחייה
              <span aria-hidden="true" className="text-danger-fg ms-xxs">
                *
              </span>
            </Label>
            <Textarea
              id="reject-reason"
              rows={4}
              maxLength={500}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              aria-describedby="reject-reason-count"
              className="mt-xs"
            />
            <p id="reject-reason-count" aria-live="polite" className="text-muted mt-xxs text-xs">
              נותרו <span className="font-tabular">{remaining}</span> תווים
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void submitReject()}
              disabled={rejectBusy || !rejectReason.trim()}
              aria-busy={rejectBusy || undefined}
            >
              {rejectBusy ? "דוחה…" : "דחה ושלח מייל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KycListSkeleton() {
  return (
    <div className="mt-2xl" role="status" aria-live="polite">
      <span className="sr-only">טוען בקשות אימות…</span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="border-hairline py-xl border-b last:border-b-0">
          <div className="gap-md flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="gap-xs flex">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-20" />
            </div>
          </div>
          <div className="gap-md mt-lg grid grid-cols-1 sm:grid-cols-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="space-y-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="aspect-[4/3] w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
