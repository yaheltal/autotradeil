"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * Pending approval screen + KYC document upload (Phase 4.4 fix).
 *
 * After signup, the dealer is auto-signed-in by /signup/dealer/page.tsx
 * so we have a Supabase session here. The 3 KYC documents must be
 * uploaded BEFORE admin reviews the application — this page is the
 * primary place for that.
 *
 * A11y (approved):
 *   - H1 focused on mount.
 *   - Each upload row: visible <label> + sr-only <input type="file">
 *     kept in tab order, styled <button>-via-htmlFor trigger.
 *   - Progress live region: polite, only re-announces on value CHANGE
 *     (counter ref guards against poll storms).
 *   - When kyc_status === "submitted" → success block shown, upload
 *     rows hidden.
 *   - When kyc_status === "rejected" → role="alert" inline + uploads
 *     re-enabled with the rejection reason.
 */

type KycStatus = "pending" | "submitted" | "approved" | "rejected";

type KycStatusResponse = {
  kyc_status: KycStatus;
  id_card_front_url: string | null;
  id_card_back_url: string | null;
  dealer_license_url: string | null;
  kyc_rejected_reason: string | null;
};

type DocType = "id_front" | "id_back" | "dealer_license";
const DOCS: Record<DocType, { field: keyof KycStatusResponse; label: string }> = {
  id_front: { field: "id_card_front_url", label: "תעודת זהות — צד קדמי" },
  id_back: { field: "id_card_back_url", label: "תעודת זהות — צד אחורי" },
  dealer_license: { field: "dealer_license_url", label: "רישיון סוחר רכבים" },
};

