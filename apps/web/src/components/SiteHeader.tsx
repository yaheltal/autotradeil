import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Public-site sticky header. Used on the legal pages
 * (/terms, /privacy, /contact). The marketing landing page uses
 * LandingNav (with scroll-spy); the dashboard + admin shells use
 * their own. This component is for unauthenticated visitors on
 * static surfaces.
 *
 * `showAnchorNav` toggles the inline section anchors (יתרונות /
 * אמון / לקונה הפרטי). Off by default since those anchors only
 * resolve on the landing page.
 */
export function SiteHeader({ showAnchorNav = false }: { showAnchorNav?: boolean }) {
  return (
    <header
      className={[
        "border-hairline bg-paper/85 sticky top-0 z-30 border-b backdrop-blur",
        "supports-[backdrop-filter]:bg-paper/70",
      ].join(" ")}
    >
      <div className="px-md sm:px-lg gap-md sm:gap-2xl mx-auto flex max-w-6xl items-center justify-between py-3 sm:py-4">
        <nav aria-label="ראשי" className="gap-md sm:gap-2xl flex min-w-0 items-center">
          <Link
            href="/"
            aria-label="AutoTradeIL — דף הבית"
            className="focus-visible:outline-accent duration-fast group flex items-center rounded-sm transition-transform focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <Image
              src="/logo-full.png"
              alt="AutoTradeIL"
              width={1095}
              height={361}
              priority
              className="duration-fast h-10 w-auto transition-transform group-hover:scale-[1.03] sm:h-14"
            />
          </Link>
          {showAnchorNav ? (
            <ul className="gap-xxs hidden items-center sm:flex">
              {[
                { href: "#why", label: "יתרונות" },
                { href: "#trust", label: "אמון" },
                { href: "#consumer", label: "לקונה הפרטי" },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-muted hover:text-ink hover:bg-muted/10 focus-visible:outline-accent px-md duration-fast inline-flex min-h-11 items-center rounded-md py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>
        <Button asChild>
          <Link href="/login">כניסה</Link>
        </Button>
      </div>
    </header>
  );
}
