"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "connected" | "disconnected";

/**
 * ApiStatus — tiny live badge indicating whether the backend /health
 * endpoint (and its DB connection) is reachable.
 *
 * Accessibility review: approved with 2 fixes (applied):
 *   - badge uses ring + /70 opacity for ≥3:1 shape contrast (SC 1.4.11)
 *   - component is a sibling of <nav>, not inside it (landmark cleanliness)
 *
 * The coloured dot is aria-hidden — meaning is carried by text alone
 * (SC 1.4.1 not color-only).
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
        const res = await fetch(`${apiUrl}/health`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { database_connected?: boolean };
        if (cancelled) return;
        setStatus(data.database_connected === true ? "connected" : "disconnected");
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    };

    void check();
    const id = setInterval(() => void check(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const label =
    status === "loading" ? "בודק חיבור ל-API…" : status === "connected" ? "API מחובר" : "API מנותק";

  const tone =
    status === "connected"
      ? "bg-green-100 text-green-900 ring-1 ring-green-600/30 dark:bg-green-900/70 dark:text-green-100 dark:ring-green-400/40"
      : status === "disconnected"
        ? "bg-red-100 text-red-900 ring-1 ring-red-600/30 dark:bg-red-900/70 dark:text-red-100 dark:ring-red-400/40"
        : "bg-slate-100 text-slate-900 ring-1 ring-slate-400/40 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-500/40";

  const dot =
    status === "connected"
      ? "bg-green-600 dark:bg-green-400"
      : status === "disconnected"
        ? "bg-red-600 dark:bg-red-400"
        : "bg-slate-400 animate-pulse";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${tone}`}
    >
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}
