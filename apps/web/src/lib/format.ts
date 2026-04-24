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
 * "לפני X דקות" / "לפני שעה" / "לפני 3 ימים" style Hebrew time-ago.
 * Precise enough for a notification feed. Input is ISO 8601; we also
 * return the ISO value so callers can render `<time datetime=...>`.
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
