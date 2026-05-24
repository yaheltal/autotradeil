"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { AdminStatusPill } from "@/components/admin/AdminStatusPill";
import { ArchiveDealerDialog } from "@/components/admin/ArchiveDealerDialog";
import { SilentSuspendDialog } from "@/components/admin/SilentSuspendDialog";
import { SuspendWithReasonDialog } from "@/components/admin/SuspendWithReasonDialog";
import { RejectDealerDialog } from "@/components/RejectDealerDialog";
import { deriveStatus } from "@/components/StatusBadge";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/dealers/[id] — editorial deep-read on a single dealer.
 *
 *   {business_name}                              ← Frank Ruhl 4xl
 *   ──────────
 *   {email} · {status pill} · {tier} · [מושעה]
 *
 *   [פרטים · מלאי · עסקאות · הצעות · KYC]      ← shadcn Tabs
 *
 *   פרטים tab:
 *     פרטי העסק                                  ← eyebrow
 *     ──────────
 *     dl rows (ח.פ · רישיון · איש קשר · ...)
 *
 *     פעולות
 *     ──────────
 *     state-dependent action buttons
 *
 *   KYC tab:
 *     status pill + 3 photo cards + approve/reject
 *
 * Heaviest admin page — last commit because the shared primitives
 * (masthead, status pill, dialog conventions) had to be battle-
 * tested first. The 3 external admin action dialogs (Archive /
 * SilentSuspend / SuspendWithReason) are preserved verbatim from
 * @/components/admin/* — they're slated for their own pass.
 */

type Dealer = {
  id: string;
  user_id: string;
  email: string;
  business_name: string;
  business_id: string;
  license_number: string;
  contact_name: string;
  city: string;
  phone: string;
  lot_size: number;
  verified: boolean;
  rejection_reason: string | null;
  rejected_at: string | null;
  verified_at: string | null;
  tier: Tier;
  trust_score: number | string;
  created_at: string;
  deals_completed: number;
  kyc_status: "pending" | "submitted" | "approved" | "rejected";
  member_since: string | null;
  suspended_at: string | null;
};

type TabId = "details" | "inventory" | "deals" | "offers" | "kyc";

const TABS: { id: TabId; label: string }[] = [
  { id: "details", label: "פרטים" },
  { id: "inventory", label: "מלאי" },
  { id: "deals", label: "עסקאות" },
  { id: "offers", label: "הצעות" },
  { id: "kyc", label: "KYC" },
];

type ImpersonationResponse = {
  impersonation_token: string;
  dealer_id: string;
  business_name: string;
  expires_in_seconds: number;
};

function dealerStatusVariant(d: {
  verified: boolean;
  rejected_at: string | null;
  suspended_at: string | null;
}): { variant: "ink" | "neutral" | "accent" | "danger"; label: string } {
  if (d.suspended_at) return { variant: "danger", label: "מושעה" };
  if (d.rejected_at) return { variant: "danger", label: "נדחה" };
  if (d.verified) return { variant: "ink", label: "מאושר" };
  return { variant: "neutral", label: "ממתין" };
}

