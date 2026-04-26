/**
 * Sentry — Edge-runtime (Next.js middleware) initialization.
 *
 * Our middleware.ts runs on the Edge runtime; needs its own Sentry
 * init since it can't share node modules with the server runtime.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
