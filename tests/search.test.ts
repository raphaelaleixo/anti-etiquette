import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as catalog from '../src/lib/catalog'
import * as cellar from '../src/lib/cellar'
import * as appState from '../src/lib/appState'
import { runSearch } from '../src/lib/search'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'
import { wine } from './helpers'

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
    expect(appState.getSnapshot().search!.results.length).toBeGreaterThan(0)
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
    expect(snap.search).not.toBe(null)
    expect(snap.search!.profile).not.toBe(null)
    expect(snap.search!.catalog).toHaveLength(2)
    expect(snap.status).toBe('')
  })

  it('excludes dislikes and skips from the ranking', async () => {
    cellar.saveWine(wine('900'), 'dislike')
    cellar.saveWine(wine('901'), 'skip')
    stubCatalog([wine('900'), wine('901'), wine('902')])

    await runSearch()

    expect(appState.getSnapshot().search!.results.map(r => r.wine.sku)).toEqual(['902'])
  })

  it('surfaces saved wines that are stocked here', async () => {
    stubCatalog([wine('111'), wine('900')])
    await runSearch()
    expect(appState.getSnapshot().search!.favourites.map(w => w.sku)).toEqual(['111'])
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
    expect(snap.search!.catalog.map(w => w.sku)).toEqual(['902'])
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
    expect(snap.search).toBe(null)
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
    expect(appState.getSnapshot().search).not.toBe(null)
    appState.setBranch('23113')
    // One assertion now, not two: "no search" and "no results" used to be
    // separate fields that could disagree, and cannot any more.
    expect(appState.getSnapshot().search).toBe(null)
  })

  it('keeps results when the filters are applied unchanged', () => {
    // Opening the sheet to check what is set, then applying it, must not throw
    // away a search.
    appState.setFilters({ ...appState.getSnapshot().filters })
    expect(appState.getSnapshot().search).not.toBe(null)
  })

  it('clears results when the filters actually change', () => {
    appState.setFilters({ ...appState.getSnapshot().filters, colour: 'white' })
    expect(appState.getSnapshot().search).toBe(null)
  })
})

/**
 * The branch's whole filtered catalog is already in hand, so refreshing the
 * saved list from it costs nothing. No TTL and no refetch-on-load: price is
 * the only cached field that both drifts and matters, and a wine that is not
 * stocked at the branch being searched is not one anyone is about to buy.
 */
describe('opportunistic refresh', () => {
  beforeEach(() => {
    appState.setBranch('23112')
  })

  it('updates cached prices from the catalog it already downloaded', async () => {
    cellar.saveWine(wine('111', { price: 20 }), 'like')
    const spy = stubCatalog([wine('111', { price: 26 }), wine('900')])

    await runSearch()

    expect(cellar.getSnapshot().entries[0]!.wine!.price).toBe(26)
    expect(spy).toHaveBeenCalledTimes(1) // one request, the same one as before
  })

  it('costs no extra network calls at all', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    cellar.saveWine(wine('111'), 'like')
    stubCatalog([wine('111'), wine('900')])

    await runSearch()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaves saved wines the branch does not stock untouched', async () => {
    cellar.saveWine(wine('111', { price: 20 }), 'like')
    cellar.saveWine(wine('222', { price: 30 }), 'like')
    stubCatalog([wine('111', { price: 26 })])

    await runSearch()

    const entries = cellar.getSnapshot().entries
    expect(entries[0]!.wine!.price).toBe(26)
    expect(entries[1]!.wine!.price).toBe(30) // absent from this branch, so unchanged
  })

  it('builds the profile from the refreshed prices, not the stale ones', async () => {
    // buildProfile takes a median price, so running it before the refresh
    // would score every wine against a number that is out of date.
    cellar.saveWine(wine('111', { price: 20 }), 'like')
    stubCatalog([wine('111', { price: 60 })])

    await runSearch()

    expect(appState.getSnapshot().search!.profile!.medianPrice).toBe(60)
  })

  it('does not add catalog wines to the saved list', async () => {
    cellar.saveWine(wine('111'), 'like')
    stubCatalog([wine('111'), wine('900'), wine('901')])

    await runSearch()

    expect(cellar.getSnapshot().entries).toHaveLength(1)
  })
})
