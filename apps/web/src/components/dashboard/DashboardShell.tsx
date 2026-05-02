"use client";

import { Bell, Menu } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { BottomNav } from "@/components/dashboard/BottomNav";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { TopBar } from "@/components/dashboard/TopBar";

/**
 * DashboardShell — the global chrome that wraps every authenticated
 * dealer page. Two-column on desktop (sidebar + content), single
 * column on mobile (sticky header + content + bottom-nav).
 *
 * Existing per-page headers are still rendered inside `children` for
 * now. The next step (page-by-page) will strip the redundant chrome
 * from each page once the new shell is verified.
 *
 * Layout notes:
 *   - Sidebar uses `sticky` instead of `fixed` so the document still
 *     flows naturally; useful for keyboard / screen-reader order.
 *   - Mobile pads bottom by 72px so BottomNav doesn't hide content.
 *   - `dir="rtl"` is inherited from <html>; the sidebar lives on the
 *     right via `border-s` (start-side border), which Tailwind maps
 *     to the right edge in RTL.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="bg-brand-cream dark:bg-brand-night flex min-h-[100dvh]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        {/* Mobile sticky header — visible < md */}
        <header
          className={[
            "sticky top-0 z-30 flex h-14 items-center gap-3 px-4 md:hidden",
            "border-brand-navy/10 border-b dark:border-white/10",
            "dark:bg-brand-slate/95 bg-white/95 backdrop-blur",
          ].join(" ")}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          aria-label="סרגל ניווט מובייל"
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="פתיחת תפריט"
            aria-expanded={mobileMenuOpen}
            className="text-brand-navy hover:bg-brand-navy/5 dark:text-brand-cream inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors dark:hover:bg-white/5"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex-1">
            <BrandMark />
          </div>
          <button
            type="button"
            aria-label="התראות"
            className="text-brand-navy hover:bg-brand-navy/5 dark:text-brand-cream relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors dark:hover:bg-white/5"
          >
            <Bell className="h-5 w-5" aria-hidden />
          </button>
          <ThemeToggle />
        </header>

        {/* Mobile slide-down menu (collapsible) */}
        {mobileMenuOpen ? <MobileMenu onClose={() => setMobileMenuOpen(false)} /> : null}

        {/* Page content. Bottom padding leaves room for BottomNav on
            mobile so the last list item / FAB isn't hidden behind it. */}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        <BottomNav />
      </div>
    </div>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="border-brand-navy/10 dark:bg-brand-slate border-b bg-white md:hidden dark:border-white/10"
      role="menu"
      aria-label="תפריט מובייל"
    >
      <ul className="flex flex-col p-2">
        {[
          { href: "/dashboard", label: "פרופיל" },
          { href: "/dashboard/inventory", label: "מלאי" },
          { href: "/dashboard/marketplace", label: "שוק B2B" },
          { href: "/dashboard/offers", label: "הצעות" },
          { href: "/dashboard/deals", label: "עסקאות" },
          { href: "/dashboard/analytics", label: "סטטיסטיקות" },
          { href: "/dashboard/security", label: "אבטחה" },
        ].map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              onClick={onClose}
              className="text-brand-navy hover:bg-brand-navy/5 dark:text-brand-cream block rounded-lg px-3 py-3 text-sm font-semibold transition-colors dark:hover:bg-white/5"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
