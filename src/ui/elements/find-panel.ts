import { StoreElement, html, mount, delegate, type Html } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import { chipSummary } from '../../lib/filters'
import { branchName } from '../../lib/branches'
import { describeMatch } from '../../lib/reasons'
import { openBranchSheet } from '../branchSheet'
import { openFilterSheet } from '../filterSheet'
import type { ScoredWine, TasteProfile, Wine } from '../../lib/types'

/** Below this, SAQ's community average is closer to noise than signal. */
const THIN_SAMPLE = 5

/**
 * SAQ's own community rating.
 *
 * The review count is always shown, never the score alone: the catalog
 * contains wines rated 100/100 off three reviews, and a bare "100" would read
 * as the best wine in the shop. Thin samples are additionally dimmed so the
 * eye discounts them without having to do the arithmetic.
 */
function rating(wine: Wine): Html | false {
  if (wine.rating === null) return false
  const thin = wine.ratingCount !== null && wine.ratingCount < THIN_SAMPLE
  return html`
    <span class="${thin ? 'rating rating--thin' : 'rating'}">
      <span class="rating-score">${wine.rating}</span>
      <span class="rating-outof">/100</span>
      ${wine.ratingCount !== null && html`<span class="rating-count"> (${wine.ratingCount})</span>`}
    </span>
  `
}

function saqLink(wine: Wine, className: string): Html {
  return html`
    <a class="${className}" href="https://www.saq.com/en/${wine.urlKey}"
       target="_blank" rel="noreferrer">${wine.name}</a>
  `
}

function favourites(rows: readonly Wine[]): Html | false {
  if (rows.length === 0) return false
  return html`
    <section class="favourites-card">
      <div class="favourites-head">
        <span class="favourites-dot" aria-hidden="true"></span>
        <div class="favourites-title">
          ${rows.length === 1 ? 'One of your wines is here' : `${rows.length} of your wines are here`}
        </div>
      </div>
      <div class="favourites-list">
        ${rows.map(wine => html`
          <div class="favourites-row">
            <div class="favourites-body">
              ${saqLink(wine, 'favourites-name')}
              <div class="favourites-stock">${rating(wine)}</div>
            </div>
            <div class="favourites-price">$${wine.price.toFixed(2)}</div>
          </div>
        `)}
      </div>
    </section>
  `
}

function results(rows: readonly ScoredWine[], profile: TasteProfile, total: number): Html | false {
  if (rows.length === 0) return false
  return html`
    <section class="results-section">
      <div class="results-head">
        <div class="label">Best matches here</div>
        <div class="results-count">${rows.length} of ${total} in stock</div>
      </div>
      <div class="results-list">
        ${rows.map((scored, i) => html`
          <div class="results-row" style="--i:${i}">
            <div class="results-rank">${i + 1}</div>
            <div class="results-body">
              <div class="results-name-row">
                ${saqLink(scored.wine, 'results-name')}
                <div class="results-price">$${scored.wine.price.toFixed(2)}</div>
              </div>
              <!--
                No stock line. buildCatalogFilter already pins
                availability_front == 'In store' and store_availability_list ==
                branch, so every row here is in stock at this branch by
                construction, and the header above already says "N of M in
                stock". Replacing the deleted count with "at this branch" would
                just repeat that.
              -->
              <div class="results-stock">${rating(scored.wine)}</div>
              <p class="reason">${describeMatch(scored, profile)}</p>
            </div>
          </div>
        `)}
      </div>
    </section>
  `
}

export class FindPanel extends StoreElement {
  protected sources() {
    // appState for the search itself; cellar so that re-filing a wine reflows
    // the list without another catalog fetch.
    return [appState.subscribe, cellar.subscribe]
  }

  connectedCallback(): void {
    delegate(this, 'click', '[data-find]', (_e, el) => {
      if (el.dataset.find === 'branch') openBranchSheet()
      else if (el.dataset.find === 'filters') openFilterSheet()
    })
    super.connectedCallback()
  }

  protected render(): void {
    const { branch, filters, results: ranked, favourites: favs, catalog, profile } =
      appState.getSnapshot()
    const hidden = cellar.hiddenSkus([...cellar.getSnapshot().refs])

    // Re-filed after a search, the already-rendered rows still hold the wine,
    // so filtering here reflows the list with no further network traffic.
    const visible = ranked.filter(r => !hidden.has(r.wine.sku))
    const visibleFavourites = favs.filter(w => !hidden.has(w.sku))

    mount(this, html`
      <div class="chip-row">
        <button type="button" class="chip chip-branch" data-find="branch">
          <span class="chip-dot" aria-hidden="true"></span>
          <span class="chip-branch-name">${branch ? branchName(branch) : 'Choose a branch'}</span>
          <span class="chip-change">Change</span>
        </button>
        <button type="button" class="chip chip-filter" data-find="filters">
          ${chipSummary(filters)}
        </button>
      </div>
      ${profile && favourites(visibleFavourites)}
      ${profile && results(visible, profile, catalog.length)}
    `)
  }
}
