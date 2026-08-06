import { StoreElement, html, mount, delegate } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import * as lang from '../../lib/lang'
import { transitionTo } from '../../lib/viewTransition'
import type { Mode } from '../../lib/appState'

/**
 * The two-segment tab switch.
 *
 * The sliding pill is a ::before on the track rather than a DOM node — it is
 * purely decorative, so it stays out of the accessibility tree. Its position
 * comes from `data-mode`; with two equal-width segments that is arithmetic, so
 * nothing has to be measured.
 */
export class ModeSwitch extends StoreElement {
  protected sources() {
    // The count comes from the cellar, the selected tab from appState, so this
    // element genuinely needs both.
    return [appState.subscribe, cellar.subscribe, lang.subscribe]
  }

  connectedCallback(): void {
    this.className = 'modeswitch'
    this.setAttribute('role', 'navigation')
    this.setAttribute('aria-label', 'Section')
    delegate(this, 'click', 'button[data-mode]', (_e, el) => {
      const next = el.dataset.mode as Mode
      const current = appState.getSnapshot().mode
      if (next === current) return
      // No flush needed: setMode publishes synchronously, so by the time this
      // callback returns the DOM already holds the new view for the browser's
      // second snapshot.
      transitionTo(() => appState.setMode(next), next === 'find' ? 'forward' : 'backward')
    })
    super.connectedCallback()
  }

  protected render(): void {
    const { mode } = appState.getSnapshot()
    const count = cellar.getSnapshot().liked.length
    this.setAttribute('data-mode', mode)
    // aria-current="false" is spec-valid and means exactly "not current", so
    // the attribute can always be present and carry an interpolated value —
    // no need to interpolate the attribute *name*, which is what would drag
    // raw() into a place it does not belong.
    //
    // The token is spelled out rather than interpolating the boolean: `false`
    // renders as empty by design here (so `${cond && html`…`}` reads the way
    // it looks), and aria-current="" is not one of the spec's tokens.
    const current = (m: Mode) => (mode === m ? 'true' : 'false')
    mount(this, html`
      <button
        data-mode="wines"
        class="${mode === 'wines' ? 'active' : ''}"
        aria-current="${current('wines')}"
      >${lang.t().myWinesTab(count)}</button>
      <button
        data-mode="find"
        class="${mode === 'find' ? 'active' : ''}"
        aria-current="${current('find')}"
      >${lang.t().findTab}</button>
    `)
  }
}
