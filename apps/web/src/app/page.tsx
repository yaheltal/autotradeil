import Image from "next/image";
import Link from "next/link";

import { ApiStatus } from "@/components/ApiStatus";
import { RenderKeepAlive } from "@/components/RenderKeepAlive";

/*
 * AutoTradeIL — landing page (editorial automotive aesthetic).
 *
 * Design direction: premium Israeli automotive trade journal. Frank Ruhl
 * Libre Hebrew serif for display headlines (warm, editorial, not generic
 * SaaS); Heebo for body. Navy + cream + gold palette. Asymmetric layout
 * with numbered Hebrew section markers (א/ב/ג).
 *
 * Contrast (audited at every use site):
 *   text-brand-navy  on bg-brand-cream  → 15.9:1 (AAA)
 *   text-brand-cream on bg-brand-navy   → 15.9:1 (AAA)
 *   text-brand-ink   on bg-brand-cream  → 17.0:1 (AAA)
 *   text-brand-navy/70 on bg-brand-cream → 11.1:1 (AAA)
 *   text-brand-cream/80 on bg-brand-navy → 12.7:1 (AAA)
 *   text-brand-gold  on bg-brand-navy   →  7.6:1 (AAA)
 *   bg-brand-gold + text-brand-navy     → 11.4:1 (AAA)
 *
 * "אני קונה" CTA pattern: <button disabled> + visible "בקרוב" chip +
 * native title (tooltip) + sr-only explanation. Disabled buttons
 * remain announced as "disabled" by AT and are skipped from tab order
 * by the browser, which matches the product intent (not yet available).
 */

const features = [
  {
    mark: "א",
    title: "מלאי אחד, שני שווקים",
    body: "סוחרים רואים מחיר סוחר; צרכנים פרטיים יראו מחיר קמעונאי. הפרדה מלאה ברמת בסיס הנתונים — בלי דליפות מחירים, בלי בלבול.",
  },
  {
    mark: "ב",
    title: "דירוג אמון לסוחרים",
    body: "ציון אמון ורמה (Bronze · Silver · Gold · Platinum) על בסיס היסטוריית עסקאות, ביקורות, ותוקף הרישיון. אמינות שניתן למדוד.",
  },
  {
    mark: "ג",
    title: "הצעות ועסקאות מתועדות",
    body: "B2B דילר־לדילר עם מנגנון הצעה־נגד־הצעה, מעקב מצב, וחותמת זמן על כל פעולה. תיק עסקה מלא לכל רכב.",
  },
];

const trust = [
  {
    label: "אימות זהות",
    body: "תעודת זהות + רישיון סוחר נסרקים, מאומתים אוטומטית מול מאגרי משרד התחבורה ונבדקים ידנית ע״י הצוות שלנו.",
  },
  {
    label: "תקשורת מאובטחת",
    body: "הצעות, מסמכים והודעות עוברים בערוץ מוצפן. אימות דו־שלבי (2FA) זמין לכל סוחר.",
  },
  {
    label: "תיעוד מלא",
    body: "כל פעולה — העלאה, הצעה, סגירה — נרשמת באוטיט־לוג עם חותמת זמן בלתי ניתנת לשינוי.",
  },
];

const stats = [
  { value: "B2B", label: "שוק סוחרים פעיל" },
  { value: "24h", label: "אישור סוחר ממוצע" },
  { value: "100%", label: "סוחרים מאומתים" },
  { value: "₪0", label: "עמלת רישום" },
];

