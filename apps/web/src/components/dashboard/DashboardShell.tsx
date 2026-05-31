"use client";

import { useEffect, useState } from "react";

import { BottomNav } from "@/components/dashboard/BottomNav";
import { MobileSidebarSheet } from "@/components/dashboard/MobileSidebarSheet";
import { Sidebar } from "@/components/dashboard/Sidebar";
// Dark mode infrastructure ready (Phase 1 complete — next-themes wired,
// tailwind darkMode: "class" enabled, RGB-triplet CSS vars declared in
// globals.css). Toggle hidden until Phase 2-3 add `dark:*` variants to
// every page or migrate Tailwind config to consume the dark-aware vars.
// TODO: restore <ThemeToggle /> render in the mobile header below once
// the dark palette ships.
// import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { TopBar } from "@/components/dashboard/TopBar";
import { NotificationBell } from "@/components/NotificationBell";
import { createClient } from "@/lib/supabase";

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
  // Token probe — non-blocking; the bell hides until resolved. Same
  // pattern as TopBar so the mobile header's bell shares the same
  // NotificationBell component (poll/markRead/etc) as desktop instead
  // of the dead placeholder it used to render (QA #6).
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setToken(session?.access_token ?? null);
    })();
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setToken(session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="bg-brand-cream dark:bg-brand-night flex min-h-[100dvh]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        {/* Mobile sticky header — visible < md.
         *
         * Leading-edge Menu button opens the full nav (analytics + security
         * aren't in the 5-tab BottomNav, so the drawer is the only way to
         * reach them on mobile). The previous "AutoTradeIL" wordmark in
         * the center is gone — it duplicated the brand presence already
         * carried by the desktop Sidebar AND the drawer's own header,
         * which produced three copies on small screens.
         */}
        <header
          className={[
            "gap-md px-md sticky top-0 z-30 flex h-14 items-center md:hidden",
            "border-hairline bg-paper/95 border-b backdrop-blur",
          ].join(" ")}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          aria-label="סרגל ניווט מובייל"
        >
          <MobileSidebarSheet />
          <div className="flex-1" aria-hidden="true" />
          {token ? <NotificationBell token={token} /> : null}
          {/* <ThemeToggle /> — hidden, see import comment above */}
        </header>

        {/* Page content. Bottom padding leaves room for BottomNav on
            mobile so the last list item / FAB isn't hidden behind it. */}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        <BottomNav />
      </div>
    </div>
  );
}
