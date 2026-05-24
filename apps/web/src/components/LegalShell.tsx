import type { ReactNode } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * Shared shell for legal/static pages (תנאי שימוש, פרטיות).
 *
 *   {title}                                      ← Frank Ruhl 4xl
 *   ─────                                         ← hairline
 *   עודכן לאחרונה: {date}                          ← muted dek (font-tabular)
 *
 *   <article> — prose with descendant selectors that map every
 *   heading / paragraph / link / list element to ink/paper/muted/accent
 *   tokens. No @tailwindcss/typography dependency; the rules sit
 *   inline so the legal pages stay one self-contained component.
 *
 * Same masthead rhythm as the dashboard/admin editorial pattern.
 * The previous "מסמך משפטי" eyebrow + gold-stroke decoration is
 * dropped — the page title speaks for itself; the dek tells you
 * when it was updated.
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
        <div className="px-md sm:px-lg pb-3xl pt-2xl sm:pt-3xl mx-auto max-w-3xl">
          <header>
            <h1 className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight sm:text-5xl">
              {title}
            </h1>
            <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
            {updatedAt ? (
              <p className="text-muted mt-lg text-sm">
                עודכן לאחרונה: <span className="font-tabular">{updatedAt}</span>
              </p>
            ) : null}
          </header>

          {/*
           * Prose-style content. No @tailwindcss/typography (not
           * installed) — targeted descendant selectors keep the legal
           * pages reading cleanly with our locked tokens. The a-tag
           * rule pairs ink text with an accent underline so the link
           * affordance lives in the decoration, not in a color shift.
           */}
          <article className="text-ink mt-2xl space-y-2xl [&_a]:text-ink [&_a]:decoration-accent [&_a]:duration-fast [&_a:hover]:text-accent [&_h2]:text-ink [&_h3]:text-ink [&_ol]:text-muted [&_p]:text-muted [&_strong]:text-ink [&_ul]:text-muted text-base leading-relaxed [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-4 [&_a]:transition-colors [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:sm:text-3xl [&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-medium [&_h3]:tracking-tight [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pe-6 [&_section]:space-y-3 [&_strong]:font-medium [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pe-6">
            {children}
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
