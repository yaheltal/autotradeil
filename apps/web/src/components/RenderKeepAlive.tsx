"use client";

import { useEffect } from "react";

/**
 * RenderKeepAlive — fire-and-forget ping to the Render API on mount.
 *
 * Render's free + starter plans spin the FastAPI worker down after
 * ~15 minutes of idle. The first request after idle pays a 20-30s
 * cold-start. If even one user visits the public landing page, this
 * ping warms the API so the next user (or the same one logging in)
 * doesn't see the cold start.
 *
 * Cost: 1 HEAD-equivalent GET per landing-page view.
 * Caveat: only effective if the landing page gets traffic at least
 * every 15 minutes. For zero-traffic projects the GitHub Actions
 * cron at /tmp/keepalive.yml.draft is the proper solution.
 *
 * Failure is silent — we never want a network blip on the marketing
 * site to surface as a UX problem. `keepalive: true` lets the
 * request finish even if the user navigates away mid-ping.
 */
export function RenderKeepAlive() {
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return;
    // Try the explicit healthz first, fall back to /api/v1/health if
    // routing differs. Both should respond in <50ms when warm.
    void fetch(`${apiUrl}/healthz`, {
      method: "GET",
      keepalive: true,
      cache: "no-store",
    }).catch(() => {
      void fetch(`${apiUrl}/api/v1/health`, {
        method: "GET",
        keepalive: true,
        cache: "no-store",
      }).catch(() => {
        /* silent */
      });
    });
  }, []);

  return null;
}
