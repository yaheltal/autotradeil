"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NotificationBell } from "@/components/NotificationBell";
import { createClient } from "@/lib/supabase";

// Dark mode infrastructure ready (Phase 1 complete — next-themes wired,
// tailwind darkMode: "class" enabled, RGB-triplet CSS vars declared in
// globals.css). Toggle hidden until Phase 2-3 add `dark:*` variants to
// every page or migrate Tailwind config to consume the dark-aware vars.
// TODO: restore <ThemeToggle /> render below once the dark palette ships.
// import { ThemeToggle } from "@/components/dashboard/ThemeToggle";

/**
 * TopBar — desktop horizontal bar above the page content. Sticky at
 * the top of the scroll container so the search + notifications +
 * theme toggle stay reachable.
 *
 * Notifications: mounts the shared NotificationBell once we resolve
 * a Supabase session. The chrome owns the bell directly now — pages
 * used to mount their own and the previous decorative placeholder
 * here had no onClick (QA #6).
 *
 * Search: Enter (or clicking the magnifier) navigates to
 * /dashboard/inventory?q=<trimmed>. Empty query is a no-op. The
 * inventory page reads ?q= on mount and pre-fills its smart fallback
 * filter so results land already filtered (QA #7).
 */
export function TopBar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // session token for NotificationBell. Mirrors useDealerAuth's
  // getSession() probe but without the redirect side-effect — the
  // chrome shouldn't drive navigation when the page itself manages
  // auth. Bell hides until the token resolves; that's better UX than
  // a never-firing button.
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

  const submitSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/dashboard/inventory?q=${encodeURIComponent(trimmed)}`);
  };

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
        {/* Search box — Enter navigates to /dashboard/inventory?q=… */}
        <form
          role="search"
          className="relative max-w-md flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <button
            type="submit"
            aria-label="חפש"
            className="text-brand-navy/40 dark:text-brand-cream/40 hover:text-brand-navy dark:hover:text-brand-cream absolute inset-y-0 start-0 flex items-center rounded-s-lg ps-3 transition-colors"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
          <input
            type="search"
            placeholder="חיפוש מהיר…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={[
              "h-9 w-full rounded-lg border pe-3 ps-9 text-sm transition-colors",
              "border-brand-navy/15 bg-brand-cream/40 text-brand-navy placeholder:text-brand-ink/40",
              "focus:border-brand-gold focus:ring-brand-gold/25 focus:outline-none focus:ring-4",
              "dark:bg-brand-night/40 dark:text-brand-cream dark:placeholder:text-brand-cream/40 dark:border-white/10",
            ].join(" ")}
            aria-label="חיפוש"
          />
        </form>

        <div className="ms-auto flex items-center gap-1">
          {rightSlot}
          {token ? <NotificationBell token={token} /> : null}
          {/* <ThemeToggle /> — hidden, see import comment above */}
        </div>
      </div>
    </header>
  );
}
