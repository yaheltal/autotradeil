"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { BrandMark } from "@/components/BrandMark";
import { DashboardSubNav } from "@/components/DashboardSubNav";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationPrefs } from "@/components/NotificationPrefs";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";

/*
 * Dealer security & identity page (Phase 3.5).
 *
 * A11y plan (approved):
 *   - H1 focusable on mount.
 *   - Dedicated status live region (aria-label="סטטוס פעולה") for action
 *     results — distinct from NotificationBell's toast channel.
 *   - OTP: single <input autocomplete="one-time-code" maxLength={6}
 *     inputMode="numeric"> (not 6 boxes).
 *   - TOTP: QR <img> alt is QR-only; adjacent visible text handles
 *     "can't scan" fallback. Plaintext secret lives inside a <details>
 *     (native keyboard + SR support).
 *   - Phone input: dir="ltr" on the input itself; hint text also dir="ltr".
 *   - KYC upload: visually-hidden file input kept in tab order (.sr-only),
 *     styled button triggers it. Filename announced via role=status AND
 *     surfaced as visible chip next to the button.
 *   - Upload progress region: "הועלו X מתוך 3 מסמכים" for SR completeness.
 *   - All modal dialogs trap focus + return to trigger (Radix default).
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

type DocMeta = { field: keyof KycStatusResponse; label: string };

const DOCS: Record<DocType, DocMeta> = {
  id_front: { field: "id_card_front_url", label: "תעודת זהות — צד קדמי" },
  id_back: { field: "id_card_back_url", label: "תעודת זהות — צד אחורי" },
  dealer_license: { field: "dealer_license_url", label: "רישיון סוחר רכבים" },
};

const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  pending: "ממתין להעלאת מסמכים",
  submitted: "הוגש — ממתין לבדיקה",
  approved: "אושר",
  rejected: "נדחה",
};

const KYC_STATUS_CLASS: Record<KycStatus, string> = {
  pending: "bg-amber-100 text-amber-900 ring-amber-600/30",
  submitted: "bg-indigo-100 text-indigo-950 ring-indigo-700/30",
  approved: "bg-ok-bg text-ok-text ring-ok/30",
  rejected: "bg-danger-bg text-danger-text ring-danger/30",
};

export default function SecurityPage() {
  const { token } = useDealerAuth("/dashboard/security");

  // ---------- Action-result status region ----------
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const h1Ref = useRef<HTMLHeadingElement>(null);

  // ---------- OTP preferences ----------
  const [otpMethod, setOtpMethod] = useState<"email" | "sms">("email");
  const [phone, setPhone] = useState("");
  const [otpSaveBusy, setOtpSaveBusy] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSendBusy, setOtpSendBusy] = useState(false);

  // ---------- 2FA ----------
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollQr, setEnrollQr] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  // ---------- KYC ----------
  const [kyc, setKyc] = useState<KycStatusResponse | null>(null);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [kycFilenames, setKycFilenames] = useState<Record<DocType, string>>({
    id_front: "",
    id_back: "",
    dealer_license: "",
  });

  const loadKyc = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<KycStatusResponse>("/api/v1/security/kyc/status", {
        token,
      });
      setKyc(res);
    } catch {
      /* non-fatal */
    }
  }, [token]);

  // Initial bootstrap — load the dealer's current 2FA + phone + KYC status.
  // We don't have a single "profile" endpoint so we poke /kyc/status and
  // default 2FA to false until we add a /me endpoint. 2FA state flips to
  // true after a successful enrollment.
  useEffect(() => {
    void loadKyc();
  }, [loadKyc]);

  useEffect(() => {
    if (kyc) h1Ref.current?.focus();
  }, [kyc]);

  // ---------- Handlers ----------

  const saveOtpPrefs = async () => {
    if (!token) return;
    setOtpSaveBusy(true);
    try {
      if (otpMethod === "sms" && phone) {
        await apiFetch("/api/v1/security/phone", {
          method: "POST",
          token,
          body: JSON.stringify({ phone }),
        });
      }
      await apiFetch("/api/v1/security/otp/method", {
        method: "POST",
        token,
        body: JSON.stringify({ method: otpMethod }),
      });
      setToast("ההעדפות נשמרו");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setOtpSaveBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!token) return;
    setOtpSendBusy(true);
    try {
      await apiFetch("/api/v1/security/otp/send", {
        method: "POST",
        token,
        body: JSON.stringify({ method: otpMethod }),
      });
      setToast("הקוד נשלח");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שגיאה בשליחת הקוד");
    } finally {
      setOtpSendBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!token) return;
    try {
      await apiFetch("/api/v1/security/otp/verify", {
        method: "POST",
        token,
        body: JSON.stringify({ code: otpCode }),
      });
      setToast("הקוד אומת בהצלחה");
      setOtpCode("");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "קוד שגוי");
    }
  };

  const startEnroll = async () => {
    if (!token) return;
    setEnrollError(null);
    setEnrollCode("");
    try {
      const res = await apiFetch<{ secret: string; qr_data_url: string }>(
        "/api/v1/security/2fa/setup",
        { method: "POST", token },
      );
      setEnrollSecret(res.secret);
      setEnrollQr(res.qr_data_url);
      setEnrollOpen(true);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שגיאה בהגדרת 2FA");
    }
  };

  const confirmEnroll = async () => {
    if (!token) return;
    setEnrollBusy(true);
    setEnrollError(null);
    try {
      await apiFetch("/api/v1/security/2fa/enable", {
        method: "POST",
        token,
        body: JSON.stringify({ secret: enrollSecret, code: enrollCode }),
      });
      setTwoFaEnabled(true);
      setEnrollOpen(false);
      setToast("2FA הופעל בהצלחה");
    } catch (e) {
      setEnrollError(e instanceof Error ? e.message : "קוד שגוי");
    } finally {
      setEnrollBusy(false);
    }
  };

  const confirmDisable = async () => {
    if (!token) return;
    setDisableBusy(true);
    setDisableError(null);
    try {
      await apiFetch("/api/v1/security/2fa/disable", {
        method: "POST",
        token,
        body: JSON.stringify({ code: disableCode }),
      });
      setTwoFaEnabled(false);
      setDisableOpen(false);
      setDisableCode("");
      setToast("2FA בוטל");
    } catch (e) {
      setDisableError(e instanceof Error ? e.message : "קוד שגוי");
    } finally {
      setDisableBusy(false);
    }
  };

  const uploadKyc = async (docType: DocType, file: File) => {
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
      setKycFilenames((prev) => ({ ...prev, [docType]: file.name }));
      setToast(`המסמך ${DOCS[docType].label} הועלה`);
      await loadKyc();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שגיאה בהעלאה");
    } finally {
      setUploading(null);
    }
  };

  if (!token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  // KYC docs progress for live-region completeness announcement
  const uploadedCount = kyc
    ? Number(!!kyc.id_card_front_url) +
      Number(!!kyc.id_card_back_url) +
      Number(!!kyc.dealer_license_url)
    : 0;

  return (
    <div className="bg-brand-cream text-brand-ink min-h-screen">
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <BrandMark />
          <NotificationBell token={token} />
        </div>
      </header>

      <DashboardSubNav />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <BackLink href="/dashboard" label="חזרה ללוח הבקרה" />
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="text-brand-navy mt-3 text-3xl font-bold tracking-tight focus:outline-none"
          >
            אבטחה ואימות זהות
          </h1>
          <p className="text-brand-ink/70 mt-2">הגדרות אימות דו-שלבי, קוד חד-פעמי ומסמכי זהות.</p>

          {/* Action-result live region (separate from NotificationBell) */}
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

          <div className="mt-8 space-y-8">
            {/* ======================================================
                1) OTP preferences
                ====================================================== */}
            <section
              aria-labelledby="otp-heading"
              className="border-brand-navy/10 rounded-lg border bg-white p-6"
            >
              <h2 id="otp-heading" className="text-brand-navy text-lg font-semibold">
                קוד חד-פעמי (OTP)
              </h2>
              <p className="text-brand-ink/70 mt-1 text-sm">
                קבל קוד בן 6 ספרות לפעולות רגישות. תקף ל-10 דקות.
              </p>

              <fieldset className="mt-4 border-0 p-0">
                <legend className="text-brand-navy text-sm font-medium">שיטת אימות</legend>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <label className="border-brand-navy/20 hover:bg-brand-navy/5 inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2">
                    <input
                      type="radio"
                      name="otp-method"
                      value="email"
                      checked={otpMethod === "email"}
                      onChange={() => setOtpMethod("email")}
                      className="accent-brand-navy"
                    />
                    <span className="text-brand-navy text-sm font-medium">אימייל</span>
                  </label>
                  <label className="border-brand-navy/20 hover:bg-brand-navy/5 inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2">
                    <input
                      type="radio"
                      name="otp-method"
                      value="sms"
                      checked={otpMethod === "sms"}
                      onChange={() => setOtpMethod("sms")}
                      className="accent-brand-navy"
                    />
                    <span className="text-brand-navy text-sm font-medium">SMS</span>
                  </label>
                </div>
              </fieldset>

              {otpMethod === "sms" ? (
                <div className="mt-4">
                  <label htmlFor="otp-phone" className="text-brand-navy block text-sm font-medium">
                    מספר טלפון
                  </label>
                  <p id="otp-phone-hint" dir="ltr" className="text-brand-navy/70 mt-1 text-xs">
                    פורמט: 05X-XXXXXXX או +972…
                  </p>
                  <input
                    id="otp-phone"
                    type="tel"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-describedby="otp-phone-hint"
                    className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                  />
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveOtpPrefs()}
                  disabled={otpSaveBusy}
                  aria-busy={otpSaveBusy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {otpSaveBusy ? "שומר…" : "שמור העדפות"}
                </button>
                <button
                  type="button"
                  onClick={() => void sendOtp()}
                  disabled={otpSendBusy}
                  aria-busy={otpSendBusy || undefined}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  {otpSendBusy ? "שולח…" : "שלח קוד לבדיקה"}
                </button>
              </div>

              <div className="border-brand-navy/10 mt-5 border-t pt-4">
                <label
                  htmlFor="otp-verify-code"
                  className="text-brand-navy block text-sm font-medium"
                >
                  הזן את הקוד שהתקבל
                </label>
                <p id="otp-verify-hint" className="text-brand-navy/70 mt-1 text-xs">
                  6 ספרות שנשלחו למייל או ב-SMS
                </p>
                <input
                  id="otp-verify-code"
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  aria-describedby="otp-verify-hint"
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-40 rounded-md border bg-white px-3 py-2 font-mono text-base tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                <button
                  type="button"
                  onClick={() => void verifyOtp()}
                  disabled={otpCode.length !== 6}
                  className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 focus-visible:outline-brand-navy mt-3 inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  אמת קוד
                </button>
              </div>
            </section>

            {/* ======================================================
                2) TOTP 2FA
                ====================================================== */}
            <section
              aria-labelledby="twofa-heading"
              className="border-brand-navy/10 rounded-lg border bg-white p-6"
            >
              <h2 id="twofa-heading" className="text-brand-navy text-lg font-semibold">
                אימות דו-שלבי (2FA)
              </h2>
              <p className="text-brand-ink/70 mt-1 text-sm">
                קוד מתחלף מאפליקציית Google Authenticator, Authy או דומה.
              </p>

              <p className="mt-4 text-sm">
                <span className="text-brand-ink/60">סטטוס: </span>
                {twoFaEnabled ? (
                  <span className="text-ok-text font-semibold">
                    <span aria-hidden="true">✓ </span>
                    מופעל
                  </span>
                ) : (
                  <span className="text-brand-ink/80 font-semibold">לא מופעל</span>
                )}
              </p>

              {twoFaEnabled ? (
                <button
                  type="button"
                  onClick={() => setDisableOpen(true)}
                  className="border-danger text-danger-text hover:bg-danger-bg focus-visible:outline-danger-text mt-4 inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  בטל 2FA
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startEnroll()}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  הפעל 2FA
                </button>
              )}
            </section>

            {/* ======================================================
                3) KYC documents
                ====================================================== */}
            <section
              aria-labelledby="kyc-heading"
              className="border-brand-navy/10 rounded-lg border bg-white p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="kyc-heading" className="text-brand-navy text-lg font-semibold">
                    מסמכי זהות
                  </h2>
                  <p className="text-brand-ink/70 mt-1 text-sm">
                    נדרשים 3 מסמכים — תעודת זהות (קדמי+אחורי) ורישיון סוחר רכבים.
                  </p>
                </div>
                {kyc ? (
                  <span
                    aria-label={`סטטוס אימות זהות: ${KYC_STATUS_LABEL[kyc.kyc_status]}`}
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${KYC_STATUS_CLASS[kyc.kyc_status]}`}
                  >
                    {KYC_STATUS_LABEL[kyc.kyc_status]}
                  </span>
                ) : null}
              </div>

              {kyc?.kyc_status === "rejected" && kyc.kyc_rejected_reason ? (
                <div
                  role="region"
                  aria-label="סיבת דחיית אימות הזהות"
                  className="bg-danger-bg text-danger-text mt-4 rounded-md px-4 py-3"
                >
                  <p className="text-xs font-semibold">סיבת הדחייה:</p>
                  <p className="mt-1 text-sm">{kyc.kyc_rejected_reason}</p>
                  <p className="mt-2 text-xs">ניתן להעלות מסמכים חדשים מתחת.</p>
                </div>
              ) : null}

              {/* Progress live region — announces "X מתוך 3" as SR completeness cue */}
              <p role="status" aria-live="polite" className="sr-only" key={uploadedCount}>
                {uploadedCount === 3 ? "כל המסמכים הועלו" : `הועלו ${uploadedCount} מתוך 3 מסמכים`}
              </p>

              <ul className="mt-5 space-y-4">
                {(Object.keys(DOCS) as DocType[]).map((docType) => (
                  <KycRow
                    key={docType}
                    docType={docType}
                    uploaded={!!kyc?.[DOCS[docType].field]}
                    filename={kycFilenames[docType]}
                    uploading={uploading === docType}
                    onSelect={(file) => void uploadKyc(docType, file)}
                  />
                ))}
              </ul>
            </section>

            {/* 4) Notification preferences (Phase 4.4 Step 7) */}
            <NotificationPrefsLoader token={token} />
          </div>
        </div>
      </main>

      {/* =========================================================
          2FA enrollment dialog
          ========================================================= */}
      <Dialog.Root open={enrollOpen} onOpenChange={setEnrollOpen}>
        <Dialog.Portal>
          <Dialog.Overlay aria-hidden="true" className="bg-brand-navy/40 fixed inset-0 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-brand-cream w-full max-w-md rounded-xl p-6 shadow-xl">
              <Dialog.Title className="text-brand-navy text-lg font-bold">
                הפעלת אימות דו-שלבי
              </Dialog.Title>
              <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
                סרוק את הקוד באפליקציית Google Authenticator, Authy או דומה, ואז הקלד את הקוד בן 6
                הספרות שמופיע באפליקציה.
              </Dialog.Description>

              {enrollQr ? (
                <div className="mt-4 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={enrollQr}
                    alt="קוד QR לסריקה ב-Google Authenticator"
                    className="border-brand-navy/10 h-48 w-48 rounded-md border bg-white p-2"
                  />
                </div>
              ) : null}

              <details className="border-brand-navy/10 mt-3 rounded-md border bg-white px-3 py-2">
                <summary className="text-brand-navy cursor-pointer text-sm font-medium">
                  לא יכול לסרוק? השתמש בקוד להקלדה ידנית
                </summary>
                <code
                  dir="ltr"
                  className="text-brand-ink bg-brand-cream/60 mt-2 block break-all rounded px-2 py-1 text-sm tracking-wider"
                >
                  {enrollSecret}
                </code>
              </details>

              <div className="mt-5">
                <label htmlFor="enroll-code" className="text-brand-navy block text-sm font-medium">
                  קוד מהאפליקציה
                </label>
                <input
                  id="enroll-code"
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-40 rounded-md border bg-white px-3 py-2 font-mono text-base tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              {enrollError ? (
                <p
                  role="alert"
                  className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm"
                >
                  {enrollError}
                </p>
              ) : null}

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
                  onClick={() => void confirmEnroll()}
                  disabled={enrollBusy || enrollCode.length !== 6}
                  aria-busy={enrollBusy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {enrollBusy ? "מפעיל…" : "אשר והפעל"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* =========================================================
          2FA disable dialog
          ========================================================= */}
      <Dialog.Root open={disableOpen} onOpenChange={setDisableOpen}>
        <Dialog.Portal>
          <Dialog.Overlay aria-hidden="true" className="bg-brand-navy/40 fixed inset-0 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-brand-cream w-full max-w-md rounded-xl p-6 shadow-xl">
              <Dialog.Title className="text-brand-navy text-lg font-bold">
                ביטול אימות דו-שלבי
              </Dialog.Title>
              <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
                להזנת הקוד הנוכחי מהאפליקציה כדי לבטל את ההגנה.
              </Dialog.Description>

              <label
                htmlFor="disable-code"
                className="text-brand-navy mt-4 block text-sm font-medium"
              >
                קוד מהאפליקציה
              </label>
              <input
                id="disable-code"
                type="text"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-40 rounded-md border bg-white px-3 py-2 font-mono text-base tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2"
              />

              {disableError ? (
                <p
                  role="alert"
                  className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm"
                >
                  {disableError}
                </p>
              ) : null}

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
                  onClick={() => void confirmDisable()}
                  disabled={disableBusy || disableCode.length !== 6}
                  aria-busy={disableBusy || undefined}
                  className="bg-danger hover:bg-danger/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {disableBusy ? "מבטל…" : "בטל 2FA"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function KycRow({
  docType,
  uploaded,
  filename,
  uploading,
  onSelect,
}: {
  docType: DocType;
  uploaded: boolean;
  filename: string;
  uploading: boolean;
  onSelect: (file: File) => void;
}) {
  const id = `kyc-${docType}`;
  const meta = DOCS[docType];

  return (
    <li className="border-brand-navy/10 rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label htmlFor={id} className="text-brand-navy block text-sm font-semibold">
            {meta.label}
          </label>
          <p className="text-brand-ink/60 mt-0.5 text-xs">
            JPEG / PNG / WebP / HEIC / PDF, עד 10MB
          </p>
          {filename ? (
            <p className="text-brand-ink/80 mt-1 text-xs">
              <span className="text-brand-ink/60">נבחר: </span>
              <span className="font-mono">{filename}</span>
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
          {/* Visually-hidden file input — kept in the tab order.
              Label above is wired via htmlFor so keyboard users can
              tab straight to the input and trigger it. */}
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelect(f);
            }}
          />
          <label
            htmlFor={id}
            aria-label={`${uploaded ? "החלף" : "העלה"} — ${meta.label}${filename ? `, קובץ נוכחי: ${filename}` : ""}`}
            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-within:outline-brand-navy inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-within:outline-2 focus-within:outline-offset-2"
          >
            {uploading ? "מעלה…" : uploaded ? "החלף קובץ" : "בחר קובץ / צלם"}
          </label>
        </div>
      </div>
    </li>
  );
}

// Phase 4.4 — fetch the dealer's current prefs once, then hand off to
// the NotificationPrefs component for editing/saving.
function NotificationPrefsLoader({ token }: { token: string }) {
  const [initial, setInitial] = useState<{
    notification_offers: boolean;
    notification_deals: boolean;
    notification_updates: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetch<{
          notification_offers: boolean;
          notification_deals: boolean;
          notification_updates: boolean;
        }>("/api/v1/dealers/me", { token });
        if (!cancelled) {
          setInitial({
            notification_offers: me.notification_offers,
            notification_deals: me.notification_deals,
            notification_updates: me.notification_updates,
          });
        }
      } catch {
        /* silent — section just stays in loading state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!initial) return null;
  return <NotificationPrefs token={token} initial={initial} />;
}
