"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { BrandMark } from "@/components/BrandMark";
import { FormField } from "@/components/FormField";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * Dealer signup form — 9 fields, 3 semantic groups, Hebrew RTL.
 *
 * A11y fixes applied from the approved plan:
 *   - 3 <fieldset> groups with visible <legend>
 *   - Labels paired via htmlFor; hint id + error id listed in
 *     aria-describedby (hint first)
 *   - role="alert" ONLY on the top-of-form summary
 *   - business_id + lot_size use type="text" inputMode="numeric"
 *     (type="number" has known a11y issues)
 *   - type="tel" + autocomplete="tel-national" for phone
 *   - business_id: autocomplete="off" (no standard token for tax ID)
 *   - On API error, focus jumps to top-of-form alert
 *   - On validation error, react-hook-form auto-focuses first invalid field
 */

const IL_MOBILE = /^(\+972|0)5\d{8}$/;

// Schema stays string-in / string-out so react-hook-form's input types
// line up with <input> values. We convert lot_size to number + strip
// phone separators at submit time.
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
});

type FormValues = z.infer<typeof schema>;

export default function DealerSignupPage() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (submitError) {
      errorRef.current?.focus();
    }
  }, [submitError]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    // Normalize at the edge: strip phone separators, convert lot_size to int.
    const payload = {
      ...values,
      phone: values.phone.replace(/[\s\-()]/g, ""),
      lot_size: parseInt(values.lot_size, 10),
    };
    try {
      await apiFetch("/api/v1/auth/signup/dealer", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Phase 4.4 KYC fix — auto-sign-in so /pending can upload documents.
      try {
        const supabase = createClient();
        await supabase.auth.signInWithPassword({
          email: payload.email,
          password: values.password,
        });
      } catch {
        /* non-fatal — pending page will show a "log in" prompt instead */
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
        <p className="text-brand-ink/70 mt-2 text-center">מלא את הפרטים ונחזור אליך לאחר אישור.</p>

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

        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-8">
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
            <legend className="text-brand-navy px-2 text-sm font-semibold">פרטי יצירת קשר</legend>
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
