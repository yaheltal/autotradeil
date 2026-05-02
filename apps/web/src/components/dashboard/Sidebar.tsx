"use client";

import {
  BarChart3,
  Car,
  ChevronsLeft,
  ChevronsRight,
  Handshake,
  LayoutDashboard,
  Shield,
  ShoppingBag,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/BrandMark";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "פרופיל", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/inventory", label: "מלאי", icon: Car },
  { href: "/dashboard/marketplace", label: "שוק B2B", icon: ShoppingBag },
  { href: "/dashboard/offers", label: "הצעות", icon: Tag },
  { href: "/dashboard/deals", label: "עסקאות", icon: Handshake },
  { href: "/dashboard/analytics", label: "סטטיסטיקות", icon: BarChart3 },
  { href: "/dashboard/security", label: "אבטחה", icon: Shield },
];

const COLLAPSED_KEY = "dashboard.sidebar.collapsed";

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Sidebar — desktop only (md+). Collapsible to icon-only mode. Persists
 * collapse state in localStorage. Anchored to the right edge in RTL via
 * the parent grid layout.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <aside
      data-collapsed={collapsed}
      className={[
        "hidden md:flex md:flex-col",
        "border-brand-navy/10 dark:bg-brand-slate border-s bg-white dark:border-white/10",
        "transition-[width] duration-200 ease-out",
        collapsed ? "md:w-[72px]" : "md:w-64",
        "sticky top-0 h-[100dvh] shrink-0",
      ].join(" ")}
      aria-label="תפריט ניווט ראשי"
    >
      <div className="flex h-16 items-center justify-between gap-2 px-4">
        {!collapsed ? (
          <BrandMark />
        ) : (
          <span className="bg-brand-gold inline-block h-2 w-2 rounded-full" aria-hidden />
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "הרחבת התפריט" : "צמצום התפריט"}
          aria-pressed={collapsed}
          className="text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5 dark:text-brand-cream/60 dark:hover:text-brand-cream inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors dark:hover:bg-white/5"
        >
          {collapsed ? (
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronsRight className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={[
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                    active
                      ? "bg-brand-navy text-brand-cream dark:bg-brand-gold dark:text-brand-navy"
                      : "text-brand-ink/75 hover:text-brand-navy hover:bg-brand-navy/5 dark:text-brand-cream/75 dark:hover:text-brand-cream dark:hover:bg-white/5",
                    collapsed ? "justify-center" : "",
                  ].join(" ")}
                >
                  <Icon
                    className={[
                      "h-5 w-5 shrink-0",
                      active
                        ? ""
                        : "text-brand-navy/55 group-hover:text-brand-navy dark:text-brand-cream/55 dark:group-hover:text-brand-cream",
                    ].join(" ")}
                    aria-hidden
                  />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {/* Active accent: gold dot on inactive vs filled bg on active */}
                  {active && collapsed ? (
                    <span
                      aria-hidden
                      className="bg-brand-gold absolute -end-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-brand-navy/10 border-t px-3 py-3 dark:border-white/10">
        {!collapsed ? (
          <p className="text-brand-ink/40 dark:text-brand-cream/40 px-2 text-[11px]">
            AutoTradeIL · v0.1
          </p>
        ) : null}
      </div>
    </aside>
  );
}
