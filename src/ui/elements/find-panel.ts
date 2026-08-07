import { StoreElement, html, mount, delegate, money, type Html } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import { productUrl } from '../../lib/catalog'
import * as lang from '../../lib/lang'
import { describeMatch } from '../../lib/reasons'
import { branchName, BRANCHES } from '../../lib/branches'
import { colourLabel, priceLabel } from '../../lib/filters'
import { runSearch } from '../../lib/search'
import { openBranchSheet } from '../branchSheet'
import { openFilterSheet } from '../filterSheet'
import { openAddWines } from '../addWines'
import type { ScoredWine, TasteProfile, Wine } from '../../lib/types'

/** Said on the gate, because "which shop" is the question it is asking. */
const BRANCH_COUNT = BRANCHES.length

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
function rating(wine: Wine): Html {
  const t = lang.t()
  if (wine.rating === null) return html`<span class="rating rating--none">${t.noRating}</span>`
  const thin = wine.ratingCount !== null && wine.ratingCount < THIN_SAMPLE
  return html`
    <span class="${thin ? 'rating rating--thin' : 'rating'}">
      <span class="rating-score">${t.ratingOf(wine.rating)}</span>
      ${wine.ratingCount !== null && html`
        <span class="rating-count">
          ${thin ? t.fromFewReviews(wine.ratingCount) : t.fromReviews(wine.ratingCount)}
        </span>
      `}
    </span>
  `
}

/** Region, country and grapes — the facts, under the reason that used them. */
function provenance(wine: Wine): string {
  const place = [wine.region, wine.country].filter(Boolean).join(', ')
  const grapes = wine.grapes.join(', ')
  return [place, grapes].filter(Boolean).join(' · ')
}

function saqLink(wine: Wine, className: string): Html {
  // productUrl carries the language prefix, so a link cannot point at the
  // English page while the row beside it shows French data.
  return html`
    <a class="${className}" href="${productUrl(wine.urlKey)}"
       target="_blank" rel="noreferrer">${wine.name}</a>
  `
}

function favourites(rows: readonly Wine[]): Html | false {
  if (rows.length === 0) return false
  return html`
    <section class="favourites-card">
      <div class="favourites-head">
        <div class="favourites-title">${lang.t().alsoHere}</div>
        <p class="hint">${lang.t().alsoHereNote}</p>
      </div>
      <div class="favourites-list">
        ${rows.map(wine => html`
          <div class="favourites-row">
            <div class="favourites-body">
              ${saqLink(wine, 'favourites-name')}
              <div class="favourites-stock">${rating(wine)}</div>
            </div>
            <div class="favourites-price">${money(wine.price)}</div>
          </div>
        `)}
      </div>
    </section>
  `
}

