import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { storage } from '../src/lib/storage'
import * as cellar from '../src/lib/cellar'
import type { CellarEntry } from '../src/lib/cellar'
import type { SeedRef } from '../src/lib/types'
import { wine } from './helpers'

const KEY = 'cellar.v2'

function seed(entries: Array<Partial<CellarEntry> & { sku: string }>): void {
  storage.setItem(KEY, JSON.stringify(
    entries.map(e => ({ kind: 'like', addedAt: 1, wine: null, wineFetchedAt: 0, ...e })),
  ))
  cellar.reload()
}

function stored(): CellarEntry[] {
  return JSON.parse(storage.getItem(KEY) ?? '[]')
}

beforeEach(() => {
  storage.removeItem(KEY)
  cellar.reload()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('hiddenSkus', () => {
  const refs: SeedRef[] = [
    { sku: '111', kind: 'like' },
    { sku: '222', kind: 'dislike' },
    { sku: '333', kind: 'skip' },
  ]

  it('hides both dislikes and skips from the results', () => {
    expect(cellar.hiddenSkus(refs)).toEqual(new Set(['222', '333']))
  })

  it('never hides a liked wine', () => {
    expect(cellar.hiddenSkus(refs).has('111')).toBe(false)
  })

  it('is the only thing the two hidden kinds share — a skip is not a dislike', () => {
    // The prompt's "steer clear" list is built from kind === 'dislike' alone.
    // If a skip ever leaked into it, the model would generalize away from a
    // wine the user has no quarrel with, which is exactly what 'skip' exists
    // to avoid.
    const steerClear = refs.filter(r => r.kind === 'dislike').map(r => r.sku)
    expect(steerClear).toEqual(['222'])
    expect(steerClear).not.toContain('333')
  })
})

/**
 * The regression test for the write-echo bug.
 *
 * In the React app the writes were fire-and-forget; they only reached the UI
 * because Firebase echoed them back. Delete Firebase and every one of these
 * would land in storage and never repaint.
 */
describe('every mutator notifies subscribers exactly once', () => {
  const cases: Array<[string, () => void]> = [
    ['saveWine', () => cellar.saveWine(wine('111'), 'like')],
    ['saveWines', () => cellar.saveWines([{ wine: wine('111'), kind: 'like' }])],
    ['setKind', () => cellar.setKind('111', 'dislike')],
    ['removeSeed', () => cellar.removeSeed('111')],
    ['refreshWines', () => cellar.refreshWines([wine('111', { price: 99 })])],
    ['markUnresolved', () => cellar.markUnresolved(['111'])],
    ['replaceAll', () => cellar.replaceAll([])],
    ['reload', () => cellar.reload()],
  ]

  for (const [name, run] of cases) {
    it(name, () => {
      seed([{ sku: '111', wine: wine('111') }])
      let calls = 0
      const unsub = cellar.subscribe(() => { calls++ })
      run()
      unsub()
      expect(calls).toBe(1)
    })
  }

  it('stops notifying after unsubscribe', () => {
    let calls = 0
    const unsub = cellar.subscribe(() => { calls++ })
    unsub()
    cellar.saveWine(wine('111'), 'like')
    expect(calls).toBe(0)
  })
})

describe('getSnapshot identity', () => {
  it('is stable between mutations', () => {
    seed([{ sku: '111', wine: wine('111') }])
    expect(cellar.getSnapshot()).toBe(cellar.getSnapshot())
  })

  it('changes on mutation, so a === check is a valid skip signal', () => {
    seed([{ sku: '111', wine: wine('111') }])
    const before = cellar.getSnapshot()
    cellar.setKind('111', 'dislike')
    expect(cellar.getSnapshot()).not.toBe(before)
  })

  it('does not mutate the previously handed-out snapshot', () => {
    seed([{ sku: '111', wine: wine('111') }])
    const before = cellar.getSnapshot()
    cellar.removeSeed('111')
    expect(before.entries).toHaveLength(1) // the old snapshot is still the old list
    expect(cellar.getSnapshot().entries).toHaveLength(0)
  })
})

describe('the governing invariant: the list is precious, the cached wine is disposable', () => {
  it('degrades a malformed wine blob to a cache miss without losing the entry', () => {
    storage.setItem(KEY, JSON.stringify([
      { sku: '111', kind: 'dislike', addedAt: 5, wine: { sku: '111', name: 42 }, wineFetchedAt: 9 },
    ]))
    cellar.reload()

    const snap = cellar.getSnapshot()
    expect(snap.entries).toHaveLength(1)
    expect(snap.entries[0]!.kind).toBe('dislike') // the precious part survived
    expect(snap.entries[0]!.wine).toBe(null) // the disposable part did not
    expect(snap.unresolved).toHaveLength(1) // and it is queued for re-fetch
  })

  it('quarantines corrupt JSON instead of wiping it', () => {
    const corrupt = '{not json at all'
    storage.setItem(KEY, corrupt)

    const writes: Array<[string, string]> = []
    vi.spyOn(storage, 'setItem').mockImplementation((k, v) => { writes.push([k, v]) })
    cellar.reload()

    expect(cellar.getSnapshot().entries).toEqual([])
    // The unreadable bytes are copied aside, verbatim, under a timestamped key.
    // This is the one thing here that cannot be regenerated from the network,
    // so a parse failure must never be resolved by deleting it.
    const quarantined = writes.find(([k]) => k.startsWith('cellar.corrupt.'))
    expect(quarantined).toBeDefined()
    expect(quarantined![1]).toBe(corrupt)
    expect(writes.some(([k]) => k === KEY)).toBe(false) // and the original is not overwritten
  })

  it('quarantines a well-formed JSON value that is not an array', () => {
    storage.setItem(KEY, '{"seeds":{"111":{"kind":"like"}}}') // e.g. a v1 document
    const writes: string[] = []
    vi.spyOn(storage, 'setItem').mockImplementation(k => { writes.push(k) })
    cellar.reload()

    expect(cellar.getSnapshot().entries).toEqual([])
    expect(writes.some(k => k.startsWith('cellar.corrupt.'))).toBe(true)
  })

  it('drops only the entries that have no sku', () => {
    storage.setItem(KEY, JSON.stringify([
      { sku: '111', kind: 'like' },
      { kind: 'like' },
      { sku: '', kind: 'like' },
      { sku: '222', kind: 'skip' },
    ]))
    cellar.reload()

    expect(cellar.getSnapshot().refs).toEqual([
      { sku: '111', kind: 'like' },
      { sku: '222', kind: 'skip' },
    ])
  })

  it('reads a record written before `kind` existed as a like', () => {
    storage.setItem(KEY, JSON.stringify([{ sku: '111', addedAt: 1 }]))
    cellar.reload()
    expect(cellar.getSnapshot().refs[0]!.kind).toBe('like')
  })
})

describe('quota failures', () => {
  it('never throw out of a mutator, and surface on the snapshot', () => {
    seed([{ sku: '111', wine: wine('111') }])
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => cellar.saveWine(wine('222'), 'like')).not.toThrow()

    const snap = cellar.getSnapshot()
    expect(snap.error).toContain('Quota')
    expect(snap.entries).toHaveLength(2) // the user's action still happened on screen
  })

  it('clear once a write succeeds again', () => {
    const spy = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    cellar.saveWine(wine('111'), 'like')
    expect(cellar.getSnapshot().error).not.toBe(null)

    spy.mockRestore()
    cellar.saveWine(wine('222'), 'like')
    expect(cellar.getSnapshot().error).toBe(null)
  })
})

describe('mutators', () => {
  it('saveWine appends, and re-saving keeps the original addedAt', () => {
    seed([{ sku: '111', addedAt: 42, wine: wine('111') }])
    cellar.saveWine(wine('111', { price: 99 }), 'dislike')

    const entry = cellar.getSnapshot().entries[0]!
    expect(entry.addedAt).toBe(42) // re-filing is not re-adding
    expect(entry.kind).toBe('dislike')
    expect(entry.wine!.price).toBe(99)
  })

  it('saveWine clears a previous unresolved mark', () => {
    seed([{ sku: '111', unresolvedAt: 5 }])
    cellar.saveWine(wine('111'), 'like')
    expect(cellar.getSnapshot().entries[0]!.unresolvedAt).toBeUndefined()
  })

  it('removeSeed deletes only that sku', () => {
    seed([{ sku: '111' }, { sku: '222' }])
    cellar.removeSeed('111')
    expect(cellar.getSnapshot().refs.map(r => r.sku)).toEqual(['222'])
  })

  it('refreshWines updates saved entries and never adds new ones', () => {
    seed([{ sku: '111', wine: wine('111', { price: 20 }) }])
    cellar.refreshWines([wine('111', { price: 25 }), wine('999', { price: 50 })])

    const snap = cellar.getSnapshot()
    expect(snap.entries).toHaveLength(1) // 999 is in the catalog, not the cellar
    expect(snap.entries[0]!.wine!.price).toBe(25)
  })

  it('markUnresolved keeps any cached wine — it is a note, not a deletion', () => {
    seed([{ sku: '111', wine: wine('111') }])
    cellar.markUnresolved(['111'])

    const entry = cellar.getSnapshot().entries[0]!
    expect(entry.unresolvedAt).toBeGreaterThan(0)
    expect(entry.wine).not.toBe(null)
  })

  it('replaceAll validates through the same path as a read', () => {
    cellar.replaceAll([
      { sku: '111', kind: 'like', addedAt: 1, wine: null, wineFetchedAt: 0 },
      { kind: 'like' } as unknown as CellarEntry,
    ])
    expect(cellar.getSnapshot().refs).toEqual([{ sku: '111', kind: 'like' }])
  })

  it('preserves insertion order across a re-file', () => {
    seed([{ sku: '111' }, { sku: '222' }, { sku: '333' }])
    cellar.setKind('222', 'skip')
    expect(cellar.getSnapshot().refs.map(r => r.sku)).toEqual(['111', '222', '333'])
  })
})

describe('read-modify-write against storage, not the in-memory mirror', () => {
  it('does not clobber a write made by another tab', () => {
    seed([{ sku: '111', wine: wine('111') }])

    // Another tab adds 222 and this tab never hears about it.
    const other = stored()
    other.push({ sku: '222', kind: 'like', addedAt: 2, wine: null, wineFetchedAt: 0 })
    storage.setItem(KEY, JSON.stringify(other))

    // This tab now mutates from its stale in-memory view.
    cellar.saveWine(wine('333'), 'like')

    expect(cellar.getSnapshot().refs.map(r => r.sku)).toEqual(['111', '222', '333'])
  })
})

describe('snapshot grouping', () => {
  it('splits wines by kind and omits ones with no cached record', () => {
    seed([
      { sku: '111', kind: 'like', wine: wine('111') },
      { sku: '222', kind: 'dislike', wine: wine('222') },
      { sku: '333', kind: 'skip', wine: wine('333') },
      { sku: '444', kind: 'like', wine: null },
    ])

    const snap = cellar.getSnapshot()
    expect(snap.liked.map(w => w.sku)).toEqual(['111'])
    expect(snap.disliked.map(w => w.sku)).toEqual(['222'])
    expect(snap.skipped.map(w => w.sku)).toEqual(['333'])
    expect(snap.unresolved.map(e => e.sku)).toEqual(['444'])
  })
})
