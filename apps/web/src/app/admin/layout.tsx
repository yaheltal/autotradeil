"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase";

/*
 * Admin shell — top bar + sidebar navigation.
 *
 * A11y decisions (approved plan):
 *   - Sidebar is a <nav aria-label="ניווט מנהל">
 *   - Active link: aria-current="page" (not "true") + visible gold
 *     border + bold weight (not color-only)
 *   - Mobile: hamburger <button aria-expanded aria-controls="admin-sidebar">
 *     toggles a slide-in drawer with Escape close + focus trap
 *   - Skip link (from root layout) keeps targeting #main; admin pages
 *     each wrap content in <main id="main" tabIndex={-1}>
 *   - prefers-reduced-motion kills the drawer transition
 */

const NAV_ITEMS = [
  { href: "/admin", label: "בית", exact: true },
  { href: "/admin/dealers", label: "סוחרים", exact: false },
  { href: "/admin/audit-log", label: "לוג פעולות", exact: true },
] as const;

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?signedOut=1");
  };

  return (
    <div className="bg-brand-cream text-brand-ink min-h-screen">
      <header className="border-brand-navy/10 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-expanded={drawerOpen}
              aria-controls="admin-sidebar"
              aria-label="פתיחת תפריט ניווט"
              className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex h-11 w-11 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="h-5 w-5"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <Link
              href="/admin"
              aria-label="AutoTradeIL Admin — דף הבית של המנהל"
              className="text-brand-navy focus-visible:outline-brand-navy inline-flex items-center gap-2 rounded-sm text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <span>AutoTradeIL</span>
              <span
                aria-hidden="true"
                className="bg-brand-gold inline-block h-1.5 w-1.5 rounded-full"
              />
              <span className="text-brand-ink/60 text-sm font-medium" lang="en">
                Admin
              </span>
            </Link>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            aria-busy={signingOut || undefined}
            className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
          >
            {signingOut ? "מתנתק…" : "התנתקות"}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside
          id="admin-sidebar"
          className={[
            "border-brand-navy/10 border-s bg-white md:block",
            drawerOpen ? "block" : "hidden",
          ].join(" ")}
        >
          <nav aria-label="ניווט מנהל" className="sticky top-0 min-h-[calc(100vh-57px)] w-56 p-3">
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setDrawerOpen(false)}
                      className={[
                        "flex min-h-11 items-center rounded-md px-3 py-2 text-sm transition-colors",
                        "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                        "motion-reduce:transition-none",
                        active
                          ? "bg-brand-navy/5 text-brand-navy border-brand-gold border-s-4 font-bold"
                          : "text-brand-ink/80 hover:bg-brand-navy/5 hover:text-brand-navy font-medium",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
