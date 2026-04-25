"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { RejectDealerDialog } from "@/components/RejectDealerDialog";
import { StatusBadge, deriveStatus } from "@/components/StatusBadge";
import { TabsBar } from "@/components/TabsBar";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";

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
  // Phase 4.4
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

export default function DealerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, loading } = useAdminAuth();
  const router = useRouter();

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [toast, setToast] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Phase 4.4 — tabs + suspend dialog
  const [tab, setTab] = useState<TabId>("details");
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendBusy, setSuspendBusy] = useState(false);
  const suspendTriggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const d = await apiFetch<Dealer>(`/api/v1/admin/dealers/${id}`, { token });
      setDealer(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת הסוחר");
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (dealer) headingRef.current?.focus();
  }, [dealer]);

  const verify = async () => {
    if (!token || !dealer) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await apiFetch(`/api/v1/admin/dealers/${dealer.id}/verify`, {
        method: "POST",
        token,
      });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "שגיאה באישור");
    } finally {
      setActionBusy(false);
    }
  };

  const reject = async (reason: string) => {
    if (!token || !dealer) return;
    await apiFetch(`/api/v1/admin/dealers/${dealer.id}/reject`, {
      method: "POST",
      token,
      body: JSON.stringify({ reason }),
    });
    await load();
  };

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const resetPassword = async () => {
    if (!token || !dealer) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await apiFetch(`/api/v1/admin/dealers/${dealer.id}/reset-password`, {
        method: "POST",
        token,
      });
      setToast("מייל איפוס נשלח לסוחר");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setActionBusy(false);
    }
  };

  const submitSuspend = async () => {
    if (!token || !dealer) return;
    if (!suspendReason.trim()) return;
    setSuspendBusy(true);
    try {
      await apiFetch(`/api/v1/admin/dealers/${dealer.id}/suspend`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: suspendReason.trim() }),
      });
      setToast(`${dealer.business_name} הושעה`);
      setSuspendOpen(false);
      setSuspendReason("");
      await load();
      queueMicrotask(() => suspendTriggerRef.current?.focus());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "שגיאה בהשעיה");
    } finally {
      setSuspendBusy(false);
    }
  };

  const unsuspend = async () => {
    if (!token || !dealer) return;
    setActionBusy(true);
    try {
      await apiFetch(`/api/v1/admin/dealers/${dealer.id}/unsuspend`, {
        method: "POST",
        token,
      });
      setToast("הושעיה בוטלה");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setActionBusy(false);
    }
  };

  const impersonate = async () => {
    if (!token || !dealer) return;
    setActionError(null);
    setActionBusy(true);
    try {
      const res = await apiFetch<ImpersonationResponse>(`/api/v1/admin/impersonate/${dealer.id}`, {
        method: "POST",
        token,
      });
      window.sessionStorage.setItem("impersonation_token", res.impersonation_token);
      window.sessionStorage.setItem("impersonation_business_name", res.business_name);
      window.sessionStorage.setItem("impersonation_dealer_id", res.dealer_id);
      window.sessionStorage.setItem("impersonation_just_activated", "1");
      router.push("/dashboard");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "שגיאה בהתחזות");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading || (!dealer && !error)) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="alert" className="bg-danger-bg text-danger-text m-10 rounded-md px-4 py-3">
          {error}
        </p>
      </main>
    );
  }

  if (!dealer) return null;

  const status = deriveStatus(dealer);
  const isSuspended = !!dealer.suspended_at;

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-navy text-3xl font-bold tracking-tight focus:outline-none"
          >
            {dealer.business_name}
          </h1>
          <StatusBadge status={status} />
          <TrustBadge tier={dealer.tier} />
          {isSuspended ? (
            <span
              aria-label="סוחר מושעה"
              className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-700/30"
            >
              ⏸ מושעה
            </span>
          ) : null}
        </div>
        <p className="text-brand-ink/70 mt-2">{dealer.email}</p>

        {toast ? (
          <p role="status" aria-live="polite" className="sr-only" key={toast}>
            {toast}
          </p>
        ) : null}

        {actionError ? (
          <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
            {actionError}
          </p>
        ) : null}

        <div className="mt-6">
          <TabsBar tabs={TABS} active={tab} onChange={setTab} ariaLabel="טאבי סוחר" />
        </div>

        <div
          role="tabpanel"
          id="tabpanel-details"
          aria-labelledby="tab-details"
          hidden={tab !== "details"}
        >
          <section aria-labelledby="dealer-info-heading" className="mt-8">
            <h2 id="dealer-info-heading" className="text-brand-navy text-lg font-semibold">
              פרטי העסק
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Info label="ח.פ / ע.מ" value={dealer.business_id} />
              <Info label="רישיון סחר" value={dealer.license_number} />
              <Info label="איש קשר" value={dealer.contact_name} />
              <Info label="טלפון" value={dealer.phone} />
              <Info label="עיר" value={dealer.city} />
              <Info label="גודל חצר" value={`${dealer.lot_size}`} />
              <Info label="דרגה" value={dealer.tier} lang="en" />
              <Info label="ציון אמון" value={String(dealer.trust_score)} />
              <Info
                label="תאריך הרשמה"
                value={new Date(dealer.created_at).toLocaleDateString("he-IL")}
              />
              {dealer.verified_at ? (
                <Info
                  label="אושר בתאריך"
                  value={new Date(dealer.verified_at).toLocaleDateString("he-IL")}
                />
              ) : null}
              {dealer.rejected_at ? (
                <Info
                  label="נדחה בתאריך"
                  value={new Date(dealer.rejected_at).toLocaleDateString("he-IL")}
                />
              ) : null}
            </dl>

            {dealer.rejection_reason ? (
              <div className="border-danger-text/20 bg-danger-bg text-danger-text mt-6 rounded-md border px-4 py-3 text-sm">
                <p className="font-semibold">סיבת דחייה</p>
                <p className="mt-1">{dealer.rejection_reason}</p>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="actions-heading" className="mt-10">
            <h2 id="actions-heading" className="text-brand-navy text-lg font-semibold">
              פעולות
            </h2>

            {status === "pending" ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={verify}
                  disabled={actionBusy}
                  aria-busy={actionBusy || undefined}
                  className="bg-ok hover:bg-ok-text focus-visible:outline-ok-text inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  אשר סוחר
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(true)}
                  disabled={actionBusy}
                  className="border-danger text-danger-text hover:bg-danger-bg focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  דחה סוחר
                </button>
              </div>
            ) : status === "verified" ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={impersonate}
                  disabled={actionBusy}
                  aria-busy={actionBusy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {actionBusy ? "מתחיל התחזות…" : "התחזה לסוחר"}
                </button>
                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={actionBusy}
                  aria-describedby="dealer-info-heading"
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  אפס סיסמה
                </button>
                {isSuspended ? (
                  <button
                    type="button"
                    onClick={unsuspend}
                    disabled={actionBusy}
                    className="bg-ok hover:bg-ok/90 focus-visible:outline-ok inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                  >
                    בטל הושעיה
                  </button>
                ) : (
                  <button
                    ref={suspendTriggerRef}
                    type="button"
                    onClick={() => setSuspendOpen(true)}
                    disabled={actionBusy}
                    className="border-danger text-danger-text hover:bg-danger-bg focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                  >
                    השעה סוחר
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={verify}
                  disabled={actionBusy}
                  aria-busy={actionBusy || undefined}
                  className="bg-ok hover:bg-ok-text focus-visible:outline-ok-text inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  בטל דחייה ואשר
                </button>
              </div>
            )}
          </section>
        </div>
        {/* /tabpanel-details */}

        {/* ====================================================
            Inventory tab — links into existing /admin/inventory
            ==================================================== */}
        <div
          role="tabpanel"
          id="tabpanel-inventory"
          aria-labelledby="tab-inventory"
          hidden={tab !== "inventory"}
          className="mt-8"
        >
          <div className="border-brand-navy/10 rounded-lg border bg-white p-6">
            <h2 className="text-brand-navy text-lg font-semibold">המלאי של הסוחר</h2>
            <p className="text-brand-ink/70 mt-2 text-sm">
              צפה בכל הרכבים של הסוחר עם סינון מלא לפי סטטוס וחשיפה.
            </p>
            <Link
              href={`/admin/inventory?dealer_id=${dealer.id}`}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              פתח רשימת מלאי מסוננת
            </Link>
          </div>
        </div>

        {/* ====================================================
            Deals tab — placeholder
            ==================================================== */}
        <div
          role="tabpanel"
          id="tabpanel-deals"
          aria-labelledby="tab-deals"
          hidden={tab !== "deals"}
          className="mt-8"
        >
          <div className="border-brand-navy/10 rounded-lg border bg-white p-6">
            <h2 className="text-brand-navy text-lg font-semibold">עסקאות הסוחר</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-brand-ink/60 text-xs">עסקאות שהושלמו</dt>
                <dd className="text-brand-navy mt-1 text-2xl font-bold">
                  {dealer.deals_completed}
                </dd>
              </div>
              <div>
                <dt className="text-brand-ink/60 text-xs">דרגה נוכחית</dt>
                <dd className="text-brand-navy mt-1 text-2xl font-bold">{dealer.tier}</dd>
              </div>
            </dl>
            <p className="text-brand-ink/60 mt-4 text-sm">צפייה בהיסטוריית עסקאות מלאה — בקרוב.</p>
          </div>
        </div>

        {/* ====================================================
            Offers tab — placeholder
            ==================================================== */}
        <div
          role="tabpanel"
          id="tabpanel-offers"
          aria-labelledby="tab-offers"
          hidden={tab !== "offers"}
          className="mt-8"
        >
          <div className="border-brand-navy/10 rounded-lg border bg-white p-6">
            <h2 className="text-brand-navy text-lg font-semibold">הצעות הסוחר</h2>
            <p className="text-brand-ink/60 mt-2 text-sm">צפייה בהצעות שנשלחו ושהתקבלו — בקרוב.</p>
          </div>
        </div>

        {/* ====================================================
            KYC tab — fetches docs for THIS dealer + approve/reject
            ==================================================== */}
        <div
          role="tabpanel"
          id="tabpanel-kyc"
          aria-labelledby="tab-kyc"
          hidden={tab !== "kyc"}
          className="mt-8"
        >
          {token ? (
            <KycTabPanel
              dealerId={dealer.id}
              kycStatus={dealer.kyc_status}
              token={token}
              onChanged={() => {
                setToast("סטטוס אימות הזהות עודכן");
                void load();
              }}
            />
          ) : null}
        </div>

        <RejectDealerDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          onSubmit={reject}
          businessName={dealer.business_name}
        />

        {/* Suspend dialog */}
        <Dialog.Root open={suspendOpen} onOpenChange={setSuspendOpen}>
          <Dialog.Portal>
            <Dialog.Overlay aria-hidden="true" className="bg-brand-navy/40 fixed inset-0 z-40" />
            <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-brand-cream w-full max-w-md rounded-xl p-6 shadow-xl">
                <Dialog.Title className="text-brand-navy text-lg font-bold">
                  השעיית סוחר
                </Dialog.Title>
                <Dialog.Description className="text-brand-ink/80 mt-2 text-sm">
                  השעיית הסוחר תמנע ממנו גישה למערכת. ניתן לבטל את ההשעיה מאוחר יותר.
                </Dialog.Description>

                <label
                  htmlFor="susp-reason"
                  className="text-brand-navy mt-4 block text-sm font-medium"
                >
                  סיבת ההשעיה
                  <span aria-hidden="true" className="text-danger-text ms-1">
                    *
                  </span>
                </label>
                <textarea
                  id="susp-reason"
                  rows={4}
                  maxLength={500}
                  required
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  aria-describedby="susp-reason-count"
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                <p
                  id="susp-reason-count"
                  aria-live="polite"
                  className="text-brand-ink/60 mt-1 text-xs"
                >
                  {suspendReason.length >= 450 ? `נותרו ${500 - suspendReason.length} תווים` : ""}
                </p>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      ביטול
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    onClick={() => void submitSuspend()}
                    disabled={suspendBusy || !suspendReason.trim()}
                    aria-busy={suspendBusy || undefined}
                    className="bg-danger hover:bg-danger/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                  >
                    {suspendBusy ? "משעה…" : "השעה סוחר"}
                  </button>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </main>
  );
}

