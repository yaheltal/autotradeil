import Image from "next/image";
import Link from "next/link";

import { ApiStatus } from "@/components/ApiStatus";

/**
 * Public-site sticky header. Used on the marketing landing page and
 * the legal pages (/terms, /privacy, /contact). The dashboard + admin
 * shells use their own headers — this is for unauthenticated visitors.
 *
 * `showAnchorNav` toggles the inline section anchors (יתרונות / אמון /
 * לקונה הפרטי). Off by default since those anchors only resolve on the
 * landing page.
 */
export function SiteHeader({ showAnchorNav = false }: { showAnchorNav?: boolean }) {
  return (
    <header className="border-brand-navy/10 bg-brand-cream/85 supports-[backdrop-filter]:bg-brand-cream/70 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <nav aria-label="ראשי" className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link
            href="/"
            aria-label="AutoTradeIL — דף הבית"
            className="focus-visible:outline-brand-navy group flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <Image
              src="/logo-full.png"
              alt="AutoTradeIL"
              width={1095}
              height={361}
              priority
              className="h-10 w-auto transition-transform group-hover:scale-[1.03] sm:h-14"
            />
          </Link>
          {showAnchorNav ? (
            <ul className="hidden items-center gap-1 sm:flex">
              <li>
                <a
                  href="#why"
                  className="text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  יתרונות
                </a>
              </li>
              <li>
                <a
                  href="#trust"
                  className="text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  אמון
                </a>
              </li>
              <li>
                <a
                  href="#consumer"
                  className="text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  לקונה הפרטי
                </a>
              </li>
            </ul>
          ) : null}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <ApiStatus />
          <Link
            href="/login"
            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            כניסה
          </Link>
        </div>
      </div>
    </header>
  );
}
