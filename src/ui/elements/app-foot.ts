import { StoreElement, html, mount, delegate } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import { transitionTo } from '../../lib/viewTransition'
import { openAddWines } from '../addWines'

/**
 * The pinned footer, whose contents depend on the tab.
 *
 * Task 8 replaces the find-tab button with the prompt box once a search has
 * run.
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
          // Task 8 runs the search here.
          break
      }
    })
    super.connectedCallback()
  }

  protected render(): void {
    const { mode, branch, status } = appState.getSnapshot()
    const liked = cellar.getSnapshot().liked.length

    if (mode === 'wines') {
      mount(this, html`
        <button class="btn-secondary" data-act="add-wines">＋ Add wines</button>
        <button class="btn-primary" data-act="go-find">Find a wine →</button>
      `)
      return
    }

    mount(this, html`
      <button class="btn-primary" data-act="search">Find wines I'd like here</button>
    `)
    // `disabled` is a boolean attribute — present means true whatever the
    // value — so the aria-current trick does not apply, and reaching for
    // raw() to inject an attribute *name* is precisely what raw() is not for.
    // Setting the property on markup this method just rendered is local and
    // cannot be orphaned.
    const button = this.querySelector('button')
    if (button instanceof HTMLButtonElement) {
      // Task 11 replaces this with a real empty state that says why.
      button.disabled = !branch || liked === 0 || status !== ''
    }
  }
}
