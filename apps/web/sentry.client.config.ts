/**
 * Sentry — browser-side initialization.
 *
 * Loads automatically via @sentry/nextjs. Empty DSN → no-op (zero
 * runtime cost, no network calls). The DSN is intentionally exposed
 * to the browser via NEXT_PUBLIC_* — Sentry's client DSN is a
 * write-only ingestion endpoint, not a secret.
 *
 * Sample rates: conservative defaults for free-tier quota. Crank up
 * tracesSampleRate when investigating a perf regression.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Replay is opt-in via env var since it captures DOM and is
    // privacy-sensitive. Off by default; enable per-project later.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Strip JWT bearer tokens out of breadcrumbs. The Authorization
    // header should never reach Sentry — even if intercepted by a
    // breach, a leaked DSN already only allows ingestion.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "fetch" && breadcrumb.data?.url) {
        // Mask any ?token= query param value
        breadcrumb.data.url = String(breadcrumb.data.url).replace(
          /([?&]token=)[^&]+/g,
          "$1[REDACTED]",
        );
      }
      return breadcrumb;
    },
  });
}
