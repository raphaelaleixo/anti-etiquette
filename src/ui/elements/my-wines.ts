import { StoreElement, html, mount, delegate, type Html } from '../dom'
import * as cellar from '../../lib/cellar'
import type { CellarEntry } from '../../lib/cellar'
import { KIND_LABEL, KINDS, type SeedKind } from '../../lib/types'

/**
 * The saved list: three groups, a per-row action menu, and nothing else.
 *
 * Adding happens in the add-wines sheet from the footer, so this only ever
 * displays, re-files and removes.
 *
 * Rows are plain markup rather than custom elements. Per-row elements were
 * considered — they would let one wine re-render without the list — but every
 * re-file moves a wine *between* groups, so the parent has to re-render
 * anyway, and the row elements would be destroyed and re-upgraded on each
 * pass for nothing. A list of tens of rows rebuilds in well under a frame.
 */

const KIND_CLASS: Record<SeedKind, string> = {
  like: 'liked',
  dislike: 'disliked',
  skip: 'skipped',
}

/**
 * Close the popover a click came from, if any.
 *
 * Guarded because the Popover API is absent in some engines and in the test
 * DOM, and because hidePopover() throws when the popover is not showing.
 */
function closePopoverFrom(el: Element): void {
  const popover = el.closest('[popover]')
  if (!(popover instanceof HTMLElement)) return
  if (typeof popover.hidePopover !== 'function') return
  try {
    popover.hidePopover()
  } catch {
    // Already hidden. Nothing to do, and nothing worth reporting.
  }
}

function menu(entry: CellarEntry, name: string): Html {
  const id = `wine-menu-${entry.sku}`
  return html`
    <button class="mywines-menu-btn" popovertarget="${id}" aria-label="Actions for ${name}">⋮</button>
    <div id="${id}" popover="auto" class="wine-menu">
      <div class="wine-menu-head">${name}</div>
      ${KINDS.map(k => html`
        <button
          type="button"
          class="wine-menu-item"
          data-act="set-kind"
          data-sku="${entry.sku}"
          data-kind="${k}"
          aria-pressed="${k === entry.kind ? 'true' : 'false'}"
        >
          <span class="wine-menu-tick" aria-hidden="true">${k === entry.kind ? '✓' : ''}</span>
          ${KIND_LABEL[k]}
        </button>
      `)}
      <button
        type="button"
        class="wine-menu-item wine-menu-item--danger"
        data-act="remove"
        data-sku="${entry.sku}"
      >
        <span class="wine-menu-tick" aria-hidden="true"></span>
        Remove from my wines
      </button>
    </div>
  `
}

function row(entry: CellarEntry, index: number): Html {
  const wine = entry.wine
  // `--i` drives the per-row stagger in styles.css.
  const stagger = `--i:${index}`

  if (wine === null) {
    // The replacement for "Loading N more…", which in the React app was shown
    // for a SKU that could never resolve — invisible, permanent, and with no
    // way to remove it. This row is explicit and removable.
    return html`
      <li class="mywines-row mywines-row--unresolved" style="${stagger}">
        <span class="mywines-rule" aria-hidden="true"></span>
        <div class="mywines-body">
          <div class="mywines-name">SKU ${entry.sku}</div>
          <div class="mywines-region">couldn't look this up</div>
        </div>
        <button
          type="button"
          class="mywines-menu-btn"
          data-act="remove"
          data-sku="${entry.sku}"
          aria-label="Remove SKU ${entry.sku}"
        >✕</button>
      </li>
    `
  }

  return html`
    <li class="mywines-row mywines-row--${KIND_CLASS[entry.kind]}" style="${stagger}">
      <span class="mywines-rule" aria-hidden="true"></span>
      <div class="mywines-body">
        <div class="mywines-name">${wine.name}</div>
        ${wine.region && html`<div class="mywines-region">${wine.region}</div>`}
      </div>
      ${menu(entry, wine.name)}
    </li>
  `
}

function list(entries: CellarEntry[]): Html {
  return html`<ul class="mywines">${entries.map(row)}</ul>`
}

export class MyWines extends StoreElement {
  protected sources() {
    return [cellar.subscribe]
  }

  connectedCallback(): void {
    delegate(this, 'click', '[data-act]', (_e, el) => {
      const sku = el.dataset.sku
      if (!sku) return

      // **Hide before mutating.** The React version called the action and then
      // hidePopover(); in vanilla that order destroys the popover's own node
      // mid-handler, because the mutation re-renders this section
      // synchronously. It does not fail loudly — it fails as an occasional
      // stuck overlay — which is exactly why the order is enforced here rather
      // than remembered at each call site.
      closePopoverFrom(el)

      if (el.dataset.act === 'remove') {
        cellar.removeSeed(sku)
      } else if (el.dataset.act === 'set-kind') {
        const kind = el.dataset.kind
        if (kind === 'like' || kind === 'dislike' || kind === 'skip') {
          cellar.setKind(sku, kind)
        }
      }
    })
    super.connectedCallback()
  }

  protected render(): void {
    const { entries } = cellar.getSnapshot()
    const of = (kind: SeedKind) => entries.filter(e => e.kind === kind)
    const liked = of('like')
    const disliked = of('dislike')
    const skipped = of('skip')

    // Every saved SKU renders, resolved or not, so the count and the rows can
    // no longer disagree. That is what deletes the three "Loading N more…"
    // lines along with skipsRevealed and the *Total props: there is no longer
    // an asynchronous gap for them to describe.
    mount(this, html`
      <section class="mywines-group">
        <div class="mywines-head">
          <span class="mywines-badge mywines-badge--good" aria-hidden="true">✓</span>
          <div class="mywines-title">Liked</div>
          <div class="mywines-count">${liked.length}</div>
        </div>
        ${liked.length === 0
          ? html`<p class="hint">Add wines you have drunk and liked — not ones you are thinking of buying.</p>`
          : list(liked)}
      </section>

      <section class="mywines-group mywines-group--disliked">
        <div class="mywines-head">
          <span class="mywines-badge mywines-badge--bad" aria-hidden="true">✕</span>
          <div class="mywines-title mywines-title--quiet">Steer clear</div>
          <div class="mywines-count">${disliked.length}</div>
        </div>
        ${disliked.length === 0
          ? html`<p class="hint">Wines to steer away from. Just as useful as the ones you like.</p>`
          : list(disliked)}
      </section>

      <details class="mywines-group mywines-group--skipped">
        <summary class="mywines-head">
          <span class="mywines-badge mywines-badge--quiet" aria-hidden="true">–</span>
          <div class="mywines-title mywines-title--quiet">Don't recommend</div>
          <div class="mywines-count">${skipped.length}</div>
        </summary>
        <p class="hint">
          Kept out of your results and left out of the prompt entirely. Unlike
          "Steer clear", these say nothing about your taste — no similar wine is
          pushed away on their account.
        </p>
        ${skipped.length > 0 && list(skipped)}
      </details>
    `)
  }
}
