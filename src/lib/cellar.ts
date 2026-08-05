import { storage, onExternalChange } from './storage'
import type { SeedKind, SeedRef, Wine } from './types'

/**
 * The saved wine list.
 *
 * One key, `cellar.v2`, holding the whole document as an insertion-ordered
 * array. The Firebase version wrote one key per SKU so that two phones could
 * not clobber each other; this fork has one browser and deletes that
 * requirement.
 *
 * **Governing invariant: the SKU + kind list is precious, the cached `Wine` is
 * disposable.** A bad wine blob degrades one entry to a cache miss and is
 * re-fetched later; it never removes the entry. Corrupt JSON is quarantined,
 * never wiped. Quota errors never throw out of a mutator.
 *
 * **Publishing lives inside every mutator.** In the React app the writes were
 * fire-and-forget and only reached the UI because Firebase echoed them back —
 * delete Firebase and those writes go silent. Here a mutation that does not
 * notify is not possible to write.
 */

const KEY = 'cellar.v2'
const CORRUPT_PREFIX = 'cellar.corrupt.'

export interface CellarEntry {
  sku: string
  kind: SeedKind
  addedAt: number
  /** Last known record. Null means never resolved, or the cache failed validation. */
  wine: Wine | null
  wineFetchedAt: number
  /** A resolve found nothing. Suppresses a retry on every subsequent load. */
  unresolvedAt?: number
}

export interface CellarSnapshot {
  entries: readonly CellarEntry[]
  refs: readonly SeedRef[]
  liked: readonly Wine[]
  disliked: readonly Wine[]
  skipped: readonly Wine[]
  /** Entries with no cached wine — Task 7 hydrates these and renders them explicitly. */
  unresolved: readonly CellarEntry[]
  /** Set when a write failed. The list in memory is still correct. */
  error: string | null
}

// ---------------------------------------------------------------- validation

function toKind(raw: unknown): SeedKind {
  // Anything unrecognised reads as 'like' — that was the only kind before the
  // field existed, so the oldest records carry no `kind` at all.
  return raw === 'dislike' || raw === 'skip' ? raw : 'like'
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function strArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every(x => typeof x === 'string') ? v : null
}

/**
 * Validate a cached wine. Returning null costs one network round-trip later;
 * accepting a malformed one corrupts scoring silently, which is worse.
 */
function toWine(raw: unknown): Wine | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const sku = str(r.sku)
  const name = str(r.name)
  const urlKey = str(r.urlKey)
  const price = num(r.price)
  const grapes = strArray(r.grapes)
  const availability = strArray(r.availability)
  if (sku === null || name === null || urlKey === null || price === null) return null
  if (grapes === null || availability === null) return null
  return {
    sku,
    name,
    urlKey,
    price,
    inStock: r.inStock === true,
    country: str(r.country),
    region: str(r.region),
    appellation: str(r.appellation),
    grapes,
    vintage: str(r.vintage),
    tasteTag: str(r.tasteTag),
    rating: num(r.rating),
    ratingCount: num(r.ratingCount),
    availability,
  }
}

function toEntry(raw: unknown): CellarEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const sku = str(r.sku)
  if (sku === null || sku === '') return null // no sku, nothing to keep
  const unresolvedAt = num(r.unresolvedAt)
  return {
    sku,
    kind: toKind(r.kind),
    addedAt: num(r.addedAt) ?? 0,
    wine: toWine(r.wine),
    wineFetchedAt: num(r.wineFetchedAt) ?? 0,
    ...(unresolvedAt === null ? {} : { unresolvedAt }),
  }
}

// ------------------------------------------------------------------- storage

/**
 * Move unparseable content aside instead of overwriting it.
 *
 * The list is the one thing here that cannot be regenerated from the network,
 * so a parse failure must never be resolved by deleting it. A quarantined copy
 * can be recovered by hand; a wiped one cannot.
 */
function quarantine(rawText: string): void {
  try {
    storage.setItem(`${CORRUPT_PREFIX}${Date.now()}`, rawText)
  } catch {
    // Out of quota with corrupt data already present. Nothing further to try,
    // and throwing here would take down the load.
  }
}

function read(): CellarEntry[] {
  let rawText: string | null = null
  try {
    rawText = storage.getItem(KEY)
  } catch {
    return []
  }
  if (rawText === null || rawText === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    quarantine(rawText)
    return []
  }
  if (!Array.isArray(parsed)) {
    quarantine(rawText)
    return []
  }
  return parsed.map(toEntry).filter((e): e is CellarEntry => e !== null)
}

function write(next: CellarEntry[]): string | null {
  try {
    storage.setItem(KEY, JSON.stringify(next))
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save to this browser.'
  }
}