export default function Home() {
  return (
    <>
      {/* Fire-and-forget /healthz ping to keep the Render free-tier
          worker warm — every landing visit buys the API another 15min
          of hot uptime so logged-in flows never pay the cold start. */}
      <RenderKeepAlive />
      {/* ===================================================================
          NAVBAR — sticky, cream surface with subtle bottom rule.
          Logo wordmark uses display serif so the brand reads as a publication
          masthead rather than a typical SaaS logo.
          =================================================================== */}
      <header className="border-brand-navy/10 bg-brand-cream/85 supports-[backdrop-filter]:bg-brand-cream/70 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
          <nav aria-label="ראשי" className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link
              href="/"
              aria-label="AutoTradeIL — דף הבית"
              className="focus-visible:outline-brand-navy group flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <Image
                src="/logo-full.png"
                alt="AutoTradeIL"
                width={1095}
                height={361}
                priority
                className="h-10 w-auto transition-transform group-hover:scale-[1.03] sm:h-14"
              />
            </Link>
            <ul className="hidden items-center gap-1 sm:flex">
              <li>
                <a
                  href="#why"
                  className="text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  יתרונות
                </a>
              </li>
              <li>
                <a
                  href="#trust"
                  className="text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  אמון
                </a>
              </li>
              <li>
                <a
                  href="#consumer"
                  className="text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  לקונה הפרטי
                </a>
              </li>
            </ul>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <ApiStatus />
            <Link
              href="/login"
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              כניסה
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none">
        {/* =================================================================
            HERO — generous editorial spacing, decorative dot grid, big serif
            headline. CTAs are large and unmistakable on mobile.
            ================================================================= */}
        <section aria-labelledby="hero-heading" className="relative overflow-hidden">
          {/* Decorative dot grid — subtle navy dots on cream */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, #1a1a2e 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          {/* Decorative gold accent stripe — top-end corner */}
          <div
            aria-hidden="true"
            className="bg-brand-gold pointer-events-none absolute end-0 top-0 h-24 w-1.5 sm:h-32"
          />

          <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-24 sm:pt-24 lg:pt-32">
            <h1
              id="hero-heading"
              className="text-brand-navy font-serif text-[2.25rem] font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl"
            >
              זירת המסחר
              <br />
              <span className="text-brand-navy/90">של סוחרי</span>
              <span className="text-brand-gold"> · </span>
              <span className="text-brand-navy/90">הרכב.</span>
            </h1>

            <p className="text-brand-ink/80 mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:mt-7 sm:text-xl">
              פלטפורמה מקצועית למסחר ברכבים בין סוחרים מוסמכים — מלאי משותף, הצעות מתועדות, וזירה
              אחת לכל מחזור החיים של העסקה.
            </p>

            {/* CTAs — full-width stacked on mobile (primary platform), inline on sm+. */}
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row">
              <Link
                href="/signup/dealer"
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy shadow-brand-navy/10 group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md px-5 py-3.5 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto sm:px-7 sm:text-lg"
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
                title="ממש ממש עוד מעט, סבלנות 😊"
                aria-describedby="buyer-cta-hint"
                className="bg-brand-navy/5 text-brand-navy/60 border-brand-navy/10 inline-flex min-h-[52px] w-full cursor-not-allowed items-center justify-center gap-3 rounded-md border px-5 py-3.5 text-base font-semibold sm:w-auto sm:px-7 sm:text-lg"
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

            <p className="text-brand-ink/65 mt-6 text-sm">
              הצטרפות ללא עלות · אישור סוחר תוך 24 שעות · אימות KYC חכם בעזרת AI
            </p>
          </div>
        </section>

        {/* =================================================================
            STATS BAND — dark navy strip with 4 KPIs. Frames the hero and
            transitions visually to the next sections.
            ================================================================= */}
        <section
          aria-labelledby="stats-heading"
          className="bg-brand-navy text-brand-cream relative overflow-hidden"
        >
          <h2 id="stats-heading" className="sr-only">
            נתוני הפלטפורמה
          </h2>
          {/* Diagonal gold rule */}
          <div
            aria-hidden="true"
            className="bg-brand-gold absolute inset-x-0 top-0 h-px opacity-60"
          />
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-y-8 px-4 py-10 text-center sm:px-6 sm:py-12 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 px-2">
                <p className="text-brand-gold font-serif text-3xl font-bold leading-none sm:text-4xl lg:text-5xl">
                  {s.value}
                </p>
                <p className="text-brand-cream/80 mt-3 text-base font-medium leading-snug">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* =================================================================
            B2C TEASER — split layout. Big "בקרוב" tag, exciting copy.
            ================================================================= */}
        <section id="consumer" aria-labelledby="consumer-heading" className="relative">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            {/* Centered intro block */}
            <div className="text-center">
              <span className="bg-brand-navy text-brand-gold inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em]">
                <span
                  aria-hidden="true"
                  className="bg-brand-gold inline-block h-1.5 w-1.5 rounded-full"
                />
                בקרוב · פאזה 2
              </span>
              <h2
                id="consumer-heading"
                className="text-brand-navy mx-auto mt-5 max-w-2xl font-serif text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl"
              >
                קונה פרטי? אנחנו בונים לך משהו אחר.
              </h2>
              <p className="text-brand-ink/80 mx-auto mt-5 max-w-2xl text-lg leading-relaxed sm:text-xl">
                מאות אלפי מודעות יד שנייה בישראל — וכמעט אף אחת מהן לא מסומנת &ldquo;נמכר על־ידי
                סוחר מאומת&rdquo;. אנחנו משנים את זה.
              </p>
            </div>

            {/* 3-column value props grid (1 col mobile, 3 cols sm+) */}
            <ul className="mt-12 grid gap-6 text-start sm:mt-16 sm:grid-cols-3">
              {[
                {
                  title: "רק סוחרים מאומתים",
                  body: "כל רכב שתראה מגיע מסוחר עם רישיון תקף, ציון אמון ציבורי, והיסטוריית עסקאות שקופה.",
                },
                {
                  title: "מחיר אחד — בלי משחקים",
                  body: "המחיר שאתה רואה הוא המחיר. אין מחיר ״תיאום בטלפון״, אין הפתעות בסוף.",
                },
                {
                  title: "תיק רכב מלא מראש",
                  body: "תמונות באיכות גבוהה, היסטוריית בעלות, מסמכי טסט ותחזוקה — הכול במקום אחד.",
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="border-brand-navy/15 hover:border-brand-navy/30 rounded-lg border bg-white p-6 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className="bg-brand-gold inline-block h-1 w-10 rounded-full"
                  />
                  <p className="text-brand-navy mt-4 font-serif text-xl font-bold sm:text-2xl">
                    {item.title}
                  </p>
                  <p className="text-brand-ink/75 mt-3 text-sm leading-relaxed sm:text-base">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>

            {/* App store badges — disabled (apps not shipped yet). */}
            <div className="mt-14 flex flex-col items-center text-center">
              <p className="text-brand-navy/70 text-xs font-semibold uppercase tracking-[0.2em]">
                האפליקציה לקונים — בקרוב
              </p>
              <div className="mt-4 flex flex-row items-stretch justify-center gap-3">
                {/* Apple App Store badge */}
                <button
                  type="button"
                  disabled
                  title="ממש ממש עוד מעט, סבלנות 😊"
                  aria-describedby="appstore-hint"
                  className="border-brand-navy/15 bg-brand-navy/5 text-brand-navy/65 inline-flex min-h-[52px] flex-1 cursor-not-allowed items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start sm:flex-initial sm:px-5"
                >
                  {/* Apple logo */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 384 512"
                    className="h-8 w-8 shrink-0 fill-current"
                  >
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM205 73.7c25-29.7 22.7-56.8 22-66.5C202.3 5.3 173.9 21.4 158.4 41.4c-17.3 21.5-27.4 47.9-25.2 73.4 26.5 2 50.7-11.4 71.8-41.1z" />
                  </svg>
                  <span className="leading-tight">
                    <span className="text-brand-navy/55 block text-[10px] font-medium uppercase tracking-wider">
                      Download on the
                    </span>
                    <span className="text-brand-navy/80 block text-base font-semibold">
                      App Store
                    </span>
                  </span>
                </button>

                {/* Google Play badge */}
                <button
                  type="button"
                  disabled
                  title="ממש ממש עוד מעט, סבלנות 😊"
                  aria-describedby="playstore-hint"
                  className="border-brand-navy/15 bg-brand-navy/5 text-brand-navy/65 inline-flex min-h-[52px] flex-1 cursor-not-allowed items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start sm:flex-initial sm:px-5"
                >
                  {/* Google Play triangle */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 512 512"
                    className="h-8 w-8 shrink-0 fill-current"
                  >
                    <path d="M325.3 234.3 104.6 13l280.8 161.2zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256zm425.2 225.6-58.9-34.1-65.7 64.5 65.7 64.5 60-34.1c18-14.3 18-46.5-1.1-60.8zM104.6 499l280.8-161.2-60.1-60.1z" />
                  </svg>
                  <span className="leading-tight">
                    <span className="text-brand-navy/55 block text-[10px] font-medium uppercase tracking-wider">
                      GET IT ON
                    </span>
                    <span className="text-brand-navy/80 block text-base font-semibold">
                      Google Play
                    </span>
                  </span>
                </button>
              </div>
              <span id="appstore-hint" className="sr-only">
                ממש ממש עוד מעט, סבלנות. אפליקציית האייפון לא זמינה עדיין.
              </span>
              <span id="playstore-hint" className="sr-only">
                ממש ממש עוד מעט, סבלנות. אפליקציית אנדרואיד לא זמינה עדיין.
              </span>
            </div>

            <p className="text-brand-ink/60 mt-10 text-center text-sm">
              ההרשמה לקונים פרטיים תיפתח בהמשך השנה. בינתיים — סוחרים יכולים להצטרף ולבנות נוכחות
              לפני ההשקה.
            </p>
          </div>
        </section>

        {/* =================================================================
            WHY / FEATURES — 3 numbered editorial cards (א/ב/ג).
            ================================================================= */}
        <section
          id="why"
          aria-labelledby="why-heading"
          className="bg-brand-navy text-brand-cream relative"
        >
          {/* Bottom-end gold corner accent */}
          <div
            aria-hidden="true"
            className="bg-brand-gold pointer-events-none absolute bottom-0 start-0 h-1.5 w-24 sm:w-40"
          />

          <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <p className="text-brand-gold flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              למה AutoTradeIL
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
            </p>
            <h2
              id="why-heading"
              className="mx-auto mt-5 max-w-3xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
            >
              לא עוד לוח מודעות. תשתית מסחר.
            </h2>

            <ul className="bg-brand-cream/10 mt-12 grid gap-px sm:grid-cols-3 sm:overflow-hidden sm:rounded-xl">
              {features.map((f) => (
                <li key={f.title} className="bg-brand-navy group relative p-6 sm:p-8">
                  <span
                    aria-hidden="true"
                    className="text-brand-gold/80 font-serif text-5xl font-bold leading-none"
                  >
                    {f.mark}
                  </span>
                  <h3 className="text-brand-cream mt-5 font-serif text-xl font-bold sm:text-2xl">
                    {f.title}
                  </h3>
                  <p className="text-brand-cream/80 mt-3 text-sm leading-relaxed sm:text-base">
                    {f.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* =================================================================
            TRUST — three pillars on cream.
            ================================================================= */}
        <section id="trust" aria-labelledby="trust-heading" className="relative">
          <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <p className="text-brand-navy/70 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              אמון לפני הכול
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
            </p>
            <h2
              id="trust-heading"
              className="text-brand-navy mx-auto mt-5 max-w-3xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
            >
              שלוש שכבות הגנה על כל עסקה.
            </h2>
            <p className="text-brand-ink/70 mx-auto mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">
              בנינו את AutoTradeIL מתוך הנחה שכל סוחר חדש זקוק להוכיח את עצמו — ושכל רוכש זקוק לכלים
              כדי לוודא שהוא מתעסק עם מי שאמור.
            </p>

            <ul className="mt-12 grid gap-6 text-start sm:grid-cols-3">
              {trust.map((t, i) => (
                <li
                  key={t.label}
                  className="border-brand-navy/15 hover:border-brand-navy/30 group relative rounded-lg border bg-white p-6 transition-colors sm:p-7"
                >
                  <span
                    aria-hidden="true"
                    className="text-brand-navy/30 group-hover:text-brand-gold absolute end-5 top-5 font-serif text-2xl font-bold leading-none transition-colors"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-brand-navy font-serif text-xl font-bold sm:text-2xl">
                    {t.label}
                  </h3>
                  <p className="text-brand-ink/75 mt-3 text-sm leading-relaxed sm:text-base">
                    {t.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* =================================================================
            FINAL CTA — quiet but confident. Repeats the dealer signup.
            ================================================================= */}
        <section aria-labelledby="cta-heading" className="relative">
          <div className="mx-auto max-w-5xl px-4 pb-20 pt-4 sm:px-6 sm:pb-24">
            <div className="border-brand-navy/15 from-brand-cream to-brand-cream/40 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 sm:p-12 lg:p-16">
              <div
                aria-hidden="true"
                className="bg-brand-gold absolute start-0 top-0 h-1.5 w-32 sm:w-48"
              />
              <div className="text-center lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-12 lg:text-start">
                <div>
                  <h2
                    id="cta-heading"
                    className="text-brand-navy font-serif text-[1.75rem] font-bold leading-tight sm:text-4xl lg:text-5xl"
                  >
                    מוכן להתחיל לסחור באופן מקצועי?
                  </h2>
                  <p className="text-brand-ink/75 mx-auto mt-5 max-w-xl text-base leading-relaxed sm:text-lg lg:mx-0">
                    הצטרף לסוחרים שכבר משתמשים ב-AutoTradeIL לניהול מלאי, הצעות, ועסקאות. הקמת חשבון
                    לוקחת פחות מ-10 דקות.
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

      {/* ===================================================================
          FOOTER — dark navy, structured nav, copyright.
          =================================================================== */}
      <footer className="bg-brand-navy text-brand-cream relative">
        <div
          aria-hidden="true"
          className="bg-brand-gold pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
        />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              {/* Footer uses the WHITE-recolored variant so the navy + bronze
                  brand glyphs become cream and read clearly on the navy bg. */}
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
                    href="#why"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    יתרונות
                  </a>
                </li>
                <li>
                  <a
                    href="#trust"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    אמון ובטחון
                  </a>
                </li>
                <li>
                  <a
                    href="#consumer"
                    className="text-brand-cream/85 hover:text-brand-cream focus-visible:outline-brand-gold inline-flex min-h-11 items-center rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    לקונה הפרטי
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
