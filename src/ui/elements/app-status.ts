import { StoreElement, html, mount } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'

/**
 * Transient status and error lines.
 *
 * Takes both stores because the two failure modes are unrelated: appState
 * carries search progress and search failures, while the cellar carries write
 * failures (quota). A user who cannot save is entitled to know before they add
 * twenty wines.
 */
export class AppStatus extends StoreElement {
  protected sources() {
    return [appState.subscribe, cellar.subscribe]
  }

  protected render(): void {
    const { status, error } = appState.getSnapshot()
    const writeError = cellar.getSnapshot().error
    mount(this, html`
      ${status && html`<p class="status">${status}</p>`}
      ${error && html`<p class="error">${error}</p>`}
      ${writeError && html`<p class="error">Could not save to this browser. ${writeError}</p>`}
    `)
  }
}
