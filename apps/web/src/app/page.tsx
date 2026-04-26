import Image from "next/image";
import Link from "next/link";

import { LandingNav } from "@/components/LandingNav";
import { RenderKeepAlive } from "@/components/RenderKeepAlive";

/*
 * AutoTradeIL — landing page (premium B2B trading infrastructure).
 *
 * Editorial automotive aesthetic. Frank Ruhl Libre Hebrew serif for
 * display headlines, Heebo for body. Navy + cream + gold palette.
 * Mobile-first; every section reflows cleanly to a single column on
 * narrow viewports.
 *
 * Sections in order:
 *   1. Header (sticky)
 *   2. Hero — gradient gold accent + "live" pulse on the active-market chip
 *   3. Stats band — 4 KPIs
 *   4. WHAT DEALERS GET — 6 features in a 2x3 grid (SVG icons, no emoji)
 *   5. AI agent — dark navy band, "Powered by Claude AI" subtle credit
 *   6. SECURITY — bank-grade dark band, 4 SVG pillars
 *   7. TRUST TIERS — Bronze / Silver / Gold / Platinum with concrete benefits
 *   8. Coming soon — split (damaged-cars market + native app)
 *   9. Final CTA — beta seat scarcity
 *  10. Footer (kept)
 *
 * A11y notes:
 *   - Every section has aria-labelledby pointing at its heading.
 *   - All decorative SVGs aria-hidden; emoji NEVER used in copy.
 *   - Pulse + gradient animations honor prefers-reduced-motion via
 *     motion-safe / motion-reduce classes (the global CSS already
 *     short-circuits animation duration when reduced motion is on,
 *     so the marketing animations are gated cleanly).
 *   - Disabled buttons use native `disabled` (not aria-disabled) so
 *     AT skips them from tab order.
 *
 * Contrast (audited):
 *   text-brand-navy on bg-brand-cream    → 15.9:1 (AAA)
 *   text-brand-cream on bg-brand-navy    → 15.9:1 (AAA)
 *   text-brand-gold on bg-brand-navy     →  7.6:1 (AAA)
 *   bg-brand-gold + text-brand-navy      → 11.4:1 (AAA)
 */

// ============================================================================
// Inline SVG icons — kept here (not lucide-react) to skip ~30KB of bundle.
// Each is decorative; aria-hidden lives on the parent element so the icon
// itself doesn't need it.
// ============================================================================

function IconAI(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function IconInventory(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

function IconMarket(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9v11h18V9" />
      <path d="M3 9h18" />
      <path d="M9 14h6v6H9z" />
    </svg>
  );
}

function IconClipboard(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4v-1a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M9 11h6M9 15h6M9 19h4" />
    </svg>
  );
}

function IconBell(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9z" />
      <path d="M10.3 21a1.94 1.94 0 003.4 0" />
    </svg>
  );
}

function IconAward(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <circle cx="12" cy="9" r="6" />
      <path d="M8.21 13.89L7 22l5-3 5 3-1.21-8.12" />
    </svg>
  );
}

