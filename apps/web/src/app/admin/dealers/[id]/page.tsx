"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { RejectDealerDialog } from "@/components/RejectDealerDialog";
import { StatusBadge, deriveStatus } from "@/components/StatusBadge";
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
  tier: string;
  trust_score: number | string;
  created_at: string;
};

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
  const headingRef = useRef<HTMLHeadingElement>(null);

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
        </div>
        <p className="text-brand-ink/70 mt-2">{dealer.email}</p>

        {actionError ? (
          <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
            {actionError}
          </p>
        ) : null}

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
            <div className="mt-4">
              <button
                type="button"
                onClick={impersonate}
                disabled={actionBusy}
                aria-busy={actionBusy || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {actionBusy ? "מתחיל התחזות…" : "התחזה לסוחר"}
              </button>
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

        <RejectDealerDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          onSubmit={reject}
          businessName={dealer.business_name}
        />
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
