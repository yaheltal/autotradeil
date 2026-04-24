"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { BrandMark } from "@/components/BrandMark";

/*
 * Pending approval screen.
 * Heading is focused on mount so a screen reader announces the outcome.
 * The checkmark icon is aria-hidden — meaning lives in the heading text.
 */

export default function SignupPendingPage() {
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
          נעדכן אותך במייל כשהבקשה תאושר. התהליך לוקח בדרך כלל עד 24 שעות בימי עבודה.
        </p>

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
