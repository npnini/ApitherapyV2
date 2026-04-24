import { StingPoint } from '../types/apipuncture';

interface CacheEntry {
  data: StingPoint[];
  fetchedAt: number; // Date.now()
}

let cache: CacheEntry | null = null;

/**
 * Returns cached points if they are still within the TTL window, or null if
 * expired / nothing cached yet.
 * @param ttlMinutes — from appConfig.treatmentSettings.pointsCacheTTLMinutes
 */
export function getCachedPoints(ttlMinutes: number): StingPoint[] | null {
  if (!cache) return null;
  const ageMs = Date.now() - cache.fetchedAt;
  if (ageMs > ttlMinutes * 60_000) {
    cache = null; // expired → trigger fresh fetch
    return null;
  }
  return cache.data;
}

/**
 * Stores a freshly-fetched full point list.
 */
export function setCachedPoints(points: StingPoint[]): void {
  cache = { data: points, fetchedAt: Date.now() };
}

/**
 * Force-invalidate the cache (e.g., after an admin saves changes to points).
 */
export function invalidatePointsCache(): void {
  cache = null;
}
