"use client";

import { Bell } from "lucide-react";

import { BottomNav } from "@/components/dashboard/BottomNav";
import { MobileSidebarSheet } from "@/components/dashboard/MobileSidebarSheet";
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
          <button
            type="button"
            aria-label="התראות"
            className="text-ink duration-fast hover:bg-muted/10 focus-visible:outline-accent relative inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Bell className="h-5 w-5" aria-hidden />
          </button>
          <ThemeToggle />
        </header>

        {/* Page content. Bottom padding leaves room for BottomNav on
            mobile so the last list item / FAB isn't hidden behind it. */}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        <BottomNav />
      </div>
    </div>
  );
}
