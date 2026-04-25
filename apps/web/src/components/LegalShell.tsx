import type { ReactNode } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * Shared shell for legal/static pages (תנאי שימוש, פרטיות, יצירת קשר).
 * Provides the standard header/footer chrome plus a centered prose
 * container with consistent typography for headings, paragraphs, and
 * lists in Hebrew RTL.
 *
 * Use `<LegalShell title="..." updatedAt="...">{children}</LegalShell>`
 * — children should be a sequence of <section> blocks containing <h2>
 * + <p> / <ul>. The shell handles spacing and color tokens.
 */
export function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-3xl px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-20">
          <header>
            <p className="text-brand-navy/70 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
              <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
              מסמך משפטי
            </p>
            <h1 className="text-brand-navy mt-5 font-serif text-[2rem] font-bold leading-[1.15] tracking-tight sm:text-5xl">
              {title}
            </h1>
            {updatedAt ? (
              <p className="text-brand-ink/65 mt-3 text-sm">עודכן לאחרונה: {updatedAt}</p>
            ) : null}
          </header>

          {/*
           * Prose-style content. We don't use @tailwindcss/typography
           * (not installed) — instead we apply targeted descendant
           * selectors so the page reads cleanly with our brand tokens.
           */}
          <article className="text-brand-ink [&_h2]:text-brand-navy [&_h3]:text-brand-navy [&_p]:text-brand-ink/85 [&_a]:text-brand-navy [&_a]:decoration-brand-gold [&_strong]:text-brand-navy [&_ul]:text-brand-ink/85 [&_ol]:text-brand-ink/85 mt-10 space-y-8 text-base leading-relaxed [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-4 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:sm:text-3xl [&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-bold [&_h3]:tracking-tight [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pe-6 [&_section]:space-y-3 [&_strong]:font-bold [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pe-6">
            {children}
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
