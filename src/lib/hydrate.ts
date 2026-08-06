import { resolveSku } from './catalog'
import * as cellar from './cellar'
import type { CellarEntry } from './cellar'
import type { Wine } from './types'

/**
 * Fill in saved entries that have no cached wine.
 *
 * On virtually every load there are none, and this returns without touching
 * the network. That is the behavioural statement of the whole refactor: the
 * React app called `resolveWineName` for every saved wine on every load
 * (`App.tsx:113`), so opening the page cost one request per saved bottle. Here
 * a record is written when the wine is added and kept until something replaces
 * it, so the only entries left are the ones that genuinely never resolved:
 * imported from another device, or a lookup that failed at the time.
 */

/**
 * Concurrency cap.
 *
 * Usually irrelevant — the list is empty. It matters when someone imports a
 * long list, where an uncapped `Promise.all` would fire one request per saved
 * wine at the catalog in a single burst. Deleting that burst from search was
 * one of the wins of dropping the stock endpoint; it would be careless to
 * reintroduce it here.
 */
const CONCURRENCY = 4

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      const item = items[i]
      if (item === undefined) return
      out[i] = await fn(item)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Which entries are worth a lookup.
 *
 * `unresolvedAt` is what stops a SKU the catalog does not know from being
 * re-queried on every single load for the rest of the list's life. The row is
 * still shown, and removing it is one tap; this only suppresses the retry.
 */
export function pending(entries: readonly CellarEntry[]): CellarEntry[] {
  return entries.filter(e => e.wine === null && e.unresolvedAt === undefined)
}

export interface HydrateResult {
  /** Entries looked up. Zero means no network traffic happened at all. */
  attempted: number
  resolved: number
  /** Looked up successfully, but the catalog has no such wine. */
  unresolved: number
  /** The lookup itself failed. Deliberately NOT marked unresolved. */
  failed: number
}

export async function hydrateMissing(): Promise<HydrateResult> {
  const targets = pending(cellar.getSnapshot().entries)
  const empty: HydrateResult = { attempted: 0, resolved: 0, unresolved: 0, failed: 0 }
  if (targets.length === 0) return empty

  const results = await mapLimit(targets, CONCURRENCY, async entry => {
    try {
      // resolveSku demands `found.sku === sku`, so a delisted SKU comes back
      // null rather than as whatever the relevance ranker liked best. Without
      // that check this function is the exact path by which a stranger's
      // bottle joins the liked list. `searchWines` is the half that may guess;
      // this is the half that must not.
      return { sku: entry.sku, wine: await resolveSku(entry.sku), failed: false }
    } catch {
      return { sku: entry.sku, wine: null as Wine | null, failed: true }
    }
  })

  const resolved = results
    .map(r => r.wine)
    .filter((w): w is Wine => w !== null)

  // A transient network failure must not be recorded as "this wine does not
  // exist" — that would suppress the retry forever on the strength of one bad
  // moment. Only a successful lookup that found nothing counts.
  const unresolved = results.filter(r => !r.failed && r.wine === null).map(r => r.sku)
  const failed = results.filter(r => r.failed).length

  if (resolved.length > 0) cellar.refreshWines(resolved)
  if (unresolved.length > 0) cellar.markUnresolved(unresolved)

  return {
    attempted: targets.length,
    resolved: resolved.length,
    unresolved: unresolved.length,
    failed,
  }
}
