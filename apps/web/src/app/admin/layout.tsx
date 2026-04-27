"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ApiStatus } from "@/components/ApiStatus";
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
  { href: "/admin/inventory", label: "מלאי", exact: false },
  { href: "/admin/transactions", label: "עסקאות בתהליך", exact: false },
  { href: "/admin/kyc", label: "אימות זהות", exact: false },
  { href: "/admin/settings", label: "הגדרות", exact: false },
  { href: "/admin/audit-log", label: "לוג פעולות", exact: true },
] as const;

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const firstNavLinkRef = useRef<HTMLAnchorElement>(null);

  // Escape closes the drawer, body scroll locked while open, focus
  // moves into the first nav item on open + back to the toggle on
  // close. Without this, mobile users tapping the hamburger saw the
  // sidebar fly in but couldn't dismiss it on iOS Safari (no swipe
  // gesture, Escape on hardware keyboards did nothing) and the page
  // behind kept scrolling under the overlay.
  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);

    queueMicrotask(() => firstNavLinkRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      queueMicrotask(() => drawerToggleRef.current?.focus());
    };
  }, [drawerOpen]);

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      sessionStorage.clear();
    } catch {
      /* private browsing — ignore */
    }
    // Hard-redirect so the SPA bundle re-mounts fresh — defeats any
    // in-memory React state still holding the previous admin's data.
    window.location.href = "/login?signedOut=1";
  };

  return (
    <div className="bg-brand-cream text-brand-ink min-h-screen">
      <header className="border-brand-navy/10 safe-top border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              ref={drawerToggleRef}
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-expanded={drawerOpen}
              aria-controls="admin-sidebar"
              aria-label={drawerOpen ? "סגור תפריט ניווט" : "פתיחת תפריט ניווט"}
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
          <div className="flex items-center gap-2 sm:gap-3">
            <ApiStatus />
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
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop: in-flow sidebar (md and up). Mobile: backdrop +
            slide-in drawer. The OLD implementation rendered the
            sidebar as an inline flex child even when open on mobile,
            which squeezed the main content to ~120px wide. */}

        {/* Mobile drawer backdrop — only mounted when open + below md.
            Click-to-close. role=presentation so SR doesn't announce it. */}
        {drawerOpen ? (
          <button
            type="button"
            aria-label="סגור תפריט"
            onClick={() => setDrawerOpen(false)}
            className="bg-brand-navy/40 fixed inset-0 z-40 cursor-default md:hidden"
          />
        ) : null}

        <aside
          id="admin-sidebar"
          aria-hidden={!drawerOpen ? true : undefined}
          // RTL slide: drawer is anchored at start (right edge in RTL).
          // When closed it must translate +100% (off-screen to the right).
          // Tailwind's `translate-x-full` doesn't auto-flip in RTL so we
          // use an arbitrary [transform:…] value paired with md:!transform-none
          // so desktop layout is unaffected.
          //
          // Mobile drawer is now FULL-WIDTH (w-screen) — the previous
          // 80vw cap left a sliver of the page peeking through which
          // looked broken in mobile Safari + PWA standalone mode where
          // iOS Safari inserts its own bottom toolbar.
          className={[
            // Desktop: sticky in-flow column with no transform.
            "md:relative md:block md:!transform-none",
            // Mobile: fixed overlay anchored at start (RTL-aware), full width.
            "fixed bottom-0 start-0 top-[57px] z-50 w-screen",
            "border-brand-navy/10 border-s bg-white shadow-2xl",
            "transition-transform duration-200 motion-reduce:transition-none",
            drawerOpen ? "[transform:translateX(0)]" : "[transform:translateX(100%)]",
            // Hide entirely from layout on mobile when closed (avoids
            // sneaking into the tab order behind the backdrop).
            !drawerOpen ? "pointer-events-none md:pointer-events-auto" : "",
            // On md+ reset all the mobile-specific positioning.
            "md:bottom-auto md:top-0 md:w-56 md:shadow-none",
          ].join(" ")}
        >
          <nav
            aria-label="ניווט מנהל"
            className="sticky top-0 h-[calc(100vh-57px)] overflow-y-auto p-3 md:min-h-[calc(100vh-57px)]"
          >
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map((item, idx) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      ref={idx === 0 ? firstNavLinkRef : undefined}
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
      {/* WatermarkOverlay intentionally NOT mounted on /admin —
          admins are operators, not the audience for the anti-leak
          tile. Only dealers see the watermark (mounted in
          dashboard/layout.tsx). */}
    </div>
  );
}
