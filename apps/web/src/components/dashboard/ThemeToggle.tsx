"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * ThemeToggle — sun/moon button. Persists choice to localStorage
 * under key `theme` ("dark" | "light"). The init script in
 * app/layout.tsx reads this same key before first paint to avoid
 * a flash of wrong theme on cold loads.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // private mode — silently no-op
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "החלף למצב יום" : "החלף למצב לילה"}
      aria-pressed={isDark}
      className={[
        "inline-flex h-10 w-10 items-center justify-center rounded-lg",
        "text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy",
        "dark:text-brand-cream dark:hover:bg-white/5",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        className ?? "",
      ].join(" ")}
    >
      {isDark ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
    </button>
  );
}
