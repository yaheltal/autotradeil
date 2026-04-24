import Link from "next/link";

/**
 * Wordmark for page headers. Navy letters + gold accent dot.
 * The gold dot is aria-hidden — the wordmark text alone carries meaning
 * (not color-only), satisfying WCAG 1.4.1.
 */
export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="AutoTradeIL — דף הבית"
      className="text-brand-navy focus-visible:outline-brand-navy inline-flex items-center gap-2 rounded-sm text-2xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <span>AutoTradeIL</span>
      <span aria-hidden="true" className="bg-brand-gold inline-block h-2 w-2 rounded-full" />
    </Link>
  );
}
