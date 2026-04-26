"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/*
 * WatermarkOverlay — diagonal repeating "business_name · email" text
 * tiled across the viewport at very low opacity.
 *
 * Why: discourage screenshot leaks of inventory / KYC docs / offers
 * from logged-in dealers + admins. The overlay isn't a security
 * boundary (any motivated leaker can crop), but it adds friction and
 * makes the source identifiable.
 *
 * A11y:
 *   - aria-hidden=true: it's a decorative anti-leak signal, not
 *     content. Screen readers must skip it entirely.
 *   - pointer-events:none + position:fixed: never intercepts clicks,
 *     focus, or selection. Cannot trap a keyboard user.
 *   - z-index sits above everything but below interactive UI focus
 *     because we render it BEFORE focus is captured. With pointer
 *     events disabled, no focus ring is hidden behind it.
 *   - Motion-reduce safe: the pattern is static — no animation.
 *
 * Mount only when authenticated (caller decides). The overlay
 * silently renders nothing until identity resolves so logged-out
 * detours (e.g. after sign-out) don't flash a stale watermark.
 */

type WhoAmI = {
  email: string;
  user_type: "consumer" | "dealer" | "admin";
};

type DealerMe = {
  business_name: string | null;
};

export function WatermarkOverlay() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const who = await apiFetch<WhoAmI>("/api/v1/auth/whoami", {
          token: session.access_token,
        });
        if (cancelled) return;

        let line = who.email;
        if (who.user_type === "dealer") {
          try {
            const me = await apiFetch<DealerMe>("/api/v1/dealers/me", {
              token: session.access_token,
            });
            if (me.business_name) {
              line = `${me.business_name} · ${who.email}`;
            }
          } catch {
            // Dealer row might not exist yet (signup pending) — fall
            // back to email only. Watermark still serves its purpose.
          }
        } else if (who.user_type === "admin") {
          line = `Admin · ${who.email}`;
        }

        if (!cancelled) setLabel(line);
      } catch {
        // Silent — watermark is best-effort. Auth failures bubble up
        // through the page's own auth hook.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!label) return null;

  // Build one tile-row of the label. Repeating it 6× gives enough
  // horizontal coverage on ultrawide monitors. The whole row is
  // wrapped in a <div> tilted -22deg and tiled vertically with
  // CSS gap so it scales to any viewport without media queries.
  const cell = `${label}\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0`;
  const row = cell.repeat(6);

  return (
    <div
      aria-hidden="true"
      data-testid="watermark-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
        userSelect: "none",
        overflow: "hidden",
        // Center the tilted plane so it fully covers the viewport
        // even after rotation crops the corners.
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          insetInlineStart: "50%",
          transform: "translate(-50%, -50%) rotate(-22deg)",
          // Force LTR so the email + bullet glyphs always render in a
          // predictable order — we want a uniform diagonal tile, not
          // RTL/LTR text shaping that varies per locale.
          direction: "ltr",
          width: "200vmax",
          height: "200vmax",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "5.5rem",
          opacity: 0.06,
          color: "#1B2B4B",
          fontWeight: 700,
          fontSize: "1.05rem",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-heebo), -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            style={{ transform: i % 2 === 0 ? "translateX(-3rem)" : "translateX(3rem)" }}
          >
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}
