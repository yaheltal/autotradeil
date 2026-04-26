"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/*
 * BackLink — uniform "go back" affordance for inner dashboard / admin
 * pages. Renders a button when no `href` is provided (uses
 * router.back()) or a <Link> otherwise so deep-linked / refreshed
 * pages always have a meaningful target.
 *
 * A11y:
 *   - aria-label combines "חזרה" with the optional `label` so screen
 *     readers always announce destination ("חזרה לרשימת הסוחרים")
 *     not just "חזרה".
 *   - 44×44 minimum tap target (min-h-11) per WCAG 2.5.5.
 *   - Arrow glyph aria-hidden to avoid double-announcement.
 *   - focus-visible ring matches the rest of the brand.
 */
export function BackLink({ href, label = "חזרה" }: { href?: string; label?: string }) {
  const router = useRouter();

  const className =
    "text-brand-navy focus-visible:outline-brand-navy hover:bg-brand-navy/5 inline-flex min-h-11 items-center gap-1 rounded-md px-2 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";

  const content = (
    <>
      <span aria-hidden="true">→</span>
      <span>{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.back()} aria-label={label} className={className}>
      {content}
    </button>
  );
}
