import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as catalog from '../src/lib/catalog'
import * as cellar from '../src/lib/cellar'
import * as appState from '../src/lib/appState'
import { runSearch } from '../src/lib/search'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'

function wine(sku: string, over: Partial<Wine> = {}): Wine {
  return {
    sku, name: `Wine ${sku}`, urlKey: `w-${sku}`, price: 20, inStock: true,
    country: 'France', region: 'Rhône', appellation: null, grapes: ['Syrah'],
    vintage: null, tasteTag: null, rating: null, ratingCount: null,
    availability: [], ...over,
  }
}

beforeEach(() => {
  storage.removeItem('cellar.v2')
  storage.removeItem('branch')
  storage.removeItem('recentBranches')
  storage.removeItem('branchCounts')
  cellar.reload()
  appState.clearResults()
  appState.setBranch('')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function stubCatalog(wines: Wine[]): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(catalog, 'fetchBranchCatalog').mockResolvedValue(wines)
}

describe('preconditions', () => {
  it('does nothing without a branch', async () => {
    const spy = stubCatalog([])
    cellar.saveWine(wine('111'), 'like')
    await runSearch()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does nothing without a liked wine', async () => {
    const spy = stubCatalog([])
    appState.setBranch('23112')
    await runSearch()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not count a dislike as something to search from', async () => {
    const spy = stubCatalog([])
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'dislike')
    await runSearch()
    expect(spy).not.toHaveBeenCalled()
  })
})

/**
 * The phase this fork deletes. The React version followed the catalog fetch
 * with one stock request per shortlisted wine — 10+ concurrent calls through a
 * serverless proxy, and the slowest part of a search.
 */
describe('there is no stock phase', () => {
  it('reaches the network exactly once, for the catalog', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    stubCatalog([wine('900'), wine('901')])
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')

    await runSearch()

    expect(fetchSpy).not.toHaveBeenCalled() // the one call is the stubbed catalog
    expect(appState.getSnapshot().results.length).toBeGreaterThan(0)
  })
})

describe('a completed search', () => {
  beforeEach(() => {
    appState.setBranch('23112')
    cellar.saveWine(wine('111', { region: 'Rhône', grapes: ['Syrah'] }), 'like')
  })

  it('ranks the branch catalog and marks itself searched', async () => {
    stubCatalog([wine('900', { grapes: ['Syrah'] }), wine('901', { grapes: ['Merlot'] })])
    await runSearch()

    const snap = appState.getSnapshot()
    expect(snap.searched).toBe(true)
    expect(snap.profile).not.toBe(null)
    expect(snap.catalog).toHaveLength(2)
    expect(snap.status).toBe('')
  })

  it('excludes dislikes and skips from the ranking', async () => {
    cellar.saveWine(wine('900'), 'dislike')
    cellar.saveWine(wine('901'), 'skip')
    stubCatalog([wine('900'), wine('901'), wine('902')])

    await runSearch()

    expect(appState.getSnapshot().results.map(r => r.wine.sku)).toEqual(['902'])
  })

  it('surfaces saved wines that are stocked here', async () => {
    stubCatalog([wine('111'), wine('900')])
    await runSearch()
    expect(appState.getSnapshot().favourites.map(w => w.sku)).toEqual(['111'])
  })

  it('remembers the branch and its result count for the picker', async () => {
    stubCatalog([wine('900'), wine('901'), wine('902')])
    await runSearch()

    expect(JSON.parse(storage.getItem('recentBranches')!)).toEqual(['23112'])
    expect(JSON.parse(storage.getItem('branchCounts')!)).toEqual({ '23112': 3 })
  })

  it('reports paging progress while it runs', async () => {
    const seen: string[] = []
    vi.spyOn(catalog, 'fetchBranchCatalog').mockImplementation(async (_b, _f, onProgress) => {
      onProgress?.(1, 3)
      seen.push(appState.getSnapshot().status)
      onProgress?.(2, 3)
      seen.push(appState.getSnapshot().status)
      return [wine('900')]
    })

    await runSearch()

    expect(seen).toEqual(['Fetching catalog… page 1 of 3', 'Fetching catalog… page 2 of 3'])
    expect(appState.getSnapshot().progress).toBe(null) // cleared when results land
  })
})

/**
 * The older request finishing later is not unusual — it is the normal case
 * when the first branch has more pages than the second.
 */
describe('a search superseded by a newer one', () => {
  it('does not land its results on top of the newer search', async () => {
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')

    let releaseFirst: (w: Wine[]) => void = () => {}
    vi.spyOn(catalog, 'fetchBranchCatalog')
      .mockImplementationOnce(() => new Promise<Wine[]>(r => { releaseFirst = r }))
      .mockResolvedValueOnce([wine('902')])

    const first = runSearch()
    const second = runSearch()
    await second

    releaseFirst([wine('900'), wine('901')])
    await first

    const snap = appState.getSnapshot()
    expect(snap.catalog.map(w => w.sku)).toEqual(['902'])
  })

  it('does not report an error from the abandoned search', async () => {
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')

    let failFirst: (e: Error) => void = () => {}
    vi.spyOn(catalog, 'fetchBranchCatalog')
      .mockImplementationOnce(() => new Promise<Wine[]>((_r, reject) => { failFirst = reject }))
      .mockResolvedValueOnce([wine('902')])

    const first = runSearch()
    await runSearch()

    failFirst(new Error('the abandoned one died'))
    await first

    expect(appState.getSnapshot().error).toBe(null)
  })
})

describe('when the catalog fails', () => {
  it('reports it and leaves the app usable', async () => {
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')
    vi.spyOn(catalog, 'fetchBranchCatalog').mockRejectedValue(new Error('network down'))

    await runSearch()

    const snap = appState.getSnapshot()
    expect(snap.error).toContain('network down')
    expect(snap.status).toBe('')
    expect(snap.searched).toBe(false)
  })
})

describe('changing branch or filters invalidates results', () => {
  beforeEach(async () => {
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')
    stubCatalog([wine('900')])
    await runSearch()
  })

  it('clears results when the branch changes', () => {
    expect(appState.getSnapshot().searched).toBe(true)
    appState.setBranch('23113')
    expect(appState.getSnapshot().searched).toBe(false)
    expect(appState.getSnapshot().results).toHaveLength(0)
  })

  it('keeps results when the filters are applied unchanged', () => {
    // Opening the sheet to check what is set, then applying it, must not throw
    // away a search.
    appState.setFilters({ ...appState.getSnapshot().filters })
    expect(appState.getSnapshot().searched).toBe(true)
  })

  it('clears results when the filters actually change', () => {
    appState.setFilters({ ...appState.getSnapshot().filters, colour: 'white' })
    expect(appState.getSnapshot().searched).toBe(false)
  })
})
