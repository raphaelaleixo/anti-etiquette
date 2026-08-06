import { describe, it, expect, beforeEach } from 'vitest'
import {
  FORMAT, VERSION, buildDocument, serialize, filename, parseDocument, merge,
  recordExport, lastExportAt, shouldSuggestExport,
} from '../src/lib/cellarIo'
import { storage } from '../src/lib/storage'
import { wine, entry } from './helpers'

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0)

beforeEach(() => {
  storage.removeItem('cellar.lastExport')
})

describe('the exported document', () => {
  it('carries a format discriminator and a version', () => {
    const doc = buildDocument([entry('111')], NOW)
    expect(doc.format).toBe(FORMAT)
    expect(doc.version).toBe(VERSION)
    expect(doc.exportedAt).toBe('2026-08-05T12:00:00.000Z')
  })

  it('is exactly the persisted shape, not a translation of it', () => {
    // One shape, one validator, nothing to keep in sync.
    const e = entry('111', { kind: 'skip', wine: wine('111'), wineFetchedAt: 42 })
    expect(buildDocument([e], NOW).entries[0]).toEqual(e)
  })

  it('round-trips through serialize and parse', () => {
    const entries = [entry('111', { wine: wine('111') }), entry('222', { kind: 'dislike' })]
    const result = parseDocument(serialize(entries, NOW))
    expect(result).toMatchObject({ ok: true, skipped: 0 })
    expect(result.ok && result.entries).toEqual(entries)
  })

  it('names the file by date', () => {
    expect(filename(NOW)).toBe('my-wines-2026-08-05.json')
  })
})

/**
 * Without the discriminator, handing the app an unrelated JSON file would look
 * exactly like handing it an empty list — a silent no-op the user reads as
 * "my wines are gone".
 */
describe('rejecting things that are not an export', () => {
  it('rejects text that is not JSON', () => {
    expect(parseDocument('not json at all')).toEqual({ ok: false, error: "That file isn't JSON." })
  })

  it('rejects a JSON array', () => {
    expect(parseDocument('[]').ok).toBe(false)
  })

  it('rejects an unrelated JSON object', () => {
    const result = parseDocument(JSON.stringify({ name: 'package', version: '1.0.0' }))
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error).toContain('not a wine list export')
  })

  it('rejects an export from a newer version rather than dropping fields', () => {
    const result = parseDocument(JSON.stringify({ format: FORMAT, version: 99, entries: [] }))
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error).toContain('newer version')
  })

  it('rejects a document with no entries array', () => {
    expect(parseDocument(JSON.stringify({ format: FORMAT, version: 2 })).ok).toBe(false)
  })

  it('accepts an empty list, which is different from a bad file', () => {
    expect(parseDocument(JSON.stringify({ format: FORMAT, version: 2, entries: [] })))
      .toEqual({ ok: true, entries: [], skipped: 0 })
  })
})

