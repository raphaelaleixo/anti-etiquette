import { StoreElement, html, mount } from '../dom'
import * as appState from '../../lib/appState'
import * as cellar from '../../lib/cellar'
import * as lang from '../../lib/lang'

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
    return [appState.subscribe, cellar.subscribe, lang.subscribe]
  }

  protected render(): void {
    const { status, error, progress } = appState.getSnapshot()
    const writeError = cellar.getSnapshot().error
    mount(this, html`
      ${(status || error || writeError) && html`
        <div class="statusbar">
          ${status && html`<p class="status">${status}</p>`}
          ${error && html`<p class="error">${error}</p>`}
          ${writeError && html`<p class="error">${lang.t().couldNotSave} ${writeError}</p>`}
        </div>
      `}
      <!--
        A catalog fetch is several seconds and several pages, so the bar
        reports real progress rather than spinning. It is a progressbar with
        its bounds set, not a decorated div: a screen reader gets "page 3 of 9"
        from the same numbers the fill is drawn from.
      -->
      ${progress && html`
        <div class="progress" role="progressbar"
             aria-valuenow="${progress.done}" aria-valuemin="0"
             aria-valuemax="${progress.total}">
          <div class="progress-fill" style="scale:${progress.done / progress.total} 1"></div>
        </div>
      `}
    `)
  }
}
