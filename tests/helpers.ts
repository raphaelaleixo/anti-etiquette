import { getCatalogLang } from '../src/lib/catalog'
import type { CellarEntry } from '../src/lib/cellar'
import type { Wine } from '../src/lib/types'

/**
 * Shared fixtures.
 *
 * The `wine()` builder had drifted into nine copies, each differing only in
 * whether `region` was set and what the price happened to be — differences
 * that were accidental, not meaningful, and that made a test's intent harder
 * to read rather than easier. One builder with overrides says which fields a
 * given test actually cares about.
 *
 * Not a `.test.ts` file, so vitest does not try to run it.
 */

export function wine(sku: string, over: Partial<Wine> = {}): Wine {
  return {
    sku,
    name: `Wine ${sku}`,
    urlKey: `w-${sku}`,
    price: 20,
    inStock: true,
    country: 'France',
    region: 'Rhône',
    appellation: null,
    grapes: ['Syrah'],
    vintage: null,
    tasteTag: null,
    rating: null,
    ratingCount: null,
    availability: [],
    ...over,
  }
}

/**
 * A cellar entry, defaulting to no cached wine — the state hydration fills.
 *
 * When a wine *is* supplied, the entry is stamped with the current catalog
 * language, because that is what saving one actually does. Without it every
 * fixture would look like a pre-`wineLang` record and read as stale, which is
 * correct behaviour but not what most tests mean to set up. Pass `wineLang`
 * explicitly to test the mismatch.
 */
export function entry(sku: string, over: Partial<CellarEntry> = {}): CellarEntry {
  const e: CellarEntry = { sku, kind: 'like', addedAt: 1, wine: null, wineFetchedAt: 0, ...over }
  if (e.wine !== null && e.wineLang === undefined) e.wineLang = getCatalogLang()
  return e
}

/** Keys the app writes, cleared between tests so state cannot leak across them. */
export const STORAGE_KEYS = [
  'cellar.v2',
  'cellar.lastExport',
  'branch',
  'filters',
  'recentBranches',
  'branchCounts',
] as const
