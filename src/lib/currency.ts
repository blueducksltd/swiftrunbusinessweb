/**
 * Formats a monetary amount using the browser's Intl.NumberFormat.
 * Passing the ISO currency code (e.g. "GBP", "NGN", "EUR") produces
 * the correct symbol automatically — no hardcoded lookup tables needed.
 *
 * If currency is missing/empty, falls back to plain number formatting.
 */
export function fmtCurrency(amount: number, currency: string | null | undefined): string {
  if (!currency) return amount.toLocaleString();
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  }
}

/** Compact formatter: 1 500 000 → "£1.5M", 3 200 → "£3.2k", etc. */
export function fmtCurrencyCompact(amount: number, currency: string | null | undefined): string {
  if (!currency) {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
    return amount.toLocaleString();
  }
  try {
    if (amount >= 1_000_000) {
      const sym = new Intl.NumberFormat("en", { style: "currency", currency, maximumSignificantDigits: 1 })
        .formatToParts(amount)
        .find((p) => p.type === "currency")?.value ?? currency.toUpperCase();
      return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
    }
    if (amount >= 1_000) {
      const sym = new Intl.NumberFormat("en", { style: "currency", currency, maximumSignificantDigits: 1 })
        .formatToParts(amount)
        .find((p) => p.type === "currency")?.value ?? currency.toUpperCase();
      return `${sym}${(amount / 1_000).toFixed(0)}k`;
    }
    return fmtCurrency(amount, currency);
  } catch {
    return fmtCurrency(amount, currency);
  }
}