export default function SignupPendingPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  const [token, setToken] = useState<string | null>(null);
  const [kyc, setKyc] = useState<KycStatusResponse | null>(null);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [filenames, setFilenames] = useState<Record<DocType, string>>({
    id_front: "",
    id_back: "",
    dealer_license: "",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // Live-region progress — only update on value change, not poll storm.
  const [progressMsg, setProgressMsg] = useState("");
  const lastProgressRef = useRef("");

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Bootstrap session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setToken(data.session.access_token);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<KycStatusResponse>("/api/v1/security/kyc/status", { token });
      setKyc(res);
    } catch {
      /* non-fatal */
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Update the progress message ONLY when the count actually changes.
  useEffect(() => {
    if (!kyc) return;
    const count =
      Number(!!kyc.id_card_front_url) +
      Number(!!kyc.id_card_back_url) +
      Number(!!kyc.dealer_license_url);
    const next = count === 3 ? "כל המסמכים הועלו" : `הועלו ${count} מתוך 3 מסמכים`;
    if (next !== lastProgressRef.current) {
      lastProgressRef.current = next;
      setProgressMsg(next);
    }
  }, [kyc]);

  // Move focus to the success heading on transition to "submitted".
  useEffect(() => {
    if (kyc?.kyc_status === "submitted") {
      queueMicrotask(() => successHeadingRef.current?.focus());
    }
  }, [kyc?.kyc_status]);

  const upload = async (docType: DocType, file: File) => {
    if (!token) return;
    setUploading(docType);
    try {
      const form = new FormData();
      form.append("document_type", docType);
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/security/kyc/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message ?? body.detail ?? `HTTP ${res.status}`);
      }
      setFilenames((prev) => ({ ...prev, [docType]: file.name }));
      await loadStatus();
    } catch {
      /* non-fatal — show generic error in the row */
    } finally {
      setUploading(null);
    }
  };

  const isSubmitted = kyc?.kyc_status === "submitted";
  const isRejected = kyc?.kyc_status === "rejected";
  const allUploaded =
    !!kyc && !!kyc.id_card_front_url && !!kyc.id_card_back_url && !!kyc.dealer_license_url;
  const canFinalize = !!token && allUploaded && (kyc?.kyc_status === "pending" || isRejected);

  const finalize = async () => {
    if (!token) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      await apiFetch("/api/v1/security/kyc/finalize", {
        method: "POST",
        token,
      });
      setConfirmOpen(false);
      await loadStatus();
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : "שליחת הבקשה נכשלה, נסה שוב");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-12 text-center">
        <BrandMark />

        <div
          aria-hidden="true"
          className="bg-brand-gold text-brand-navy mt-10 flex h-20 w-20 items-center justify-center rounded-full"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy mt-8 text-3xl font-bold tracking-tight focus:outline-none"
        >
          הבקשה שלך התקבלה!
        </h1>
        <p className="text-brand-ink/80 mt-4 max-w-sm">
          לפני אישור הצוות יש להעלות שלושה מסמכי זהות. התהליך לוקח בדרך כלל עד 24 שעות לאחר שהמסמכים
          מתקבלים.
        </p>

        {/* Polite progress region — only fires on count change */}
        <p role="status" aria-live="polite" className="sr-only" key={progressMsg}>
          {progressMsg}
        </p>

        {!token ? (
          <p role="status" className="text-brand-ink/70 mt-8 max-w-sm text-sm">
            יש להתחבר כדי להעלות מסמכי זהות.{" "}
            <Link
              href="/login"
              className="text-brand-navy decoration-brand-gold rounded-sm font-semibold underline decoration-2 underline-offset-4"
            >
              התחברות
            </Link>
          </p>
        ) : isSubmitted ? (
          <section
            aria-labelledby="kyc-success-heading"
            className="border-ok/30 bg-ok-bg/50 mt-8 w-full rounded-lg border p-6 text-start"
          >
            <h2
              ref={successHeadingRef}
              tabIndex={-1}
              className="text-brand-navy text-lg font-bold focus:outline-none"
            >
              המסמכים הועלו בהצלחה ✓
            </h2>
            <p className="text-brand-ink mt-2 text-sm">נחכה לאישור הצוות. נעדכן אותך במייל.</p>
          </section>
        ) : (
          <section aria-labelledby="kyc-uploads-heading" className="mt-8 w-full text-start">
            <h2 id="kyc-uploads-heading" className="text-brand-navy text-lg font-semibold">
              אימות זהות — שלב חובה
            </h2>

            {isRejected && kyc?.kyc_rejected_reason ? (
              <div
                role="alert"
                className="bg-danger-bg text-danger-text mt-3 rounded-md px-4 py-3 text-sm"
              >
                <p className="font-semibold">המסמכים נדחו</p>
                <p className="mt-1">{kyc.kyc_rejected_reason}</p>
                <p className="mt-2 text-xs">ניתן להעלות מסמכים מתוקנים מתחת.</p>
              </div>
            ) : null}

            <ul className="mt-4 space-y-3">
              {(Object.keys(DOCS) as DocType[]).map((docType) => {
                const meta = DOCS[docType];
                const uploaded = !!kyc?.[meta.field];
                const inputId = `kyc-${docType}`;
                return (
                  <li key={docType} className="border-brand-navy/10 rounded-md border bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <label
                          htmlFor={inputId}
                          className="text-brand-navy block text-sm font-semibold"
                        >
                          {meta.label}
                        </label>
                        <p className="text-brand-ink/60 mt-0.5 text-xs">
                          JPEG / PNG / WebP / HEIC / PDF, עד 10MB
                        </p>
                        {filenames[docType] ? (
                          <p className="text-brand-ink/80 mt-1 text-xs">
                            <span className="text-brand-ink/60">נבחר: </span>
                            <span className="font-mono">{filenames[docType]}</span>
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {uploaded ? (
                          <span
                            aria-label="הועלה בהצלחה"
                            className="text-ok-text inline-flex items-center gap-1 text-sm font-semibold"
                          >
                            <span aria-hidden="true">✓</span>
                            הועלה
                          </span>
                        ) : null}
                        <input
                          id={inputId}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                          capture="environment"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(docType, f);
                          }}
                        />
                        <label
                          htmlFor={inputId}
                          aria-label={`${uploaded ? "החלפת" : "העלאת"} ${meta.label}`}
                          className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-within:outline-brand-navy inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-within:outline-2 focus-within:outline-offset-2"
                        >
                          {uploading === docType ? "מעלה…" : uploaded ? "החלף" : "בחר קובץ / צלם"}
                        </label>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setFinalizeError(null);
                  setConfirmOpen(true);
                }}
                disabled={!canFinalize}
                aria-disabled={!canFinalize}
                aria-describedby={!canFinalize ? "finalize-help" : undefined}
                className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 focus-visible:outline-brand-navy disabled:bg-brand-navy/20 disabled:text-brand-navy/60 inline-flex min-h-12 w-full items-center justify-center rounded-md px-5 py-3 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
              >
                סיום תהליך
              </button>
              {!canFinalize ? (
                <p id="finalize-help" className="text-brand-ink/70 mt-2 text-center text-xs">
                  ניתן לסיים את התהליך לאחר העלאת שלושת המסמכים.
                </p>
              ) : null}
            </div>
          </section>
        )}

        <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in fixed inset-0 z-40 bg-black/50" />
            <Dialog.Content
              dir="rtl"
              aria-describedby="kyc-confirm-desc"
              className="data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 text-start shadow-2xl focus:outline-none"
            >
              <Dialog.Title className="text-brand-navy text-xl font-bold">
                סיום תהליך אימות
              </Dialog.Title>
              <Dialog.Description
                id="kyc-confirm-desc"
                className="text-brand-ink mt-3 text-sm leading-relaxed"
              >
                המסמכים שלך יישלחו לסקירה ע״י הצוות שלנו. תוך 24 שעות תקבל מייל ו-SMS עם תוצאת
                האימות. לאחר השליחה לא ניתן יהיה להחליף מסמכים עד לתשובת הצוות.
              </Dialog.Description>

              {finalizeError ? (
                <p
                  role="alert"
                  className="bg-danger-bg text-danger-text mt-4 rounded-md px-3 py-2 text-sm"
                >
                  {finalizeError}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void finalize()}
                  disabled={finalizing}
                  aria-disabled={finalizing}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  {finalizing ? "שולח…" : "אישור ושליחה"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            חזרה לדף הכניסה
          </Link>
          <a
            href="https://wa.me/972500000000"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="יצירת קשר דרך וואטסאפ"
            className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            יצירת קשר בוואטסאפ
          </a>
        </div>
      </div>
    </main>
  );
}
