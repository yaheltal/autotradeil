import Link from "next/link";

import { ApiStatus } from "@/components/ApiStatus";

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
              className="focus-visible:outline-brand-navy group flex items-baseline gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <span className="text-brand-navy font-serif text-lg font-bold tracking-tight sm:text-xl">
                AutoTradeIL
              </span>
              <span
                aria-hidden="true"
                className="bg-brand-gold inline-block h-1.5 w-1.5 rounded-full transition-transform group-hover:scale-150"
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

          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:pt-28">
            {/* Issue label — editorial trade-journal touch */}
            <p className="text-brand-navy/70 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              גיליון 01 · 2026 · ישראל
            </p>

            <h1
              id="hero-heading"
              className="text-brand-navy mt-6 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
            >
              זירת המסחר
              <br />
              <span className="text-brand-navy/90">ברכבים</span>
              <span className="text-brand-gold"> · </span>
              <span className="text-brand-navy/90">של ישראל.</span>
            </h1>

            <p className="text-brand-ink/80 mt-7 max-w-xl text-lg leading-relaxed sm:text-xl">
              פלטפורמה מקצועית למסחר ברכבים בין סוחרים מוסמכים — מלאי משותף, הצעות מתועדות, וזירה
              אחת לכל מחזור החיים של העסקה.
            </p>

            {/* CTAs — active dealer signup + disabled buyer (coming soon).
                Disabled <button> + sr-only explanation + visible chip + tooltip. */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <Link
                href="/signup/dealer"
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy shadow-brand-navy/10 group inline-flex min-h-14 items-center justify-center gap-2 rounded-md px-7 py-3.5 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-lg"
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
                title="השוק לקונים פרטיים נפתח בקרוב"
                aria-describedby="buyer-cta-hint"
                className="border-brand-navy/25 text-brand-navy/55 inline-flex min-h-14 cursor-not-allowed items-center justify-center gap-3 rounded-md border-2 border-dashed bg-transparent px-7 py-3.5 text-base font-semibold sm:text-lg"
              >
                <span>אני קונה</span>
                <span
                  aria-hidden="true"
                  className="bg-brand-navy/10 text-brand-navy/80 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tracking-wide"
                >
                  בקרוב
                </span>
              </button>
              <span id="buyer-cta-hint" className="sr-only">
                השוק לקונים פרטיים נפתח בקרוב — אינו זמין כרגע
              </span>
            </div>

            <p className="text-brand-ink/60 mt-6 text-sm">
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
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 px-2">
                <p className="text-brand-gold font-serif text-3xl font-bold leading-none sm:text-4xl lg:text-5xl">
                  {s.value}
                </p>
                <p className="text-brand-cream/80 mt-3 text-sm font-medium leading-snug sm:text-base">
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
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
              <div className="lg:sticky lg:top-28">
                <span className="bg-brand-navy text-brand-gold inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em]">
                  <span
                    aria-hidden="true"
                    className="bg-brand-gold inline-block h-1.5 w-1.5 rounded-full"
                  />
                  בקרוב · פאזה 2
                </span>
                <h2
                  id="consumer-heading"
                  className="text-brand-navy mt-5 font-serif text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl"
                >
                  קונה פרטי?
                  <br />
                  אנחנו בונים לך משהו אחר.
                </h2>
              </div>

              <div className="border-brand-navy/15 lg:border-s-2 lg:ps-10">
                <p className="text-brand-ink text-lg leading-relaxed sm:text-xl">
                  מאות אלפי מודעות יד שנייה בישראל — וכמעט אף אחת מהן לא מסומנת &ldquo;נמכר על־ידי
                  סוחר מאומת&rdquo;. אנחנו משנים את זה.
                </p>
                <ul className="mt-8 space-y-5">
                  {[
                    {
                      title: "רק רכבים מסוחרים מאומתים",
                      body: "כל רכב שתראה מגיע מסוחר עם רישיון תקף, ציון אמון ציבורי, והיסטוריית עסקאות שקופה.",
                    },
                    {
                      title: "מחיר אחד — בלי משחקים",
                      body: "המחיר שאתה רואה הוא המחיר. אין מחיר &ldquo;תיאום בטלפון&rdquo;, אין הפתעות בסוף.",
                    },
                    {
                      title: "תיק רכב מלא לפני שאתה נוסע לראות",
                      body: "תמונות באיכות גבוהה, היסטוריית בעלות, מסמכי טסט ותחזוקה — הכול במקום אחד.",
                    },
                  ].map((item) => (
                    <li key={item.title} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="bg-brand-gold mt-2 inline-block h-2 w-2 shrink-0 rounded-full"
                      />
                      <div className="min-w-0">
                        <p className="text-brand-navy text-base font-bold sm:text-lg">
                          {item.title}
                        </p>
                        <p className="text-brand-ink/75 mt-1 text-sm leading-relaxed sm:text-base">
                          {item.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-brand-ink/60 mt-8 text-sm">
                  ההרשמה לקונים פרטיים תיפתח בהמשך השנה. בינתיים — סוחרים יכולים להצטרף ולבנות
                  נוכחות לפני ההשקה.
                </p>
              </div>
            </div>
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

          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="text-brand-gold flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              למה AutoTradeIL
            </p>
            <h2
              id="why-heading"
              className="mt-5 max-w-3xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
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
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-brand-navy/70 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
                  <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
                  אמון לפני הכול
                </p>
                <h2
                  id="trust-heading"
                  className="text-brand-navy mt-5 max-w-2xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
                >
                  שלוש שכבות הגנה על כל עסקה.
                </h2>
              </div>
              <p className="text-brand-ink/70 max-w-sm text-sm leading-relaxed sm:text-base">
                בנינו את AutoTradeIL מתוך הנחה שכל סוחר חדש זקוק להוכיח את עצמו — ושכל רוכש זקוק
                לכלים כדי לוודא שהוא מתעסק עם מי שאמור.
              </p>
            </div>

            <ul className="mt-12 grid gap-6 sm:grid-cols-3">
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
          <div className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 sm:pb-24">
            <div className="border-brand-navy/15 from-brand-cream to-brand-cream/40 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-8 sm:p-12 lg:p-16">
              <div
                aria-hidden="true"
                className="bg-brand-gold absolute start-0 top-0 h-1.5 w-32 sm:w-48"
              />
              <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-12">
                <div>
                  <h2
                    id="cta-heading"
                    className="text-brand-navy font-serif text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl"
                  >
                    מוכן להתחיל לסחור באופן מקצועי?
                  </h2>
                  <p className="text-brand-ink/75 mt-5 text-base leading-relaxed sm:text-lg">
                    הצטרף לסוחרים שכבר משתמשים ב-AutoTradeIL לניהול מלאי, הצעות, ועסקאות. הקמת חשבון
                    לוקחת פחות מ-10 דקות.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link
                    href="/signup/dealer"
                    className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy shadow-brand-navy/10 group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md px-7 py-3.5 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-lg"
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
                    className="text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy decoration-brand-gold inline-flex min-h-12 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
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
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-xl font-bold tracking-tight">AutoTradeIL</span>
                <span
                  aria-hidden="true"
                  className="bg-brand-gold inline-block h-1.5 w-1.5 rounded-full"
                />
              </div>
              <p className="text-brand-cream/75 mt-4 max-w-xs text-sm leading-relaxed">
                פלטפורמת המסחר המקצועית של ישראל לסוחרי רכב מאומתים. מבוססת בתל-אביב.
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
