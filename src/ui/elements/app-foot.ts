import { StoreElement, html, mount, delegate, type Html } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import { transitionTo } from '../../lib/viewTransition'
import { openAddWines } from '../addWines'
import { openPromptDialog } from '../promptDialog'
import { buildPrompt } from '../../lib/prompt'
import { rankWines } from '../../lib/score'
import { branchName } from '../../lib/branches'
import { runSearch } from '../../lib/search'

/** How many ranked wines to offer the model. 0 means all of them. */
export const PROMPT_COUNTS = [20, 40, 0] as const

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * The pinned footer, whose contents depend on the tab and on whether a search
 * has run.
 */
export class AppFoot extends StoreElement {
  protected sources() {
    return [appState.subscribe, cellar.subscribe]
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
        case 'prompt':
          openPromptDialog(this.#buildPrompt(), appState.getSnapshot().catalog.length)
          break
        case 'prompt-count':
          appState.setPromptCount(Number(el.dataset.count))
          break
      }
    })
    super.connectedCallback()
  }

  #buildPrompt(): string {
    const { catalog, profile, promptCount, filters, branch } = appState.getSnapshot()
    const snap = cellar.getSnapshot()
    if (!profile) return ''
    const hidden = cellar.hiddenSkus([...snap.refs])
    const rankable = catalog.filter(w => !hidden.has(w.sku))
    const ranked = rankWines(rankable, profile, promptCount === 0 ? rankable.length : promptCount)
    return buildPrompt(
      [...snap.liked],
      [...snap.disliked],
      ranked.map(r => r.wine),
      branch ? branchName(branch) : '',
      filters,
    )
  }

  #promptBox(): Html {
    const { promptCount } = appState.getSnapshot()
    const length = this.#buildPrompt().length
    return html`
      <div class="prompt-actions">
        <button class="btn-primary" data-act="prompt">
          Prompt <span class="btn-note">${formatCount(length)}</span>
        </button>
        <div class="prompt-include">
          <span>Include</span>
          <div class="prompt-include-seg" data-active="${PROMPT_COUNTS.indexOf(promptCount as 20 | 40 | 0)}">
            ${PROMPT_COUNTS.map(n => html`
              <button
                type="button" class="${promptCount === n ? 'active' : ''}"
                data-act="prompt-count" data-count="${n}"
              >${n === 0 ? 'All' : n}</button>
            `)}
          </div>
        </div>
      </div>
    `
  }

  protected render(): void {
    const { mode, branch, status, searched, profile } = appState.getSnapshot()
    const liked = cellar.getSnapshot().liked.length

    if (mode === 'wines') {
      mount(this, html`
        <button class="btn-secondary" data-act="add-wines">＋ Add wines</button>
        <button class="btn-primary" data-act="go-find">Find a wine →</button>
      `)
      return
    }

    if (searched && profile) {
      mount(this, this.#promptBox())
      return
    }

    mount(this, html`
      <button class="btn-primary" data-act="search">Find wines I'd like here</button>
    `)
    // `disabled` is a boolean attribute — present means true whatever the
    // value — so it cannot be interpolated. Set on markup just rendered.
    const button = this.querySelector('button')
    if (button instanceof HTMLButtonElement) {
      // Task 11 replaces this with a real empty state that says why.
      button.disabled = !branch || liked === 0 || status !== ''
    }
  }
}