// --------------------------------------------------------------------- store

let entries: CellarEntry[] = read()
let error: string | null = null
let snapshot: CellarSnapshot | null = null
const listeners = new Set<() => void>()

function build(): CellarSnapshot {
  const refs: SeedRef[] = entries.map(e => ({ sku: e.sku, kind: e.kind }))
  const winesOf = (kind: SeedKind): Wine[] =>
    entries.filter(e => e.kind === kind && e.wine !== null).map(e => e.wine!)
  return {
    entries,
    refs,
    liked: winesOf('like'),
    disliked: winesOf('dislike'),
    skipped: winesOf('skip'),
    unresolved: entries.filter(e => e.wine === null),
    error,
  }
}

/** Identity-stable until the next mutation, so consumers can skip work on `===`. */
export function getSnapshot(): CellarSnapshot {
  if (snapshot === null) snapshot = build()
  return snapshot
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function publish(): void {
  snapshot = null
  for (const fn of [...listeners]) fn()
}

/**
 * Every mutator goes through here.
 *
 * The read is against storage rather than the in-memory mirror, so two open
 * tabs narrow to a sub-millisecond clobber window instead of a whole session.
 * A failed write updates memory and publishes anyway — the user's action is
 * not lost from the screen just because it could not be persisted.
 */
function mutate(fn: (current: CellarEntry[]) => CellarEntry[]): void {
  entries = fn(read())
  error = write(entries)
  publish()
}

/** Re-read from storage and notify. Used by the cross-tab listener. */
export function reload(): void {
  entries = read()
  error = null
  publish()
}

export function watchOtherTabs(): () => void {
  return onExternalChange(KEY, reload)
}

// ------------------------------------------------------------------ mutators

function upsert(current: CellarEntry[], wine: Wine, kind: SeedKind): CellarEntry[] {
  const now = Date.now()
  const at = current.findIndex(e => e.sku === wine.sku)
  if (at === -1) {
    return [...current, { sku: wine.sku, kind, addedAt: now, wine, wineFetchedAt: now }]
  }
  const next = [...current]
  const prev = next[at]!
  // Keep the original addedAt: re-filing a wine is not re-adding it, and the
  // list is insertion-ordered.
  const { unresolvedAt: _dropped, ...rest } = prev
  next[at] = { ...rest, kind, wine, wineFetchedAt: now }
  return next
}

export function saveWine(wine: Wine, kind: SeedKind): void {
  mutate(current => upsert(current, wine, kind))
}

export function saveWines(items: Array<{ wine: Wine; kind: SeedKind }>): void {
  mutate(current => items.reduce((acc, i) => upsert(acc, i.wine, i.kind), current))
}

export function setKind(sku: string, kind: SeedKind): void {
  mutate(current => current.map(e => (e.sku === sku ? { ...e, kind } : e)))
}

export function removeSeed(sku: string): void {
  mutate(current => current.filter(e => e.sku !== sku))
}

/**
 * Update cached wines for entries already in the list.
 *
 * Called with a branch's catalog during search, which is why it never adds:
 * the catalog contains thousands of wines the user has not saved.
 */
export function refreshWines(wines: Wine[]): void {
  const bySku = new Map(wines.map(w => [w.sku, w]))
  mutate(current => {
    const now = Date.now()
    return current.map(e => {
      const found = bySku.get(e.sku)
      if (!found) return e
      const { unresolvedAt: _dropped, ...rest } = e
      return { ...rest, wine: found, wineFetchedAt: now }
    })
  })
}

/** A resolve found nothing. Keeps any cached wine — this is a note, not a deletion. */
export function markUnresolved(skus: string[]): void {
  const wanted = new Set(skus)
  mutate(current => {
    const now = Date.now()
    return current.map(e => (wanted.has(e.sku) ? { ...e, unresolvedAt: now } : e))
  })
}

/** Wholesale replacement, for import. Validates through the same path as a read. */
export function replaceAll(next: CellarEntry[]): void {
  const clean = next.map(toEntry).filter((e): e is CellarEntry => e !== null)
  mutate(() => clean)
}

// ---------------------------------------------------------------------- pure

/**
 * The SKUs that must not appear in the results.
 *
 * Dislikes and skips both drop out, but for different reasons, and only this
 * union is shared: dislikes go on to the prompt as wines to steer away from,
 * while skips are never mentioned to the model at all. Keeping the two apart
 * is the whole point of the third kind — a skip removes one bottle, it does
 * not argue against everything resembling it.
 */
export function hiddenSkus(refs: SeedRef[]): Set<string> {
  return new Set(
    refs.filter(r => r.kind === 'dislike' || r.kind === 'skip').map(r => r.sku),
  )
}
