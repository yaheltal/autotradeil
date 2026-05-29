"use client";

import {
  Car,
  FileClock,
  Home,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * AdminSidebar — right-edge nav for desktop (md+). Mirrors the
 * dealer dashboard's Sidebar rhythm — hairline border, ink/paper
 * hierarchy, accent on active — but ships a clean editorial token
 * surface (no `brand-*` legacy aliases).
 *
 * The "Admin" eyebrow under the brand mark is the chrome's one
 * tell that this is the operator surface. No color noise; the
 * tracking-widest uppercase muted-tone label carries the meaning.
 */

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "בית", icon: Home, exact: true },
  { href: "/admin/dealers", label: "סוחרים", icon: Users },
  { href: "/admin/inventory", label: "מלאי", icon: Car },
  { href: "/admin/deletion-requests", label: "בקשות מחיקה", icon: Trash2 },
  { href: "/admin/transactions", label: "עסקאות בתהליך", icon: ShoppingBag },
  { href: "/admin/kyc", label: "אימות זהות", icon: ShieldCheck },
  { href: "/admin/settings", label: "הגדרות", icon: Settings },
  { href: "/admin/audit-log", label: "לוג פעולות", icon: FileClock, exact: true },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className={[
        "hidden md:flex md:flex-col",
        "border-hairline bg-paper border-s",
        "sticky top-0 h-[100dvh] w-56 shrink-0",
      ].join(" ")}
      aria-label="ניווט מנהל"
    >
      {/* Brand block — Frank Ruhl wordmark + accent dot, with
          a tracking-widest "Admin" eyebrow underneath so the surface
          identifies itself without a second color. */}
      <div className="px-lg py-lg border-hairline border-b">
        <Link
          href="/admin"
          aria-label="AutoTradeIL — לוח ניהול"
          className="focus-visible:outline-accent inline-flex flex-col gap-0 rounded-sm focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span className="text-ink gap-xs tracking-editorial inline-flex items-center font-serif text-xl font-medium">
            AutoTradeIL
            <span aria-hidden="true" className="bg-accent inline-block h-1.5 w-1.5 rounded-full" />
          </span>
          <span className="text-muted mt-xxs text-[10px] font-medium uppercase tracking-widest">
            Admin
          </span>
        </Link>
      </div>

      <nav className="px-md py-md flex-1 overflow-y-auto">
        <ul className="space-y-xxs flex flex-col">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "gap-md px-md py-md duration-fast group relative flex items-center rounded-md text-sm font-medium transition-colors",
                    "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    active ? "bg-ink text-paper" : "text-muted hover:text-ink hover:bg-muted/10",
                  ].join(" ")}
                >
                  <Icon
                    className={["h-5 w-5 shrink-0", active ? "" : "group-hover:text-ink"].join(" ")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-lg py-md border-hairline border-t">
        <p className="text-subtle text-[11px]">AutoTradeIL · v0.1</p>
      </div>
    </aside>
  );
}
