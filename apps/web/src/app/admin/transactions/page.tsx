"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/*
 * /admin/transactions — admin escort screen for deals in flight.
 *
 * A deal lands here when both buyer and seller have clicked
 * "אשר עסקה" on /dashboard/offers — the vehicle's
 * inventory.status flips to "in_transaction" and the deal sits
 * here until an admin verifies payment + paperwork and clicks
 * "סמן כהושלם". That call moves the vehicle to "sold" and
 * recalculates trust scores for both sides.
 *
 * a11y plan:
 *   - <main id="main" tabIndex={-1}>; H1 focusable on data-ready
 *   - Each transaction row is an <article aria-labelledby> with
 *     a sr-only "עסקה {n} מתוך {total}" anchor for SR navigation
 *   - The complete button is wrapped in a ConfirmDialog so the
 *     admin can't accidentally close a deal — destructive double-tap
 *   - Action result announced via a single role=status region
 *   - Skeleton loader during fetch (3 placeholder rows)
 */

type DealerInfo = {
  id: string;
  business_name: string;
  city: string | null;
  tier: string;
  phone: string | null;
};

type VehicleInfo = {
  make: string;
  model: string;
  year: number;
  plate_number: string | null;
};

type Transaction = {
  deal_id: string;
  offer_id: string;
  inventory_id: string;
  final_price: number;
  confirmed_at: string | null;
  vehicle: VehicleInfo;
  buyer: DealerInfo;
  seller: DealerInfo;
};

type Resp = { items: Transaction[]; total: number };

