"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const ITEMS = [
  { href: "/dashboard", label: "פרופיל", exact: true },
  { href: "/dashboard/inventory", label: "מלאי", exact: false },
  { href: "/dashboard/marketplace", label: "שוק B2B", exact: false },
  { href: "/dashboard/offers", label: "הצעות", exact: false },
  { href: "/dashboard/deals", label: "עסקאות", exact: false },
  { href: "/dashboard/analytics", label: "סטטיסטיקות", exact: false },
  { href: "/dashboard/security", label: "אבטחה", exact: false },
] as const;

function isActive(pathname: string, item: (typeof ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Dealer dashboard sub-nav.
 *
 * Mobile primary platform — 7 tabs at min-h-11 + px-4 sum to ~520px,
 * which doesn't fit on a 375px iPhone. We make the row horizontally
 * scrollable with snap-x, hide the scrollbar visually (still keyboard +
 * SR navigable), and on mount scroll the active tab into view so the
 * user lands looking at where they are.
 *
 * a11y:
 *   - Underlying <ul> still has the same <Link> set; horizontal scroll
 *     is purely visual — Tab keys traverse all 7 links unaffected.
 *   - Active link uses aria-current="page" + a visible gold underline
 *     so the active state isn't color-only and survives forced-colors.
 *   - Scroll-snap keeps each tab cleanly framed when the user swipes.
 */
export function DashboardSubNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll the active tab into view on mount + on route change. Center
  // alignment puts the active tab visually in the middle of the strip
  // so adjacent tabs are discoverable.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    // requestAnimationFrame ensures layout has settled before measuring.
    requestAnimationFrame(() => {
      active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
  }, [pathname]);

  return (
    <nav
      aria-label="ניווט לוח בקרה"
      className="border-brand-navy/10 hidden border-b bg-white md:block"
    >
      <div className="mx-auto max-w-5xl px-2 sm:px-6">
        <ul
          ref={listRef}
          className="flex snap-x snap-mandatory gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href} className="shrink-0 snap-start">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "inline-flex min-h-11 items-center whitespace-nowrap px-4 py-3 text-sm",
                    "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                    // Active state pairs gold underline with bold weight
                    // and a navy bg tint — three signals so the state is
                    // identifiable without color too (WCAG 1.4.11).
                    active
                      ? "text-brand-navy border-brand-gold bg-brand-navy/5 border-b-[3px] font-bold"
                      : "text-brand-ink/70 hover:text-brand-navy border-b-[3px] border-transparent font-semibold",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
