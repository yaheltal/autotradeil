import Link from "next/link";

import { ApiStatus } from "@/components/ApiStatus";

/*
 * Contrast (documented so future edits don't regress):
 *   body       text-slate-900 on bg-white     → 19:1  (AAA)
 *   muted      text-slate-600 on bg-white     → 7.2:1 (AAA)
 *   primary    bg-blue-700 + text-white       → 7.45:1 (AAA)
 *   secondary  text-slate-900 on bg-white+border-slate-300 → 19:1 (AAA)
 *   dark body  text-slate-100 on bg-slate-950 → 18.7:1 (AAA)
 *   dark prim  bg-blue-500 + text-slate-950   → 8.3:1  (AAA)
 */

const features = [
  {
    title: "מלאי אחד, שני שווקים",
    body: "סוחרים רואים מחיר סוחר; צרכנים רואים מחיר קמעונאי. הפרדה מלאה ברמת בסיס הנתונים.",
  },
  {
    title: "דירוג אמון לסוחרים",
    body: "ציון אמון ורמה (bronze / silver / gold / platinum) על בסיס היסטוריה, ביקורות ורישיון.",
  },
  {
    title: "הצעות ועסקאות ממוקדות",
    body: "B2B דילר-לדילר והעברה חלקה לעסקה B2C — הכול עם תיעוד מלא.",
  },
];

const steps = [
  "מצטרפים — סוחר עם מספר רישיון, או צרכן עם חיפוש פעיל.",
  "מחפשים או מעלים מלאי — עם מחירים שקופים לכל צד.",
  "סוגרים עסקה — B2B בין סוחרים או B2C ישירות לצרכן.",
];

export default function Home() {
  return (
    <>
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <nav aria-label="ראשי" className="flex items-center gap-4 sm:gap-6">
            <Link
              href="/"
              aria-label="AutoTradeIL — דף הבית"
              className="rounded-sm text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
            >
              AutoTradeIL
            </Link>
            <ul className="flex items-center gap-2 sm:gap-4">
              <li>
                <a
                  href="#features"
                  className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  יתרונות
                </a>
              </li>
              <li>
                <a
                  href="#how"
                  className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  איך זה עובד
                </a>
              </li>
              <li>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:bg-blue-500 dark:text-slate-950 dark:hover:bg-blue-400"
                >
                  כניסה
                </Link>
              </li>
            </ul>
          </nav>
          <ApiStatus />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <section aria-labelledby="hero-heading" className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <h1 id="hero-heading" className="text-4xl font-bold tracking-tight sm:text-5xl">
            זירת המסחר ברכבים של ישראל
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            לידים לסוחרים, מחירים שקופים לצרכנים, עסקאות במקום אחד.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup/dealer"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-blue-700 px-6 py-3 text-base font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:bg-blue-500 dark:text-slate-950 dark:hover:bg-blue-400"
            >
              אני סוחר — הצטרפות
            </Link>
            <Link
              href="/signup/consumer"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              אני קונה — התחל חיפוש
            </Link>
          </div>
        </section>

        <section
          id="features"
          aria-labelledby="features-heading"
          className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <h2 id="features-heading" className="text-3xl font-bold tracking-tight">
              למה AutoTradeIL
            </h2>
            <ul className="mt-10 grid gap-6 sm:grid-cols-3">
              {features.map((f) => (
                <li
                  key={f.title}
                  className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"
                >
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="how"
          aria-labelledby="how-heading"
          className="mx-auto max-w-6xl px-6 py-16 sm:py-20"
        >
          <h2 id="how-heading" className="text-3xl font-bold tracking-tight">
            איך זה עובד
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((text, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-6 dark:border-slate-800">
                <span
                  aria-hidden="true"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-base font-bold text-white dark:bg-blue-500 dark:text-slate-950"
                >
                  {i + 1}
                </span>
                <p className="mt-4 text-slate-700 dark:text-slate-300">
                  <span className="sr-only">שלב {i + 1}: </span>
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">© 2026 AutoTradeIL</p>
          <nav aria-label="תחתון">
            <ul className="flex gap-2 sm:gap-4">
              <li>
                <Link
                  href="/terms"
                  className="inline-flex min-h-11 items-center rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  תנאי שימוש
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="inline-flex min-h-11 items-center rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  פרטיות
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="inline-flex min-h-11 items-center rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  יצירת קשר
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