export default function DealerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, loading } = useAdminAuth();
  const router = useRouter();

  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [toast, setToast] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [suspendWithReasonOpen, setSuspendWithReasonOpen] = useState(false);
  const [silentSuspendOpen, setSilentSuspendOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("details");
  const suspendTriggerRef = useRef<HTMLButtonElement>(null);

  const dealerQuery = useQuery({
    queryKey: queryKeys.admin.dealer(id ?? ""),
    queryFn: () => apiFetch<Dealer>(`/api/v1/admin/dealers/${id}`, { token: token! }),
    enabled: !!token && !!id,
  });
  const dealer = dealerQuery.data ?? null;
  const error =
    dealerQuery.error instanceof Error
      ? dealerQuery.error.message
      : dealerQuery.error
        ? "שגיאה בטעינת הסוחר"
        : null;

  const load = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.admin.dealer(id ?? "") });
  };

  useEffect(() => {
    if (dealer) headingRef.current?.focus();
  }, [dealer]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const verifyMutation = useMutation({
    mutationFn: (dealerId: string) =>
      apiFetch(`/api/v1/admin/dealers/${dealerId}/verify`, { method: "POST", token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.dealer(id ?? "") }),
    onError: (e) => setActionError(e instanceof Error ? e.message : "שגיאה באישור"),
  });
  const verify = async () => {
    if (!dealer) return;
    setActionError(null);
    await verifyMutation.mutateAsync(dealer.id);
  };

  const rejectMutation = useMutation({
    mutationFn: ({ dealerId, reason }: { dealerId: string; reason: string }) =>
      apiFetch(`/api/v1/admin/dealers/${dealerId}/reject`, {
        method: "POST",
        token: token!,
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.dealer(id ?? "") }),
  });
  const reject = async (reason: string) => {
    if (!dealer) return;
    await rejectMutation.mutateAsync({ dealerId: dealer.id, reason });
  };

  const resetPasswordMutation = useMutation({
    mutationFn: (dealerId: string) =>
      apiFetch(`/api/v1/admin/dealers/${dealerId}/reset-password`, {
        method: "POST",
        token: token!,
      }),
    onSuccess: () => setToast("מייל איפוס נשלח לסוחר"),
    onError: (e) => setActionError(e instanceof Error ? e.message : "שגיאה"),
  });
  const resetPassword = async () => {
    if (!dealer) return;
    setActionError(null);
    await resetPasswordMutation.mutateAsync(dealer.id);
  };

  const unsuspendMutation = useMutation({
    mutationFn: ({ dealerId, password }: { dealerId: string; password: string }) =>
      apiFetch(`/api/v1/admin/dealers/${dealerId}/unsuspend`, {
        method: "POST",
        token: token!,
        body: JSON.stringify({ admin_password: password }),
      }),
    onSuccess: () => {
      setToast("הושעיה בוטלה");
      void qc.invalidateQueries({ queryKey: queryKeys.admin.dealer(id ?? "") });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "שגיאה"),
  });
  const unsuspend = async () => {
    if (!dealer) return;
    const pw = window.prompt("סיסמת המנהל שלך לאישור ביטול ההשעיה:");
    if (!pw) return;
    await unsuspendMutation.mutateAsync({ dealerId: dealer.id, password: pw });
  };

  const impersonateMutation = useMutation({
    mutationFn: (dealerId: string) =>
      apiFetch<ImpersonationResponse>(`/api/v1/admin/impersonate/${dealerId}`, {
        method: "POST",
        token: token!,
      }),
    onSuccess: (res) => {
      window.sessionStorage.setItem("impersonation_token", res.impersonation_token);
      window.sessionStorage.setItem("impersonation_business_name", res.business_name);
      window.sessionStorage.setItem("impersonation_dealer_id", res.dealer_id);
      window.sessionStorage.setItem("impersonation_just_activated", "1");
      router.push("/dashboard");
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "שגיאה בהתחזות"),
  });
  const impersonate = async () => {
    if (!dealer) return;
    setActionError(null);
    await impersonateMutation.mutateAsync(dealer.id);
  };

  const actionBusy =
    verifyMutation.isPending ||
    rejectMutation.isPending ||
    resetPasswordMutation.isPending ||
    unsuspendMutation.isPending ||
    impersonateMutation.isPending;

  const pageLoading = loading || (!dealer && !error);
  const status = dealer ? dealerStatusVariant(dealer) : null;
  const derivedStatus = dealer ? deriveStatus(dealer) : null;
  const isSuspended = !!dealer?.suspended_at;

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl">
      <AdminMasthead
        title={dealer?.business_name ?? "טוען סוחר…"}
        dek={dealer ? <span dir="ltr">{dealer.email}</span> : undefined}
        loading={pageLoading}
        count={
          dealer && status ? (
            <span className="gap-xs flex flex-wrap items-center">
              <AdminStatusPill variant={status.variant} withCheck={status.variant === "accent"}>
                {status.label}
              </AdminStatusPill>
              <TrustBadge tier={dealer.tier} compact />
            </span>
          ) : undefined
        }
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

      {actionError ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {pageLoading || !dealer ? (
        <DealerDetailSkeleton />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="mt-2xl">
          <TabsList aria-label="טאבי סוחר">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── DETAILS TAB ─────────────────────────────────────────── */}
          <TabsContent value="details" className="mt-2xl">
            <section aria-labelledby="biz-heading">
              <p className="text-muted text-xs font-medium uppercase tracking-widest">פרטי העסק</p>
              <h2 id="biz-heading" className="sr-only">
                פרטי העסק
              </h2>
              <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

              <dl className="gap-x-2xl gap-y-md mt-lg grid grid-cols-1 sm:grid-cols-2">
                <DRow label="ח.פ / ע.מ" value={dealer.business_id} />
                <DRow label="רישיון סחר" value={dealer.license_number} />
                <DRow label="איש קשר" value={dealer.contact_name} />
                <DRow label="טלפון" value={<span dir="ltr">{dealer.phone}</span>} />
                <DRow label="עיר" value={dealer.city} />
                <DRow
                  label="גודל חצר"
                  value={<span className="font-tabular">{dealer.lot_size}</span>}
                />
                <DRow label="דרגה" value={<span lang="en">{dealer.tier}</span>} />
                <DRow
                  label="ציון אמון"
                  value={<span className="font-tabular">{dealer.trust_score}</span>}
                />
                <DRow
                  label="תאריך הרשמה"
                  value={
                    <time dateTime={dealer.created_at} className="font-tabular">
                      {new Date(dealer.created_at).toLocaleDateString("he-IL")}
                    </time>
                  }
                />
                {dealer.verified_at ? (
                  <DRow
                    label="אושר בתאריך"
                    value={
                      <time dateTime={dealer.verified_at} className="font-tabular">
                        {new Date(dealer.verified_at).toLocaleDateString("he-IL")}
                      </time>
                    }
                  />
                ) : null}
                {dealer.rejected_at ? (
                  <DRow
                    label="נדחה בתאריך"
                    value={
                      <time dateTime={dealer.rejected_at} className="font-tabular">
                        {new Date(dealer.rejected_at).toLocaleDateString("he-IL")}
                      </time>
                    }
                  />
                ) : null}
              </dl>

              {dealer.rejection_reason ? (
                <Alert variant="destructive" className="mt-xl">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    <span className="font-medium">סיבת דחייה: </span>
                    {dealer.rejection_reason}
                  </AlertDescription>
                </Alert>
              ) : null}
            </section>

            <section aria-labelledby="actions-heading" className="mt-3xl">
              <p className="text-muted text-xs font-medium uppercase tracking-widest">פעולות</p>
              <h2 id="actions-heading" className="sr-only">
                פעולות
              </h2>
              <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

              {derivedStatus === "pending" ? (
                <div className="gap-sm mt-lg flex flex-wrap">
                  <Button
                    type="button"
                    onClick={verify}
                    disabled={actionBusy}
                    aria-busy={actionBusy || undefined}
                  >
                    <Check aria-hidden="true" />
                    <span>אשר סוחר</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRejectOpen(true)}
                    disabled={actionBusy}
                    className="text-danger-fg border-danger/30 hover:bg-danger-bg"
                  >
                    <X aria-hidden="true" />
                    <span>דחה סוחר</span>
                  </Button>
                </div>
              ) : derivedStatus === "verified" ? (
                <div className="gap-sm mt-lg flex flex-wrap">
                  <Button
                    type="button"
                    onClick={impersonate}
                    disabled={actionBusy}
                    aria-busy={actionBusy || undefined}
                  >
                    {actionBusy ? "מתחבר…" : "התחבר בתור סוחר"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetPassword}
                    disabled={actionBusy}
                  >
                    אפס סיסמה
                  </Button>
                  {isSuspended ? (
                    <Button type="button" onClick={unsuspend} disabled={actionBusy}>
                      בטל הושעיה
                    </Button>
                  ) : (
                    <>
                      <Button
                        ref={suspendTriggerRef}
                        type="button"
                        variant="outline"
                        onClick={() => setSuspendWithReasonOpen(true)}
                        disabled={actionBusy}
                        className="text-warn-fg border-warn/40 hover:bg-warn-bg"
                      >
                        <AlertTriangle aria-hidden="true" />
                        <span>השעה עם סיבה</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSilentSuspendOpen(true)}
                        disabled={actionBusy}
                        className="text-warn-fg border-warn/40 hover:bg-warn-bg"
                      >
                        <AlertTriangle aria-hidden="true" />
                        <span>השעה בשקט</span>
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setArchiveOpen(true)}
                    disabled={actionBusy}
                    className="text-danger-fg border-danger/30 hover:bg-danger-bg"
                  >
                    <X aria-hidden="true" />
                    <span>מחק (העבר לארכיון)</span>
                  </Button>
                </div>
              ) : (
                <div className="mt-lg">
                  <Button
                    type="button"
                    onClick={verify}
                    disabled={actionBusy}
                    aria-busy={actionBusy || undefined}
                  >
                    בטל דחייה ואשר
                  </Button>
                </div>
              )}
            </section>
          </TabsContent>

          {/* ── INVENTORY TAB ──────────────────────────────────────── */}
          <TabsContent value="inventory" className="mt-2xl">
            <section aria-labelledby="inv-heading">
              <p className="text-muted text-xs font-medium uppercase tracking-widest">
                המלאי של הסוחר
              </p>
              <h2 id="inv-heading" className="sr-only">
                המלאי של הסוחר
              </h2>
              <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
              <p className="text-muted mt-lg text-sm">
                צפה בכל הרכבים של הסוחר עם סינון מלא לפי סטטוס וחשיפה.
              </p>
              <Button asChild className="mt-lg">
                <Link href={`/admin/inventory?dealer_id=${dealer.id}`}>פתח רשימת מלאי מסוננת</Link>
              </Button>
            </section>
          </TabsContent>

          {/* ── DEALS TAB ──────────────────────────────────────────── */}
          <TabsContent value="deals" className="mt-2xl">
            <section aria-labelledby="deals-heading">
              <p className="text-muted text-xs font-medium uppercase tracking-widest">
                עסקאות הסוחר
              </p>
              <h2 id="deals-heading" className="sr-only">
                עסקאות הסוחר
              </h2>
              <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
              <dl className="gap-2xl mt-lg grid grid-cols-1 sm:grid-cols-2">
                <div>
                  <dt className="text-muted text-xs font-medium uppercase tracking-widest">
                    עסקאות שהושלמו
                  </dt>
                  <dd className="text-ink font-tabular mt-xs font-serif text-3xl font-medium">
                    {dealer.deals_completed}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs font-medium uppercase tracking-widest">
                    דרגה נוכחית
                  </dt>
                  <dd className="text-ink mt-xs font-serif text-3xl font-medium">{dealer.tier}</dd>
                </div>
              </dl>
              <p className="text-muted mt-xl text-sm">צפייה בהיסטוריית עסקאות מלאה — בקרוב.</p>
            </section>
          </TabsContent>

          {/* ── OFFERS TAB ─────────────────────────────────────────── */}
          <TabsContent value="offers" className="mt-2xl">
            <section aria-labelledby="offers-heading">
              <p className="text-muted text-xs font-medium uppercase tracking-widest">
                הצעות הסוחר
              </p>
              <h2 id="offers-heading" className="sr-only">
                הצעות הסוחר
              </h2>
              <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
              <p className="text-muted mt-lg text-sm">צפייה בהצעות שנשלחו ושהתקבלו — בקרוב.</p>
            </section>
          </TabsContent>

          {/* ── KYC TAB ────────────────────────────────────────────── */}
          <TabsContent value="kyc" className="mt-2xl">
            {token ? (
              <KycTabPanel
                dealerId={dealer.id}
                token={token}
                onChanged={() => {
                  setToast("סטטוס אימות הזהות עודכן");
                  void load();
                }}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      )}

      <RejectDealerDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onSubmit={reject}
        businessName={dealer?.business_name ?? ""}
      />

      {dealer ? (
        <>
          <SuspendWithReasonDialog
            open={suspendWithReasonOpen}
            onOpenChange={setSuspendWithReasonOpen}
            dealerId={dealer.id}
            dealerLabel={`${dealer.business_name}${dealer.city ? ` · ${dealer.city}` : ""}`}
            token={token!}
            onSuspended={() => {
              setToast("הסוחר הושעה");
              void load();
              queueMicrotask(() => suspendTriggerRef.current?.focus());
            }}
          />
          <SilentSuspendDialog
            open={silentSuspendOpen}
            onOpenChange={setSilentSuspendOpen}
            dealerId={dealer.id}
            dealerLabel={`${dealer.business_name}${dealer.city ? ` · ${dealer.city}` : ""}`}
            token={token!}
            onSuspended={() => {
              setToast("הסוחר הושעה בשקט");
              void load();
              queueMicrotask(() => suspendTriggerRef.current?.focus());
            }}
          />
          <ArchiveDealerDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            dealerId={dealer.id}
            dealerLabel={`${dealer.business_name}${dealer.city ? ` · ${dealer.city}` : ""}`}
            token={token!}
            onArchived={() => {
              setToast("הסוחר הועבר לארכיון");
              void load();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DRow — hairline-separated label/value pair, mirrors the inventory detail.
// ---------------------------------------------------------------------------

function DRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-hairline gap-md py-sm flex flex-wrap items-baseline justify-between border-b last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-ink text-sm font-medium">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KycTabPanel — per-dealer KYC review (signed URLs from
// /api/v1/admin/dealers/{id}). Approve/reject mutations + photo
// viewer + reject reason dialog, all on shadcn primitives.
// ---------------------------------------------------------------------------

function KycTabPanel({
  dealerId,
  token,
  onChanged,
}: {
  dealerId: string;
  token: string;
  onChanged: () => void;
}) {
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [viewer, setViewer] = useState<{ label: string; url: string } | null>(null);

  const kycQuery = useQuery({
    queryKey: [...queryKeys.admin.dealer(dealerId), "kyc"] as const,
    queryFn: () =>
      apiFetch<{
        kyc_status: "pending" | "submitted" | "approved" | "rejected";
        kyc_rejected_reason: string | null;
        id_card_front_url: string | null;
        id_card_back_url: string | null;
        dealer_license_url: string | null;
      }>(`/api/v1/admin/dealers/${dealerId}`, { token }),
  });
  const kyc = kycQuery.data ?? null;
  const loadErr =
    kycQuery.error instanceof Error
      ? kycQuery.error.message
      : kycQuery.error
        ? "שגיאה בטעינת מסמכים"
        : null;

  const approveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/security/kyc/${dealerId}/approve`, { method: "POST", token }),
    onSuccess: () => {
      void kycQuery.refetch();
      onChanged();
    },
    onError: (e) => setActionErr(e instanceof Error ? e.message : "שגיאה"),
  });
  const rejectMutation = useMutation({
    mutationFn: (txt: string) =>
      apiFetch(`/api/v1/security/kyc/${dealerId}/reject`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: txt }),
      }),
    onSuccess: () => {
      setRejectOpen(false);
      setReason("");
      void kycQuery.refetch();
      onChanged();
    },
    onError: (e) => setActionErr(e instanceof Error ? e.message : "שגיאה"),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;
  const approve = async () => {
    setActionErr(null);
    await approveMutation.mutateAsync();
  };
  const submitReject = async () => {
    if (!reason.trim()) return;
    setActionErr(null);
    await rejectMutation.mutateAsync(reason.trim());
  };

  const remaining = 500 - reason.length;

  const statusVariant = (
    s: "pending" | "submitted" | "approved" | "rejected",
  ): "ink" | "neutral" | "accent" | "danger" => {
    if (s === "approved") return "accent";
    if (s === "rejected") return "danger";
    if (s === "submitted") return "ink";
    return "neutral";
  };
  const STATUS_LABEL = {
    pending: "ממתין להעלאה",
    submitted: "ממתין לאישור",
    approved: "מאומת",
    rejected: "נדחה",
  } as const;

  return (
    <section aria-labelledby="kyc-tab-heading">
      <p className="text-muted text-xs font-medium uppercase tracking-widest">אימות זהות (KYC)</p>
      <h2 id="kyc-tab-heading" className="sr-only">
        אימות זהות
      </h2>
      <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

      {loadErr ? (
        <Alert variant="destructive" className="mt-lg">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{loadErr}</AlertDescription>
        </Alert>
      ) : null}
      {actionErr ? (
        <Alert variant="destructive" className="mt-lg">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{actionErr}</AlertDescription>
        </Alert>
      ) : null}

      {kyc ? (
        <div className="gap-xs mt-lg flex flex-wrap items-center">
          <AdminStatusPill
            variant={statusVariant(kyc.kyc_status)}
            withCheck={statusVariant(kyc.kyc_status) === "accent"}
          >
            {STATUS_LABEL[kyc.kyc_status]}
          </AdminStatusPill>
          {kyc.kyc_status === "rejected" && kyc.kyc_rejected_reason ? (
            <span className="text-muted text-xs">סיבת דחייה: {kyc.kyc_rejected_reason}</span>
          ) : null}
        </div>
      ) : null}

      {!kyc ? (
        <div role="status" aria-live="polite" className="mt-lg">
          <span className="sr-only">טוען מסמכים…</span>
          <ul className="gap-md grid grid-cols-1 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <li key={i} aria-hidden="true" className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="aspect-[4/3] w-full rounded-md" />
              </li>
            ))}
          </ul>
        </div>
      ) : !kyc.id_card_front_url && !kyc.id_card_back_url && !kyc.dealer_license_url ? (
        <p className="text-muted mt-lg py-2xl text-center text-sm">
          הסוחר עדיין לא העלה מסמכי זהות.
        </p>
      ) : (
        <>
          <ul className="gap-md mt-lg grid grid-cols-1 sm:grid-cols-3">
            {(
              [
                ["id_card_front_url", "תעודת זהות — צד קדמי"],
                ["id_card_back_url", "תעודת זהות — צד אחורי"],
                ["dealer_license_url", "רישיון סוחר רכבים"],
              ] as const
            ).map(([key, label]) => (
              <li key={key}>
                <p className="text-muted mb-xs text-xs">{label}</p>
                <KycPhotoCard
                  url={kyc[key]}
                  label={label}
                  onOpen={(u) => setViewer({ label, url: u })}
                />
              </li>
            ))}
          </ul>

          {kyc.kyc_status === "submitted" ? (
            <div className="gap-sm mt-xl flex flex-wrap">
              <Button type="button" onClick={approve} disabled={busy} aria-busy={busy || undefined}>
                <Check aria-hidden="true" />
                <span>אשר אימות זהות</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={busy}
                className="text-danger-fg border-danger/30 hover:bg-danger-bg"
              >
                <X aria-hidden="true" />
                <span>דחה אימות זהות</span>
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* Doc viewer dialog */}
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

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>דחיית אימות זהות</DialogTitle>
            <DialogDescription>הסוחר יקבל את הסיבה במייל. פעולה לא ניתנת לביטול.</DialogDescription>
          </DialogHeader>

          <div className="mt-md">
            <Label htmlFor="kyc-reject-reason">
              סיבת הדחייה
              <span aria-hidden="true" className="text-danger-fg ms-xxs">
                *
              </span>
            </Label>
            <Textarea
              id="kyc-reject-reason"
              rows={4}
              maxLength={500}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="kyc-reject-count"
              className="mt-xs"
            />
            <p id="kyc-reject-count" aria-live="polite" className="text-muted mt-xxs text-xs">
              {remaining <= 50 ? (
                <>
                  נותרו <span className="font-tabular">{remaining}</span> תווים
                </>
              ) : null}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void submitReject()}
              disabled={busy || !reason.trim()}
              aria-busy={busy || undefined}
            >
              {busy ? "דוחה…" : "דחה ושלח מייל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// KycPhotoCard — handles loading shimmer, signed-URL expiry error, and
// click-to-open. Signed URLs expire 10min after the parent fetch.
// ---------------------------------------------------------------------------

function KycPhotoCard({
  url,
  label,
  onOpen,
}: {
  url: string | null;
  label: string;
  onOpen: (url: string) => void;
}) {
  const [state, setState] = useState<"idle" | "loaded" | "error">("idle");

  if (!url) {
    return (
      <div className="border-hairline text-subtle bg-paper flex aspect-[4/3] items-center justify-center rounded-md border text-xs">
        חסר
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      aria-label={`הצג ${label} בגודל מלא`}
      className="border-hairline hover:border-ink focus-visible:outline-accent duration-fast bg-paper group relative block aspect-[4/3] w-full overflow-hidden rounded-md border transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {state === "idle" ? (
        <div
          aria-hidden="true"
          className="bg-muted/10 absolute inset-0 motion-safe:animate-pulse"
        />
      ) : null}
      {state !== "error" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className="duration-fast relative h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      ) : (
        <div className="text-muted gap-xxs px-md flex h-full w-full flex-col items-center justify-center text-center text-xs">
          <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          <span>טעינת התמונה נכשלה</span>
          <span className="text-subtle">החתימה אולי פגה — רענן</span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton for the masthead-loaded state.
// ---------------------------------------------------------------------------

function DealerDetailSkeleton() {
  return (
    <div className="mt-2xl" role="status" aria-live="polite">
      <span className="sr-only">טוען סוחר…</span>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="gap-x-2xl gap-y-md mt-2xl grid grid-cols-1 sm:grid-cols-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="border-hairline gap-md py-sm flex items-baseline justify-between border-b last:border-b-0"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
