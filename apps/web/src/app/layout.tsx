import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoTradeIL — פלטפורמת מסחר רכב לסוחרים וצרכנים בישראל",
  description:
    "זירת מסחר ברכבים לסוחרים מוסמכים ולצרכנים פרטיים — מלאי, הצעות, ועסקאות במקום אחד.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${heebo.variable} font-sans antialiased bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100`}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:bg-blue-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-white"
        >
          דלג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  );
}
