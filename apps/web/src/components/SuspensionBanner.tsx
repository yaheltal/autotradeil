"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

/**
 * SuspensionBanner — Phase 6.7. Shown at the top of dealer pages when a
 * dealer is suspended with a visible reason (suspension_silent=false).
 *
 * Silent suspensions intentionally don't render this banner — the dealer
 * just sees generic 503 errors when they try to act.
 *
 * A11y: role="alert" surfaces the suspension to screen readers on mount;
 * sticky banner so the message stays visible even when scrolling.
 */

type DealerMe = {
  suspended_at: string | null;
  suspended_reason: string | null;
  suspension_silent?: boolean;
};

export function SuspensionBanner({ token }: { token: string | null }) {
  const [info, setInfo] = useState<DealerMe | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<DealerMe>("/api/v1/dealers/me", { token })
      .then((d) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {
        // /dealers/me returns 403 with the suspension reason in detail
        // when the dealer is suspended with a reason. The banner only
        // renders for verified-and-suspended dealers, so a fetch failure
        // means we silently skip the banner — the page itself will show
        // an error elsewhere.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!info || !info.suspended_at) return null;
  // Silent suspends do NOT show a banner — that's the whole point.
  if (info.suspension_silent) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-30 border-b-2 border-amber-700 bg-amber-50 text-amber-900"
    >
      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
        <p className="text-sm font-semibold">
          <span aria-hidden="true">⚠️ </span>
          החשבון שלך הושעה
          {info.suspended_reason ? ` — סיבה: ${info.suspended_reason}` : ""}
        </p>
        <p className="mt-1 text-xs">
          לא תוכל לבצע פעולות במערכת בזמן שהחשבון מושעה. לבירור או ערעור — צור קשר עם התמיכה.
        </p>
      </div>
    </div>
  );
}