function Info({ label, value, lang }: { label: string; value: string; lang?: string }) {
  return (
    <div className="border-brand-navy/10 rounded-lg border bg-white p-4">
      <dt className="text-brand-ink/60 text-sm">{label}</dt>
      <dd lang={lang} className="text-brand-navy mt-1 break-words text-base font-medium">
        {value}
      </dd>
    </div>
  );
}

// =============================================================================
// KYC tab panel — Phase 4.4 fix.
// Fetches the per-dealer KYC status (signed image URLs) and lets the admin
// approve/reject directly from the dealer detail page.
// =============================================================================

type _KycTabKyc = {
  kyc_status: "pending" | "submitted" | "approved" | "rejected";
  id_card_front_url: string | null;
  id_card_back_url: string | null;
  dealer_license_url: string | null;
  kyc_rejected_reason: string | null;
};

function KycTabPanel({
  dealerId,
  token,
  onChanged,
}: {
  dealerId: string;
  kycStatus: "pending" | "submitted" | "approved" | "rejected";
  token: string;
  onChanged: () => void;
}) {
  // The /security/kyc/status endpoint is dealer-self only — for admins
  // we re-use the per-dealer entry from /security/kyc/pending list, but
  // we don't have a single-dealer admin endpoint yet. Workaround: pull
  // the pending list and find this dealer; if not in pending list (e.g.
  // already approved), fall back to status text only.
  const [kyc, setKyc] = useState<_KycTabKyc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [viewer, setViewer] = useState<{ label: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      // Use the existing pending list — sufficient for "submitted" status.
      // For other statuses we just render the status text.
      const list = await apiFetch<
        Array<{
          id: string;
          id_card_front_url: string | null;
          id_card_back_url: string | null;
          dealer_license_url: string | null;
        }>
      >("/api/v1/security/kyc/pending", { token });
      const row = list.find((r) => r.id === dealerId);
      setKyc({
        kyc_status: row ? "submitted" : "pending",
        id_card_front_url: row?.id_card_front_url ?? null,
        id_card_back_url: row?.id_card_back_url ?? null,
        dealer_license_url: row?.dealer_license_url ?? null,
        kyc_rejected_reason: null,
      });
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "שגיאה בטעינת מסמכים");
    }
  }, [dealerId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    setBusy(true);
    setActionErr(null);
    try {
      await apiFetch(`/api/v1/security/kyc/${dealerId}/approve`, {
        method: "POST",
        token,
      });
      onChanged();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    setActionErr(null);
    try {
      await apiFetch(`/api/v1/security/kyc/${dealerId}/reject`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setRejectOpen(false);
      setReason("");
      onChanged();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  };

  const remaining = 500 - reason.length;

  return (
    <div className="border-brand-navy/10 rounded-lg border bg-white p-6">
      <h2 className="text-brand-navy text-lg font-semibold">אימות זהות (KYC)</h2>

      {loadErr ? (
        <p role="alert" className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm">
          {loadErr}
        </p>
      ) : null}
      {actionErr ? (
        <p role="alert" className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm">
          {actionErr}
        </p>
      ) : null}

      {!kyc ? (
        <p role="status" className="text-brand-ink/60 mt-3">
          טוען מסמכים…
        </p>
      ) : kyc.kyc_status !== "submitted" ? (
        <p className="text-brand-ink/60 mt-3 text-sm">
          {kyc.id_card_front_url
            ? "המסמכים אושרו או נדחו בעבר."
            : "הסוחר עדיין לא העלה מסמכי זהות."}
        </p>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["id_card_front_url", "תעודת זהות — צד קדמי"] as const,
              ["id_card_back_url", "תעודת זהות — צד אחורי"] as const,
              ["dealer_license_url", "רישיון סוחר רכבים"] as const,
            ].map(([key, label]) => {
              const url = kyc[key];
              return (
                <li key={key}>
                  <p className="text-brand-ink/60 mb-1 text-xs">{label}</p>
                  {url ? (
                    <button
                      type="button"
                      onClick={() => setViewer({ label, url })}
                      aria-label={`הצג ${label}`}
                      className="border-brand-navy/10 focus-visible:outline-brand-navy block aspect-[4/3] w-full overflow-hidden rounded-md border bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <p className="border-brand-navy/10 text-brand-ink/50 bg-brand-cream/40 flex aspect-[4/3] items-center justify-center rounded-md border text-xs">
                      חסר
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              aria-busy={busy || undefined}
              className="bg-ok hover:bg-ok/90 focus-visible:outline-ok inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            >
              <span aria-hidden="true">✓</span>
              אשר אימות זהות
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              disabled={busy}
              className="bg-danger hover:bg-danger/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            >
              <span aria-hidden="true">✕</span>
              דחה אימות זהות
            </button>
          </div>
        </>
      )}

      {/* Doc viewer dialog */}
      <Dialog.Root open={!!viewer} onOpenChange={(v) => !v && setViewer(null)}>
        <Dialog.Portal>
          <Dialog.Overlay aria-hidden="true" className="bg-brand-navy/60 fixed inset-0 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-brand-cream w-full max-w-3xl rounded-xl p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <Dialog.Title className="text-brand-navy text-base font-bold">
                  {viewer?.label}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="סגור"
                    className="text-brand-ink/70 hover:text-brand-navy rounded"
                  >
                    ✕
                  </button>
                </Dialog.Close>
              </div>
              {viewer ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewer.url}
                    alt={viewer.label}
                    className="mt-3 max-h-[70vh] w-full rounded-md object-contain"
                  />
                  <a
                    href={viewer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-navy mt-3 inline-block text-sm font-semibold underline"
                  >
                    פתח בכרטיסייה חדשה
                  </a>
                </>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Reject dialog */}
      <Dialog.Root open={rejectOpen} onOpenChange={setRejectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay aria-hidden="true" className="bg-brand-navy/40 fixed inset-0 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-brand-cream w-full max-w-md rounded-xl p-6 shadow-xl">
              <Dialog.Title className="text-brand-navy text-lg font-bold">
                דחיית אימות זהות
              </Dialog.Title>
              <Dialog.Description className="text-brand-ink/80 mt-2 text-sm">
                הסוחר יקבל את הסיבה במייל. פעולה לא ניתנת לביטול.
              </Dialog.Description>

              <label
                htmlFor="kyc-reject-reason"
                className="text-brand-navy mt-4 block text-sm font-medium"
              >
                סיבת הדחייה{" "}
                <span aria-hidden="true" className="text-danger-text ms-1">
                  *
                </span>
              </label>
              <textarea
                id="kyc-reject-reason"
                rows={4}
                maxLength={500}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-describedby="kyc-reject-count"
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <p
                id="kyc-reject-count"
                aria-live="polite"
                className="text-brand-ink/60 mt-1 text-xs"
              >
                {remaining <= 50 ? `נותרו ${remaining} תווים` : ""}
              </p>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void reject()}
                  disabled={busy || !reason.trim()}
                  aria-busy={busy || undefined}
                  className="bg-danger hover:bg-danger/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {busy ? "דוחה…" : "דחה ושלח מייל"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
