"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "פרופיל", exact: true },
  { href: "/dashboard/inventory", label: "מלאי", exact: false },
  { href: "/dashboard/marketplace", label: "שוק B2B", exact: false },
  { href: "/dashboard/offers", label: "הצעות", exact: false },
] as const;

function isActive(pathname: string, item: (typeof ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function DashboardSubNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט לוח בקרה" className="border-brand-navy/10 border-b bg-white">
      <div className="mx-auto max-w-5xl px-6">
        <ul className="flex gap-1">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "inline-flex min-h-11 items-center px-4 py-3 text-sm font-semibold",
                    "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                    active
                      ? "text-brand-navy border-brand-gold border-b-2"
                      : "text-brand-ink/70 hover:text-brand-navy",
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
