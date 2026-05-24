"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { NotificationPrefs } from "@/components/NotificationPrefs";
import { PushNotificationsToggle } from "@/components/PushNotificationsToggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /dashboard/security — editorial identity surface.
 *
 *   אבטחה וזהות
 *   ──────────
 *   הגדרות אימות ומסמכי זהות · אומת ✓        ← dek byline (KYC status)
 *
 *   קוד חד-פעמי (OTP)
 *   ──────────
 *   ⦿ אימייל   ⦾ SMS
 *   [שמור]  [שלח קוד]
 *
 *   אימות דו-שלבי (2FA)
 *   ──────────
 *   סטטוס: לא מופעל     [הפעל 2FA]
 *
 *   מסמכי זהות
 *   ──────────
 *   3 מסמכים · 2 מתוך 3 הועלו
 *   ────  תעודת זהות — צד קדמי           ✓ הועלה   [החלף]
 *   ────  תעודת זהות — צד אחורי                    [בחר קובץ]
 *   ────  רישיון סוחר רכבים                        [בחר קובץ]
 *
 *   התראות         → <NotificationPrefs>
 *   התראות דחיפה   → <PushNotificationsToggle>
 *
 * All chrome (sidebar / topbar / mobile bell / logout) comes from
 * DashboardShell; this page is content only. No per-section cards —
 * typography + hairlines carry the structure (same rhythm as
 * /dashboard/analytics).
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
  pending: "ממתין לאימות",
  submitted: "ממתין לבדיקה",
  approved: "אומת",
  rejected: "נדחה",
};

