import { StoreElement, html, mount, delegate, money, closePopoverFrom, type Html } from '../dom'
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
import { KINDS, type ScoredWine, type TasteProfile, type Wine } from '../../lib/types'

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

/**
 * Wines from your own list that this branch is holding.
 *
 * Above the ranking, because a bottle you have already liked is a better bet
 * than a bottle the app is guessing at, and saying so is more honest than
 * burying it. Collapsed, because the ranking is still what this screen is for
 * — the count in the summary is the part that carries the value, and opening
 * it is one press.
 *
 * It used to sit in a rail beside the results, which put it *below* all ten of
 * them on a phone. Nobody scrolls past ten wine cards to find the good news.
 */
function favourites(rows: readonly Wine[]): Html | false {
  if (rows.length === 0) return false
  return html`
    <details class="favourites-card">
      <summary class="favourites-head">
        <span class="favourites-title">${lang.t().alsoHere(rows.length)}</span>
        <span class="hint">${lang.t().alsoHereNote}</span>
      </summary>
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
    </details>
  `
}

/**
 * All three groups, on a wine you have not saved yet.
 *
 * The rows used to offer only "less" and "hide", on the reasoning that filing
 * a recommendation as liked feeds the ranking its own output. That holds for a
 * bottle you have never tried — but plenty of results are wines you have drunk
 * and simply never got round to adding, and for those the omission just left
 * you unable to say the true thing. So all three are here, and the menu says
 * what filing one means rather than leaving it to be guessed.
 */
function fileMenu(wine: Wine): Html {
  const t = lang.t()
  const id = `file-${wine.sku}`
  return html`
    <button type="button" class="results-menu-btn" popovertarget="${id}"
            aria-label="${t.fileThisWine(wine.name)}">⋮</button>
    <div id="${id}" popover="auto" class="wine-menu">
      <div class="wine-menu-head">
        ${wine.name}
        <span class="wine-menu-note">${t.fileIfDrunk}</span>
      </div>
      ${KINDS.map(k => html`
        <button type="button" class="wine-menu-item" data-find="file"
                data-kind="${k}" data-sku="${wine.sku}">
          <span class="wine-menu-tick wine-menu-dot wine-menu-dot--${k}" aria-hidden="true"></span>
          ${k === 'skip' ? t.justHideIt : lang.kindLabel(k)}
        </button>
      `)}
    </div>
  `
}

function results(
  rows: readonly ScoredWine[], profile: TasteProfile, seedCount: number,
): Html | false {
  if (rows.length === 0) return false
  return html`
    <section class="results-section">
      <div class="results-head">
        <div class="results-title">
          ${lang.t().bestMatches}
          <span class="results-against">${lang.t().rankedAgainst(seedCount)}</span>
        </div>
      </div>
      <div class="results-list">
        ${rows.map((scored, i) => html`
          <div class="results-row" style="--i:${i}" data-sku="${scored.wine.sku}">
            <!-- A quiet ordinal, not a score. There is no score worth publishing. -->
            <div class="results-rank">${i + 1}</div>
            <div class="results-body">
              <!--
                The name leads. You are standing in front of a shelf matching
                what is on the row against what is on the bottle, and the
                reason is what you read once the label has matched.
              -->
              <div class="results-name-row">
                ${saqLink(scored.wine, 'results-name')}
                <div class="results-meta">${provenance(scored.wine)}</div>
              </div>
              <!--
                Still the only thing here that could not be copied off a price
                tag, and still the product's claim to being useful rather than
                arbitrary — it just no longer outranks the bottle it explains.
              -->
              <p class="reason">${describeMatch(scored, profile)}</p>
              <div class="results-stock">${rating(scored.wine)}</div>
            </div>
            <div class="results-side">
              <div class="results-price">${money(scored.wine.price)}</div>
              ${fileMenu(scored.wine)}
            </div>
          </div>
        `)}
      </div>
      <!--
        Said before the gap is met rather than after. The count is the branch's,
        not ours, and a bottle their system believes in can still be misplaced —
        which is a thing to have been told in advance rather than discovered in
        an aisle. The link is the way to the authoritative number, on the page
        that actually holds it.
      -->
      <p class="results-footnote">
        <strong>${lang.t().notOnShelfTitle}</strong> ${lang.t().notOnShelfNote}
      </p>
    </section>
  `
}

export class FindPanel extends StoreElement {
  /** Whether the scope column is showing the filters rather than the branches. */
  #changingFilters = false

  protected sources() {
    // appState for the search itself; cellar so that re-filing a wine reflows
    // the list without another catalog fetch.
    return [appState.subscribe, cellar.subscribe, lang.subscribe]
  }

