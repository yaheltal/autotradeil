import Image from "next/image";
import Link from "next/link";

/**
 * Public-site footer. Mirrors the structure used on the landing
 * page so /terms, /privacy, /contact share the same chrome.
 *
 * Dark ink surface — visual break from the paper body. The thin
 * accent hairline at the top is the only color moment; everything
 * else is paper-tinted ink. Inside the column headers the eyebrow
 * uses the muted accent tone (text-accent) to echo the landing
 * page's section eyebrows.
 */
export function SiteFooter() {
  return (
    <footer className="bg-ink text-paper relative">
      <div
        aria-hidden="true"
        className="bg-accent pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
      />
      <div className="px-md sm:px-lg py-2xl sm:py-3xl mx-auto max-w-6xl">
        <div className="gap-2xl grid sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Image
              src="/logo-full-white.png"
              alt="AutoTradeIL"
              width={1095}
              height={361}
              className="h-12 w-auto sm:h-14"
            />
            <p className="text-paper/70 mt-lg max-w-xs text-sm leading-relaxed">
              זירת המסחר של סוחרי הרכב בישראל. פלטפורמה B2B מקצועית עם הצעות מתועדות, מלאי משותף
              ואימות KYC.
            </p>
          </div>

          <FooterColumn
            title="פלטפורמה"
            links={[
              { href: "/#why", label: "יתרונות" },
              { href: "/#trust", label: "אמון ובטחון" },
              { href: "/#consumer", label: "לקונה הפרטי" },
            ]}
          />

          <FooterColumn
            title="חשבון"
            links={[
              { href: "/login", label: "כניסה" },
              { href: "/signup/dealer", label: "הרשמת סוחר" },
              { href: "/forgot-password", label: "שחזור סיסמה" },
            ]}
          />

          <FooterColumn
            title="חוקי"
            links={[
              { href: "/terms", label: "תנאי שימוש" },
              { href: "/privacy", label: "פרטיות" },
              { href: "/contact", label: "יצירת קשר" },
            ]}
          />
        </div>

        <div className="border-paper/15 mt-2xl pt-lg gap-sm flex flex-col border-t sm:flex-row sm:items-center sm:justify-between">
          <p className="text-paper/55 text-xs">© 2026 AutoTradeIL · כל הזכויות שמורות</p>
          <p className="text-paper/55 text-xs">נבנה בישראל · גרסה 1.0</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <nav aria-label={title}>
      <p className="text-accent text-xs font-medium uppercase tracking-widest">{title}</p>
      <ul className="mt-md space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-paper/80 hover:text-paper focus-visible:outline-accent duration-fast inline-flex min-h-11 items-center rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