export default function AdminTransactionsPage() {
  const { token, loading } = useAdminAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Transaction | null>(null);
  const [toast, setToast] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<Resp>("/api/v1/admin/transactions-in-progress", {
        token,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת העסקאות בתהליך");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const completeDeal = async (t: Transaction) => {
    if (!token) return;
    setCompleting(t.deal_id);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/transactions/${t.deal_id}/complete`, {
        method: "POST",
        token,
      });
      setToast(`העסקה הושלמה: ${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בסיום העסקה");
    } finally {
      setCompleting(null);
    }
  };

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
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <BackLink href="/admin" label="חזרה ללוח ניהול" />

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy mt-3 text-3xl font-bold tracking-tight focus:outline-none"
        >
          עסקאות בתהליך
        </h1>
        <p className="text-brand-ink/70 mt-2">
          רכבים שעוברים בין סוחרים — מאשרים תשלום והעברה ואז מסמנים כהושלם.
        </p>

        {toast ? (
          <p role="status" aria-live="polite" className="sr-only" key={toast}>
            {toast}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
            {error}
          </p>
        ) : null}

        {data === null && !error ? (
          <ul className="mt-6 space-y-4" aria-busy="true" aria-label="טוען עסקאות">
            {[0, 1, 2].map((i) => (
              <li key={i} className="border-brand-navy/10 rounded-lg border bg-white p-5">
                <div className="bg-brand-navy/10 h-5 w-1/2 rounded motion-safe:animate-pulse" />
                <div className="bg-brand-navy/10 mt-3 h-4 w-1/3 rounded motion-safe:animate-pulse" />
                <div className="bg-brand-navy/10 mt-4 h-4 w-2/3 rounded motion-safe:animate-pulse" />
              </li>
            ))}
          </ul>
        ) : data && data.items.length === 0 ? (
          <div className="border-brand-navy/15 mt-6 rounded-lg border bg-white p-10 text-center">
            <p aria-hidden="true" className="text-brand-ink/30 mx-auto text-5xl">
              ✓
            </p>
            <p className="text-brand-navy mt-3 font-bold">אין עסקאות בתהליך כרגע</p>
            <p className="text-brand-ink/65 mt-2 text-sm">
              כשעסקה תאושר ע״י שני הצדדים היא תופיע כאן עד להשלמתה.
            </p>
          </div>
        ) : data ? (
          <ul className="mt-6 space-y-4">
            {data.items.map((t, idx) => {
              const titleId = `tx-${t.deal_id}-title`;
              const veh = `${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year}`;
              const priceF = formatPrice(t.final_price);
              const isBusy = completing === t.deal_id;
              return (
                <li
                  key={t.deal_id}
                  className="border-brand-gold/40 bg-brand-cream/30 rounded-lg border-2 bg-white p-5 sm:p-6"
                >
                  <article aria-labelledby={titleId}>
                    <header className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="bg-brand-gold/15 text-brand-navy inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
                          <span
                            aria-hidden="true"
                            className="bg-brand-gold inline-block h-1.5 w-1.5 rounded-full motion-safe:animate-pulse"
                          />
                          בתהליך · {idx + 1} מתוך {data.total}
                        </span>
                        <h2
                          id={titleId}
                          className="text-brand-navy mt-2 font-serif text-xl font-bold sm:text-2xl"
                        >
                          {veh}
                        </h2>
                        {t.vehicle.plate_number ? (
                          <p className="text-brand-ink/65 mt-0.5 font-mono text-sm" dir="ltr">
                            {t.vehicle.plate_number}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-end">
                        <p className="text-brand-ink/55 text-xs uppercase tracking-wider">
                          מחיר סופי
                        </p>
                        <p className="text-brand-navy text-2xl font-bold">
                          <span aria-hidden="true">{priceF.visual}</span>
                          <span className="sr-only">{priceF.sr}</span>
                        </p>
                      </div>
                    </header>

                    <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                      <DealerCard role="seller" dealer={t.seller} />
                      <DealerCard role="buyer" dealer={t.buyer} />
                    </dl>

                    {t.confirmed_at ? (
                      <p className="text-brand-ink/60 mt-4 text-xs">
                        אישור משני הצדדים:{" "}
                        <time dateTime={t.confirmed_at}>
                          {new Date(t.confirmed_at).toLocaleString("he-IL")}
                        </time>
                      </p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmTarget(t)}
                        disabled={isBusy}
                        aria-busy={isBusy || undefined}
                        aria-label={`סמן את העסקה של ${veh} כהושלמה`}
                        className="bg-ok hover:bg-ok/90 focus-visible:outline-ok inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                      >
                        <span aria-hidden="true">✓</span>
                        {isBusy ? "סוגר…" : "סמן כהושלם"}
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(v) => !v && setConfirmTarget(null)}
        title="סיום עסקה — האם אתה בטוח?"
        description={
          confirmTarget
            ? `העסקה של ${confirmTarget.vehicle.make} ${confirmTarget.vehicle.model} ${confirmTarget.vehicle.year} תסומן כסגורה. שני הסוחרים יקבלו אישור, מוני העסקאות שלהם יעלו, וציוני האמון יחושבו מחדש. פעולה לא ניתנת לביטול.`
            : ""
        }
        confirmLabel="סגור עסקה סופית"
        tone="success"
        onConfirm={async () => {
          if (confirmTarget) await completeDeal(confirmTarget);
        }}
      />
    </main>
  );
}

const TIER_LABEL: Record<string, string> = {
  bronze: "ברונזה",
  silver: "כסף",
  gold: "זהב",
  platinum: "פלטינום",
};

function DealerCard({ role, dealer }: { role: "buyer" | "seller"; dealer: DealerInfo }) {
  const roleLabel = role === "buyer" ? "קונה" : "מוכר";
  return (
    <div className="border-brand-navy/10 rounded-md border bg-white p-4">
      <p className="text-brand-ink/55 text-xs font-semibold uppercase tracking-wider">
        {roleLabel}
      </p>
      <p className="text-brand-navy mt-1 text-base font-bold">{dealer.business_name}</p>
      <p className="text-brand-ink/70 text-sm">
        {dealer.city ?? "—"}
        {" · "}
        <span lang="en">{TIER_LABEL[dealer.tier] ?? dealer.tier}</span>
      </p>
      {dealer.phone ? (
        <p className="text-brand-ink/65 mt-1 text-sm" dir="ltr">
          <a
            href={`tel:${dealer.phone}`}
            className="text-brand-navy decoration-brand-gold underline decoration-2 underline-offset-4"
          >
            {dealer.phone}
          </a>
        </p>
      ) : null}
    </div>
  );
}
