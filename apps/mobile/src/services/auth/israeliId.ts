/**
 * Israeli teudat-zehut checksum (Luhn-like).
 *
 * Mirror of `apps/api/app/core/israeli_id.py`. Both sides validate the
 * 9-digit ID — client-side rejects bad checksums BEFORE we burn an SMS
 * send on the rate-limit budget; server-side is the source of truth.
 */

export function isValidIsraeliId(id: string | null | undefined): boolean {
  if (!id || id.length !== 9 || !/^\d{9}$/.test(id)) return false;
  let total = 0;
  for (let i = 0; i < 9; i++) {
    let step = Number(id[i]) * ((i % 2) + 1);
    if (step > 9) step -= 9;
    total += step;
  }
  return total % 10 === 0;
}
