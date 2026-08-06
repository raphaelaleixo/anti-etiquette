import { fetchBranchCatalog } from './catalog'
import { buildProfile } from './profile'
import { rankWines } from './score'
import * as cellar from './cellar'
import * as appState from './appState'
import { rememberBranch, rememberBranchCount } from './branches'

/** How many ranked wines the results list shows. */
const RESULT_COUNT = 10

/**
 * Rank a branch's catalog against the saved list.
 *
 * The React version had a second phase after this one: fetch a stock quantity
 * per shortlisted wine, 10+ concurrent requests through a serverless proxy,
 * and the slowest part of a search by a wide margin. It is gone, along with
 * the exact bottle counts it bought. `buildCatalogFilter` already pins
 * `availability_front == 'In store'` and `store_availability_list == branch`,
 * so every wine here is in stock at this branch by construction.
 */

/**
 * Only the newest search may write results or clear the status line.
 *
 * Without this, changing branch mid-fetch lets the abandoned search land its
 * results on top of the new one — the older request finishing later is not
 * unusual, it is the normal case when the first branch has more pages.
 */
let generation = 0

export async function runSearch(): Promise<void> {
  const { branch, filters } = appState.getSnapshot()
  const liked = cellar.getSnapshot().liked
  if (!branch || liked.length === 0) return

  const mine = ++generation
  const stale = () => mine !== generation

  appState.clearResults()
  appState.setStatus("Fetching this branch's catalog…")

  try {
    const catalog = await fetchBranchCatalog(branch, filters, (done, total) => {
      if (stale()) return
      appState.setStatus(`Fetching catalog… page ${done} of ${total}`, { done, total })
    })
    if (stale()) return

    rememberBranch(branch)
    rememberBranchCount(branch, catalog.length)

    // Opportunistic refresh, at zero extra cost: this branch's whole filtered
    // catalog is already in hand, so intersecting it with the saved list
    // updates every cached record that appears in it for no additional
    // request. Deliberately before buildProfile, so the profile is built from
    // the fresher prices rather than last month's.
    //
    // There is no TTL and no refetch-on-load. `price` is the only cached field
    // that both drifts and matters, and a wine whose price moved but which is
    // not stocked at the branch being searched is not a wine anyone is about
    // to buy.
    cellar.refreshWines(catalog)
    const refreshedLiked = cellar.getSnapshot().liked

    const profile = buildProfile(refreshedLiked)
    const hidden = cellar.hiddenSkus(cellar.getSnapshot().refs)
    const ranked = rankWines(catalog.filter(w => !hidden.has(w.sku)), profile, RESULT_COUNT)

    const seedSkus = new Set(profile.seeds.map(s => s.sku))
    const favourites = catalog.filter(w => seedSkus.has(w.sku))

    appState.setResults({ results: ranked, favourites, catalog, profile })
  } catch (e) {
    if (stale()) return
    appState.setError(`Search failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}
