"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * ThemeProvider — wraps next-themes with the AutoTradeIL contract:
 *
 *   attribute="class"        → next-themes sets `<html class="dark">` so
 *                              Tailwind's class-based dark mode lights up.
 *   defaultTheme="system"    → respect OS preference on first paint.
 *   storageKey="theme"       → the SAME key the legacy ThemeToggle
 *                              writes to. Both writers stay in sync.
 *   enableSystem             → required for defaultTheme="system" to take.
 *   disableTransitionOnChange → kills the global * { transition } flash
 *                              when the class swaps mid-render.
 *
 * `suppressHydrationWarning` lives on <html> in app/layout.tsx — without
 * it, next-themes' first-paint class injection causes a React hydration
 * mismatch warning.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      storageKey="theme"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
