/**
 * Pure helpers for valuing gold holdings at the current market rate.
 *
 * Gold is quoted internationally in USD per troy ounce. To value an Indian
 * family's holding we convert that to INR per gram, then scale by the holding's
 * weight and purity (fineness). All functions are framework- and I/O-free so
 * they can be unit-tested; the live USD/oz and USD→INR inputs are fetched
 * elsewhere (see {@link ../state/useGoldRate}).
 */
import { GOLD_PURITY_FINENESS, type GoldPurity } from './types';

/** Grams in one troy ounce (the unit gold is quoted in). */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

/** A resolved gold rate snapshot used to value holdings. */
export interface GoldRate {
  /** Pure (24k) gold price in INR per gram. */
  inrPerGram24k: number;
  /** When the underlying quote was produced. */
  asOf: Date;
}

/**
 * Convert a USD-per-troy-ounce spot price and a USD→INR rate into the pure-gold
 * INR-per-gram figure used to value holdings.
 */
export function inrPerGram24k(usdPerOunce: number, usdToInr: number): number {
  return (usdPerOunce * usdToInr) / GRAMS_PER_TROY_OUNCE;
}

/**
 * Value a gold holding (grams at a given purity) in INR using the supplied
 * rate. Returns a 2-decimal number. Returns 0 for non-positive weights.
 */
export function valueGoldHolding(
  grams: number,
  purity: GoldPurity,
  rate: GoldRate,
): number {
  if (!(grams > 0)) {
    return 0;
  }
  const fineness = GOLD_PURITY_FINENESS[purity];
  const value = grams * fineness * rate.inrPerGram24k;
  return Math.round(value * 100) / 100;
}

/** INR-per-gram for a specific purity (e.g. for showing the 22k day rate). */
export function inrPerGramForPurity(rate: GoldRate, purity: GoldPurity): number {
  return Math.round(rate.inrPerGram24k * GOLD_PURITY_FINENESS[purity] * 100) / 100;
}