function results(
  rows: readonly ScoredWine[], profile: TasteProfile, total: number, seedCount: number,
): Html | false {
  if (rows.length === 0) return false
  return html`
    <section class="results-section">
      <div class="results-head">
        <div class="results-title">
          ${lang.t().bestMatches}
          <span class="results-against">${lang.t().rankedAgainst(seedCount)}</span>
        </div>
        <div class="results-count">${lang.t().resultCount(rows.length, total)}</div>
      </div>
      <div class="results-list">
        ${rows.map((scored, i) => html`
          <div class="results-row" style="--i:${i}" data-sku="${scored.wine.sku}">
            <!-- A quiet ordinal, not a score. There is no score worth publishing. -->
            <div class="results-rank">${i + 1}</div>
            <div class="results-body">
              <!--
                The reason leads. It is the only thing on this row that could
                not be copied off a price tag, and it is the product's claim to
                being useful rather than arbitrary.
              -->
              <p class="reason">${describeMatch(scored, profile)}</p>
              <div class="results-name-row">
                ${saqLink(scored.wine, 'results-name')}
                <div class="results-meta">${provenance(scored.wine)}</div>
              </div>
              <div class="results-stock">${rating(scored.wine)}</div>
            </div>
            <!--
              Price and the two exclusions share a rail: both are things you do
              with the bottle rather than reasons to want it.
            -->
            <div class="results-side">
              <div class="results-price">${money(scored.wine.price)}</div>
              <div class="results-actions">
                <button type="button" class="results-act" data-find="less"
                        data-sku="${scored.wine.sku}">${lang.t().lessLikeThis}</button>
                <button type="button" class="results-act" data-find="hide"
                        data-sku="${scored.wine.sku}">${lang.t().hide}</button>
              </div>
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
    return [appState.subscribe, cellar.subscribe, lang.subscribe]
  }

  connectedCallback(): void {
    delegate(this, 'click', '[data-find]', (_e, el) => {
      if (el.dataset.find === 'branch') openBranchSheet()
      else if (el.dataset.find === 'search') void runSearch()
      else if (el.dataset.find === 'filters') openFilterSheet()
      else if (el.dataset.find === 'add') openAddWines()
      else if (el.dataset.find === 'prompt') {
        // The footer owns assembling the prompt (it has the count control), so
        // this asks it rather than building a second copy of that logic.
        document.querySelector<HTMLElement>('app-foot')
          ?.querySelector<HTMLButtonElement>('[data-act="prompt"]')?.click()
      }
      else if (el.dataset.find === 'less' || el.dataset.find === 'hide') {
        const sku = el.dataset.sku
        const wine = appState.getSnapshot().search?.results
          .find(r => r.wine.sku === sku)?.wine
        // There is no "more like this" here on purpose: the profile is built
        // from wines the visitor has actually drunk, and filing a suggestion
        // as liked would feed the ranking its own output.
        if (wine) cellar.saveWine(wine, el.dataset.find === 'less' ? 'dislike' : 'skip')
      }
    })
    super.connectedCallback()
  }

  /**
   * What is missing before a search can run, said plainly.
   *
   * The React app showed a disabled button and nothing else, so a first
   * visitor saw a dead control with no way to learn what it wanted.
   *
   * Both requirements are always named and always in the same order, with the
   * satisfied one marked. Listing only what is wrong never tells anyone what
   * "right" looks like, and reordering the pair as they are met would make the
   * screen jump under the reader.
   */
  #requirement(met: boolean, name: string, note: string): Html {
    return html`
      <div class="${met ? 'gate-req is-met' : 'gate-req is-open'}">
        <span class="gate-mark" aria-hidden="true">${met ? '✓' : ''}</span>
        <div class="gate-body">
          <div class="gate-name">${name}</div>
          <div class="gate-note">${note}</div>
        </div>
      </div>
    `
  }

  /**
   * The gate, shown whenever there is nothing to show instead.
   *
   * It used to bow out the moment both requirements were met, which left the
   * commonest state in the app — wines saved, branch chosen, search not yet
   * run — rendering literally nothing. A blank page is not a neutral outcome;
   * it reads as broken. The requirements are the same cards either way, and
   * when both are satisfied the screen says so and offers the search.
   */
  #emptyState(likedCount: number, branch: string, searched: boolean): Html | false {
    if (searched) return false
    const t = lang.t()
    const { filters } = appState.getSnapshot()
    const noWines = likedCount === 0
    const ready = likedCount > 0 && branch !== ''
    const title = ready ? t.gateReadyTitle
      : noWines ? t.emptyNoWinesTitle
      : t.emptyNoBranchTitle
    const note = ready ? t.gateReadyNote
      : noWines ? t.emptyNoWinesNote
      : `${t.onlyBottlesHeld} ${t.montrealOnly(BRANCH_COUNT)}`
    return html`
      <div class="find-gate">
      <section class="find-empty">
        <h2>${title}</h2>
        <div class="gate-reqs">
          ${this.#requirement(
            !noWines,
            t.reqWines(lang.kindLabel('like')),
            noWines ? t.reqWinesOpen : t.reqWinesMet(likedCount))}
          ${this.#requirement(
            branch !== '',
            t.reqBranch,
            branch ? t.reqBranchMet(branchName(branch)) : t.reqBranchOpen)}
        </div>
        <p class="hint">${note}</p>

        <!--
          What the search would run with, as it stands. Stated here because
          the filters carry over from last time and are otherwise invisible
          until after a search has already used them.
        -->
        <div class="scopepanel">
          <div class="label">${t.currentScope}</div>
          <div class="scopepanel-chips">
            <span class="${branch ? 'scopechip' : 'scopechip scopechip--open'}">
              ${branch ? branchName(branch) : t.noBranch}
            </span>
            <span class="scopechip">${colourLabel(filters.colour)}</span>
            <span class="scopechip">${priceLabel(filters)}</span>
            <button type="button" class="scopelink" data-find="filters">${t.changeFilters}</button>
          </div>
        </div>
        <!-- The action belongs to the requirement that is missing — or, when
             nothing is missing, to the thing that has not happened yet. -->
        ${ready
          ? html`<button type="button" class="btn-primary" data-find="search">${t.searchButton}</button>`
          : noWines
          ? html`<button type="button" class="btn-primary" data-find="add">${t.addWines}</button>`
          : html`<button type="button" class="btn-primary" data-find="branch">${t.chooseBranch}</button>`}
      </section>
      <!--
        Only when the branch is the missing piece. Someone with no wines yet
        has a different next step, and offering them a shop to stand in first
        would be answering a question they have not reached.

        Hidden below the desktop breakpoint, where the sheet is the right
        shape — so the button above stays the way in on a phone.
      -->
      ${!noWines && !ready && html`<branch-panel></branch-panel>`}
      </div>
    `
  }

  protected render(): void {
    const { branch, search } = appState.getSnapshot()
    const hidden = cellar.hiddenSkus(cellar.getSnapshot().refs)
    const likedCount = cellar.getSnapshot().liked.length

    // Re-filed after a search, the already-rendered rows still hold the wine,
    // so filtering here reflows the list with no further network traffic.
    const visible = search?.results.filter(r => !hidden.has(r.wine.sku)) ?? []
    const visibleFavourites = search?.favourites.filter(w => !hidden.has(w.sku)) ?? []

    // The scope chips live in <app-head> now, where the design puts them: one
    // bar saying where you are, above everything it applies to. Results take
    // the main column; what is not the ranking sits beside it.
    mount(this, html`
      ${this.#emptyState(likedCount, branch, search !== null && search !== undefined)}
      ${search && html`
        <div class="find-grid">
          <div class="find-main">
            ${results(visible, search.profile, search.catalog.length, likedCount)}
          </div>
          <aside class="find-side">
            ${favourites(visibleFavourites)}
            <button type="button" class="btn-primary" data-find="prompt">
              ${lang.t().askAnAi}
            </button>
          </aside>
        </div>
      `}
    `)
  }
}
