"use client";

import { Car, Handshake, ShoppingBag, Tag, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "פרופיל", icon: User, exact: true },
  { href: "/dashboard/inventory", label: "מלאי", icon: Car, exact: false },
  { href: "/dashboard/marketplace", label: "שוק", icon: ShoppingBag, exact: false },
  { href: "/dashboard/offers", label: "הצעות", icon: Tag, exact: false },
  { href: "/dashboard/deals", label: "עסקאות", icon: Handshake, exact: false },
] as const;

/**
 * BottomNav — mobile only (< md). Five-tab persistent bar pinned to
 * the bottom of the viewport. Pads itself by env(safe-area-inset-bottom)
 * so the tab labels clear the iPhone home indicator.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ניווט מהיר"
      className={[
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "border-brand-navy/10 border-t dark:border-white/10",
        "dark:bg-brand-slate/95 bg-white/95 backdrop-blur",
      ].join(" ")}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-2",
                  "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                  active
                    ? "text-brand-navy dark:text-brand-gold"
                    : "text-brand-ink/55 dark:text-brand-cream/55",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-[11px] font-semibold tracking-tight">{item.label}</span>
                {active ? (
                  <span
                    aria-hidden
                    className="bg-brand-gold absolute inset-x-6 top-0 h-0.5 rounded-b-full"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
