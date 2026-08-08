import { StoreElement, html, mount, delegate, setProp, type Html } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import * as lang from '../../lib/lang'
import { transitionTo } from '../../lib/viewTransition'
import { openAddWines } from '../addWines'
import { openPromptDialog } from '../promptDialog'
import { buildPrompt } from '../../lib/prompt'
import { rankWines } from '../../lib/score'
import { branchName } from '../../lib/branches'
import { runSearch } from '../../lib/search'

/** How many ranked wines to offer the model. 0 means all of them. */
const PROMPT_COUNTS = [20, 40, 0] as const


/**
 * The pinned footer, whose contents depend on the tab and on whether a search
 * has run.
 */
export class AppFoot extends StoreElement {
  protected sources() {
    return [appState.subscribe, cellar.subscribe, lang.subscribe]
  }

  connectedCallback(): void {
    delegate(this, 'click', '[data-act]', (_e, el) => {
      switch (el.dataset.act) {
        case 'go-find':
          transitionTo(() => appState.setMode('find'), 'forward')
          break
        case 'add-wines':
          openAddWines()
          break
        case 'search':
          void runSearch()
          break
        case 'prompt': {
          const branch = appState.getSnapshot().branch
          openPromptDialog({
            build: n => this.#buildPrompt(n),
            total: appState.getSnapshot().search?.catalog.length ?? 0,
            counts: PROMPT_COUNTS,
            count: appState.getSnapshot().promptCount,
            // Kept in appState so the choice survives closing the dialog.
            onCount: n => appState.setPromptCount(n),
          }, branch ? branchName(branch) : lang.t().thisBranch)
          break
        }
      }
    })
    super.connectedCallback()
  }

  #buildPrompt(promptCount: number): string {
    const { search, filters, branch } = appState.getSnapshot()
    const snap = cellar.getSnapshot()
    if (!search) return ''
    const hidden = cellar.hiddenSkus(snap.refs)
    const rankable = search.catalog.filter(w => !hidden.has(w.sku))
    const ranked = rankWines(
      rankable, search.profile, promptCount === 0 ? rankable.length : promptCount)
    return buildPrompt(
      snap.liked,
      snap.disliked,
      ranked.map(r => r.wine),
      branch ? branchName(branch) : '',
      filters,
    )
  }

  #promptBox(): Html {
    return html`
      <span class="foot-note">${lang.t().filingFromHere}</span>
      <button class="btn-secondary" data-act="search">${lang.t().searchAgain}</button>
      <button class="btn-primary" data-act="prompt">${lang.t().askAnAi}</button>
    `
  }

  protected render(): void {
    const { mode, branch, status, search } = appState.getSnapshot()
    const liked = cellar.getSnapshot().liked.length

    if (mode === 'wines') {
      mount(this, html`
        <button class="btn-secondary" data-act="add-wines">${lang.t().addWines}</button>
        <button class="btn-primary" data-act="go-find">${lang.t().goFind}</button>
      `)
      return
    }

    if (search) {
      mount(this, this.#promptBox())
      return
    }

    mount(this, html`
      <button class="btn-primary" data-act="search">${lang.t().searchButton}</button>
    `)
    // `disabled` is a boolean attribute — present means true whatever the
    // value — so it cannot be interpolated. Set on markup just rendered.
    setProp<HTMLButtonElement, 'disabled'>(
      this, 'button', 'disabled', !branch || liked === 0 || status !== '')
  }
}
