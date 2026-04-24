import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-heebo)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // ====================================================================
        // AutoTradeIL brand (refined / editorial — navy + gold on off-white)
        // Contrast audited at use-sites — see comments in page components.
        // ====================================================================
        brand: {
          navy: "#1a1a2e", // primary surface / text on light  → 15.9:1 on #f8f8f6 (AAA)
          gold: "#e8b84b", // accent only — NOT body text on light (fails)
          cream: "#f8f8f6", // warm off-white background
          ink: "#1a1a1a", // body text
        },
        // Status tones — darker variants for text to meet 4.5:1.
        ok: {
          DEFAULT: "#22c55e",
          text: "#14532d",
          bg: "#dcfce7",
        },
        danger: {
          DEFAULT: "#ef4444",
          text: "#7f1d1d",
          bg: "#fee2e2",
        },
      },
    },
  },
  plugins: [],
};
export default config;
