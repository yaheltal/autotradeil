/**
 * Design tokens. 4-px base grid; semantic palette is split light/dark
 * so consumers always read from `useTheme()` rather than these raw maps.
 */

export const palette = {
  navy900: "#0B1F33",
  navy800: "#0F2A47",
  navy600: "#1F3F66",
  cream50: "#FFF8EE",
  cream100: "#FBEFD8",
  gold500: "#D4A437",
  gold400: "#E0B85C",
  ink900: "#0B1F33",
  ink600: "#3F506A",
  ink400: "#7A8AA3",
  white: "#FFFFFF",
  black: "#000000",
  success: "#1F8F5C",
  successBg: "#E6F5EC",
  warning: "#B6841A",
  warningBg: "#FBEFD8",
  danger: "#B5302A",
  dangerBg: "#FCE6E4",
  slate900: "#0A1828",
  slate800: "#11243A",
  slate700: "#1A3551",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "800" as const, letterSpacing: -0.5 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: "700" as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const },
  h3: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  bodyBold: { fontSize: 15, lineHeight: 22, fontWeight: "600" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.4 },
} as const;

export const shadows = {
  sm: {
    shadowColor: "#0B1F33",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: "#0B1F33",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  lg: {
    shadowColor: "#0B1F33",
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
} as const;

export const motion = {
  spring: { damping: 18, stiffness: 220, mass: 1 },
  springBouncy: { damping: 12, stiffness: 180, mass: 1 },
  duration: { fast: 150, base: 220, slow: 320 },
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radii;
