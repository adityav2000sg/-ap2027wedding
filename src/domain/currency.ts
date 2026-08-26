/**
 * Currency conversion.
 *
 * Rates are per-wedding and dated. We always pick the most recent rate that is
 * effective on or before the reference date, so a payment logged in March keeps
 * March's rate even after someone updates the rate in June.
 */

import { round2 } from "@/lib/money";
import type { RateNode } from "./types";

export interface Converter {
  base: string;
  /** Convert an amount in `currency` into the wedding's base currency. */
  toBase(amount: number, currency: string, on?: Date): number;
  /** The rate used for currency -> base, or null if none is configured. */
  rateFor(currency: string, on?: Date): number | null;
  /** True when a foreign amount had no rate and was passed through unconverted. */
  missing: string[];
}

export function buildConverter(
  rates: RateNode[],
  base: string,
  referenceDate: Date = new Date(),
): Converter {
  const missing = new Set<string>();

  function rateFor(currency: string, on: Date = referenceDate): number | null {
    if (currency === base) return 1;

    const direct = pickRate(rates, currency, base, on);
    if (direct !== null) return direct;

    // A GBP->INR rate also answers "what is INR worth in GBP?".
    const inverse = pickRate(rates, base, currency, on);
    if (inverse !== null && inverse !== 0) return 1 / inverse;

    return null;
  }

  return {
    base,
    rateFor,
    toBase(amount, currency, on) {
      const rate = rateFor(currency, on);
      if (rate === null) {
        missing.add(currency);
        // Passing the raw number through is wrong, but silently zeroing it is
        // worse — the UI surfaces `missing` so the gap is visible, not hidden.
        return amount;
      }
      return round2(amount * rate);
    },
    get missing() {
      return [...missing];
    },
  };
}

function pickRate(
  rates: RateNode[],
  from: string,
  to: string,
  on: Date,
): number | null {
  const cutoff = on.getTime();
  let best: RateNode | null = null;
  for (const rate of rates) {
    if (rate.fromCurrency !== from || rate.toCurrency !== to) continue;
    if (new Date(rate.effectiveDate).getTime() > cutoff) continue;
    if (!best || new Date(rate.effectiveDate) > new Date(best.effectiveDate)) {
      best = rate;
    }
  }
  return best ? best.rate : null;
}
