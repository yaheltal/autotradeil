import type { Metadata } from "next";
import { Heebo } from "next/font/google";

import { ImpersonationBanner } from "@/components/ImpersonationBanner";

import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoTradeIL — פלטפורמת מסחר רכב לסוחרים וצרכנים בישראל",
  description: "זירת מסחר ברכבים לסוחרים מוסמכים ולצרכנים פרטיים — מלאי, הצעות, ועסקאות במקום אחד.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} bg-brand-cream text-brand-ink font-sans antialiased`}>
        {/* Skip link — always first focusable. Navy background + cream text ≥ 15:1 contrast. */}
        <a
          href="#main"
          className="focus:bg-brand-navy focus:text-brand-cream focus:ring-brand-gold sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:outline-none focus:ring-2"
        >
          דלג לתוכן הראשי
        </a>
        <ImpersonationBanner />
        {children}
      </body>
    </html>
  );
}
