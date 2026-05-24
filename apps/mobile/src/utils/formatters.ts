export function formatILS(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatKm(km: number): string {
  return `${km.toLocaleString("he-IL")} ק"מ`;
}

export function shortName(business: string): string {
  return business.length > 18 ? `${business.slice(0, 17)}…` : business;
}
