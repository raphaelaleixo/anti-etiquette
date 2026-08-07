import { StoreElement } from '../dom'
import { mountFilterPanel } from '../filterSheet'
import * as lang from '../../lib/lang'

/**
 * The filters, on the page rather than over it.
 *
 * The design says it in as many words: both pickers stay sheets on a phone —
 * one-handed, thumb-reachable, dismissible — and on a desktop they are inline
 * panels. This is the second half of that, the branch list being the first.
 *
 * It shares every control with the sheet; only the housing differs. Applying
 * runs the search, so this element's whole job ends there and the column it
 * sits in goes back to showing the branch list.
 */
export class FilterPanel extends StoreElement {
  protected sources() {
    // Language only, and deliberately not appState: setFilters is exactly what
    // this element does last, and re-rendering on it would tear the controls
    // down underneath the press that applied them.
    return [lang.subscribe]
  }

  connectedCallback(): void {
    this.className = 'filterpanel'
    super.connectedCallback()
  }

  protected render(): void {
    mountFilterPanel(this, () => {
      this.dispatchEvent(new CustomEvent('filters-done', { bubbles: true }))
    })
  }
}
