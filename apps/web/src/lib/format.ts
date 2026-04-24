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
