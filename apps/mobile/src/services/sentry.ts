import * as Sentry from "@sentry/react-native";

import { SENTRY_DSN } from "./config";

let initialized = false;

export function initSentry() {
  if (initialized || !SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    attachStacktrace: true,
  });
  initialized = true;
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (initialized) {
    Sentry.captureException(error, { extra: context });
  } else if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn("[error]", error, context);
  }
}
