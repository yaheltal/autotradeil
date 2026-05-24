"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/*
 * LandingNav — sticky top bar for the marketing page with a built-in
 * scroll-spy. The four section anchors (לסוחרים / AI / אבטחה / דירוגים)
 * highlight as the matching section enters the viewport — the active
 * link earns a 2px accent underline, never a tinted background.
 *
 * Why a client component: IntersectionObserver lives in the browser
 * and we want zero hydration delay between page load and the active
 * indicator settling. The nav is small enough that promoting it to
 * client doesn't pull anything heavy into the bundle.
 *
 * A11y:
 *   - Logo Link aria-label carries the brand + intent so SR users hear
 *     the full copy even though the visible tagline is HTML text.
 *   - Active section link carries aria-current="location" — closer
 *     to the spec than "page" since we're not navigating, just
 *     highlighting the visible anchor.
 *   - prefers-reduced-motion gate via global CSS layer trims the
 *     transition durations.
 *   - Mobile: section pills overflow horizontally so they don't
 *     compete with the logo for vertical space.
 */

type NavLink = { href: string; label: string };

const SECTIONS: NavLink[] = [
  { href: "#dealers", label: "לסוחרים" },
  { href: "#ai", label: "AI" },
  { href: "#security", label: "אבטחה" },
  { href: "#tiers", label: "דירוגים" },
];

export function LandingNav() {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    const ids = SECTIONS.map((s) => s.href.replace("#", ""));
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      {
        rootMargin: "-30% 0px -55% 0px",
        threshold: [0, 0.25, 0.5],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={[
        "border-hairline bg-paper/85 sticky top-0 z-30 border-b backdrop-blur",
        "supports-[backdrop-filter]:bg-paper/70",
      ].join(" ")}
    >
      <div className="px-md sm:px-lg mx-auto max-w-6xl">
        <div className="gap-md sm:gap-2xl flex items-center justify-between py-2 sm:py-4">
          <Link
            href="/"
            aria-label="AutoTradeIL — דף הבית"
            className="focus-visible:outline-accent group flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <Image
              src="/logo-full.png"
              alt="AutoTradeIL"
              width={1095}
              height={361}
              priority
              className="duration-fast h-8 w-auto transition-transform group-hover:scale-[1.03] sm:h-14"
            />
          </Link>

          {/* Desktop section nav with scroll-spy */}
          <nav aria-label="ניווט לסקשנים" className="hidden md:block">
            <ul className="gap-md flex items-center">
              {SECTIONS.map((s) => {
                const id = s.href.replace("#", "");
                const isActive = activeId === id;
                return (
                  <li key={s.href}>
                    <a
                      href={s.href}
                      aria-current={isActive ? "location" : undefined}
                      className={[
                        "relative inline-flex min-h-11 items-center px-2 py-2 text-sm transition-colors motion-reduce:transition-none",
                        "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                        isActive
                          ? "text-ink font-medium"
                          : "text-muted hover:text-ink duration-fast font-medium",
                      ].join(" ")}
                    >
                      {s.label}
                      {/* Active indicator — 2px accent underline */}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="bg-accent pointer-events-none absolute inset-x-2 -bottom-0.5 h-0.5"
                        />
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* CTAs */}
          <div className="gap-xs sm:gap-sm flex shrink-0 items-center">
            <Button asChild size="sm">
              <Link href="/signup/dealer">
                <span className="hidden sm:inline">הצטרף עכשיו</span>
                <span className="sm:hidden">הצטרף</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/login">כניסה</Link>
            </Button>
          </div>
        </div>

        {/* Mobile section nav — horizontal scroll row of pills */}
        <nav aria-label="ניווט לסקשנים — מובייל" className="-mx-md md:hidden">
          <ul className="gap-xs px-md flex overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SECTIONS.map((s) => {
              const id = s.href.replace("#", "");
              const isActive = activeId === id;
              return (
                <li key={s.href}>
                  <a
                    href={s.href}
                    aria-current={isActive ? "location" : undefined}
                    className={[
                      "duration-fast inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none",
                      "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                      isActive
                        ? "border-ink bg-ink text-paper"
                        : "border-hairline text-muted hover:text-ink hover:bg-muted/5 bg-paper",
                    ].join(" ")}
                  >
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
