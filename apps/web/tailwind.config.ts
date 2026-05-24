import type { Config } from "tailwindcss";

/**
 * AutoTradeIL design system — locked per CLAUDE.md §4.
 *
 * Two surfaces (ink / paper) + one editorial accent. No dark mode.
 * Spacing scale is the Tailwind default + editorial aliases
 * (xxs/sm/md/lg/xl/2xl/3xl/4xl/5xl mapping to 8/12/16/24/32/48/64/96/128).
 * The "no 4px" guidance in CLAUDE.md §4 is enforced going forward by
 * code review rather than by Tailwind config (replacing the whole scale
 * silently broke 100+ existing class call sites).
 *
 * Fonts come from layout.tsx via CSS variables (Fraunces for editorial
 * headings, Inter for body, Frank Ruhl Libre as the Hebrew heading
 * fallback inside the same font-serif stack).
 */
const config: Config = {
  // Light-only. No darkMode strategy → no `dark:` utility ever triggers.
  darkMode: ["class", '[data-theme="never"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // SPACING — ADD aliases to the default Tailwind scale. Replacing the
      // whole scale (as we tried) broke every existing `p-4` / `gap-6` /
      // `mt-2` call site in the codebase. The aspirational "no 4px"
      // guidance lives in CLAUDE.md §4 and is enforced going forward by
      // code review — new components must use the named aliases below.
      spacing: {
        xxs: "8px",
        sm: "12px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
        "3xl": "64px",
        "4xl": "96px",
        "5xl": "128px",
      },
      fontFamily: {
        // Body — Inter (Latin + Hebrew unicode-range). System fallback for
        // first-paint, then Inter swaps in.
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        // Editorial — Frank Ruhl Libre for every heading (Hebrew + Latin).
        // Single editorial face; no separate Latin display font (Fraunces
        // dropped — the site is Hebrew-first and the pairing was
        // over-engineering for negligible polish gain).
        serif: ["var(--font-frank-ruhl)", '"Frank Ruhl Libre"', "ui-serif", "Georgia", "serif"],
        // Monospace — system stack only. Never a fourth web font (per CLAUDE.md §4).
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      colors: {
        // Two locked surfaces.
        ink: "#0A0A0A",
        paper: "#FFFFFF",
        // ONE editorial accent — oxidized bronze. Reserved for CTAs and
        // one or two highlight moments per page. NOT a body text color.
        accent: {
          DEFAULT: "#A8723A",
          ink: "#FFFFFF", // text-on-accent
          subtle: "#F4ECDF", // accent-tinted surface for callouts
        },
        // Tonal variations of ink (NOT new colors per CLAUDE.md §4).
        muted: "#6B6B6E", // secondary body text
        subtle: "#9A9A9D", // tertiary / metadata
        hairline: "rgba(10,10,10,0.08)", // borders, dividers
        // Status — rendered as ink tints, not as additional brand colors.
        // Foreground/background paired for AA contrast on body type.
        ok: {
          DEFAULT: "#1F8F5C",
          fg: "#0E3B26",
          bg: "#E6F5EC",
        },
        warn: {
          DEFAULT: "#9A6700",
          fg: "#3F2A00",
          bg: "#FFF7D6",
        },
        danger: {
          DEFAULT: "#B5302A",
          fg: "#5A1815",
          bg: "#FCE6E4",
        },

        // shadcn/ui semantic surface — mapped to the locked palette so
        // primitives scaffolded via `npx shadcn` inherit our system, not
        // their gray defaults. Phase 6 installs the primitives.
        background: "#FFFFFF",
        foreground: "#0A0A0A",
        card: { DEFAULT: "#FFFFFF", foreground: "#0A0A0A" },
        popover: { DEFAULT: "#FFFFFF", foreground: "#0A0A0A" },
        primary: { DEFAULT: "#0A0A0A", foreground: "#FFFFFF" }, // ink-on-paper buttons
        secondary: { DEFAULT: "#F4F4F5", foreground: "#0A0A0A" },
        destructive: { DEFAULT: "#B5302A", foreground: "#FFFFFF" },
        border: "rgba(10,10,10,0.08)",
        input: "rgba(10,10,10,0.12)",
        ring: "#A8723A",

        // ---- Legacy aliases (kept ONLY to prevent a 100-file rewrite in
        // this commit; will be migrated away over Phases 6–8). Every
        // legacy name maps to a NEW locked token so the visual outcome
        // is the new system regardless of which class an old component
        // still uses. New code MUST NOT reference these. ----
        brand: {
          cream: "#FFFFFF", // legacy bg → paper
          ink: "#0A0A0A", // legacy text → ink
          navy: "#0A0A0A", // legacy navy → ink (the navy/gold tradition retires)
          gold: "#A8723A", // legacy gold → accent (oxidized bronze)
          night: "#0A0A0A", // legacy dark surface — never triggers
          slate: "#0A0A0A", // legacy dark card — never triggers
        },
      },
      borderRadius: {
        // 10px standard radius — matches mobile `radii.md` for visual parity.
        DEFAULT: "10px",
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        pill: "999px",
      },
      letterSpacing: {
        tightest: "-0.04em",
        editorial: "-0.025em", // Fraunces tightening for big display headings
      },
      // Custom hover transition timing — capped at 200ms per CLAUDE.md §4.
      transitionDuration: {
        DEFAULT: "150ms",
        fast: "120ms",
        base: "180ms",
      },
      // shadcn keyframes (added now so Phase 6 components animate correctly).
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 180ms ease-out",
        "accordion-up": "accordion-up 180ms ease-out",
      },
    },
  },
  plugins: [
    // `font-tabular` utility — locks tabular-nums on prices/odometer/years
    // per CLAUDE.md §4. Added inline (no plugin dep) to keep the surface
    // small.
    function ({
      addUtilities,
    }: {
      addUtilities: (u: Record<string, Record<string, string>>) => void;
    }) {
      addUtilities({
        ".font-tabular": {
          "font-variant-numeric": "tabular-nums",
          "font-feature-settings": '"tnum"',
        },
      });
    },
  ],
};
export default config;
