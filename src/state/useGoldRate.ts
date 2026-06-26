/**
 * Hook that resolves the current gold rate in INR per gram (24k).
 *
 * Combines two free, key-less, CORS-enabled sources:
 * - freegoldapi.com — daily gold price in USD per troy ounce.
 * - open.er-api.com — USD→INR exchange rate.
 *
 * The result is cached in localStorage for a few hours so the network is hit
 * at most a couple of times a day; a stale cache is used as a fallback if the
 * network fails. Consumers use {@link ../domain/gold} helpers to value
 * holdings from the returned rate.
 */
import { useEffect, useState } from 'react';

import { inrPerGram24k, type GoldRate } from '../domain/gold';

const GOLD_USD_OZ_URL = 'https://freegoldapi.com/data/latest.json';
const USD_INR_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'familyvault.goldRate.v1';
/** Refetch at most this often (6 hours). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Status of the gold-rate fetch. */
export type GoldRateStatus = 'loading' | 'ready' | 'error';

export interface UseGoldRateResult {
  rate: GoldRate | null;
  status: GoldRateStatus;
  /** Force a refetch, bypassing the cache. */
  refresh: () => void;
}

interface CachedRate {
  inrPerGram24k: number;
  asOf: string;
  cachedAt: number;
}

function readCache(): CachedRate | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as CachedRate;
    if (typeof parsed.inrPerGram24k === 'number' && parsed.inrPerGram24k > 0) {
      return parsed;
    }
  } catch {
    // Ignore malformed cache.
  }
  return null;
}

function writeCache(rate: GoldRate): void {
  try {
    const payload: CachedRate = {
      inrPerGram24k: rate.inrPerGram24k,
      asOf: rate.asOf.toISOString(),
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures (private mode, quota).
  }
}

/** Fetch the latest USD/oz gold price from freegoldapi (last array entry). */
async function fetchGoldUsdPerOunce(signal: AbortSignal): Promise<number> {
  const res = await fetch(GOLD_USD_OZ_URL, { signal });
  if (!res.ok) throw new Error(`gold price ${res.status}`);
  const series = (await res.json()) as Array<{ price: number }>;
  const last = series[series.length - 1];
  if (!last || typeof last.price !== 'number') {
    throw new Error('gold price malformed');
  }
  return last.price;
}

/** Fetch the USD→INR rate from open.er-api. */
async function fetchUsdToInr(signal: AbortSignal): Promise<number> {
  const res = await fetch(USD_INR_URL, { signal });
  if (!res.ok) throw new Error(`fx ${res.status}`);
  const data = (await res.json()) as { rates?: { INR?: number } };
  const inr = data.rates?.INR;
  if (typeof inr !== 'number') throw new Error('fx malformed');
  return inr;
}

/**
 * Resolve the live gold rate. Uses a fresh cache immediately; otherwise fetches
 * both sources and caches the result. Falls back to a stale cache on error.
 */
export function useGoldRate(): UseGoldRateResult {
  const [rate, setRate] = useState<GoldRate | null>(null);
  const [status, setStatus] = useState<GoldRateStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const cached = readCache();
    if (cached !== null && attempt === 0) {
      const fresh = Date.now() - cached.cachedAt < CACHE_TTL_MS;
      setRate({ inrPerGram24k: cached.inrPerGram24k, asOf: new Date(cached.asOf) });
      setStatus('ready');
      if (fresh) {
        return () => controller.abort();
      }
      // Stale: fall through to refresh in the background.
    } else {
      setStatus('loading');
    }

    (async () => {
      try {
        const [usdPerOz, usdToInr] = await Promise.all([
          fetchGoldUsdPerOunce(controller.signal),
          fetchUsdToInr(controller.signal),
        ]);
        if (cancelled) return;
        const resolved: GoldRate = {
          inrPerGram24k: inrPerGram24k(usdPerOz, usdToInr),
          asOf: new Date(),
        };
        setRate(resolved);
        setStatus('ready');
        writeCache(resolved);
      } catch {
        if (cancelled) return;
        // Keep any stale cached value already set; otherwise report error.
        setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  return { rate, status, refresh: () => setAttempt((a) => a + 1) };
}
