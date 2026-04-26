/**
 * Sentry — Node-runtime (Next.js server) initialization.
 *
 * Captures errors thrown inside server components, route handlers,
 * and middleware. Reads the SAME public DSN as the browser (Sentry
 * routes incoming events by DSN regardless of source).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    // PII off by default — request bodies might carry KYC photo bytes.
    sendDefaultPii: false,
  });
}