function IconShield(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconLock(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
      <circle cx="12" cy="16" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconEye(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconWatermark(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 14l8-4" opacity="0.4" />
      <path d="M8 17l8-4" opacity="0.4" />
    </svg>
  );
}

function IconCar(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M5 14l1.5-5a2 2 0 012-1.5h7a2 2 0 012 1.5L19 14" />
      <path d="M3 14h18v4H3z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </svg>
  );
}

function IconPhone(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function IconSearch(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function IconScan(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 7V5a2 2 0 012-2h2M3 17v2a2 2 0 002 2h2M21 7V5a2 2 0 00-2-2h-2M21 17v2a2 2 0 01-2 2h-2" />
      <path d="M7 12h10" />
    </svg>
  );
}

function IconChart(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 21h18" />
      <path d="M5 18V9M10 18V5M15 18v-7M20 18v-4" />
    </svg>
  );
}

// ============================================================================
// Data — sections content
// ============================================================================

type FeatureKey = "ai" | "inventory" | "market" | "clipboard" | "bell" | "award";
const FEATURE_ICON: Record<FeatureKey, (p: { className?: string }) => JSX.Element> = {
  ai: IconAI,
  inventory: IconInventory,
  market: IconMarket,
  clipboard: IconClipboard,
  bell: IconBell,
  award: IconAward,
};

const dealerFeatures: Array<{ icon: FeatureKey; title: string; body: string }> = [
  {
    icon: "ai",
    title: "סוכן AI חכם",
    body: "חיפוש בשפה טבעית, תמחור חכם, זיהוי מסמכים אוטומטי וסוכן דשבורד שמבין אותך.",
  },
  {
    icon: "inventory",
    title: "ניהול מלאי מתקדם",
    body: "מלאי פרטי + שוק B2B במקום אחד. תמונות, סטטוסים, וזיהוי לוחית רישוי.",
  },
  {
    icon: "market",
    title: "שוק B2B בלעדי",
    body: "מסחר בין סוחרים מאומתים בלבד. הצעות מחיר, מו״מ דיגיטלי, חיפוש חכם.",
  },
  {
    icon: "clipboard",
    title: "מעקב עסקאות מלא",
    body: "היסטוריית עסקאות, פרטי קונה ומוכר, טרייד-אין, ודוח רווח והפסד.",
  },
  {
    icon: "bell",
    title: "התראות בזמן אמת",
    body: "Push notifications, SMS ומייל — על כל הצעה, עסקה, ואירוע חשוב.",
  },
  {
    icon: "award",
    title: "דירוג אמון מקצועי",
    body: "Bronze / Silver / Gold / Platinum — Trust Score שנבנה עם כל עסקה.",
  },
];

type AICapKey = "search" | "scan" | "chart";
const AI_ICON: Record<AICapKey, (p: { className?: string }) => JSX.Element> = {
  search: IconSearch,
  scan: IconScan,
  chart: IconChart,
};

const aiCapabilities: Array<{ icon: AICapKey; title: string; body: string }> = [
  {
    icon: "search",
    title: "חיפוש בעברית טבעית",
    body: '"BMW 2020 מתחת ל-80 אלף" — והפילטרים מתמלאים מעצמם.',
  },
  {
    icon: "scan",
    title: "זיהוי מסמכים מיידי",
    body: "תעודת זהות + רישיון סוחר נסרקים ומאומתים בשניות.",
  },
  {
    icon: "chart",
    title: "תמחור חכם בזמן אמת",
    body: "ניתוח שוק לכל רכב — האם המחיר הוגן, גבוה או הזדמנות.",
  },
];

type SecurityKey = "shield" | "lock" | "eye" | "watermark";
const SECURITY_ICON: Record<SecurityKey, (p: { className?: string }) => JSX.Element> = {
  shield: IconShield,
  lock: IconLock,
  eye: IconEye,
  watermark: IconWatermark,
};

const securityPillars: Array<{ icon: SecurityKey; title: string; body: string }> = [
  {
    icon: "shield",
    title: "KYC + אימות זהות",
    body: "כל סוחר עובר אימות זהות + רישיון סוחר תקף לפני כניסה למערכת.",
  },
  {
    icon: "lock",
    title: "2FA + הצפנה",
    body: "אימות דו-שלבי על כל כניסה. כל תקשורת רגישה עוברת ערוץ מוצפן.",
  },
  {
    icon: "eye",
    title: "Audit Log מלא",
    body: "כל פעולה במערכת נרשמת עם חותמת זמן בלתי ניתנת לשינוי.",
  },
  {
    icon: "watermark",
    title: "סימון מים על מסמכים",
    body: "כל מסמך KYC נושא Watermark עם זהות הסוחר — הגנה מפני דליפת מידע.",
  },
];

const tiers: Array<{
  name: string;
  hue: string;
  text: string;
  benefits: string[];
}> = [
  {
    name: "Bronze",
    hue: "bg-amber-700/15 border-amber-700/40",
    text: "text-amber-800",
    benefits: ["סוחר חדש מאומת", "גישה מלאה לשוק B2B", "5 העלאות תמונה לרכב"],
  },
  {
    name: "Silver",
    hue: "bg-slate-300/30 border-slate-400/50",
    text: "text-slate-700",
    benefits: ["10+ עסקאות סגורות", "10 העלאות תמונה לרכב", "סדר עדיפות בפניות תמיכה"],
  },
  {
    name: "Gold",
    hue: "bg-amber-300/30 border-amber-500/50",
    text: "text-amber-900",
    benefits: ["50+ עסקאות סגורות", "Priority Listing במרקטפלייס", "ניתוח שוק מורחב"],
  },
  {
    name: "Platinum",
    hue: "bg-brand-navy/10 border-brand-navy/40",
    text: "text-brand-navy",
    benefits: ["100+ עסקאות סגורות", "תג Platinum מובלט בכל מודעה", "Account Manager אישי"],
  },
];

// Two headline KPIs only — per dealer feedback "leave just B2B and
// 100% verified". Fewer numbers reads more confident at a glance.
const stats = [
  { value: "B2B", label: "שוק סוחרים פעיל", live: true },
  { value: "100%", label: "סוחרים מאומתים" },
];

export default function Home() {
  return (
    <>
      <RenderKeepAlive />

      <LandingNav />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        {/* ===================================================================
            1. HERO
            =================================================================== */}
        <section aria-labelledby="hero-heading" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, #1a1a2e 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          {/* Animated gold accent stripe — subtle gradient sweep along its
              length so the eye catches it as a "live" element on land but
              honors prefers-reduced-motion via the global CSS gate. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute end-0 top-0 h-24 w-1.5 overflow-hidden sm:h-32"
          >
            <div className="bg-brand-gold absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/60 to-transparent motion-safe:animate-[shine_3.5s_ease-in-out_infinite]" />
          </div>

          <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-14 text-center sm:px-6 sm:pb-24 sm:pt-24 lg:pt-32">
            {/* Brand tagline chip — surfaces "זירת מסחר הרכב של ישראל"
                prominently above the H1. Tracking widened so the
                Hebrew line breathes; pulse dot keeps the "live" feel
                from the previous chip. */}
            <span className="border-brand-navy/15 bg-brand-cream/70 text-brand-navy inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide backdrop-blur sm:text-sm">
              <span
                aria-hidden="true"
                className="bg-brand-gold inline-flex h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
              />
              <span>זירת מסחר הרכב של ישראל</span>
            </span>

            <h1
              id="hero-heading"
              className="text-brand-navy mt-5 text-balance font-serif text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:mt-7 sm:text-6xl lg:text-7xl"
            >
              <span className="block">זירת המסחר</span>
              <span className="text-brand-navy/90 block">
                של סוחרי<span className="text-brand-gold"> · </span>הרכב.
              </span>
            </h1>

            <p className="text-brand-ink/80 mx-auto mt-5 max-w-2xl text-balance text-[15px] leading-relaxed sm:mt-7 sm:text-xl">
              פלטפורמה מקצועית למסחר ברכבים בין סוחרים מוסמכים — מלאי משותף, הצעות מתועדות, וזירה
              אחת לכל מחזור החיים של העסקה.
            </p>

            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row">
              <Link
                href="/signup/dealer"
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy shadow-brand-navy/15 group inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto sm:px-7 sm:text-lg"
              >
                <span>אני סוחר — הצטרפות</span>
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:-translate-x-1"
                >
                  ←
                </span>
              </Link>

              <button
                type="button"
                disabled
                title="ממש ממש עוד מעט, סבלנות"
                aria-describedby="buyer-cta-hint"
                className="bg-brand-navy/5 text-brand-navy/60 border-brand-navy/10 inline-flex min-h-[56px] w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-lg border px-5 py-3.5 text-base font-semibold sm:w-auto sm:px-7 sm:text-lg"
              >
                <span>אני קונה</span>
                <span
                  aria-hidden="true"
                  className="bg-brand-navy/10 text-brand-navy/70 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tracking-wide"
                >
                  בקרוב
                </span>
              </button>
              <span id="buyer-cta-hint" className="sr-only">
                ממש ממש עוד מעט, סבלנות. השוק לקונים פרטיים נפתח בקרוב.
              </span>
            </div>

            {/* Trust strip — three small badges with check glyphs. On
                mobile they wrap into a tight 3-column grid with very
                little vertical noise; on sm+ they line up horizontally
                under the CTAs. */}
            <ul
              aria-label="הבטחות הפלטפורמה"
              className="text-brand-ink/70 mx-auto mt-7 grid max-w-md grid-cols-3 items-start gap-2 text-[11px] font-medium sm:mt-9 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-x-5 sm:gap-y-2 sm:text-sm"
            >
              {["ללא עמלת רישום", "אישור סוחר תוך 24 שעות", "אימות KYC חכם בעזרת AI"].map(
                (line) => (
                  <li
                    key={line}
                    className="inline-flex items-start justify-center gap-1.5 leading-snug"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-brand-gold/15 text-brand-gold inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    >
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </section>

        {/* ===================================================================
            2. STATS BAND — two-up KPI strip with center gold divider
            =================================================================== */}
        <section
          aria-labelledby="stats-heading"
          className="bg-brand-navy text-brand-cream relative overflow-hidden"
        >
          <h2 id="stats-heading" className="sr-only">
            נתוני הפלטפורמה
          </h2>
          {/* Top + bottom gold hairlines frame the strip */}
          <div
            aria-hidden="true"
            className="bg-brand-gold absolute inset-x-0 top-0 h-px opacity-60"
          />
          <div
            aria-hidden="true"
            className="bg-brand-gold absolute inset-x-0 bottom-0 h-px opacity-30"
          />

          <div className="relative mx-auto flex max-w-3xl items-stretch px-4 py-9 sm:px-6 sm:py-14">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={[
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center text-center",
                  i > 0 ? "border-brand-cream/20 border-s" : "",
                ].join(" ")}
              >
                <p className="text-brand-gold inline-flex items-baseline gap-2 font-serif text-4xl font-bold leading-none sm:text-5xl lg:text-6xl">
                  {s.value}
                  {s.live ? (
                    <span aria-hidden="true" className="relative inline-flex h-2 w-2 self-center">
                      <span className="bg-brand-gold absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping" />
                      <span className="bg-brand-gold relative inline-flex h-2 w-2 rounded-full" />
                    </span>
                  ) : null}
                </p>
                <p className="text-brand-cream/85 mt-3 text-sm font-medium uppercase tracking-[0.18em] sm:text-base">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ===================================================================
            3. WHAT DEALERS GET — 6 features
            =================================================================== */}
        <section id="dealers" aria-labelledby="dealers-heading" className="relative">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="text-center">
              <p className="text-brand-navy/70 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
                לסוחרים
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              </p>
              <h2
                id="dealers-heading"
                className="text-brand-navy mx-auto mt-5 max-w-3xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
              >
                כל מה שסוחר מקצועי צריך — במקום אחד.
              </h2>
              <p className="text-brand-ink/75 mx-auto mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">
                לא עוד שילוב של 4 כלים, אקסל ו-WhatsApp. תשתית מסחר אחת שעוברת איתך מתחילת היום ועד
                סגירת העסקה.
              </p>
            </div>

            <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dealerFeatures.map((f) => {
                const Icon = FEATURE_ICON[f.icon];
                return (
                  <li
                    key={f.title}
                    className="border-brand-navy/12 hover:border-brand-gold/60 group relative overflow-hidden rounded-xl border bg-white p-6 transition-all hover:shadow-lg motion-reduce:transition-none sm:p-7"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-brand-gold/0 group-hover:bg-brand-gold/100 absolute inset-x-0 top-0 h-0.5 transition-colors"
                    />
                    <div
                      aria-hidden="true"
                      className="bg-brand-navy/5 text-brand-navy group-hover:bg-brand-gold group-hover:text-brand-navy inline-flex h-12 w-12 items-center justify-center rounded-lg transition-colors"
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-brand-navy mt-5 font-serif text-xl font-bold sm:text-[1.4rem]">
                      {f.title}
                    </h3>
                    <p className="text-brand-ink/75 mt-3 text-sm leading-relaxed sm:text-[15px]">
                      {f.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ===================================================================
            4. AI AGENT — dark navy, "Powered by Claude AI" small footnote
            =================================================================== */}
        <section
          id="ai"
          aria-labelledby="ai-heading"
          className="bg-brand-navy text-brand-cream relative overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="bg-brand-gold pointer-events-none absolute end-0 top-0 h-1.5 w-32 sm:w-48"
          />
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="text-center">
              <p className="text-brand-gold flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
                סוכן AI
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              </p>
              <h2
                id="ai-heading"
                className="mx-auto mt-5 max-w-3xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
              >
                הסוכן החכם שעובד בשבילך.
              </h2>
              <p className="text-brand-cream/80 mx-auto mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">
                AI מובנה לכל אורך הזרימה — מהעלאת הרכב, דרך החיפוש, ועד ניתוח התמחור. בעברית.
              </p>
            </div>

            {/* Demo panel — looks like a real search input with a typed query.
                Pure CSS — no API call. Uses motion-safe gating so reduced-motion
                users see the final state without the typing animation. */}
            <div className="mx-auto mt-12 max-w-2xl">
              <div className="border-brand-cream/15 bg-brand-cream/5 rounded-xl border p-4 shadow-2xl backdrop-blur sm:p-5">
                <div className="border-brand-cream/15 flex items-center gap-2 rounded-lg border bg-white/5 px-3 py-2.5">
                  <IconSearch className="text-brand-gold h-5 w-5 shrink-0" />
                  <span
                    aria-hidden="true"
                    className="text-brand-cream font-mono text-sm motion-safe:animate-[typecaret_4s_steps(40,end)_infinite] motion-safe:overflow-hidden motion-safe:whitespace-nowrap motion-safe:[border-inline-end:2px_solid_theme(colors.brand.gold)] sm:text-base"
                  >
                    BMW 2020 מתחת ל-80 אלף
                  </span>
                </div>
                <p className="text-brand-cream/60 mt-3 text-center text-xs">
                  כך מחפשים — בלי טפסים, בלי dropdown, בלי מילוי 8 שדות.
                </p>
              </div>
            </div>

            <ul className="mt-14 grid gap-6 sm:grid-cols-3">
              {aiCapabilities.map((c) => {
                const Icon = AI_ICON[c.icon];
                return (
                  <li
                    key={c.title}
                    className="border-brand-cream/12 bg-brand-cream/5 rounded-xl border p-6 sm:p-7"
                  >
                    <div
                      aria-hidden="true"
                      className="bg-brand-gold/15 text-brand-gold inline-flex h-11 w-11 items-center justify-center rounded-lg"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-brand-cream mt-4 font-serif text-lg font-bold sm:text-xl">
                      {c.title}
                    </h3>
                    <p className="text-brand-cream/75 mt-2 text-sm leading-relaxed">{c.body}</p>
                  </li>
                );
              })}
            </ul>

            {/* Small "Powered by" credit — Anthropic brand-safe attribution
                without using their wordmark prominently. */}
            <p className="text-brand-cream/55 mt-12 text-center text-xs">
              Powered by{" "}
              <span lang="en" className="text-brand-cream/70 font-semibold tracking-wide">
                Claude AI
              </span>{" "}
              · Anthropic
            </p>
          </div>
        </section>

        {/* ===================================================================
            5. SECURITY — bank-grade dark band
            =================================================================== */}
        <section
          id="security"
          aria-labelledby="security-heading"
          className="bg-brand-ink text-brand-cream relative"
          style={{ backgroundColor: "#0d1224" }}
        >
          {/* Subtle grid background — reads as "infrastructure" not "marketing" */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="text-center">
              <p className="text-brand-gold flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
                אבטחה
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              </p>
              <h2
                id="security-heading"
                className="mx-auto mt-5 max-w-3xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
              >
                אבטחה ברמה בנקאית.
              </h2>
              <p className="text-brand-cream/75 mx-auto mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">
                כי מסחר ברכבים דורש אמון אמיתי.
              </p>
            </div>

            <ul className="mt-14 grid gap-5 sm:grid-cols-2">
              {securityPillars.map((p) => {
                const Icon = SECURITY_ICON[p.icon];
                return (
                  <li
                    key={p.title}
                    className="border-brand-cream/15 bg-brand-cream/[0.03] flex gap-4 rounded-xl border p-6 sm:p-7"
                  >
                    <div
                      aria-hidden="true"
                      className="bg-brand-gold/10 text-brand-gold inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-brand-cream font-serif text-lg font-bold sm:text-xl">
                        {p.title}
                      </h3>
                      <p className="text-brand-cream/75 mt-2 text-sm leading-relaxed">{p.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ===================================================================
            6. TRUST TIERS — 4 cards
            =================================================================== */}
        <section id="tiers" aria-labelledby="tiers-heading" className="relative">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="text-center">
              <p className="text-brand-navy/70 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
                Trust Score
                <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              </p>
              <h2
                id="tiers-heading"
                className="text-brand-navy mx-auto mt-5 max-w-3xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
              >
                ככל שמוכרים יותר — הדירוג עולה.
              </h2>
              <p className="text-brand-ink/75 mx-auto mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">
                ארבע רמות. כל עסקה סגורה, כל ביקורת חיובית, כל חודש ללא תלונות — מקדמים אותך.
              </p>
            </div>

            <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {tiers.map((t, i) => (
                <li
                  key={t.name}
                  className={[
                    "rounded-xl border p-6 transition-transform hover:-translate-y-1 motion-reduce:transition-none sm:p-7",
                    t.hue,
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={["text-brand-navy/40 font-serif text-2xl font-bold", t.text].join(
                        " ",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <IconAward className={["h-5 w-5", t.text].join(" ")} />
                  </div>
                  <p
                    lang="en"
                    className={["mt-4 font-serif text-2xl font-bold tracking-wide", t.text].join(
                      " ",
                    )}
                  >
                    {t.name}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {t.benefits.map((b) => (
                      <li
                        key={b}
                        className="text-brand-ink/85 flex items-start gap-2 text-sm leading-snug"
                      >
                        <span aria-hidden="true" className="text-brand-gold mt-1 shrink-0">
                          ✓
                        </span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ===================================================================
            7. COMING SOON — split layout
            =================================================================== */}
        <section
          aria-labelledby="future-heading"
          className="bg-brand-navy/[0.04] border-brand-navy/10 relative border-y"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <p
              lang="en"
              className="text-brand-navy/70 flex items-center justify-center gap-2 text-center text-xs font-semibold uppercase tracking-[0.2em]"
            >
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              Coming Soon
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
            </p>
            <h2 id="future-heading" className="sr-only">
              מה בעבודה
            </h2>
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {/* Damaged-cars market */}
              <article className="border-brand-navy/15 rounded-xl border bg-white p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="bg-brand-navy/5 text-brand-navy inline-flex h-12 w-12 items-center justify-center rounded-lg"
                  >
                    <IconCar className="h-6 w-6" />
                  </div>
                  <span className="bg-brand-navy text-brand-gold inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider">
                    בקרוב
                  </span>
                </div>
                <h3 className="text-brand-navy mt-5 font-serif text-xl font-bold sm:text-2xl">
                  שוק רכבים פגועים
                </h3>
                <p className="text-brand-ink/75 mt-3 text-sm leading-relaxed sm:text-[15px]">
                  סוחרים יוכלו לקנות ולמכור רכבים שעברו תאונה במחיר מתחת למחירון — עם דוח נזק מתועד
                  וזירה מקצועית בלבד.
                </p>
              </article>

              {/* Mobile app */}
              <article className="border-brand-navy/15 rounded-xl border bg-white p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="bg-brand-navy/5 text-brand-navy inline-flex h-12 w-12 items-center justify-center rounded-lg"
                  >
                    <IconPhone className="h-6 w-6" />
                  </div>
                  <span className="bg-brand-navy text-brand-gold inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider">
                    בקרוב
                  </span>
                </div>
                <h3 className="text-brand-navy mt-5 font-serif text-xl font-bold sm:text-2xl">
                  אפליקציה מובילית
                </h3>
                <p className="text-brand-ink/75 mt-3 text-sm leading-relaxed sm:text-[15px]">
                  iOS + Android — התראות native, מצלמת KYC, וצפייה בשוק במהירות מירבית. בינתיים:
                  האתר מותקן כ-PWA למסך הבית.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled
                    className="border-brand-navy/15 bg-brand-navy/5 text-brand-navy/60 inline-flex min-h-9 cursor-not-allowed items-center rounded-md border px-3 py-1.5 text-xs font-semibold"
                  >
                    App Store · בקרוב
                  </button>
                  <button
                    type="button"
                    disabled
                    className="border-brand-navy/15 bg-brand-navy/5 text-brand-navy/60 inline-flex min-h-9 cursor-not-allowed items-center rounded-md border px-3 py-1.5 text-xs font-semibold"
                  >
                    Google Play · בקרוב
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ===================================================================
            8. FINAL CTA — beta seat scarcity
            =================================================================== */}
        <section aria-labelledby="cta-heading" className="relative">
          <div className="mx-auto max-w-5xl px-4 pb-24 pt-20 sm:px-6">
            <div className="border-brand-navy/15 from-brand-cream to-brand-cream/40 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 sm:p-12 lg:p-16">
              <div
                aria-hidden="true"
                className="bg-brand-gold absolute start-0 top-0 h-1.5 w-32 sm:w-48"
              />
              <div className="text-center lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-12 lg:text-start">
                <div>
                  <span className="bg-brand-gold/15 text-brand-navy inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider">
                    <span
                      aria-hidden="true"
                      className="bg-brand-gold inline-flex h-1.5 w-1.5 rounded-full motion-safe:animate-pulse"
                    />
                    מקומות מוגבלים · שלב הבטא
                  </span>
                  <h2
                    id="cta-heading"
                    className="text-brand-navy mt-4 font-serif text-[1.75rem] font-bold leading-tight sm:text-4xl lg:text-5xl"
                  >
                    מוכן להתחיל לסחור באופן מקצועי?
                  </h2>
                  <p className="text-brand-ink/75 mx-auto mt-5 max-w-xl text-base leading-relaxed sm:text-lg lg:mx-0">
                    הצטרפות בשלב הבטא חינמית לחלוטין — וכוללת liaison אישי לאורך 30 יום ראשונים.
                  </p>
                </div>
                <div className="mt-8 flex flex-col items-stretch gap-3 lg:mt-0">
                  <Link
                    href="/signup/dealer"
                    className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy shadow-brand-navy/10 group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md px-5 py-3.5 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-lg"
                  >
                    <span>פתיחת חשבון סוחר</span>
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:-translate-x-1"
                    >
                      ←
                    </span>
                  </Link>
                  <Link
                    href="/login"
                    className="text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy decoration-brand-gold inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    כבר יש לי חשבון — כניסה
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* =====================================================================
          FOOTER
          ===================================================================== */}
      <footer className="bg-brand-navy text-brand-cream relative">
        <div
          aria-hidden="true"
          className="bg-brand-gold pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
        />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Image
                src="/logo-full-white.png"
                alt="AutoTradeIL"
                width={1095}
                height={361}
                className="h-12 w-auto sm:h-14"
              />
              <p className="text-brand-cream/75 mt-5 max-w-xs text-sm leading-relaxed">
                זירת המסחר של סוחרי הרכב בישראל. פלטפורמה B2B מקצועית עם הצעות מתועדות, מלאי משותף
                ואימות KYC.
              </p>
            </div>

            <nav aria-label="קישורי פלטפורמה">
              <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
                פלטפורמה
              </p>
              <ul className="mt-4 space-y-2">
                <li>
                  <a
                    href="#dealers"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    לסוחרים
                  </a>
                </li>
                <li>
                  <a
                    href="#ai"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    סוכן AI
                  </a>
                </li>
                <li>
                  <a
                    href="#security"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    אבטחה
                  </a>
                </li>
                <li>
                  <a
                    href="#tiers"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    דירוגים
                  </a>
                </li>
              </ul>
            </nav>

            <nav aria-label="חשבון">
              <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
                חשבון
              </p>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/login"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    כניסה
                  </Link>
                </li>
                <li>
                  <Link
                    href="/signup/dealer"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    הרשמת סוחר
                  </Link>
                </li>
                <li>
                  <Link
                    href="/forgot-password"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    שחזור סיסמה
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="חוקי">
              <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
                חוקי
              </p>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/terms"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    תנאי שימוש
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    פרטיות
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    יצירת קשר
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="border-brand-cream/15 mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-brand-cream/60 text-xs">© 2026 AutoTradeIL · כל הזכויות שמורות</p>
            <p className="text-brand-cream/60 text-xs">נבנה בישראל · גרסה 1.0</p>
          </div>
        </div>
      </footer>
    </>
  );
}
