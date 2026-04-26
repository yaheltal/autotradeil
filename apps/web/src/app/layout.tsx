import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Heebo } from "next/font/google";

import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

// Editorial Hebrew serif — premium automotive trade-journal feel.
// Used only for display headings via the `font-serif` Tailwind utility.
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
  // Static favicons + apple-touch-icon, generated from the brand logo via
  // scripts/process_brand_logo.py. Keeping them as real /public files (not
  // dynamic Next.js routes) so social-link validators and PWA installers
  // see immutable URLs they can cache.
  //
  // Cache-busting: browsers (especially iOS Safari + Chrome desktop)
  // hold favicons forever once cached. The ?v=N query string forces a
  // fresh fetch when the brand logo changes. Bump the integer when you
  // ship a new logo. Same idea applies to apple-touch-icon (iOS pins
  // home-screen icons more aggressively still).
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
  // iOS PWA — once "Add to Home Screen" the app launches without
  // Safari chrome. status-bar-style: black-translucent renders the
  // status bar over the page content with white glyphs (matches our
  // navy header). title is what iOS shows under the icon.
  appleWebApp: {
    capable: true,
    title: "AutoTradeIL",
    statusBarStyle: "black-translucent",
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
  // viewportFit: "cover" lets the page extend beneath iOS notched
  // status bar / home indicator. Without it iOS leaves brown-cream
  // bands on iPhone X+ in standalone PWA mode. Components that
  // need to dodge those areas use env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#1a1a2e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${heebo.variable} ${frankRuhl.variable} bg-brand-cream text-brand-ink font-sans antialiased`}
      >
        {/* Skip link — always first focusable. Navy background + cream text ≥ 15:1 contrast. */}
        <a
          href="#main"
          className="focus:bg-brand-navy focus:text-brand-cream focus:ring-brand-gold sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:outline-none focus:ring-2"
        >
          דלג לתוכן הראשי
        </a>
        <ImpersonationBanner />
        {children}
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
