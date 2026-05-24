import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Inter } from "next/font/google";

import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";

import "./globals.css";

/**
 * Typography stack — locked per CLAUDE.md §4.
 *
 *   Inter (body)        → all paragraph + UI copy, Latin + Hebrew.
 *   Frank Ruhl Libre    → all headings (Hebrew + Latin). Single editorial
 *                         face — the site is Hebrew-first so a separate
 *                         Latin display font (Fraunces, previously paired)
 *                         was over-engineering for negligible polish gain.
 *
 * No third font, ever. Monospace lives in the system stack only.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "900"],
  variable: "--font-frank-ruhl",
  display: "swap",
});

// `metadataBase` lets Next.js resolve relative og:image / twitter:image
// paths (`/opengraph-image`) against the production origin. Falls back
// to localhost in dev so previews still render.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://autotradeil.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AutoTradeIL — זירת המסחר של סוחרי הרכב",
    template: "%s · AutoTradeIL",
  },
  description:
    "זירת המסחר של סוחרי הרכב בישראל. פלטפורמה B2B מקצועית — מלאי משותף, הצעות מתועדות, אימות KYC, וזירה אחת לכל מחזור החיים של העסקה.",
  applicationName: "AutoTradeIL",
  keywords: [
    "AutoTradeIL",
    "סוחרי רכב",
    "מסחר רכבים",
    "B2B רכב",
    "שוק סוחרים",
    "רכבים יד שנייה",
    "ישראל",
  ],
  authors: [{ name: "AutoTradeIL" }],
  creator: "AutoTradeIL",
  publisher: "AutoTradeIL",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: "AutoTradeIL",
    title: "AutoTradeIL — זירת המסחר של סוחרי הרכב",
    description:
      "זירת המסחר של סוחרי הרכב בישראל. פלטפורמה B2B מקצועית עם הצעות מתועדות, מלאי משותף, ואימות KYC.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AutoTradeIL — זירת המסחר של סוחרי הרכב",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoTradeIL — זירת המסחר של סוחרי הרכב",
    description:
      "זירת המסחר של סוחרי הרכב בישראל. פלטפורמה B2B מקצועית עם הצעות מתועדות, מלאי משותף, ואימות KYC.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", sizes: "any" },
      { url: "/favicon-16x16.png?v=3", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=3", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico?v=3"],
  },
  manifest: "/manifest.json?v=3",
  // iOS PWA — the new system is light-only, so the standalone status bar
  // shows dark glyphs over a paper-white background.
  appleWebApp: {
    capable: true,
    title: "AutoTradeIL",
    statusBarStyle: "default",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Paper white — matches the locked palette. Replaces the legacy navy chrome.
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        {/* next-themes injects the active class onto <html> before first
            paint (see <ThemeProvider> below). `suppressHydrationWarning`
            on <html> silences the unavoidable client/server mismatch
            that injection produces. */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
          <>
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
              crossOrigin="anonymous"
            />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          </>
        ) : null}
        {process.env.NEXT_PUBLIC_API_URL ? (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL} />
          </>
        ) : null}
      </head>
      <body
        className={`${inter.variable} ${frankRuhl.variable} bg-paper text-ink dark:bg-ink dark:text-paper font-sans antialiased`}
      >
        {/* Skip link — paper bg, ink text, accent ring. */}
        <a
          href="#main"
          className="focus:start-md focus:top-md focus:bg-ink focus:px-md focus:text-paper focus:outline-accent sr-only focus:not-sr-only focus:fixed focus:z-50 focus:rounded-md focus:py-8 focus:outline-none focus:outline-2 focus:outline-offset-2"
        >
          דלג לתוכן הראשי
        </a>
        <ThemeProvider>
          <QueryProvider>
            <ImpersonationBanner />
            {children}
            <PWAInstallPrompt />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
