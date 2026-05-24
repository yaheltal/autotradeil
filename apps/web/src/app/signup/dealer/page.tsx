"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, FileText, Loader2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * SmartCameraCapture is camera + canvas + Hebrew bidi fallback — only
 * needed when a doc slot is active. Lazy load saves ~15kB on the
 * signup page. Its own visual language is unchanged in this commit;
 * it lives in a modal layer above this page.
 */
const SmartCameraCapture = dynamic(
  () => import("@/components/SmartCameraCapture").then((m) => m.SmartCameraCapture),
  { ssr: false },
);

/*
 * /signup/dealer — editorial TOC wizard.
 *
 *   AutoTradeIL
 *   הרשמה כסוחר
 *   ──────────
 *   01 — צילום מסמכים · 02 — אישור פרטים
 *
 * Step 1 (capture)  3 SmartCameraCapture slots → POST /security/kyc/extract
 *                   pre-fills the form.
 * Step 2 (form)     4 numbered sections (account / personal / business /
 *                   contact). Submit creates account → auto-login →
 *                   best-effort blob uploads → /signup/dealer/pending.
 *
 * Auth + validation behaviour preserved verbatim from the prior
 * implementation; only the surface is rebuilt.
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
    <main
      id="main"
      tabIndex={-1}
      className="bg-paper text-ink py-3xl sm:py-4xl min-h-[100dvh] focus:outline-none"
    >
      <div className="px-lg sm:px-2xl mx-auto w-full max-w-xl">
        <Masthead ref={headingRef} title="הרשמה כסוחר" step={step} />

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
          <FormStep
            register={register}
            errors={errors}
            isSubmitting={isSubmitting}
            extractWarning={extractWarning}
            submitError={submitError}
            errorRef={errorRef}
            onSubmit={onSubmit}
          />
        )}

        <p className="text-muted mt-3xl text-center text-sm">
          כבר יש לך חשבון?{" "}
          <Link
            href="/login"
            className="text-ink duration-fast hover:text-accent focus-visible:outline-accent rounded-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            כנס
          </Link>
        </p>
      </div>
    </main>
  );
}

// =============================================================================
// Masthead — eyebrow + serif H1 + hairline + TOC step strip.
// Shared visual language with /login; the step strip is signup-specific.
// =============================================================================

const Masthead = forwardRef<HTMLHeadingElement, { title: string; step: "capture" | "form" }>(
  function MastheadImpl({ title, step }, ref) {
    return (
      <header>
        <p className="text-muted text-xs font-medium uppercase tracking-widest">AutoTradeIL</p>
        <h1
          ref={ref}
          tabIndex={-1}
          className="text-ink mt-sm tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
        >
          {title}
        </h1>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <ol aria-label="שלבי הרשמה" className="gap-md mt-lg flex items-center text-sm">
          <li
            aria-current={step === "capture" ? "step" : undefined}
            className={step === "capture" ? "text-ink font-medium" : "text-subtle"}
          >
            <span className="font-tabular">01</span>
            <span className="mx-xxs">—</span>
            צילום מסמכים
          </li>
          <li aria-hidden="true" className="text-subtle">
            ·
          </li>
          <li
            aria-current={step === "form" ? "step" : undefined}
            className={step === "form" ? "text-ink font-medium" : "text-subtle"}
          >
            <span className="font-tabular">02</span>
            <span className="mx-xxs">—</span>
            אישור פרטים
          </li>
        </ol>
      </header>
    );
  },
);

// =============================================================================
// Step 1 — capture: 3 SmartCameraCapture slots + Continue.
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
    <section aria-labelledby="capture-heading" className="mt-3xl">
      <h2 id="capture-heading" className="sr-only">
        צילום מסמכים
      </h2>
      <p className="text-muted text-sm">צלם את שלושת המסמכים. נמלא את שאר הפרטים אוטומטית.</p>

      <ul role="list" className="mt-xl">
        {slots.map((slot, i) => {
          const blob = docs[slot];
          return (
            <li
              key={slot}
              className={[
                "gap-md py-md flex items-center",
                i > 0 ? "border-hairline border-t" : "",
              ].join(" ")}
            >
              {blob ? (
                <Image
                  src={URL.createObjectURL(blob)}
                  alt={`תצוגה מקדימה: ${SLOT_LABELS[slot]}`}
                  width={96}
                  height={64}
                  unoptimized
                  className="border-hairline h-16 w-24 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="border-hairline bg-paper text-subtle flex h-16 w-24 shrink-0 items-center justify-center rounded-md border"
                >
                  <FileText className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-medium">{SLOT_LABELS[slot]}</p>
                {blob ? (
                  <p className="text-ok-fg gap-xxs mt-xxs inline-flex items-center text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    צולם בהצלחה
                  </p>
                ) : (
                  <p className="text-subtle mt-xxs text-xs">טרם צולם</p>
                )}
              </div>
              <Button
                ref={(el) => {
                  slotBtnRefs.current[slot] = el;
                }}
                type="button"
                size="sm"
                variant={blob ? "outline" : "default"}
                onClick={() => setActiveSlot(slot)}
              >
                {blob ? "צלם שוב" : "צלם"}
              </Button>
            </li>
          );
        })}
      </ul>

      <p id="continue-hint" className="text-subtle mt-lg text-xs">
        {allCaptured ? "מוכן להמשך — לחץ ״המשך״ להמשך הרשמה" : "צלם את כל 3 המסמכים כדי להמשיך"}
      </p>

      <Button
        type="button"
        size="lg"
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
          "mt-sm w-full",
          allCaptured && !extracting ? "" : "cursor-not-allowed opacity-50",
        ].join(" ")}
      >
        {extracting ? (
          <>
            <Loader2 aria-hidden="true" className="animate-spin" />
            <span>מנתח את המסמכים…</span>
          </>
        ) : (
          "המשך"
        )}
      </Button>

      <p role="status" aria-live="polite" className="sr-only" key={String(extracting)}>
        {extracting ? "מנתח את המסמכים, אנא המתן" : ""}
      </p>

      {/* SmartCameraCapture mounts whenever a slot is active. Its own visual
          language is unchanged in this commit; lives in a modal layer above. */}
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
    </section>
  );
}

