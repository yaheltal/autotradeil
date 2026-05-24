"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/transactions — editorial escort screen for deals in flight.
 *
 *   עסקאות בתהליך
 *   ──────────
 *   רכבים שעוברים בין סוחרים · {N} בתהליך
 *
 *   ── BMW X3 · 2018                                    ₪450,000
 *   ── plate · idx of total
 *   ── מוכר: TalCars · קונה: AvramAuto                   [סמן כהושלם]
 *   ── חתימות דיגיטליות (collapsible)
 *
 * Hairline-separated deal rows replace the bordered "border-brand-
 * gold/40" cards. The accent moment moves into the small "בתהליך"
 * eyebrow at the row start instead of the entire row border.
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

type Agreements = {
  buyer_signed_at: string | null;
  buyer_signed_ip: string | null;
  seller_signed_at: string | null;
  seller_signed_ip: string | null;
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
  agreements: Agreements;
};

type Resp = { items: Transaction[]; total: number };

const TIER_LABEL: Record<string, string> = {
  bronze: "ברונזה",
  silver: "כסף",
  gold: "זהב",
  platinum: "פלטינום",
};

export default function AdminTransactionsPage() {
  const { token, loading } = useAdminAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Transaction | null>(null);
  const [toast, setToast] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const txQuery = useQuery({
    queryKey: queryKeys.admin.transactions(),
    queryFn: () => apiFetch<Resp>("/api/v1/admin/transactions-in-progress", { token: token! }),
    enabled: !!token,
  });
  const data = txQuery.data ?? null;

  useEffect(() => {
    if (txQuery.error) {
      setError(
        txQuery.error instanceof Error ? txQuery.error.message : "שגיאה בטעינת העסקאות בתהליך",
      );
    }
  }, [txQuery.error]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const completeMutation = useMutation({
    mutationFn: (t: Transaction) =>
      apiFetch(`/api/v1/admin/transactions/${t.deal_id}/complete`, {
        method: "POST",
        token: token!,
      }),
    onSuccess: async (_d, t) => {
      setToast(`העסקה הושלמה: ${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year}`);
      await qc.invalidateQueries({ queryKey: queryKeys.admin.transactions() });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "שגיאה בסיום העסקה"),
  });
  const completing = completeMutation.isPending
    ? (completeMutation.variables?.deal_id ?? null)
    : null;
  const completeDeal = (t: Transaction) => {
    setError(null);
    return completeMutation.mutateAsync(t);
  };

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl">
      <AdminMasthead
        title="עסקאות בתהליך"
        dek={<span>רכבים שעוברים בין סוחרים — אמת תשלום והעברה</span>}
        loading={loading || (data === null && !error)}
        count={data ? `${data.total} ${data.total === 1 ? "בתהליך" : "בתהליך"}` : undefined}
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

      <section aria-labelledby="tx-list-heading" className="mt-2xl">
        <h2 id="tx-list-heading" className="sr-only">
          רשימת עסקאות בתהליך
        </h2>

        {data === null && !error ? (
          <TxSkeleton />
        ) : data && data.items.length === 0 ? (
          <p className="text-muted py-3xl text-center text-sm" role="status">
            אין עסקאות בתהליך כרגע. כשעסקה תאושר ע״י שני הצדדים היא תופיע כאן עד להשלמתה.
          </p>
        ) : data ? (
          <ul>
            {data.items.map((t, idx) => {
              const titleId = `tx-${t.deal_id}-title`;
              const veh = `${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year}`;
              const priceF = formatPrice(t.final_price);
              const isBusy = completing === t.deal_id;
              return (
                <li key={t.deal_id} className="border-hairline py-xl border-b last:border-b-0">
                  <article aria-labelledby={titleId}>
                    <header className="gap-md flex flex-wrap items-start justify-between">
                      <div className="min-w-0">
                        <span className="text-accent gap-xxs inline-flex items-center text-[11px] font-medium uppercase tracking-widest">
                          <span
                            aria-hidden="true"
                            className="bg-accent inline-block h-1.5 w-1.5 rounded-full motion-safe:animate-pulse"
                          />
                          בתהליך · <span className="font-tabular">{idx + 1}</span> מתוך{" "}
                          <span className="font-tabular">{data.total}</span>
                        </span>
                        <h3
                          id={titleId}
                          className="text-ink mt-xs font-serif text-xl font-medium leading-tight"
                        >
                          {veh}
                        </h3>
                        {t.vehicle.plate_number ? (
                          <p className="text-muted font-tabular mt-xxs text-sm" dir="ltr">
                            {t.vehicle.plate_number}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-end">
                        <p className="text-muted text-[11px] font-medium uppercase tracking-widest">
                          מחיר סופי
                        </p>
                        <p className="text-ink font-tabular mt-xxs font-serif text-2xl font-medium">
                          <span aria-hidden="true">{priceF.visual}</span>
                          <span className="sr-only">{priceF.sr}</span>
                        </p>
                      </div>
                    </header>

                    <dl className="gap-lg mt-xl grid grid-cols-1 sm:grid-cols-2">
                      <DealerBlock role="seller" dealer={t.seller} />
                      <DealerBlock role="buyer" dealer={t.buyer} />
                    </dl>

                    {t.confirmed_at ? (
                      <p className="text-muted mt-md text-xs">
                        אישור משני הצדדים:{" "}
                        <time dateTime={t.confirmed_at} className="font-tabular">
                          {new Date(t.confirmed_at).toLocaleString("he-IL")}
                        </time>
                      </p>
                    ) : null}

                    {/* Digital agreement audit — both signatures with
                        timestamp + IP. Mono-ish font-tabular + dir=ltr on
                        the IP keeps the dotted-octet readable in RTL. */}
                    {t.agreements.buyer_signed_at || t.agreements.seller_signed_at ? (
                      <details className="border-hairline px-md py-sm mt-md rounded-md border text-xs">
                        <summary className="text-ink cursor-pointer font-medium">
                          חתימות דיגיטליות
                        </summary>
                        <dl className="text-muted gap-xxs mt-sm grid">
                          {t.agreements.buyer_signed_at ? (
                            <div>
                              <dt className="inline">קונה חתם:</dt>{" "}
                              <dd className="inline">
                                <time
                                  dateTime={t.agreements.buyer_signed_at}
                                  className="font-tabular"
                                >
                                  {new Date(t.agreements.buyer_signed_at).toLocaleString("he-IL")}
                                </time>
                                {t.agreements.buyer_signed_ip ? (
                                  <span className="font-tabular ms-2" dir="ltr">
                                    ({t.agreements.buyer_signed_ip})
                                  </span>
                                ) : null}
                              </dd>
                            </div>
                          ) : null}
                          {t.agreements.seller_signed_at ? (
                            <div>
                              <dt className="inline">מוכר חתם:</dt>{" "}
                              <dd className="inline">
                                <time
                                  dateTime={t.agreements.seller_signed_at}
                                  className="font-tabular"
                                >
                                  {new Date(t.agreements.seller_signed_at).toLocaleString("he-IL")}
                                </time>
                                {t.agreements.seller_signed_ip ? (
                                  <span className="font-tabular ms-2" dir="ltr">
                                    ({t.agreements.seller_signed_ip})
                                  </span>
                                ) : null}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </details>
                    ) : null}

                    <div className="mt-lg">
                      <Button
                        type="button"
                        onClick={() => setConfirmTarget(t)}
                        disabled={isBusy}
                        aria-busy={isBusy || undefined}
                        aria-label={`סמן את העסקה של ${veh} כהושלמה`}
                        className="bg-accent text-accent-ink hover:bg-accent/90"
                      >
                        <Check aria-hidden="true" />
                        <span>{isBusy ? "סוגר…" : "סמן כהושלם"}</span>
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

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
    </div>
  );
}

function DealerBlock({ role, dealer }: { role: "buyer" | "seller"; dealer: DealerInfo }) {
  const roleLabel = role === "buyer" ? "קונה" : "מוכר";
  return (
    <div>
      <p className="text-muted text-[11px] font-medium uppercase tracking-widest">{roleLabel}</p>
      <p className="text-ink mt-xxs text-base font-medium">{dealer.business_name}</p>
      <p className="text-muted mt-xxs text-sm">
        {dealer.city ?? "—"}
        <span aria-hidden="true" className="text-subtle mx-xxs">
          ·
        </span>
        <span lang="en">{TIER_LABEL[dealer.tier] ?? dealer.tier}</span>
      </p>
      {dealer.phone ? (
        <p className="mt-xxs text-sm" dir="ltr">
          <a
            href={`tel:${dealer.phone}`}
            className="text-ink font-tabular duration-fast hover:text-accent focus-visible:outline-accent underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {dealer.phone}
          </a>
        </p>
      ) : null}
    </div>
  );
}

function TxSkeleton() {
  return (
    <div className="mt-2xl" role="status" aria-live="polite">
      <span className="sr-only">טוען עסקאות בתהליך…</span>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-hairline py-xl space-y-3 border-b last:border-b-0"
        >
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-1/2" />
          <div className="gap-lg grid grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
      ))}
    </div>
  );
}