export default function SecurityPage() {
  const { token } = useDealerAuth("/dashboard/security");
  const qc = useQueryClient();
  const h1Ref = useRef<HTMLHeadingElement>(null);

  // ── Action-result live region (separate from NotificationBell's toast)
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── OTP preferences ───────────────────────────────────────────
  const [otpMethod, setOtpMethod] = useState<"email" | "sms">("email");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // ── 2FA ───────────────────────────────────────────────────────
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollQr, setEnrollQr] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);

  // ── KYC ───────────────────────────────────────────────────────
  const [kycFilenames, setKycFilenames] = useState<Record<DocType, string>>({
    id_front: "",
    id_back: "",
    dealer_license: "",
  });
  const [uploading, setUploading] = useState<DocType | null>(null);

  const kycQuery = useQuery({
    queryKey: queryKeys.security.root(),
    queryFn: () => apiFetch<KycStatusResponse>("/api/v1/security/kyc/status", { token: token! }),
    enabled: !!token,
  });
  const kyc = kycQuery.data ?? null;

  useEffect(() => {
    if (kyc) h1Ref.current?.focus();
  }, [kyc]);

  const invalidateSecurity = () => qc.invalidateQueries({ queryKey: queryKeys.security.root() });

  // ── Mutations ─────────────────────────────────────────────────

  const savePrefsMutation = useMutation({
    mutationFn: async () => {
      if (otpMethod === "sms" && phone) {
        await apiFetch("/api/v1/security/phone", {
          method: "POST",
          token: token!,
          body: JSON.stringify({ phone }),
        });
      }
      await apiFetch("/api/v1/security/otp/method", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ method: otpMethod }),
      });
    },
    onSuccess: () => setToast("ההעדפות נשמרו"),
    onError: (e) => setToast(e instanceof Error ? e.message : "שגיאה בשמירה"),
  });

  const sendOtpMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/security/otp/send", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ method: otpMethod }),
      }),
    onSuccess: () => setToast("הקוד נשלח"),
    onError: (e) => setToast(e instanceof Error ? e.message : "שגיאה בשליחת הקוד"),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/security/otp/verify", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ code: otpCode }),
      }),
    onSuccess: () => {
      setToast("הקוד אומת בהצלחה");
      setOtpCode("");
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "קוד שגוי"),
  });

  const startEnrollMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ secret: string; qr_data_url: string }>("/api/v1/security/2fa/setup", {
        method: "POST",
        token: token!,
      }),
    onSuccess: (res) => {
      setEnrollSecret(res.secret);
      setEnrollQr(res.qr_data_url);
      setEnrollCode("");
      setEnrollError(null);
      setEnrollOpen(true);
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "שגיאה בהגדרת 2FA"),
  });

  const confirmEnrollMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/security/2fa/enable", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ secret: enrollSecret, code: enrollCode }),
      }),
    onSuccess: () => {
      setTwoFaEnabled(true);
      setEnrollOpen(false);
      setToast("2FA הופעל בהצלחה");
      void invalidateSecurity();
    },
    onError: (e) => setEnrollError(e instanceof Error ? e.message : "קוד שגוי"),
  });

  const confirmDisableMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/security/2fa/disable", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ code: disableCode }),
      }),
    onSuccess: () => {
      setTwoFaEnabled(false);
      setDisableOpen(false);
      setDisableCode("");
      setToast("2FA בוטל");
      void invalidateSecurity();
    },
    onError: (e) => setDisableError(e instanceof Error ? e.message : "קוד שגוי"),
  });

  // KYC upload uses multipart/form-data — apiFetch (JSON-only) can't carry
  // it, so we hand-roll fetch but route the post-success refresh through
  // the same TanStack invalidation channel as the other mutations.
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
      await invalidateSecurity();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שגיאה בהעלאה");
    } finally {
      setUploading(null);
    }
  };

  const uploadedCount = kyc
    ? Number(!!kyc.id_card_front_url) +
      Number(!!kyc.id_card_back_url) +
      Number(!!kyc.dealer_license_url)
    : 0;

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg sm:px-2xl py-2xl mx-auto max-w-3xl focus:outline-none"
    >
      {/* ── MASTHEAD ──────────────────────────────────────────────────── */}
      <header>
        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
        >
          אבטחה וזהות
        </h1>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted gap-xs mt-lg flex flex-wrap items-center text-sm">
          <span>הגדרות אימות ומסמכי זהות</span>
          {!kyc ? (
            <Skeleton className="inline-block h-4 w-20" />
          ) : (
            <>
              <span className="text-subtle mx-xxs">·</span>
              <KycStatusPill status={kyc.kyc_status} />
            </>
          )}
        </p>
      </header>

      {/* Action-result live region — distinct from NotificationBell's toast */}
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

      {/* ── SECTION 1: OTP ──────────────────────────────────────────── */}
      <section aria-labelledby="otp-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">
          קוד חד-פעמי (OTP)
        </p>
        <h2 id="otp-heading" className="sr-only">
          קוד חד-פעמי
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
        <p className="text-muted mt-lg text-sm">קוד בן 6 ספרות לפעולות רגישות. תקף ל-10 דקות.</p>

        <fieldset className="mt-lg border-0 p-0">
          <legend className="text-ink text-sm font-medium">שיטת אימות</legend>
          <div className="gap-sm mt-sm flex flex-col sm:flex-row">
            <RadioPill
              name="otp-method"
              value="email"
              checked={otpMethod === "email"}
              onChange={() => setOtpMethod("email")}
            >
              אימייל
            </RadioPill>
            <RadioPill
              name="otp-method"
              value="sms"
              checked={otpMethod === "sms"}
              onChange={() => setOtpMethod("sms")}
            >
              SMS
            </RadioPill>
          </div>
        </fieldset>

        {otpMethod === "sms" ? (
          <div className="mt-lg max-w-sm">
            <Label htmlFor="otp-phone">מספר טלפון</Label>
            <p id="otp-phone-hint" dir="ltr" className="text-muted mt-xxs text-xs">
              פורמט: 05X-XXXXXXX או +972…
            </p>
            <Input
              id="otp-phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-describedby="otp-phone-hint"
              className="mt-xs"
            />
          </div>
        ) : null}

        <div className="gap-sm mt-lg flex flex-wrap">
          <Button
            type="button"
            onClick={() => savePrefsMutation.mutate()}
            disabled={savePrefsMutation.isPending}
            aria-busy={savePrefsMutation.isPending || undefined}
          >
            {savePrefsMutation.isPending ? "שומר…" : "שמור העדפות"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => sendOtpMutation.mutate()}
            disabled={sendOtpMutation.isPending}
            aria-busy={sendOtpMutation.isPending || undefined}
          >
            {sendOtpMutation.isPending ? "שולח…" : "שלח קוד לבדיקה"}
          </Button>
        </div>

        <div className="mt-xl max-w-sm">
          <Label htmlFor="otp-verify-code">הזן את הקוד שהתקבל</Label>
          <p id="otp-verify-hint" className="text-muted mt-xxs text-xs">
            6 ספרות שנשלחו למייל או ב-SMS
          </p>
          <Input
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
            className="font-tabular mt-xs w-40 tracking-widest"
          />
          <Button
            type="button"
            onClick={() => verifyOtpMutation.mutate()}
            disabled={otpCode.length !== 6 || verifyOtpMutation.isPending}
            className="mt-sm"
          >
            אמת קוד
          </Button>
        </div>
      </section>

      {/* ── SECTION 2: 2FA ──────────────────────────────────────────── */}
      <section aria-labelledby="twofa-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">
          אימות דו-שלבי (2FA)
        </p>
        <h2 id="twofa-heading" className="sr-only">
          אימות דו-שלבי
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
        <p className="text-muted mt-lg text-sm">
          קוד מתחלף מאפליקציית Google Authenticator, Authy או דומה.
        </p>

        <p className="mt-lg text-sm">
          <span className="text-muted">סטטוס: </span>
          {twoFaEnabled ? (
            <span className="text-ink gap-xxs inline-flex items-center font-medium">
              <Check aria-hidden="true" className="h-4 w-4" />
              מופעל
            </span>
          ) : (
            <span className="text-ink font-medium">לא מופעל</span>
          )}
        </p>

        <div className="mt-lg">
          {twoFaEnabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisableOpen(true)}
              className="text-danger-fg border-danger/30 hover:bg-danger-bg"
            >
              בטל 2FA
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => startEnrollMutation.mutate()}
              disabled={startEnrollMutation.isPending}
              aria-busy={startEnrollMutation.isPending || undefined}
            >
              {startEnrollMutation.isPending ? "מכין…" : "הפעל 2FA"}
            </Button>
          )}
        </div>
      </section>

      {/* ── SECTION 3: KYC ──────────────────────────────────────────── */}
      <section aria-labelledby="kyc-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">מסמכי זהות</p>
        <h2 id="kyc-heading" className="sr-only">
          מסמכי זהות
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
        <p className="text-muted font-tabular mt-lg text-sm" role="status" aria-live="polite">
          {!kyc ? (
            <Skeleton className="inline-block h-4 w-48" />
          ) : (
            <>
              3 מסמכים נדרשים <span className="text-subtle mx-xxs">·</span>
              <span className="text-ink font-medium"> {uploadedCount} מתוך 3</span> הועלו
            </>
          )}
        </p>

        {kyc?.kyc_status === "rejected" && kyc.kyc_rejected_reason ? (
          <Alert variant="destructive" className="mt-lg">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              <span className="font-medium">סיבת הדחייה: </span>
              {kyc.kyc_rejected_reason}
              <span className="mt-xxs block text-xs">ניתן להעלות מסמכים חדשים מתחת.</span>
            </AlertDescription>
          </Alert>
        ) : null}

        <ul className="mt-xl">
          {!kyc
            ? [0, 1, 2].map((i) => <KycRowSkeleton key={i} />)
            : (Object.keys(DOCS) as DocType[]).map((docType) => (
                <KycRow
                  key={docType}
                  docType={docType}
                  uploaded={!!kyc[DOCS[docType].field]}
                  filename={kycFilenames[docType]}
                  uploading={uploading === docType}
                  onSelect={(file) => void uploadKyc(docType, file)}
                />
              ))}
        </ul>
      </section>

      {/* ── SECTION 4: Notification preferences ─────────────────────── */}
      <section aria-labelledby="prefs-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">התראות</p>
        <h2 id="prefs-heading" className="sr-only">
          העדפות התראה
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
        <div className="mt-lg">{token ? <NotificationPrefsLoader token={token} /> : null}</div>
      </section>

      {/* ── SECTION 5: Push notifications ───────────────────────────── */}
      <section aria-labelledby="push-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">התראות דחיפה</p>
        <h2 id="push-heading" className="sr-only">
          התראות דחיפה
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
        <p className="text-muted mt-lg text-sm">
          התראות מערכת ישירות לדפדפן או לטלפון, גם כשהאתר סגור.
        </p>
        <div className="mt-lg">{token ? <PushNotificationsToggle token={token} /> : null}</div>
      </section>

      {/* ── 2FA ENROLLMENT DIALOG ───────────────────────────────────── */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הפעלת אימות דו-שלבי</DialogTitle>
            <DialogDescription>
              סרוק את הקוד באפליקציית Google Authenticator, Authy או דומה, ואז הקלד את הקוד בן 6
              הספרות שמופיע באפליקציה.
            </DialogDescription>
          </DialogHeader>

          {enrollQr ? (
            <div className="mt-md flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enrollQr}
                alt="קוד QR לסריקה ב-Google Authenticator"
                className="border-hairline bg-paper h-48 w-48 rounded-md border p-2"
              />
            </div>
          ) : null}

          <details className="border-hairline px-sm py-xs mt-sm rounded-md border">
            <summary className="text-ink cursor-pointer text-sm font-medium">
              לא יכול לסרוק? השתמש בקוד להקלדה ידנית
            </summary>
            <code
              dir="ltr"
              className="text-ink bg-muted/10 mt-xs px-xs py-xxs font-tabular block break-all rounded text-sm tracking-wider"
            >
              {enrollSecret}
            </code>
          </details>

          <div className="mt-md">
            <Label htmlFor="enroll-code">קוד מהאפליקציה</Label>
            <Input
              id="enroll-code"
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={enrollCode}
              onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
              className="font-tabular mt-xs w-40 tracking-widest"
            />
          </div>

          {enrollError ? (
            <Alert variant="destructive" className="mt-sm">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>{enrollError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEnrollOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              onClick={() => confirmEnrollMutation.mutate()}
              disabled={confirmEnrollMutation.isPending || enrollCode.length !== 6}
              aria-busy={confirmEnrollMutation.isPending || undefined}
            >
              {confirmEnrollMutation.isPending ? "מפעיל…" : "אשר והפעל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 2FA DISABLE DIALOG ──────────────────────────────────────── */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ביטול אימות דו-שלבי</DialogTitle>
            <DialogDescription>הזן את הקוד הנוכחי מהאפליקציה כדי לבטל את ההגנה.</DialogDescription>
          </DialogHeader>

          <div className="mt-md">
            <Label htmlFor="disable-code">קוד מהאפליקציה</Label>
            <Input
              id="disable-code"
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
              className="font-tabular mt-xs w-40 tracking-widest"
            />
          </div>

          {disableError ? (
            <Alert variant="destructive" className="mt-sm">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>{disableError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => confirmDisableMutation.mutate()}
              disabled={confirmDisableMutation.isPending || disableCode.length !== 6}
              aria-busy={confirmDisableMutation.isPending || undefined}
            >
              {confirmDisableMutation.isPending ? "מבטל…" : "בטל 2FA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ============================================================================
// KycStatusPill — small inline pill for the masthead dek byline.
// Uses ink/paper + accent for "approved"; tonal grays elsewhere — no
// new colors. The "אומת" success case earns the accent token (CTA-only)
// because it's the one identity milestone the dealer wants to land on.
// ============================================================================

function KycStatusPill({ status }: { status: KycStatus }) {
  if (status === "approved") {
    return (
      <span className="gap-xxs text-accent inline-flex items-center font-medium">
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
        {KYC_STATUS_LABEL[status]}
      </span>
    );
  }
  if (status === "rejected") {
    return <span className="text-danger-fg font-medium">{KYC_STATUS_LABEL[status]}</span>;
  }
  return <span className="text-ink font-medium">{KYC_STATUS_LABEL[status]}</span>;
}

// ============================================================================
// RadioPill — native input wrapped in a hairline-bordered label.
// Replaces the previous `bg-brand-navy/5` segmented radios. Keyboard
// behavior is the browser default; visual state is driven by
// peer-checked Tailwind variants on the label container.
// ============================================================================

function RadioPill({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={[
        "border-hairline gap-sm px-md py-sm duration-fast bg-paper inline-flex min-h-11 flex-1 cursor-pointer items-center rounded-md border transition-colors",
        "focus-within:outline-accent focus-within:outline-none focus-within:outline focus-within:outline-2 focus-within:outline-offset-2",
        checked ? "border-ink bg-muted/5" : "hover:bg-muted/5",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="accent-ink"
      />
      <span className="text-ink text-sm font-medium">{children}</span>
    </label>
  );
}

// ============================================================================
// KycRow — single document row. Hairline-only separator (no per-row
// border) keeps the editorial rhythm. ✓ glyph → lucide Check.
// ============================================================================

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
    <li className="border-hairline gap-md py-lg flex flex-wrap items-center justify-between border-b last:border-b-0">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-ink text-sm font-medium">
          {meta.label}
        </Label>
        <p className="text-muted mt-xxs text-xs">JPEG / PNG / WebP / HEIC / PDF, עד 10MB</p>
        {filename ? (
          <p className="text-muted mt-xxs text-xs">
            <span>נבחר: </span>
            <span className="font-tabular">{filename}</span>
          </p>
        ) : null}
      </div>

      <div className="gap-sm flex items-center">
        {uploaded ? (
          <span
            aria-label="הועלה בהצלחה"
            className="text-accent gap-xxs inline-flex items-center text-sm font-medium"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
            הועלה
          </span>
        ) : null}
        {/* Visually-hidden file input — kept in the tab order via the
            wired-up <Label htmlFor>. Keyboard users can tab straight to
            the input and trigger the file picker. */}
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
        <Button type="button" variant={uploaded ? "outline" : "default"} asChild>
          <label
            htmlFor={id}
            aria-label={`${uploaded ? "החלף" : "העלה"} — ${meta.label}${filename ? `, קובץ נוכחי: ${filename}` : ""}`}
            className="cursor-pointer"
          >
            {uploading ? "מעלה…" : uploaded ? "החלף קובץ" : "בחר קובץ / צלם"}
          </label>
        </Button>
      </div>
    </li>
  );
}

function KycRowSkeleton() {
  return (
    <li
      aria-hidden="true"
      className="border-hairline gap-md py-lg flex items-center justify-between border-b last:border-b-0"
    >
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-10 w-32" />
    </li>
  );
}

// ============================================================================
// NotificationPrefsLoader — fetches the dealer's prefs once, then hands
// off to NotificationPrefs for editing/saving. Routed through TanStack
// so it joins the security cache (same root key) and refreshes when
// /dealers/me is invalidated upstream.
// ============================================================================

function NotificationPrefsLoader({ token }: { token: string }) {
  const prefsQuery = useQuery({
    queryKey: queryKeys.notifications.prefs(),
    queryFn: () =>
      apiFetch<{
        notification_offers: boolean;
        notification_deals: boolean;
        notification_updates: boolean;
      }>("/api/v1/dealers/me", { token }),
    enabled: !!token,
  });

  if (!prefsQuery.data) {
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <span className="sr-only">טוען העדפות התראה…</span>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  }

  return (
    <NotificationPrefs
      token={token}
      initial={{
        notification_offers: prefsQuery.data.notification_offers,
        notification_deals: prefsQuery.data.notification_deals,
        notification_updates: prefsQuery.data.notification_updates,
      }}
    />
  );
}
