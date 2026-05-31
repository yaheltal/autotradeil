/*
 * Number formatting helpers for dealer-facing UI.
 *
 * Return `{ visual, sr }` so callers can render the visual string
 * (with thousand separators for scanning) while providing a clean
 * SR-only override for Hebrew screen readers. If testing confirms
 * that NVDA + eSpeak-NG and VoiceOver he-IL handle "123,456"
 * correctly, the `sr` override can be dropped later without any
 * call-site change.
 */

export type Formatted = { visual: string; sr: string };

const heIL = new Intl.NumberFormat("he-IL");

export function formatPrice(value: number): Formatted {
  return {
    visual: `₪ ${heIL.format(value)}`,
    sr: `מחיר ${value} שקלים`,
  };
}

export function formatMileage(value: number): Formatted {
  return {
    visual: `${heIL.format(value)} ק"מ`,
    sr: `קילומטראז' ${value} קילומטר`,
  };
}

/**
 * Hebrew calendar-date formatter pinned to Asia/Jerusalem.
 *
 * Why the pin: server-rendered HTML uses the host process timezone
 * (Render runs in UTC), the browser uses the user's local zone
 * (overwhelmingly Asia/Jerusalem for this product). Calling
 * `new Date(iso).toLocaleDateString("he-IL")` on each side produces
 * different output and Next.js raises a hydration mismatch. The
 * pinned formatter below is identical on both sides — server HTML
 * and the first client render agree, hydration is clean.
 *
 * Both helpers accept an ISO string OR a Date; pass null/undefined
 * for a "—" placeholder (mirrors what most call sites already
 * compute by hand).
 */
const dateHE = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeHE = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dateLongHE = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatDateHe(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateHE.format(d);
}

export function formatDateTimeHe(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeHE.format(d);
}

export function formatDateLongHe(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateLongHE.format(d);
}

/**
 * "לפני X דקות" / "לפני שעה" / "לפני 3 ימים" style Hebrew time-ago.
 * Precise enough for a notification feed. Input is ISO 8601; we also
 * return the ISO value so callers can render `<time datetime=...>`.
 *
 * Uses Date.now() at call time, so callers MUST gate this behind a
 * post-mount effect — calling it directly in a render body that
 * also renders on the server causes a hydration mismatch (the
 * server's clock and the client's clock disagree by at least one
 * network round-trip). The notification panel already gates this
 * by being a click-to-open Headless UI menu (children only render
 * after the user interacts).
 */
export function formatRelativeTime(iso: string): { visual: string; iso: string } {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return { visual: "", iso };
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 45) return { visual: "לפני רגע", iso };
  if (min < 2) return { visual: "לפני דקה", iso };
  if (min < 60) return { visual: `לפני ${min} דקות`, iso };
  if (hr < 2) return { visual: "לפני שעה", iso };
  if (hr < 24) return { visual: `לפני ${hr} שעות`, iso };
  if (day < 2) return { visual: "אתמול", iso };
  if (day < 30) return { visual: `לפני ${day} ימים`, iso };
  const months = Math.floor(day / 30);
  if (months < 12) return { visual: `לפני ${months} חודשים`, iso };
  const years = Math.floor(day / 365);
  return { visual: `לפני ${years} שנים`, iso };
}
