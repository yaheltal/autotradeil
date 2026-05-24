"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * ThemeToggle — sun/moon button. Drives next-themes via setTheme()
 * so the provider's internal state, the <html> class, and
 * localStorage all stay in sync from a single source of truth.
 *
 * Phase 1 change: previously this component owned the class +
 * localStorage write directly (bypassing next-themes). That worked
 * for the class flip itself, but left next-themes' `useTheme()`
 * consumers stale and produced the "click does nothing" symptom
 * the user reported. Routing through setTheme() fixes both.
 *
 * `mounted` guard: `resolvedTheme` is undefined on the server, so
 * the button renders a neutral icon until the client hydrates —
 * avoids an aria-pressed mismatch warning + a first-paint flicker.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={isDark ? "החלף למצב יום" : "החלף למצב לילה"}
      aria-pressed={mounted ? isDark : undefined}
      className={[
        "inline-flex h-10 w-10 items-center justify-center rounded-lg",
        "text-ink hover:bg-muted/10 focus-visible:outline-accent",
        "dark:text-paper dark:hover:bg-paper/10",
        "duration-fast transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        className ?? "",
      ].join(" ")}
    >
      {isDark ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
    </button>
  );
}
