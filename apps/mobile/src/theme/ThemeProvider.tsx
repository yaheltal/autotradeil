import { createContext, useContext, useMemo } from "react";

import { palette, radii, shadows, spacing, typography, motion } from "./tokens";

/**
 * Light-only theme — Meta-style: pure white surfaces, near-black text,
 * gold accents used sparingly for brand. Dark mode is intentionally
 * disabled for now per product direction (everything should look the
 * same on every device, no system-driven cream/dark variants).
 */
type Mode = "light";

type SemanticColors = {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  overlay: string;
};

const lightColors: SemanticColors = {
  // Pure white everywhere — bg, elevated chrome, and card surface all
  // collapse to #FFFFFF. We separate them visually with hairline borders
  // and tiny shadows instead of tinted backgrounds (Meta / Apple pattern).
  bg: "#FFFFFF",
  bgElevated: "#FFFFFF",
  surface: "#FFFFFF",
  // Used for skeletons, chip-idle, divider blocks — a faint cool gray so
  // the eye still parses these as "non-content" without breaking the
  // white feel of the page.
  surfaceMuted: "#F2F3F5",
  // Hairline, not a real line. 0.08 alpha lands near 1.5pt at 3x density.
  border: "rgba(0,0,0,0.08)",
  textPrimary: "#050505",
  textSecondary: "#65676B",
  textMuted: "#8A8D91",
  accent: palette.gold500,
  accentText: "#FFFFFF",
  success: palette.success,
  successBg: "#E6F7EE",
  warning: "#9A6700",
  warningBg: "#FFF7D6",
  danger: palette.danger,
  dangerBg: "#FFE5E3",
  overlay: "rgba(0,0,0,0.50)",
};

export type Theme = {
  mode: Mode;
  colors: SemanticColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadows: typeof shadows;
  motion: typeof motion;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light-only by design — see header comment.
  const value = useMemo<Theme>(
    () => ({
      mode: "light" as const,
      colors: lightColors,
      spacing,
      radii,
      typography,
      shadows,
      motion,
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
