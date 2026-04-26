"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { BrandMark } from "@/components/BrandMark";
import { FormField } from "@/components/FormField";

/*
 * SmartCameraCapture is camera + canvas + Hebrew bidi fallback — only
 * needed when a doc slot is active. Lazy load saves ~15kB on the
 * signup page.
 */
const SmartCameraCapture = dynamic(
  () => import("@/components/SmartCameraCapture").then((m) => m.SmartCameraCapture),
  { ssr: false },
);
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * Dealer signup — Phase 6.6 wizard.
 *
 * Step 1 (capture):  3 SmartCameraCapture slots (id_front, id_back, license).
 *                    "המשך" runs POST /security/kyc/extract → pre-fills step 2.
 * Step 2 (form):     Existing fieldsets, defaults pre-filled from extraction.
 *                    Submit creates the account + auto-login + uploads the 3
 *                    captured blobs to /security/kyc/upload (best-effort).
 *
 * A11y notes (per accessibility-lead bundle review):
 *   - Step indicator <ol aria-label> with aria-current="step"
 *   - Slot list as <ul role="list"> + <li> + plain <button> (NOT <details>)
 *   - Captured thumbnail has meaningful alt ("תצוגה מקדימה: ת״ז קדמי")
 *   - "המשך" disabled uses aria-disabled (focusable so SR users hear why)
 *   - aria-busy on "המשך" while extracting; aria-live "מנתח..." region
 *   - On step 1→2: focus moves to the page <h1> (announces context)
 *   - All existing form a11y patterns kept (FormField, role=alert summary)
 */

const IL_MOBILE = /^(\+972|0)5\d{8}$/;