describe('validating imported entries', () => {
  it('runs them through the same validator a read uses', () => {
    const result = parseDocument(JSON.stringify({
      format: FORMAT, version: 2,
      entries: [
        { sku: '111', kind: 'like' },
        { kind: 'like' }, // no sku — nothing to keep
        { sku: '222', kind: 'nonsense', wine: { sku: '222', name: 42 } },
      ],
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skipped).toBe(1)
    expect(result.entries.map(e => e.sku)).toEqual(['111', '222'])
    expect(result.entries[1]!.kind).toBe('like') // unrecognised kind reads as like
    expect(result.entries[1]!.wine).toBe(null) // malformed wine degrades to a cache miss
  })
})

/**
 * The real case is "I set this up on my laptop and my phone already has three
 * wines". Replacing would silently destroy the three.
 */
describe('merge, not replace', () => {
  it('keeps local wines the import does not mention', () => {
    const result = merge([entry('111'), entry('222')], [entry('333')])
    expect(result.map(e => e.sku)).toEqual(['111', '222', '333'])
  })

  it('lets the imported kind win', () => {
    // The file is the deliberate act; the local state is the accident.
    const result = merge([entry('111', { kind: 'like' })], [entry('111', { kind: 'dislike' })])
    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('dislike')
  })

  it('takes a wine record over no record', () => {
    const result = merge(
      [entry('111', { wine: null })],
      [entry('111', { wine: wine('111'), wineFetchedAt: 5 })],
    )
    expect(result[0]!.wine).not.toBe(null)
  })

  it('keeps the local record when the import has none', () => {
    const result = merge(
      [entry('111', { wine: wine('111'), wineFetchedAt: 5 })],
      [entry('111', { wine: null })],
    )
    expect(result[0]!.wine).not.toBe(null)
  })

  it('prefers the fresher of two records, since price drifts', () => {
    const result = merge(
      [entry('111', { wine: wine('111', { price: 20 }), wineFetchedAt: 5 })],
      [entry('111', { wine: wine('111', { price: 25 }), wineFetchedAt: 9 })],
    )
    expect(result[0]!.wine!.price).toBe(25)

    const other = merge(
      [entry('111', { wine: wine('111', { price: 20 }), wineFetchedAt: 9 })],
      [entry('111', { wine: wine('111', { price: 25 }), wineFetchedAt: 5 })],
    )
    expect(other[0]!.wine!.price).toBe(20)
  })

  it('keeps the earlier addedAt, since that is when the wine was added', () => {
    const result = merge([entry('111', { addedAt: 900 })], [entry('111', { addedAt: 100 })])
    expect(result[0]!.addedAt).toBe(100)
  })

  it('clears the unresolved mark if either side ever resolved it', () => {
    const result = merge(
      [entry('111', { unresolvedAt: 5 })],
      [entry('111', { wine: wine('111'), wineFetchedAt: 9 })],
    )
    expect(result[0]!.unresolvedAt).toBeUndefined()
  })

  it('keeps the mark when neither side could resolve it', () => {
    const result = merge(
      [entry('111', { unresolvedAt: 9 })],
      [entry('111', { unresolvedAt: 5 })],
    )
    expect(result[0]!.unresolvedAt).toBe(5)
  })

  it('preserves local order and appends what is new', () => {
    const result = merge(
      [entry('111'), entry('222')],
      [entry('222', { kind: 'skip' }), entry('333')],
    )
    expect(result.map(e => e.sku)).toEqual(['111', '222', '333'])
    expect(result[1]!.kind).toBe('skip')
  })

  it('is idempotent — importing the same file twice changes nothing', () => {
    const local = [entry('111', { wine: wine('111'), wineFetchedAt: 5 })]
    const incoming = [entry('111', { kind: 'dislike', wine: wine('111'), wineFetchedAt: 7 })]
    const once = merge(local, incoming)
    expect(merge(once, incoming)).toEqual(once)
  })
})

/**
 * An unused backup feature is the same as no backup feature — but nagging
 * someone with two wines is how a prompt gets learned as noise.
 */
describe('the backup nudge', () => {
  it('stays quiet for a short list', () => {
    expect(shouldSuggestExport(3, NOW)).toBe(false)
    expect(shouldSuggestExport(9, NOW)).toBe(false)
  })

  it('speaks up for a list that has never been exported', () => {
    expect(shouldSuggestExport(10, NOW)).toBe(true)
  })

  it('goes quiet after an export', () => {
    recordExport(NOW)
    expect(lastExportAt()).toBe(NOW)
    expect(shouldSuggestExport(50, NOW)).toBe(false)
  })

  it('speaks up again a month later', () => {
    recordExport(NOW)
    const later = NOW + 31 * 24 * 60 * 60 * 1000
    expect(shouldSuggestExport(50, later)).toBe(true)
  })

  it('survives a corrupt timestamp', () => {
    storage.setItem('cellar.lastExport', 'not a number')
    expect(lastExportAt()).toBe(null)
    expect(shouldSuggestExport(10, NOW)).toBe(true)
  })
})
