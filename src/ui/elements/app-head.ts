import { StoreElement, html, mount, delegate, type Html } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import * as lang from '../../lib/lang'
import { chipSummary } from '../../lib/filters'
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
      if (el.dataset.head === 'branch') openBranchSheet()
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
          <!--
            h2, not h1: the shell already carries a visually hidden h1 naming
            the app, and it is there on both sections. This is the section
            inside it, and its opposite number on Find is the results heading.
          -->
          <h2>${t.myWines}</h2>
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
    // Before a search there is nothing for this bar to scope, and the gate
    // below already carries the same three chips in its "Current scope"
    // panel. Two copies of one fact on one screen is just noise.
    if (!search) return html``
    const hidden = cellar.hiddenSkus(cellar.getSnapshot().refs)
    const shown = search?.results.filter(r => !hidden.has(r.wine.sku)).length ?? 0
    return html`
      <!--
        One chip per thing that can be changed, and each chip is the control.
        There used to be a "Change scope" link beside them that opened the
        branch picker — the same thing the branch chip already did, so it was
        two controls for one action sitting next to each other.
      -->
      <div class="scopebar">
        <div class="scopebar-chips">
          <!--
            The visible text is the current value, which is what someone
            scanning the bar needs. On its own it does not say that pressing it
            changes anything — "Rosemont" is a place, not an action — so each
            chip is labelled with the verb and keeps the value after it.
          -->
          <button type="button" class="scopechip" data-head="branch"
                  aria-label="${t.changeBranchTo(branch ? branchName(branch) : t.chooseBranch)}">
            ${branch ? branchName(branch) : t.chooseBranch}
          </button>
          <button type="button" class="scopechip" data-head="filters"
                  aria-label="${t.changeFiltersFrom(chipSummary(filters))}">
            ${chipSummary(filters)}
          </button>
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
  }
}