// =============================================================================
// Step 2 — form: 4 numbered sections (account / personal / business / contact).
// =============================================================================

function FormStep({
  register,
  errors,
  isSubmitting,
  extractWarning,
  submitError,
  errorRef,
  onSubmit,
}: {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  isSubmitting: boolean;
  extractWarning: string | null;
  submitError: string | null;
  errorRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="mt-3xl">
      <div className="space-y-md mb-xl">
        {extractWarning ? (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{extractWarning}</AlertDescription>
          </Alert>
        ) : null}
        {submitError ? (
          <Alert
            variant="destructive"
            ref={errorRef as React.RefObject<HTMLDivElement>}
            tabIndex={-1}
            className="focus:outline-none"
          >
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="space-y-3xl">
        <FormSection number="01" title="פרטי חשבון">
          <Field
            id="email"
            label="אימייל"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            registration={register("email")}
            error={errors.email?.message}
          />
          <Field
            id="password"
            label="סיסמה"
            hint="לפחות 8 תווים"
            type="password"
            autoComplete="new-password"
            required
            registration={register("password")}
            error={errors.password?.message}
          />
        </FormSection>

        <FormSection number="02" title="פרטים אישיים" subtitle="חולץ אוטומטית מהת״ז — ניתן לערוך">
          <div className="gap-lg grid grid-cols-1 sm:grid-cols-2">
            <Field
              id="first_name"
              label="שם פרטי"
              autoComplete="given-name"
              registration={register("first_name")}
              error={errors.first_name?.message}
            />
            <Field
              id="last_name"
              label="שם משפחה"
              autoComplete="family-name"
              registration={register("last_name")}
              error={errors.last_name?.message}
            />
          </div>
          <div className="gap-lg grid grid-cols-1 sm:grid-cols-2">
            <Field
              id="id_number"
              label="מספר תעודת זהות"
              hint="9 ספרות"
              inputMode="numeric"
              autoComplete="off"
              maxLength={9}
              registration={register("id_number")}
              error={errors.id_number?.message}
            />
            <Field
              id="birth_date"
              label="תאריך לידה"
              type="date"
              autoComplete="bday"
              registration={register("birth_date")}
              error={errors.birth_date?.message}
            />
          </div>
        </FormSection>

        <FormSection number="03" title="פרטי העסק">
          <Field
            id="business_name"
            label="שם העסק"
            autoComplete="organization"
            required
            registration={register("business_name")}
            error={errors.business_name?.message}
          />
          <Field
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
          <div className="gap-lg grid grid-cols-1 sm:grid-cols-2">
            <Field
              id="license_number"
              label="מספר רישיון סחר"
              required
              registration={register("license_number")}
              error={errors.license_number?.message}
            />
            <Field
              id="license_until"
              label="תוקף רישיון"
              type="date"
              registration={register("license_until")}
              error={errors.license_until?.message}
            />
          </div>
          <Field
            id="city"
            label="עיר"
            autoComplete="address-level2"
            required
            registration={register("city")}
            error={errors.city?.message}
          />
          <Field
            id="lot_size"
            label="גודל החצר — כמה רכבים בו-זמנית"
            hint="מספר בין 1 ל-1000"
            inputMode="numeric"
            autoComplete="off"
            required
            registration={register("lot_size")}
            error={errors.lot_size?.message}
          />
        </FormSection>

        <FormSection number="04" title="פרטי יצירת קשר">
          <Field
            id="contact_name"
            label="שם איש קשר"
            autoComplete="name"
            required
            registration={register("contact_name")}
            error={errors.contact_name?.message}
          />
          <Field
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
        </FormSection>
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting}
        aria-busy={isSubmitting || undefined}
        className="mt-3xl w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 aria-hidden="true" className="animate-spin" />
            <span>שולח…</span>
          </>
        ) : (
          "שלח הרשמה"
        )}
      </Button>
    </form>
  );
}

