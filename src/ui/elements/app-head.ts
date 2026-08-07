import { StoreElement, html, mount, delegate, type Html } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import * as lang from '../../lib/lang'
import { chipSummary, colourLabel, priceLabel } from '../../lib/filters'
import { branchName } from '../../lib/branches'
import { openBranchSheet } from '../branchSheet'
import { openFilterSheet } from '../filterSheet'

/**
 * The row under the top bar: what this page is, and what acts on all of it.
 *
 * Two quite different things share the slot, because they occupy the same
 * position in the design and answer the same question — "what am I looking at,
 * and what can I do to the whole of it".
 *
 * On My wines that is a title, a count, and the backup actions. On Find a wine
 * it is the current scope — branch and filters, as chips that open their
 * sheets — and how much of the shelf survived them.
 */
export class AppHead extends StoreElement {
  protected sources() {
    return [appState.subscribe, cellar.subscribe, lang.subscribe]
  }

  connectedCallback(): void {
    delegate(this, 'click', '[data-head]', (_e, el) => {
      if (el.dataset.head === 'branch' || el.dataset.head === 'scope') openBranchSheet()
      else if (el.dataset.head === 'filters') openFilterSheet()
    })
    super.connectedCallback()
  }

  #wines(): Html {
    const t = lang.t()
    const snap = cellar.getSnapshot()
    return html`
      <div class="pagehead">
        <div class="pagehead-title">
          <h1>${t.myWines}</h1>
          <span class="pagehead-sub">${t.savedShaping(snap.entries.length, snap.liked.length)}</span>
        </div>
        <div class="pagehead-actions">
          <button type="button" class="ghostbtn" data-act="export">${t.exportBackup}</button>
          <button type="button" class="ghostbtn" data-act="import">${t.importShort}</button>
        </div>
      </div>
    `
  }

  #find(): Html {
    const t = lang.t()
    const { branch, filters, search } = appState.getSnapshot()
    const hidden = cellar.hiddenSkus(cellar.getSnapshot().refs)
    const shown = search?.results.filter(r => !hidden.has(r.wine.sku)).length ?? 0
    return html`
      <div class="scopebar">
        <div class="scopebar-chips">
          <button type="button" class="scopechip is-set" data-head="branch">
            ${branch ? branchName(branch) : t.chooseBranch}
          </button>
          <button type="button" class="scopechip" data-head="filters">
            ${colourLabel(filters.colour)}
          </button>
          <button type="button" class="scopechip" data-head="filters">
            ${priceLabel(filters)}
          </button>
          <button type="button" class="scopelink" data-head="scope">${t.changeScope}</button>
        </div>
        ${search && html`
          <div class="scopebar-count">${t.resultCount(shown, search.catalog.length)}</div>
        `}
      </div>
    `
  }

  protected render(): void {
    // Nothing is saved yet: the first-run screen carries its own heading, and a
    // title row above it would be two headings arguing.
    if (appState.getSnapshot().mode === 'wines'
        && cellar.getSnapshot().entries.length === 0) {
      mount(this, html``)
      return
    }
    mount(this, appState.getSnapshot().mode === 'wines' ? this.#wines() : this.#find())
    void chipSummary
  }
}
