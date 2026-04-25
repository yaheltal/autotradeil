import Image from "next/image";
import Link from "next/link";

/**
 * Public-site footer. Mirrors the structure used on the landing page
 * so /terms, /privacy, /contact share the same chrome.
 */
export function SiteFooter() {
  return (
    <footer className="bg-brand-navy text-brand-cream relative">
      <div
        aria-hidden="true"
        className="bg-brand-gold pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
      />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Image
              src="/logo-full-white.png"
              alt="AutoTradeIL"
              width={1095}
              height={361}
              className="h-12 w-auto sm:h-14"
            />
            <p className="text-brand-cream/75 mt-5 max-w-xs text-sm leading-relaxed">
              זירת המסחר של סוחרי הרכב בישראל. פלטפורמה B2B מקצועית עם הצעות מתועדות, מלאי משותף
              ואימות KYC.
            </p>
          </div>

          <nav aria-label="קישורי פלטפורמה">
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
              פלטפורמה
            </p>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/#why"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  יתרונות
                </Link>
              </li>
              <li>
                <Link
                  href="/#trust"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  אמון ובטחון
                </Link>
              </li>
              <li>
                <Link
                  href="/#consumer"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  לקונה הפרטי
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="חשבון">
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
              חשבון
            </p>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/login"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  כניסה
                </Link>
              </li>
              <li>
                <Link
                  href="/signup/dealer"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  הרשמת סוחר
                </Link>
              </li>
              <li>
                <Link
                  href="/forgot-password"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  שחזור סיסמה
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="חוקי">
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
              חוקי
            </p>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/terms"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  תנאי שימוש
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  פרטיות
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  יצירת קשר
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="border-brand-cream/15 mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-brand-cream/60 text-xs">© 2026 AutoTradeIL · כל הזכויות שמורות</p>
          <p className="text-brand-cream/60 text-xs">נבנה בישראל · גרסה 1.0</p>
        </div>
      </div>
    </footer>
  );
}
