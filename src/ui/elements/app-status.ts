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

  /**
   * The live region is the host, not anything below it.
   *
   * `mount` assigns innerHTML, so every child of this element is destroyed and
   * rebuilt on each store change. A region declared down there would be a new
   * node each time — and a live region that did not exist before its content
   * did is not reliably announced. The host is the only node here that
   * survives a render, so the announcement belongs on it.
   *
   * Polite rather than assertive. Everything this element says follows
   * something the reader just did, so it can wait for a gap instead of cutting
   * across whatever is being read. Not atomic, so a changed line is spoken on
   * its own rather than re-reading the bar.
   */
  connectedCallback(): void {
    this.setAttribute('aria-live', 'polite')
    this.setAttribute('aria-atomic', 'false')
    super.connectedCallback()
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

        aria-live="off" because it would otherwise inherit the polite region on
        the host: nine pages announced one by one, over the top of the status
        line that already says what is happening. The bar stays readable on
        demand; it just stops interrupting to say so.
      -->
      ${progress && html`
        <div class="progress" role="progressbar" aria-live="off"
             aria-label="${lang.t().fetchingCatalog}"
             aria-valuenow="${progress.done}" aria-valuemin="0"
             aria-valuemax="${progress.total}">
          <div class="progress-fill" style="scale:${progress.done / progress.total} 1"></div>
        </div>
      `}
    `)
  }
}
