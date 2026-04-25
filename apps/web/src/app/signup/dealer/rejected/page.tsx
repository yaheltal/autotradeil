"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { BrandMark } from "@/components/BrandMark";

/*
 * Rejection screen.
 *
 * The `reason` query param is whitelisted server-side-ish: we never
 * render the raw URL value, only map known codes to Hebrew strings.
 * Anything unknown collapses to a generic message. This defends
 * against social-engineering via crafted URLs
 * ("…?reason=call+555-SCAM").
 *
 * The reason text sits inside a role="alert" region — rejection is
 * assertive information the user needs immediately.
 */

const REASON_MAP = {
  invalid_license: "הרישיון שסופק אינו תקף או לא נמצא ברשומות משרד התחבורה.",
  duplicate_business_id: "העסק הזה כבר רשום במערכת. אם זו טעות, פנה אלינו.",
} as const;

type ReasonKey = keyof typeof REASON_MAP;

const DEFAULT_REASON = "פרטים נוספים נשלחו אליך במייל. לבירורים — צור איתנו קשר.";

function isKnownKey(k: string): k is ReasonKey {
  return Object.prototype.hasOwnProperty.call(REASON_MAP, k);
}

// Whitelist of chars allowed in free-form rejection text coming via URL.
// Hebrew range + ASCII + common punctuation. No regex `u` flag needed —
// the character class uses BMP code points only.
const SAFE_TEXT = /^[\u0590-\u05FF\u0000-\u007F\s.,!?()\-\u2014\u2013'"\u05F3\u05F4]{3,500}$/;

function translateReason(raw: string | null): string {
  if (!raw) return DEFAULT_REASON;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_REASON;
  }
  if (isKnownKey(decoded)) return REASON_MAP[decoded];
  if (SAFE_TEXT.test(decoded)) return decoded;
  return DEFAULT_REASON;
}

export default function SignupRejectedPage() {
  return (
    <Suspense fallback={null}>
      <SignupRejectedPageInner />
    </Suspense>
  );
}

function SignupRejectedPageInner() {
  const params = useSearchParams();
  const reason = translateReason(params.get("reason"));

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main id="main" tabIndex={-1} className="min-h-screen focus:outline-none">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <BrandMark />

        <div
          aria-hidden="true"
          className="bg-danger-bg text-danger-text mt-10 flex h-20 w-20 items-center justify-center rounded-full"
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
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-navy mt-8 text-3xl font-bold tracking-tight focus:outline-none"
        >
          בקשתך לא אושרה
        </h1>

        <div
          role="alert"
          aria-live="assertive"
          className="border-danger-text/20 bg-danger-bg text-danger-text mt-6 w-full rounded-md border px-4 py-3 text-start"
        >
          <p className="font-semibold">סיבה</p>
          <p className="mt-1 text-sm leading-6">{reason}</p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a
            href="https://wa.me/972500000000"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="יצירת קשר דרך וואטסאפ"
            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            יצירת קשר בוואטסאפ
          </a>
          <Link
            href="/login"
            className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            חזרה לדף הכניסה
          </Link>
        </div>
      </div>
    </main>
  );
}
