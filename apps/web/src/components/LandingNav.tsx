"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

/*
 * LandingNav — sticky top bar for the marketing page with a built-in
 * scroll-spy. The four section anchors (לסוחרים / AI / אבטחה / דירוגים)
 * highlight in gold as the matching section enters the viewport.
 *
 * Why a client component: IntersectionObserver lives in the browser
 * and we want zero hydration delay between page load and the active
 * indicator settling. The nav is small enough that promoting it to
 * client doesn't pull anything heavy into the bundle.
 *
 * A11y:
 *   - Logo Link aria-label is the brand + tagline so SR users hear
 *     the full copy even though the visible tagline is HTML text
 *     beside the icon (not baked into the PNG anymore).
 *   - Active section link carries aria-current="location" — closer
 *     to the spec than "page" since we're not navigating, just
 *     highlighting the visible anchor.
 *   - prefers-reduced-motion gate via the global CSS layer kills the
 *     transition durations to ~0 instead of forbidding them outright.
 *   - Mobile: nav is a horizontal scroll row so the section pills
 *     don't compete with the logo for vertical space. Wrapped in
 *     <ul> for AT.
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

    // We want the section that owns the most viewport center to be
    // active. Tighter rootMargin (negative top + bottom) means the
    // active section flips only when ~40% of it is in the viewport,
    // which feels less twitchy than a 1px crossing.
    const observer = new IntersectionObserver(
      (entries) => {
        // Collect every entry that's currently intersecting + pick
        // the one closest to the top of the viewport (smallest top
        // distance from 0).
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
    <header className="border-brand-navy/10 bg-brand-cream/85 supports-[backdrop-filter]:bg-brand-cream/70 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-2 sm:gap-6 sm:py-4">
          {/* Logo — original full PNG with the legacy tagline shown
              exactly as on every other page (per dealer instruction
              to bring it back as it was). */}
          <Link
            href="/"
            aria-label="AutoTradeIL — דף הבית"
            className="focus-visible:outline-brand-navy group flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <Image
              src="/logo-full.png"
              alt="AutoTradeIL"
              width={1095}
              height={361}
              priority
              className="h-8 w-auto transition-transform group-hover:scale-[1.03] sm:h-14"
            />
          </Link>

          {/* Desktop section nav with scroll-spy */}
          <nav aria-label="ניווט לסקשנים" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {SECTIONS.map((s) => {
                const id = s.href.replace("#", "");
                const isActive = activeId === id;
                return (
                  <li key={s.href}>
                    <a
                      href={s.href}
                      aria-current={isActive ? "location" : undefined}
                      className={[
                        "relative inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none",
                        "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                        isActive
                          ? "text-brand-navy bg-brand-gold/10 font-bold"
                          : "text-brand-navy/75 hover:text-brand-navy hover:bg-brand-navy/5",
                      ].join(" ")}
                    >
                      {s.label}
                      {/* Active indicator — gold underline. Renders
                          conditionally so the inactive links stay
                          flush with the surrounding row. */}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="bg-brand-gold pointer-events-none absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full"
                        />
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* CTAs — visible on every viewport. "הצטרף" is the primary
              gold pill (matches the page's signup-first voice);
              "כניסה" is secondary. On very narrow phones the labels
              shrink; the gold pill stays prominent. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/signup/dealer"
              className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 focus-visible:outline-brand-navy inline-flex min-h-9 items-center rounded-md px-2.5 py-1.5 text-xs font-bold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm"
            >
              <span className="hidden sm:inline">הצטרף עכשיו</span>
              <span className="sm:hidden">הצטרף</span>
            </Link>
            <Link
              href="/login"
              className="text-brand-navy border-brand-navy/30 hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-9 items-center rounded-md border bg-white px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm"
            >
              כניסה
            </Link>
          </div>
        </div>

        {/* Mobile section nav — horizontal scroll row of small pills.
            Renders below md only so the desktop layout stays unchanged.
            The pills are NOT wrapped — they overflow horizontally so
            users can swipe through them on phones. */}
        <nav aria-label="ניווט לסקשנים — מובייל" className="-mx-4 md:hidden">
          <ul className="flex gap-2 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SECTIONS.map((s) => {
              const id = s.href.replace("#", "");
              const isActive = activeId === id;
              return (
                <li key={s.href}>
                  <a
                    href={s.href}
                    aria-current={isActive ? "location" : undefined}
                    className={[
                      "border-brand-navy/15 inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none",
                      "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                      isActive
                        ? "border-brand-gold bg-brand-gold/15 text-brand-navy"
                        : "text-brand-navy/75 hover:bg-brand-navy/5 bg-white",
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
