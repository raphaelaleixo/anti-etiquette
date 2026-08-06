import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as catalog from '../src/lib/catalog'
import * as cellar from '../src/lib/cellar'
import { hydrateMissing, pending } from '../src/lib/hydrate'
import { storage } from '../src/lib/storage'
import { wine, entry } from './helpers'

beforeEach(() => {
  storage.removeItem('cellar.v2')
  cellar.reload()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * The behavioural statement of the whole refactor.
 *
 * The React app called resolveWineName for every saved wine on every load, so
 * opening the page cost one request per saved bottle. If this test ever fails,
 * the fork has quietly given that back.
 */
describe('the no-network-on-load guarantee', () => {
  it('makes no lookups at all when every entry is cached', async () => {
    const spy = vi.spyOn(catalog, 'resolveSku')
    cellar.replaceAll([
      entry('111', { wine: wine('111') }),
      entry('222', { wine: wine('222') }),
      entry('333', { wine: wine('333') }),
    ])

    const result = await hydrateMissing()

    expect(spy).not.toHaveBeenCalled()
    expect(result.attempted).toBe(0)
  })

  it('makes no lookups on an empty list', async () => {
    const spy = vi.spyOn(catalog, 'resolveSku')
    expect((await hydrateMissing()).attempted).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('looks up only the entries actually missing a record', async () => {
    const spy = vi.spyOn(catalog, 'resolveSku')
      .mockImplementation(async sku => wine(sku))
    cellar.replaceAll([
      entry('111', { wine: wine('111') }),
      entry('222'),
      entry('333', { wine: wine('333') }),
    ])

    const result = await hydrateMissing()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('222')
    expect(result).toMatchObject({ attempted: 1, resolved: 1, unresolved: 0, failed: 0 })
  })
})

describe('caching what it finds', () => {
  it('writes the resolved wine into the entry', async () => {
    vi.spyOn(catalog, 'resolveSku')
      .mockImplementation(async sku => wine(sku, { name: 'Resolved at last' }))
    cellar.replaceAll([entry('111')])

    await hydrateMissing()

    expect(cellar.getSnapshot().entries[0]!.wine!.name).toBe('Resolved at last')
    expect(cellar.getSnapshot().unresolved).toHaveLength(0)
  })

  it('leaves the kind alone — hydration is a cache fill, not a re-file', async () => {
    vi.spyOn(catalog, 'resolveSku').mockImplementation(async sku => wine(sku))
    cellar.replaceAll([entry('111', { kind: 'dislike' })])

    await hydrateMissing()

    expect(cellar.getSnapshot().refs).toEqual([{ sku: '111', kind: 'dislike' }])
  })

  it('never adds an entry the list did not already have', async () => {
    vi.spyOn(catalog, 'resolveSku').mockImplementation(async sku => wine(sku))
    cellar.replaceAll([entry('111')])

    await hydrateMissing()

    expect(cellar.getSnapshot().entries).toHaveLength(1)
  })
})

describe('a SKU the catalog does not know', () => {
  it('is marked so it is not looked up again on every load', async () => {
    const spy = vi.spyOn(catalog, 'resolveSku').mockResolvedValue(null)
    cellar.replaceAll([entry('10237458')])

    const first = await hydrateMissing()
    expect(first).toMatchObject({ attempted: 1, unresolved: 1 })
    expect(cellar.getSnapshot().entries[0]!.unresolvedAt).toBeGreaterThan(0)

    // Second load: the entry is still there and still shown, but not re-queried.
    spy.mockClear()
    const second = await hydrateMissing()

    expect(spy).not.toHaveBeenCalled()
    expect(second.attempted).toBe(0)
    expect(cellar.getSnapshot().entries).toHaveLength(1)
  })

  it('keeps the entry rather than removing it', async () => {
    // The list is precious; a lookup failure is a cache miss, never a deletion.
    vi.spyOn(catalog, 'resolveSku').mockResolvedValue(null)
    cellar.replaceAll([entry('10237458', { kind: 'skip' })])

    await hydrateMissing()

    expect(cellar.getSnapshot().refs).toEqual([{ sku: '10237458', kind: 'skip' }])
  })
})

/**
 * The distinction that matters: "the catalog says no such wine" is permanent,
 * "the network was down" is not. Conflating them would suppress the retry
 * forever on the strength of one bad moment.
 */
describe('a lookup that fails outright', () => {
  it('is not recorded as unresolved, so the next load tries again', async () => {
    const spy = vi.spyOn(catalog, 'resolveSku')
      .mockRejectedValue(new Error('network down'))
    cellar.replaceAll([entry('111')])

    const result = await hydrateMissing()

    expect(result).toMatchObject({ attempted: 1, resolved: 0, unresolved: 0, failed: 1 })
    expect(cellar.getSnapshot().entries[0]!.unresolvedAt).toBeUndefined()

    // Next load, catalog back up.
    spy.mockResolvedValue(wine('111'))
    await hydrateMissing()

    expect(cellar.getSnapshot().entries[0]!.wine!.sku).toBe('111')
  })

  it('does not reject, so a dead catalog cannot take down the load', async () => {
    vi.spyOn(catalog, 'resolveSku').mockRejectedValue(new Error('network down'))
    cellar.replaceAll([entry('111'), entry('222')])

    await expect(hydrateMissing()).resolves.toMatchObject({ failed: 2 })
  })

  it('keeps the wines it did resolve when others fail', async () => {
    vi.spyOn(catalog, 'resolveSku').mockImplementation(async sku => {
      if (sku === '222') throw new Error('network down')
      return wine(sku)
    })
    cellar.replaceAll([entry('111'), entry('222')])

    const result = await hydrateMissing()

    expect(result).toMatchObject({ resolved: 1, failed: 1 })
    expect(cellar.getSnapshot().entries[0]!.wine).not.toBe(null)
    expect(cellar.getSnapshot().entries[1]!.wine).toBe(null)
  })
})

describe('concurrency', () => {
  it('never has more than four lookups in flight', async () => {
    // Uncapped, importing a long list would fire one request per saved wine in
    // a single burst — the exact thing dropping the stock endpoint deleted.
    let inFlight = 0
    let peak = 0
    vi.spyOn(catalog, 'resolveSku').mockImplementation(async sku => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 1))
      inFlight--
      return wine(sku)
    })
    cellar.replaceAll(Array.from({ length: 20 }, (_, i) => entry(String(1000 + i))))

    const result = await hydrateMissing()

    expect(result).toMatchObject({ attempted: 20, resolved: 20 })
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('resolves every entry exactly once', async () => {
    const seen: string[] = []
    vi.spyOn(catalog, 'resolveSku').mockImplementation(async sku => {
      seen.push(sku)
      return wine(sku)
    })
    cellar.replaceAll(Array.from({ length: 9 }, (_, i) => entry(String(1000 + i))))

    await hydrateMissing()

    expect(seen).toHaveLength(9)
    expect(new Set(seen).size).toBe(9)
  })
})

describe('pending', () => {
  it('selects only entries with no wine and no prior verdict', () => {
    const entries = [
      entry('111', { wine: wine('111') }),
      entry('222'),
      entry('333', { unresolvedAt: 5 }),
      entry('444', { wine: wine('444'), unresolvedAt: 5 }),
    ]
    expect(pending(entries).map(e => e.sku)).toEqual(['222'])
  })
})
