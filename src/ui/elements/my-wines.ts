import { StoreElement, html, mount, delegate, setProp, type Html } from '../dom'
import * as cellar from '../../lib/cellar'
import type { CellarEntry } from '../../lib/cellar'
import {
  serialize, filename, parseDocument, merge, recordExport, shouldSuggestExport,
} from '../../lib/cellarIo'
import { isPersistent } from '../../lib/storage'
import * as lang from '../../lib/lang'
import { KINDS, type SeedKind } from '../../lib/types'

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
    <button class="mywines-menu-btn" popovertarget="${id}" aria-label="${lang.t().actionsFor(name)}">⋮</button>
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
          ${lang.kindLabel(k)}
        </button>
      `)}
      <button
        type="button"
        class="wine-menu-item wine-menu-item--danger"
        data-act="remove"
        data-sku="${entry.sku}"
      >
        <span class="wine-menu-tick" aria-hidden="true"></span>
        ${lang.t().removeFromList}
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
          <div class="mywines-name">${lang.t().unresolvedSku(entry.sku)}</div>
          <div class="mywines-region">${lang.t().unresolvedNote}</div>
        </div>
        <button
          type="button"
          class="mywines-menu-btn"
          data-act="remove"
          data-sku="${entry.sku}"
          aria-label="${lang.t().removeSku(entry.sku)}"
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

/**
 * The backup block.
 *
 * The copy is deliberately plain about the limitation rather than reassuring
 * about the feature: this list lives in one browser and one "clear browsing
 * data" ends it. On iOS Safari it is sharper still — script-writable storage
 * is evicted after seven days without interaction, so a visitor who tries this
 * once and returns three weeks later finds nothing. "Add to Home Screen" is a
 * real mitigation, which is why the webmanifest ships.
 */
function backup(entryCount: number, nag: boolean, message: string | null): Html {
  return html`
    <details class="backup" data-backup>
      <summary class="backup-summary">
        ${lang.t().backupSummary}${nag ? lang.t().backupNag : ''}
      </summary>
      <p class="hint">${lang.t().backupNote}</p>
      <div class="backup-actions">
        <button type="button" class="btn-secondary" data-act="export">
          ${lang.t().exportCount(entryCount)}
        </button>
        <button type="button" class="btn-secondary" data-act="import">${lang.t().importFile}</button>
        <input type="file" accept="application/json,.json" data-act="file" hidden />
      </div>
      ${message && html`<p class="hint backup-message">${message}</p>`}
    </details>
  `
}

export class MyWines extends StoreElement {
  /** Result of the last export or import, shown until the next render. */
  #message: string | null = null

  protected sources() {
    return [cellar.subscribe, lang.subscribe]
  }

  #export(): void {
    const now = Date.now()
    const { entries } = cellar.getSnapshot()
    const blob = new Blob([serialize(entries, now)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename(now)
    a.click()
    URL.revokeObjectURL(url)
    recordExport(now)
    this.#message = lang.t().exported(entries.length)
    this.render()
  }

  async #import(file: File): Promise<void> {
    const result = parseDocument(await file.text())
    if (!result.ok) {
      this.#message = result.error
      this.render()
      return
    }
    const before = cellar.getSnapshot().entries.length
    // Merge, not replace: the real case is a laptop export landing on a phone
    // that already has three wines, and replacing would destroy them.
    cellar.replaceAll(merge(cellar.getSnapshot().entries, result.entries))
    const added = cellar.getSnapshot().entries.length - before
    const skipped = result.skipped > 0 ? lang.t().importSkipped(result.skipped) : ''
    this.#message = lang.t().imported(result.entries.length, added) + skipped
    this.render()
  }

  connectedCallback(): void {
    delegate(this, 'click', '[data-act="export"]', () => this.#export())
    delegate(this, 'click', '[data-act="import"]', () => {
      this.querySelector<HTMLInputElement>('[data-act="file"]')?.click()
    })
    delegate(this, 'change', '[data-act="file"]', (_e, el) => {
      const file = (el as HTMLInputElement).files?.[0]
      if (file) void this.#import(file)
    })

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
    const nag = !isPersistent() || shouldSuggestExport(entries.length, Date.now())
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
          <div class="mywines-title">${lang.t().kindLike}</div>
          <div class="mywines-count">${liked.length}</div>
        </div>
        ${liked.length === 0
          ? html`<p class="hint">${lang.t().likedEmpty}</p>`
          : list(liked)}
      </section>

      <section class="mywines-group mywines-group--disliked">
        <div class="mywines-head">
          <span class="mywines-badge mywines-badge--bad" aria-hidden="true">✕</span>
          <div class="mywines-title mywines-title--quiet">${lang.t().kindDislike}</div>
          <div class="mywines-count">${disliked.length}</div>
        </div>
        ${disliked.length === 0
          ? html`<p class="hint">${lang.t().dislikedEmpty}</p>`
          : list(disliked)}
      </section>

      <details class="mywines-group mywines-group--skipped">
        <summary class="mywines-head">
          <span class="mywines-badge mywines-badge--quiet" aria-hidden="true">–</span>
          <div class="mywines-title mywines-title--quiet">${lang.t().kindSkip}</div>
          <div class="mywines-count">${skipped.length}</div>
        </summary>
        <p class="hint">${lang.t().skippedNote}</p>
        ${skipped.length > 0 && list(skipped)}
      </details>

      ${backup(entries.length, nag, this.#message)}
    `)

    // `open` is a boolean attribute, so it is set rather than interpolated.
    // Opened only when there is something to say — a block that springs open
    // on every render is the kind of prompt people learn to close unread.
    setProp<HTMLDetailsElement, 'open'>(
      this, '[data-backup]', 'open', nag || this.#message !== null)
  }
}