// =============================================================================
// Section header pattern — used inside FormStep. Numbered eyebrow ("01"),
// title, optional subtitle, and a hairline rule that anchors the section.
// =============================================================================

function FormSection({
  number,
  title,
  subtitle,
  children,
}: {
  number: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header>
        <p className="gap-sm text-muted flex items-baseline text-xs font-medium uppercase tracking-widest">
          <span className="font-tabular">{number}</span>
          <span className="text-ink normal-case tracking-normal" style={{ fontSize: "0.875rem" }}>
            {title}
          </span>
        </p>
        {subtitle ? <p className="text-muted mt-xxs text-xs">{subtitle}</p> : null}
        <div aria-hidden="true" className="bg-hairline mt-md h-px w-full" />
      </header>
      <div className="mt-lg space-y-lg">{children}</div>
    </section>
  );
}

// =============================================================================
// Field — single text input with Label + optional hint + optional error.
// Local to this page (replacing the brand-* FormField helper inline rather
// than retokening that file, since FormField also serves InventoryFormDialog).
// =============================================================================

function Field({
  id,
  label,
  hint,
  error,
  type = "text",
  inputMode,
  autoComplete,
  required,
  dir,
  maxLength,
  registration,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  required?: boolean;
  dir?: "ltr" | "rtl";
  maxLength?: number;
  registration: ReturnType<ReturnType<typeof useForm<FormValues>>["register"]>;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-xs">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger-fg ms-1">
            *
          </span>
        ) : null}
      </Label>
      {hint ? (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        dir={dir}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={error ? "border-danger" : undefined}
        {...registration}
      />
      {error ? (
        <p id={errorId} className="text-danger-fg text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
