/**
 * Next.js instrumentation hook (App Router) — required by
 * @sentry/nextjs ≥ 8 to load the runtime-specific Sentry config
 * exactly once at server boot.
 *
 * Empty DSN at config load time → both inits become no-ops.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Re-export the captureRequestError hook from @sentry/nextjs so
// errors thrown during React-Server-Component renders surface to
// Sentry with the request context attached.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