  connectedCallback(): void {
    // Applying hands the column back. Running the search is the filter panel's
    // own business — doing it here as well would search twice.
    this.addEventListener('filters-done', () => { this.#changingFilters = false })
    delegate(this, 'click', '[data-find]', (_e, el) => {
      if (el.dataset.find === 'branch') this.#goToBranchPicker()
      else if (el.dataset.find === 'search') void runSearch()
      else if (el.dataset.find === 'filters') this.#goToFilters()
      else if (el.dataset.find === 'add') openAddWines()
      else if (el.dataset.find === 'prompt') {
        // The footer owns assembling the prompt (it has the count control), so
        // this asks it rather than building a second copy of that logic.
        document.querySelector<HTMLElement>('app-foot')
          ?.querySelector<HTMLButtonElement>('[data-act="prompt"]')?.click()
      }
      else if (el.dataset.find === 'file') {
        const kind = el.dataset.kind
        if (kind !== 'like' && kind !== 'dislike' && kind !== 'skip') return
        const wine = appState.getSnapshot().search?.results
          .find(r => r.wine.sku === el.dataset.sku)?.wine
        // Hide before mutating: saveWine publishes, which re-renders this
        // section and destroys the popover's own node mid-handler.
        closePopoverFrom(el)
        if (wine) cellar.saveWine(wine, kind)
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
  /**
   * The scope column, if this screen is currently showing one.
   *
   * Asked of the DOM rather than of the viewport: the column is hidden by the
   * stylesheet, so reading the page cannot drift out of step with it the way a
   * breakpoint copied into JavaScript would.
   *
   * One question, one answer, for both pickers. Asking it separately in each
   * handler is what let them disagree: the branch one looked for its own
   * element rather than for the column, so once the filters had taken the
   * column over there was no branch panel to find and it opened a sheet on top
   * of one that was already there.
   */
  #scopeColumn(): HTMLElement | null {
    const el = this.querySelector<HTMLElement>('branch-panel, filter-panel')
    return el !== null && el.offsetParent !== null ? el : null
  }

  /**
   * Take the visitor to the branch picker, whichever one this screen has.
   *
   * A phone gets the sheet: one-handed, thumb-reachable, dismissible. A wide
   * screen has the list on the page beside the gate, so a modal over it would
   * be a second copy of a control that is already there.
   */
  #goToBranchPicker(): void {
    if (this.#scopeColumn() === null) {
      openBranchSheet()
      return
    }
    // The column may be showing the filters. Hand it back first.
    if (this.#changingFilters) {
      this.#changingFilters = false
      this.render()
    }
    const panel = this.querySelector<HTMLElement>('branch-panel')
    panel?.scrollIntoView({ block: 'nearest' })
    panel?.querySelector<HTMLInputElement>('[data-branch-q]')?.focus()
  }

  /**
   * Show the filters wherever this screen can show them.
   *
   * Same fork as the branch picker, and asked the same way: whether the scope
   * column is actually rendering, not how wide the window is. Toggling rather
   * than opening, because a panel that took over the column with no way back
   * would stand between the visitor and the branch list.
   */
  #goToFilters(): void {
    if (this.#scopeColumn() === null) {
      openFilterSheet()
      return
    }
    this.#changingFilters = !this.#changingFilters
    this.render()
  }

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
    // The picker stays on the page for the whole of the gate, not just while
    // the branch is missing — on a wide screen it is how the branch gets
    // changed, so taking it away once answered is what created a dead end.
    const panelShown = !noWines
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
        <!--
          A row per thing that can be changed, rather than one run of chips.
          A deviation from the frame, which puts all four on one line: with a
          branch name and two filter values the row wrapped anyway, and where
          it wrapped had nothing to do with what the chips meant.
        -->
        <div class="scopepanel">
          <div class="label">${t.currentScope}</div>
          <div class="scopepanel-row">
            <span class="scopepanel-key">${t.scopeBranch}</span>
            <span class="${branch ? 'scopechip' : 'scopechip scopechip--open'}">
              ${branch ? branchName(branch) : t.noBranch}
            </span>
            <button type="button" class="scopelink" data-find="branch">${t.change}</button>
          </div>
          <div class="scopepanel-row">
            <span class="scopepanel-key">${t.scopeFilters}</span>
            <span class="scopechip">${colourLabel(filters.colour)}</span>
            <span class="scopechip">${priceLabel(filters)}</span>
            <button type="button" class="scopelink" data-find="filters">${t.change}</button>
          </div>
        </div>
        <!-- The action belongs to the requirement that is missing — or, when
             nothing is missing, to the thing that has not happened yet. -->
        ${ready
          ? false
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
      <!--
        One column, two things it can be showing. The branch list by default;
        the filters while they are being changed, because the design puts both
        on the page at this width rather than over it.
      -->
      ${panelShown && (this.#changingFilters
        ? html`<filter-panel></filter-panel>`
        : html`<branch-panel></branch-panel>`)}
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
          ${favourites(visibleFavourites)}
          ${results(visible, search.profile, likedCount)}
        </div>
      `}
    `)
  }
}
