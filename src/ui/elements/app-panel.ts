import { StoreElement, html, mount } from '../dom'
import * as appState from '../../lib/appState'

/**
 * The body, swapped by tab.
 *
 * Switching modes tears this subtree down and rebuilds it, which is exactly
 * why the sections inside subscribe for themselves: a central registry would
 * have to unsubscribe here by hand on every switch, and the leak it caused
 * would be invisible.
 *
 */
export class AppPanel extends StoreElement {
  protected sources() {
    return [appState.subscribe]
  }

  protected render(): void {
    const { mode } = appState.getSnapshot()
    mount(this, mode === 'wines'
      ? html`<div class="panel" data-panel="wines"><my-wines></my-wines></div>`
      : html`<div class="panel" data-panel="find"><find-panel></find-panel></div>`)
  }
}
