"use client";

import { Bell, Search } from "lucide-react";

// Dark mode infrastructure ready (Phase 1 complete — next-themes wired,
// tailwind darkMode: "class" enabled, RGB-triplet CSS vars declared in
// globals.css). Toggle hidden until Phase 2-3 add `dark:*` variants to
// every page or migrate Tailwind config to consume the dark-aware vars.
// TODO: restore <ThemeToggle /> render below once the dark palette ships.
// import { ThemeToggle } from "@/components/dashboard/ThemeToggle";

/**
 * TopBar — desktop horizontal bar above the page content. Sticky at
 * the top of the scroll container so the search + notifications +
 * theme toggle stay reachable. NotificationBell is intentionally not
 * imported here yet — each page still mounts its own; once we refactor
 * pages we'll move the bell into here.
 */
export function TopBar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <header
      className={[
        "sticky top-0 z-30 hidden md:flex md:h-16",
        "border-brand-navy/10 border-b dark:border-white/10",
        "dark:bg-brand-slate/85 bg-white/85 backdrop-blur",
        "px-6",
      ].join(" ")}
      aria-label="סרגל עליון"
    >
      <div className="flex w-full items-center gap-4">
        {/* Search box (visual only for now — wired to existing CommandCenter on each page) */}
        <div className="relative max-w-md flex-1">
          <span className="text-brand-navy/40 dark:text-brand-cream/40 absolute inset-y-0 start-0 flex items-center ps-3">
            <Search className="h-4 w-4" aria-hidden />
          </span>
          <input
            type="search"
            placeholder="חיפוש מהיר…"
            className={[
              "h-9 w-full rounded-lg border pe-3 ps-9 text-sm transition-colors",
              "border-brand-navy/15 bg-brand-cream/40 text-brand-navy placeholder:text-brand-ink/40",
              "focus:border-brand-gold focus:ring-brand-gold/25 focus:outline-none focus:ring-4",
              "dark:bg-brand-night/40 dark:text-brand-cream dark:placeholder:text-brand-cream/40 dark:border-white/10",
            ].join(" ")}
            aria-label="חיפוש"
          />
        </div>

        <div className="ms-auto flex items-center gap-1">
          {rightSlot}
          <button
            type="button"
            aria-label="התראות"
            className="text-brand-navy/70 hover:bg-brand-navy/5 hover:text-brand-navy dark:text-brand-cream/70 dark:hover:text-brand-cream relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors dark:hover:bg-white/5"
          >
            <Bell className="h-5 w-5" aria-hidden />
          </button>
          {/* <ThemeToggle /> — hidden, see import comment above */}
        </div>
      </div>
    </header>
  );
}
