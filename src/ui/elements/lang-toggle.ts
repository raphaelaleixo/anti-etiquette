import { StoreElement, html, mount, delegate } from '../dom'
import * as lang from '../../lib/lang'
import type { Lang } from '../../lib/lang'

// EN first, as the design draws it — and as the page itself defaults.
const LANGS: readonly Lang[] = ['en', 'fr']

/**
 * The FR/EN switch.
 *
 * Two buttons rather than one toggle: with two languages a single control has
 * to decide whether its label names the current state or the action, and both
 * readings are wrong half the time. Showing both and marking one is
 * unambiguous, and it is what the design draws.
 *
 * Switching is not free — it moves the catalog store view, which means the
 * saved wines were fetched in the other language and are re-fetched in the
 * background. `lang.setLang` does that; this element only asks.
 */
export class LangToggle extends StoreElement {
  protected sources() {
    return [lang.subscribe]
  }

  connectedCallback(): void {
    this.className = 'langtoggle'
    delegate(this, 'click', 'button[data-lang]', (_e, el) => {
      const next = el.dataset.lang
      if (next === 'en' || next === 'fr') lang.setLang(next)
    })
    super.connectedCallback()
  }

  protected render(): void {
    const current = lang.getLang()
    // A group label, because two two-letter buttons say nothing on their own
    // to anyone who cannot see them sitting together.
    this.setAttribute('role', 'group')
    this.setAttribute('aria-label', lang.t().language)
    mount(this, html`
      ${LANGS.map(l => html`
        <button
          type="button"
          data-lang="${l}"
          class="${l === current ? 'active' : ''}"
          aria-pressed="${l === current ? 'true' : 'false'}"
          lang="${l}"
        >${l.toUpperCase()}</button>
      `)}
    `)
  }
}
