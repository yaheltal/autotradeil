"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";

/*
 * Admin KYC review panel.
 *
 * A11y (approved):
 *   - H1 focusable on data-ready.
 *   - Each dealer row is an <article aria-labelledby="…">.
 *   - Document thumbnails are <button> elements opening a Radix Dialog
 *     with the full-size image. Dialog.Title names the doc. Also offers
 *     "פתח בכרטיסייה חדשה" for native browser zoom/rotate.
 *   - Reject dialog: textarea required, max 500 chars, with a live-
 *     region char counter ("נותרו X תווים") linked via aria-describedby.
 *   - Destructive "דחה" button carries aria-describedby pointing at the
 *     dealer's business name so an SR user tabbing through the list
 *     hears context, not a sequence of unlabelled "דחה" buttons.
 *   - Action result announced via a single status region.
 *   - Post-action focus returns to the list heading (cards unmount).
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

const DOC_LABEL: Record<string, string> = {
  id_card_front_url: "תעודת זהות — צד קדמי",
  id_card_back_url: "תעודת זהות — צד אחורי",
  dealer_license_url: "רישיון סוחר רכבים",
};

export default function AdminKycPage() {
  const { token, loading } = useAdminAuth();

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const [rows, setRows] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const [viewer, setViewer] = useState<{ label: string; url: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Pending | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<Pending[]>("/api/v1/security/kyc/pending", { token });
      setRows(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת הבקשות");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (rows !== null) h1Ref.current?.focus();
  }, [rows]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const approve = async (dealer: Pending) => {
    if (!token) return;
    try {
      await apiFetch(`/api/v1/security/kyc/${dealer.id}/approve`, {
        method: "POST",
        token,
      });
      setToast(`${dealer.business_name} — אימות אושר`);
      await load();
      queueMicrotask(() => listHeadingRef.current?.focus());
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שגיאה באישור");
    }
  };

  const submitReject = async () => {
    if (!token || !rejectTarget) return;
    if (!rejectReason.trim()) return;
    setRejectBusy(true);
    try {
      await apiFetch(`/api/v1/security/kyc/${rejectTarget.id}/reject`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setToast(`${rejectTarget.business_name} — אימות נדחה`);
      setRejectTarget(null);
      setRejectReason("");
      await load();
      queueMicrotask(() => listHeadingRef.current?.focus());
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שגיאה בדחייה");
    } finally {
      setRejectBusy(false);
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

  const remaining = 500 - rejectReason.length;

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/admin"
          className="text-brand-navy focus-visible:outline-brand-navy inline-flex items-center gap-1 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">→</span>
          חזרה ללוח ניהול
        </Link>

        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-brand-navy mt-4 text-3xl font-bold tracking-tight focus:outline-none"
        >
          אימות זהות — בקשות ממתינות
        </h1>

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
          <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
            {error}
          </p>
        ) : null}

        <h2 ref={listHeadingRef} tabIndex={-1} className="sr-only focus:outline-none">
          רשימת בקשות
        </h2>

        {rows === null ? (
          <p role="status" className="text-brand-ink/60 p-8">
            טוען…
          </p>
        ) : rows.length === 0 ? (
          <p className="border-brand-navy/10 text-brand-ink/60 mt-6 rounded-lg border bg-white p-10 text-center">
            אין בקשות אימות ממתינות
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {rows.map((d) => {
              const titleId = `kyc-${d.id}-title`;
              const businessId = `kyc-${d.id}-business`;
              return (
                <li key={d.id} className="border-brand-navy/10 rounded-lg border bg-white p-5">
                  <article aria-labelledby={titleId}>
                    <header>
                      <h3 id={titleId} className="text-brand-navy text-lg font-bold">
                        <span id={businessId}>{d.business_name}</span>
                      </h3>
                      <p className="text-brand-ink/70 mt-1 text-sm">
                        {d.email}
                        {d.city ? ` · ${d.city}` : ""}
                      </p>
                    </header>

                    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {(
                        ["id_card_front_url", "id_card_back_url", "dealer_license_url"] as const
                      ).map((key) => {
                        const url = d[key];
                        const label = DOC_LABEL[key] ?? key;
                        return (
                          <li key={key}>
                            <p className="text-brand-ink/60 mb-1 text-xs">{label}</p>
                            {url ? (
                              <button
                                type="button"
                                onClick={() => setViewer({ label, url })}
                                aria-label={`הצג ${label} של ${d.business_name}`}
                                className="border-brand-navy/10 focus-visible:outline-brand-navy block aspect-[4/3] w-full overflow-hidden rounded-md border bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
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
                        onClick={() => void approve(d)}
                        aria-describedby={businessId}
                        className="bg-ok hover:bg-ok/90 focus-visible:outline-ok inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <span aria-hidden="true">✓</span>
                        אשר
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectTarget(d);
                          setRejectReason("");
                        }}
                        aria-describedby={businessId}
                        className="bg-danger hover:bg-danger/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <span aria-hidden="true">✕</span>
                        דחה
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Document viewer dialog */}
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
                    className="text-brand-ink/70 hover:text-brand-navy focus-visible:outline-brand-navy rounded focus-visible:outline-2 focus-visible:outline-offset-2"
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
      <Dialog.Root open={!!rejectTarget} onOpenChange={(v) => !v && setRejectTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay aria-hidden="true" className="bg-brand-navy/40 fixed inset-0 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-brand-cream w-full max-w-md rounded-xl p-6 shadow-xl">
              <Dialog.Title className="text-brand-navy text-lg font-bold">
                דחיית אימות זהות
              </Dialog.Title>
              <Dialog.Description className="text-brand-ink/80 mt-1 text-sm">
                הסוחר יקבל את הסיבה במייל. פעולה לא ניתנת לביטול.
              </Dialog.Description>

              <label
                htmlFor="reject-reason"
                className="text-brand-navy mt-4 block text-sm font-medium"
              >
                סיבת הדחייה
                <span aria-hidden="true" className="text-danger-text ms-1">
                  *
                </span>
              </label>
              <textarea
                id="reject-reason"
                rows={4}
                maxLength={500}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                aria-describedby="reject-reason-count"
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <p
                id="reject-reason-count"
                aria-live="polite"
                className="text-brand-ink/60 mt-1 text-xs"
              >
                נותרו {remaining} תווים
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
                  onClick={() => void submitReject()}
                  disabled={rejectBusy || !rejectReason.trim()}
                  aria-busy={rejectBusy || undefined}
                  className="bg-danger hover:bg-danger/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {rejectBusy ? "דוחה…" : "דחה ושלח מייל"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