const schema = z.object({
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים"),
  business_name: z
    .string()
    .min(2, "חובה להזין שם עסק (לפחות 2 תווים)")
    .max(120, "שם העסק ארוך מדי"),
  business_id: z.string().regex(/^\d{9}$/, "ח.פ / ע.מ חייב להיות בדיוק 9 ספרות"),
  license_number: z.string().min(3, "חובה להזין מספר רישיון סחר").max(50, "מספר רישיון ארוך מדי"),
  phone: z
    .string()
    .refine((v) => IL_MOBILE.test(v.replace(/[\s\-()]/g, "")), "פורמט לא תקין, דוגמה: 0501234567"),
  city: z.string().min(2, "חובה להזין עיר").max(80, "שם עיר ארוך מדי"),
  lot_size: z
    .string()
    .regex(/^\d+$/, "יש להזין מספר")
    .refine((v) => {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 1000;
    }, "מספר בין 1 ל-1000"),
  contact_name: z.string().min(2, "חובה להזין שם איש קשר").max(120, "שם ארוך מדי"),
  // Phase 6.6 — KYC personal info (auto-filled from AI extract)
  first_name: z.string().max(100).optional().or(z.literal("")),
  last_name: z.string().max(100).optional().or(z.literal("")),
  id_number: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{9}$/.test(v), "מספר תעודת זהות חייב להיות 9 ספרות"),
  birth_date: z.string().optional().or(z.literal("")),
  license_until: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

type DocSlot = "id_front" | "id_back" | "license";
type ExtractResult = {
  first_name?: string | null;
  last_name?: string | null;
  id_number?: string | null;
  birth_date?: string | null;
  license_number?: string | null;
  license_until?: string | null;
  city?: string | null;
  warnings?: string[];
};

const SLOT_LABELS: Record<DocSlot, string> = {
  id_front: "ת״ז קדמי",
  id_back: "ת״ז אחורי",
  license: "רישיון סוחר רכב",
};

export default function DealerSignupPage() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const slotBtnRefs = useRef<Record<DocSlot, HTMLButtonElement | null>>({
    id_front: null,
    id_back: null,
    license: null,
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [step, setStep] = useState<"capture" | "form">("capture");

  // Step 1 state
  const [docs, setDocs] = useState<{ [K in DocSlot]?: Blob }>({});
  const [activeSlot, setActiveSlot] = useState<DocSlot | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (submitError) errorRef.current?.focus();
  }, [submitError]);

  const allCaptured = !!(docs.id_front && docs.id_back && docs.license);

  const goToFormStep = async () => {
    if (!allCaptured) return;
    setExtracting(true);
    setExtractWarning(null);
    try {
      const fd = new FormData();
      fd.append("id_front", docs.id_front!, "id_front.jpg");
      fd.append("id_back", docs.id_back!, "id_back.jpg");
      fd.append("license", docs.license!, "license.jpg");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/security/kyc/extract`,
        { method: "POST", body: fd },
      );
      if (res.ok) {
        const data = (await res.json()) as ExtractResult;
        // Pre-fill the form from the extraction. Empty strings keep the
        // resolver happy on optional fields.
        reset({
          email: "",
          password: "",
          business_name: "",
          business_id: "",
          license_number: data.license_number ?? "",
          phone: "",
          city: data.city ?? "",
          lot_size: "",
          contact_name:
            data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : "",
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
          id_number: data.id_number ?? "",
          birth_date: data.birth_date ?? "",
          license_until: data.license_until ?? "",
        });
        if (data.warnings && data.warnings.length > 0) {
          // Distinguish "service not configured" (env-var gap on the
          // backend) from partial-success warnings — they read very
          // differently to the user and the former is actionable only
          // by the operator (set ANTHROPIC_API_KEY on Render).
          const notConfigured = data.warnings.some((w) =>
            w.toLowerCase().includes("not configured"),
          );
          setExtractWarning(
            notConfigured
              ? "המילוי האוטומטי לא זמין כרגע — אנא מלא את הפרטים ידנית."
              : `הזיהוי האוטומטי הצליח חלקית — אנא בדוק את הפרטים. (${data.warnings.join(", ")})`,
          );
        }
      } else {
        setExtractWarning("הזיהוי האוטומטי נכשל, נא למלא ידנית");
      }
    } catch {
      setExtractWarning("הזיהוי האוטומטי נכשל, נא למלא ידנית");
    } finally {
      setExtracting(false);
      setStep("form");
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const payload = {
      email: values.email,
      password: values.password,
      business_name: values.business_name,
      business_id: values.business_id,
      license_number: values.license_number,
      phone: values.phone.replace(/[\s\-()]/g, ""),
      city: values.city,
      lot_size: parseInt(values.lot_size, 10),
      contact_name: values.contact_name,
      first_name: values.first_name || undefined,
      last_name: values.last_name || undefined,
      id_number: values.id_number || undefined,
      birth_date: values.birth_date || undefined,
      license_until: values.license_until || undefined,
    };
    try {
      await apiFetch("/api/v1/auth/signup/dealer", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Auto-login so the post-signup KYC upload + /pending page work.
      let token: string | undefined;
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.signInWithPassword({
          email: payload.email,
          password: values.password,
        });
        token = data.session?.access_token;
      } catch {
        /* non-fatal */
      }
      // Best-effort upload of the 3 captured KYC blobs.
      if (token) {
        const slots: DocSlot[] = ["id_front", "id_back", "license"];
        for (const slot of slots) {
          const blob = docs[slot];
          if (!blob) continue;
          const fd = new FormData();
          fd.append("file", blob, `${slot}.jpg`);
          fd.append("document_type", slot);
          await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/security/kyc/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          }).catch(() => {
            // Silent — dealer can re-upload from /pending
          });
        }
      }
      router.push("/signup/dealer/pending");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "שגיאה בשליחת הטופס. נסה שוב.");
    }
  });

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex justify-center">
          <BrandMark />
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy mt-10 text-center text-3xl font-bold tracking-tight focus:outline-none"
        >
          הרשמה כסוחר
        </h1>

        {/* Step indicator */}
        <ol
          aria-label="שלבי הרשמה"
          className="text-brand-ink/70 mt-4 flex justify-center gap-2 text-sm"
        >
          <li
            aria-current={step === "capture" ? "step" : undefined}
            className={step === "capture" ? "text-brand-navy font-bold" : ""}
          >
            1. צילום מסמכים
          </li>
          <li aria-hidden="true">›</li>
          <li
            aria-current={step === "form" ? "step" : undefined}
            className={step === "form" ? "text-brand-navy font-bold" : ""}
          >
            2. אישור פרטים
          </li>
        </ol>

        {step === "capture" ? (
          <CaptureStep
            docs={docs}
            setDocs={setDocs}
            activeSlot={activeSlot}
            setActiveSlot={setActiveSlot}
            slotBtnRefs={slotBtnRefs}
            onContinue={goToFormStep}
            extracting={extracting}
            allCaptured={allCaptured}
          />
        ) : (
          <>
            {extractWarning ? (
              <p
                role="status"
                className="mt-6 rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {extractWarning}
              </p>
            ) : null}
            {submitError ? (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3 text-sm focus:outline-none"
              >
                {submitError}
              </div>
            ) : null}

            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-8">
              <fieldset className="border-brand-navy/15 rounded-lg border bg-white p-5">
                <legend className="text-brand-navy px-2 text-sm font-semibold">פרטי חשבון</legend>
                <div className="space-y-5">
                  <FormField
                    id="email"
                    label="אימייל"
                    type="email"
                    autoComplete="email"
                    required
                    registration={register("email")}
                    error={errors.email?.message}
                  />
                  <FormField
                    id="password"
                    label="סיסמה"
                    hint="לפחות 8 תווים"
                    type="password"
                    autoComplete="new-password"
                    required
                    registration={register("password")}
                    error={errors.password?.message}
                  />
                </div>
              </fieldset>

              <fieldset className="border-brand-navy/15 rounded-lg border bg-white p-5">
                <legend className="text-brand-navy px-2 text-sm font-semibold">
                  פרטים אישיים (חולץ אוטומטית מהת״ז — ניתן לערוך)
                </legend>
                <div className="space-y-5">
                  <FormField
                    id="first_name"
                    label="שם פרטי"
                    autoComplete="given-name"
                    registration={register("first_name")}
                    error={errors.first_name?.message}
                  />
                  <FormField
                    id="last_name"
                    label="שם משפחה"
                    autoComplete="family-name"
                    registration={register("last_name")}
                    error={errors.last_name?.message}
                  />
                  <FormField
                    id="id_number"
                    label="מספר תעודת זהות"
                    hint="9 ספרות"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={9}
                    registration={register("id_number")}
                    error={errors.id_number?.message}
                  />
                  <FormField
                    id="birth_date"
                    label="תאריך לידה"
                    type="date"
                    autoComplete="bday"
                    registration={register("birth_date")}
                    error={errors.birth_date?.message}
                  />
                </div>
              </fieldset>

              <fieldset className="border-brand-navy/15 rounded-lg border bg-white p-5">
                <legend className="text-brand-navy px-2 text-sm font-semibold">פרטי העסק</legend>
                <div className="space-y-5">
                  <FormField
                    id="business_name"
                    label="שם העסק"
                    autoComplete="organization"
                    required
                    registration={register("business_name")}
                    error={errors.business_name?.message}
                  />
                  <FormField
                    id="business_id"
                    label="ח.פ / ע.מ"
                    hint="9 ספרות"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    maxLength={9}
                    registration={register("business_id")}
                    error={errors.business_id?.message}
                  />
                  <FormField
                    id="license_number"
                    label="מספר רישיון סחר ברכב"
                    required
                    registration={register("license_number")}
                    error={errors.license_number?.message}
                  />
                  <FormField
                    id="license_until"
                    label="תוקף רישיון סוחר"
                    type="date"
                    registration={register("license_until")}
                    error={errors.license_until?.message}
                  />
                  <FormField
                    id="city"
                    label="עיר"
                    autoComplete="address-level2"
                    required
                    registration={register("city")}
                    error={errors.city?.message}
                  />
                  <FormField
                    id="lot_size"
                    label="גודל החצר — כמה רכבים בו-זמנית"
                    hint="מספר בין 1 ל-1000"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    registration={register("lot_size")}
                    error={errors.lot_size?.message}
                  />
                </div>
              </fieldset>

              <fieldset className="border-brand-navy/15 rounded-lg border bg-white p-5">
                <legend className="text-brand-navy px-2 text-sm font-semibold">
                  פרטי יצירת קשר
                </legend>
                <div className="space-y-5">
                  <FormField
                    id="contact_name"
                    label="שם איש קשר"
                    autoComplete="name"
                    required
                    registration={register("contact_name")}
                    error={errors.contact_name?.message}
                  />
                  <FormField
                    id="phone"
                    label="טלפון"
                    hint="טלפון נייד ישראלי, דוגמה: 0501234567"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    required
                    registration={register("phone")}
                    error={errors.phone?.message}
                  />
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-3 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? "שולח…" : "שלח הרשמה"}
              </button>
            </form>
          </>
        )}

        <p className="text-brand-ink/70 mt-8 text-center text-sm">
          כבר יש לך חשבון?{" "}
          <Link
            href="/login"
            className="text-brand-navy decoration-brand-gold focus-visible:outline-brand-navy rounded-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            כנס
          </Link>
        </p>
      </div>
    </main>
  );
}

// =============================================================================
// CaptureStep — step 1: 3 SmartCameraCapture slots + Continue.
// =============================================================================

function CaptureStep({
  docs,
  setDocs,
  activeSlot,
  setActiveSlot,
  slotBtnRefs,
  onContinue,
  extracting,
  allCaptured,
}: {
  docs: { [K in DocSlot]?: Blob };
  setDocs: (next: { [K in DocSlot]?: Blob }) => void;
  activeSlot: DocSlot | null;
  setActiveSlot: (s: DocSlot | null) => void;
  slotBtnRefs: React.MutableRefObject<Record<DocSlot, HTMLButtonElement | null>>;
  onContinue: () => void;
  extracting: boolean;
  allCaptured: boolean;
}) {
  const slots: DocSlot[] = ["id_front", "id_back", "license"];
  return (
    <>
      <p className="text-brand-ink/70 mt-4 text-center text-sm">
        צלם את שלושת המסמכים — נמלא לך את שאר הפרטים אוטומטית.
      </p>

      <ul role="list" className="mt-6 space-y-3">
        {slots.map((slot) => {
          const blob = docs[slot];
          return (
            <li
              key={slot}
              className="border-brand-navy/15 flex items-center gap-3 rounded-lg border bg-white p-4"
            >
              {blob ? (
                <img
                  src={URL.createObjectURL(blob)}
                  alt={`תצוגה מקדימה: ${SLOT_LABELS[slot]}`}
                  className="border-brand-navy/10 h-16 w-24 rounded border object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="bg-brand-navy/5 border-brand-navy/10 flex h-16 w-24 items-center justify-center rounded border text-2xl"
                >
                  📄
                </div>
              )}
              <div className="flex-1">
                <p className="text-brand-navy text-sm font-semibold">{SLOT_LABELS[slot]}</p>
                {blob ? (
                  <p className="text-ok-text text-xs">צולם בהצלחה ✓</p>
                ) : (
                  <p className="text-brand-ink/60 text-xs">טרם צולם</p>
                )}
              </div>
              <button
                ref={(el) => {
                  slotBtnRefs.current[slot] = el;
                }}
                type="button"
                onClick={() => setActiveSlot(slot)}
                className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {blob ? "צלם שוב" : "צלם"}
              </button>
            </li>
          );
        })}
      </ul>

      <p id="continue-hint" className="text-brand-ink/60 mt-4 text-center text-xs">
        {allCaptured ? "מוכן להמשך — לחץ ״המשך״ להמשך הרשמה" : "צלם את כל 3 המסמכים כדי להמשיך"}
      </p>

      <button
        type="button"
        onClick={onContinue}
        aria-disabled={!allCaptured || extracting}
        aria-busy={extracting || undefined}
        aria-describedby="continue-hint"
        onClickCapture={(e) => {
          if (!allCaptured || extracting) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className={[
          "bg-brand-navy text-brand-cream mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-3 text-base font-semibold",
          "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
          allCaptured && !extracting ? "hover:bg-brand-navy/90" : "cursor-not-allowed opacity-50",
        ].join(" ")}
      >
        {extracting ? "מנתח את המסמכים…" : "המשך"}
      </button>

      <p role="status" aria-live="polite" className="sr-only" key={String(extracting)}>
        {extracting ? "מנתח את המסמכים, אנא המתן" : ""}
      </p>

      {/* SmartCameraCapture mounts whenever a slot is active */}
      {activeSlot ? (
        <SmartCameraCapture
          open={activeSlot !== null}
          onOpenChange={(open) => {
            if (!open) {
              const restoreBtn = activeSlot ? slotBtnRefs.current[activeSlot] : null;
              setActiveSlot(null);
              queueMicrotask(() => restoreBtn?.focus());
            }
          }}
          label={SLOT_LABELS[activeSlot]}
          onCapture={(blob) => {
            setDocs({ ...docs, [activeSlot]: blob });
          }}
        />
      ) : null}
    </>
  );
}
