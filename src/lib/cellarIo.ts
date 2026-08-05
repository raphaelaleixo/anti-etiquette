import { parseEntry, type CellarEntry } from './cellar'
import { storage } from './storage'

/**
 * Export and import.
 *
 * localStorage means one "clear browsing data" wipes the list, and on iOS
 * Safari it is worse than that: script-writable storage is evicted after seven
 * days without interaction. A returning visitor is safe; someone who tries
 * this once and comes back three weeks later is not. So a backup has to exist,
 * and it has to be offered before it is needed.
 */

export const FORMAT = 'saq-wine-matcher.cellar'
export const VERSION = 2

/** Kept from the original app's namespace so the two can read each other. */
export interface CellarDocument {
  format: typeof FORMAT
  version: number
  exportedAt: string
  entries: CellarEntry[]
}

const LAST_EXPORT_KEY = 'cellar.lastExport'

/** Past this many entries, an unbacked-up list is worth mentioning. */
const NAG_THRESHOLD = 10
const NAG_AFTER_DAYS = 30

/**
 * `entries` is deliberately the persisted shape, so an export is a copy of
 * what is stored rather than a translation of it. One shape, one validator,
 * and nothing to keep in sync.
 */
export function buildDocument(entries: readonly CellarEntry[], now: number): CellarDocument {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date(now).toISOString(),
    entries: [...entries],
  }
}

export function serialize(entries: readonly CellarEntry[], now: number): string {
  return JSON.stringify(buildDocument(entries, now), null, 2)
}

export function filename(now: number): string {
  return `my-wines-${new Date(now).toISOString().slice(0, 10)}.json`
}

export type ParseResult =
  | { ok: true; entries: CellarEntry[]; skipped: number }
  | { ok: false; error: string }

/**
 * `format` is the discriminator, and it is the reason this reports an error
 * rather than silently importing nothing: without it, handing the app an
 * unrelated JSON file would look exactly like handing it an empty list.
 */
export function parseDocument(text: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't JSON." }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "That doesn't look like a wine list export." }
  }
  const doc = parsed as Partial<CellarDocument>
  if (doc.format !== FORMAT) {
    return { ok: false, error: "That's a JSON file, but not a wine list export." }
  }
  if (typeof doc.version !== 'number' || doc.version > VERSION) {
    return {
      ok: false,
      error: `That export was made by a newer version (${String(doc.version)}). Update this page first.`,
    }
  }
  if (!Array.isArray(doc.entries)) {
    return { ok: false, error: 'That export has no wine list in it.' }
  }

  // Same validator a read uses, so an import cannot smuggle in a shape a load
  // would have rejected.
  const entries = doc.entries.map(parseEntry).filter((e): e is CellarEntry => e !== null)
  return { ok: true, entries, skipped: doc.entries.length - entries.length }
}

/**
 * Merge, not replace.
 *
 * The real case is "I set this up on my laptop and my phone already has three
 * wines" — replacing would silently destroy the three. Imported `kind` wins,
 * because the file is the deliberate act and the local state is the accident.
 */
export function merge(
  current: readonly CellarEntry[],
  incoming: readonly CellarEntry[],
): CellarEntry[] {
  const out = [...current]
  const indexBySku = new Map(out.map((e, i) => [e.sku, i]))

  for (const entry of incoming) {
    const at = indexBySku.get(entry.sku)
    if (at === undefined) {
      indexBySku.set(entry.sku, out.length)
      out.push(entry)
      continue
    }
    const mine = out[at]!
    // A record beats no record; between two records the fresher one wins,
    // since price is the field that both drifts and matters.
    const takeIncomingWine = mine.wine === null
      || (entry.wine !== null && entry.wineFetchedAt > mine.wineFetchedAt)
    const wine = takeIncomingWine ? entry.wine : mine.wine
    const wineFetchedAt = takeIncomingWine ? entry.wineFetchedAt : mine.wineFetchedAt
    // If either side ever resolved it, it is not unresolved.
    const stillUnresolved = wine === null
      && mine.unresolvedAt !== undefined
      && entry.unresolvedAt !== undefined

    out[at] = {
      sku: mine.sku,
      kind: entry.kind,
      addedAt: Math.min(mine.addedAt || entry.addedAt, entry.addedAt || mine.addedAt),
      wine,
      wineFetchedAt,
      ...(stillUnresolved ? { unresolvedAt: Math.min(mine.unresolvedAt!, entry.unresolvedAt!) } : {}),
    }
  }
  return out
}

// ------------------------------------------------------------- backup nudge

export function recordExport(now: number): void {
  try {
    storage.setItem(LAST_EXPORT_KEY, String(now))
  } catch {
    // Not worth interrupting a successful export over.
  }
}

export function lastExportAt(): number | null {
  try {
    const raw = storage.getItem(LAST_EXPORT_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * Whether to nudge about backing up.
 *
 * Soft, and only once the list is worth something — an unused backup feature
 * is the same as no backup feature, but nagging someone with two wines is how
 * a prompt gets learned as noise and ignored when it matters.
 */
export function shouldSuggestExport(entryCount: number, now: number): boolean {
  if (entryCount < NAG_THRESHOLD) return false
  const last = lastExportAt()
  if (last === null) return true
  return now - last > NAG_AFTER_DAYS * 24 * 60 * 60 * 1000
}
