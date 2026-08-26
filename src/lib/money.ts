/**
 * Money.
 *
 * Stored as Decimal(14,2) in Postgres; carried through the app as a plain
 * `number` of major units (rupees, not paise). Wedding-scale figures sit far
 * below 2^53, so double precision is exact for 2dp arithmetic here — but every
 * conversion funnels through `toNumber`/`round2` so rounding stays in one place.
 */

export type CurrencyCode = "GBP" | "USD" | "SGD" | "EUR" | "INR" | "THB";

export const CURRENCIES: Record<
  CurrencyCode,
  { code: CurrencyCode; symbol: string; name: string; locale: string; decimals: number }
> = {
  GBP: { code: "GBP", symbol: "£", name: "Pound Sterling", locale: "en-GB", decimals: 2 },
  USD: { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", decimals: 2 },
  SGD: { code: "SGD", symbol: "S$", name: "Singapore Dollar", locale: "en-SG", decimals: 2 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", locale: "en-IE", decimals: 2 },
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN", decimals: 2 },
  THB: { code: "THB", symbol: "฿", name: "Thai Baht", locale: "th-TH", decimals: 2 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

export function currencySymbol(code: string): string {
  return CURRENCIES[code as CurrencyCode]?.symbol ?? code;
}

/** Prisma Decimal | number | string | null -> number. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && "toString" in (value as object)) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Same as `toNumber` but preserves "not set" so optional stages stay optional. */
export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Full precision: "₹15,48,000" (Indian grouping for INR, locale grouping else).
 * Decimals are dropped unless the amount actually has them — wedding budgets
 * are read in lakhs, not paise.
 */
export function formatMoney(
  amount: number,
  code: string = "INR",
  options: { decimals?: boolean; signed?: boolean } = {},
): string {
  const meta = CURRENCIES[code as CurrencyCode];
  const symbol = meta?.symbol ?? `${code} `;
  const locale = meta?.locale ?? "en-IN";
  const value = round2(amount);
  const showDecimals = options.decimals ?? (meta?.decimals !== 0 && value % 1 !== 0);
  const body = Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });
  const sign = value < 0 ? "−" : options.signed && value > 0 ? "+" : "";
  return `${sign}${symbol}${body}`;
}

/**
 * Compact: "₹15.48M", "₹850K", "₹4,200".
 * Used on dashboard cards where the shape of the number matters more than the
 * exact paise. Hovering always reveals the precise figure.
 */
export function formatCompactMoney(
  amount: number,
  code: string = "INR",
  options: { signed?: boolean } = {},
): string {
  const symbol = currencySymbol(code);
  const value = round2(amount);
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : options.signed && value > 0 ? "+" : "";

  let body: string;
  if (abs >= 1_000_000) body = `${trimZeros(abs / 1_000_000)}M`;
  else if (abs >= 1_000) body = `${trimZeros(abs / 1_000)}K`;
  else body = String(Math.round(abs));

  return `${sign}${symbol}${body}`;
}

function trimZeros(value: number): string {
  const fixed = value >= 100 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2);
  // Only strip zeros *after a decimal point* — "100" must not become "1".
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** "1.2 lakh" / "1.55 crore" — how Indian families actually discuss money. */
export function formatIndianScale(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return `${trimZeros(abs / 10_000_000)} crore`;
  if (abs >= 100_000) return `${trimZeros(abs / 100_000)} lakh`;
  return abs.toLocaleString("en-IN");
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/** Guarded division — variance percentages against a zero allocation. */
export function safeRatio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}
