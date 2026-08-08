import { StoreElement, html, mount, delegate, setProp, closePopoverFrom, type Html } from '../dom'
import * as cellar from '../../lib/cellar'
import type { CellarEntry } from '../../lib/cellar'
import {
  serialize, filename, parseDocument, merge, recordExport, shouldSuggestExport,
} from '../../lib/cellarIo'
import { isPersistent } from '../../lib/storage'
import * as lang from '../../lib/lang'
import { openAddWines } from '../addWines'
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

function menu(entry: CellarEntry, name: string): Html {
  const id = `wine-menu-${entry.sku}`
  return html`
    <button class="mywines-menu-btn" popovertarget="${id}" aria-label="${lang.t().actionsFor(name)}">⋮</button>
    <div id="${id}" popover="auto" class="wine-menu">
      <div class="wine-menu-head">${name}</div>
      <!--
        Actions are phrased as actions. "More like this" names where a wine
        already is; "Move to More like this" is the thing the press does, and
        the design words the row controls that way for exactly that reason.
        The current group keeps its plain name, because pressing it does
        nothing.
      -->
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
          ${k === entry.kind ? lang.kindLabel(k)
            : k === 'skip' ? lang.t().justHideIt
            : lang.t().moveTo(lang.kindLabel(k))}
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

/** Region and country together, which is how the design names a place. */
function place(wine: NonNullable<CellarEntry['wine']>): string {
  return [wine.region, wine.country].filter(Boolean).join(', ')
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
        <div class="mywines-body">
          <div class="mywines-name">${lang.t().unresolvedSku(entry.sku)}</div>
          <div class="mywines-region">${lang.t().unresolvedTitle}</div>
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
    <!--
      No per-kind modifier here: the card this row sits in already carries the
      group's colour, and tinting the row as well would say it twice.
    -->
    <li class="mywines-row" style="${stagger}">
      <div class="mywines-body">
        <div class="mywines-name">${wine.name}</div>
        ${place(wine) && html`<div class="mywines-region">${place(wine)}</div>`}
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
/**
 * Findable, honest, not alarming.
 *
 * Four states rather than one with a warning bolted on: resting, just-acted,
 * a large list never exported, and a browser that will not store anything.
 * The last is not a nag — it is a statement that the feature this screen is
 * about does not work here.
 */
function backup(entryCount: number, nag: boolean, message: string | null): Html {
  const t = lang.t()
  const blocked = !isPersistent()
  const unbacked = !blocked && nag

  const heading = blocked ? t.nothingCanBeSaved
    : unbacked ? t.worthDoingNow
    : t.keepACopy
  const summary = blocked ? t.nothingCanBeSaved
    : unbacked ? t.noBackupYet(entryCount)
    : t.backupSummary

  return html`
    <details class="${blocked ? 'backup backup--blocked' : 'backup'}" data-backup>
      <summary class="backup-summary">${summary}</summary>
      <div class="backup-head">${heading}</div>
      <p class="hint">${blocked ? t.storageBlockedWhy : t.keepACopyWhy}</p>
      <!-- Kept in every state: seven days of iOS inactivity is the specific
           way this list disappears, and it does not stop being true because
           the panel is resting. -->
      <p class="hint">${t.backupNote}</p>
      ${!blocked && html`<p class="hint">${t.importMerges}</p>`}
      <div class="backup-actions">
        <button type="button" class="${unbacked ? 'btn-primary' : 'btn-secondary'}" data-act="export">
          ${t.exportCount(entryCount)}
        </button>
        <!--
          A nag that cannot be dismissed is a nag people learn to scroll past.
          "Not now" closes the panel and says nothing else; the summary line
          above it keeps the fact visible without the argument.
        -->
        ${unbacked
          ? html`<button type="button" class="btn-secondary" data-act="not-now">${t.notNow}</button>`
          : html`<button type="button" class="btn-secondary" data-act="import">${t.importFile}</button>`}
        <input type="file" accept="application/json,.json" data-act="file" hidden />
      </div>
      ${message && html`<p class="hint backup-message">${message}</p>`}
    </details>
  `
}

/**
 * The first screen anyone sees.
 *
 * An empty list previously meant three empty groups and a hint — technically
 * complete, and no reason to believe the product would do anything useful. It
 * now says what to do, what comes back, and what the three groups are for,
 * because that last one is the product's central idea and the hardest to guess.
 */
function firstRun(): Html {
  const t = lang.t()
  const group = (kind: SeedKind, note: string) => html`
    <div class="firstrun-group firstrun-group--${KIND_CLASS[kind]}">
      <div class="firstrun-groupname">${lang.kindLabel(kind)}</div>
      <div class="firstrun-groupnote">${note}</div>
    </div>
  `
  return html`
    <section class="firstrun">
      <!--
        The argument, then the proof, then the action — all in one column. The
        worked example sits under the buttons rather than in its own region:
        it is what the button is promising, so it reads as part of the pitch.
      -->
      <div class="firstrun-lead">
        <div class="label firstrun-eyebrow">${t.startHere}</div>
        <h2 class="firstrun-big">${t.emptyListBegin}</h2>
        <p class="hint">${t.emptyListHow}</p>
        <div class="firstrun-actions">
          <button type="button" class="btn-primary" data-act="add-wines">${t.addWines}</button>
          <button type="button" class="btn-secondary" data-act="import">${t.importBackup}</button>
          <input type="file" accept="application/json,.json" data-act="file" hidden />
        </div>

        <div class="firstrun-panel firstrun-example">
          <div class="label">${t.whatYouGetBack}</div>
          <p class="firstrun-quote">${t.exampleReason}</p>
          <p class="hint">${t.everyExplained}</p>
        </div>
      </div>

      <!--
        The three groups, taught here because this is the only moment the
        visitor has nothing else to read.
      -->
      <div class="firstrun-panel">
        <div class="firstrun-panelhead">
          <h3>${t.threePlaces}</h3>
          <p class="hint">${t.moveAnyTime}</p>
        </div>
        <div class="firstrun-groups">
          ${group('like', t.kindLikeNote)}
          ${group('dislike', t.kindDislikeNote)}
          ${group('skip', t.kindSkipNote)}
        </div>
      </div>

      <p class="hint firstrun-foot">${t.staysInBrowser}</p>
    </section>
  `
}

export class MyWines extends StoreElement {
  /** Result of the last export or import, shown until the next render. */
  #message: string | null = null

  /**
   * Which groups are showing everything.
   *
   * Held on the element rather than in a store: it is how this one screen is
   * being looked at, not something the rest of the app or another tab has any
   * business knowing. The element outlives its own `mount()`, so it survives
   * every re-render.
   */
  #expanded = new Set<SeedKind>()

  /**
   * Whether the export nag has been waved away this visit.
   *
   * Not persisted: it is a "not now", not a "never". The panel still says the
   * list is unexported in its summary line — what this silences is the panel
   * springing open, which is the part that becomes noise.
   */
  #dismissedNag = false

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
    delegate(this, 'click', '[data-act="not-now"]', () => {
      this.#dismissedNag = true
      this.render()
    })
    delegate(this, 'click', '[data-act="toggle"]', (_e, el) => {
      const kind = el.dataset.kind as SeedKind
      if (this.#expanded.has(kind)) this.#expanded.delete(kind)
      else this.#expanded.add(kind)
      this.render()
    })
    delegate(this, 'click', '[data-act="add-wines"]', () => openAddWines())
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

  /**
   * One group column.
   *
   * The three groups are the product's central idea and were previously named
   * for the visitor's feeling — Liked, Steer clear, Don't recommend. They are
   * now named for what they do to results, and each carries a line saying so,
   * because the consequence was the part nobody could infer.
   */
  #group(kind: SeedKind, entries: CellarEntry[], emptyHint: string): Html {
    const t = lang.t()
    const note = kind === 'like' ? t.kindLikeNote
      : kind === 'dislike' ? t.kindDislikeNote
      : t.kindSkipNote

    // "Just hidden" starts closed. The design says so in as many words — it is
    // the largest group and the least interesting, because nothing in it says
    // anything about your taste — so it gets a count and a way in rather than
    // a column of names.
    //
    // The other two are NOT capped. The frames show "+ 5 more" on desktop and
    // "+ 6 more" on the phone for the same nine wines, which means the artboard
    // is eliding to fit, not specifying a rule. Copying that literally would
    // hide a visitor's own list behind a control for no reason.
    const open = this.#expanded.has(kind)
    const collapsible = kind === 'skip'
    const shown = collapsible && !open ? [] : entries

    return html`
      <section class="group group--${KIND_CLASS[kind]}">
        <header class="group-head">
          <div class="group-titlerow">
            <span class="group-dot" aria-hidden="true"></span>
            <span class="group-name">${lang.kindLabel(kind)}</span>
            <span class="group-count">${entries.length}</span>
            ${collapsible && entries.length > 0 && html`
              <button type="button" class="group-toggle" data-act="toggle" data-kind="${kind}"
                      aria-expanded="${open ? 'true' : 'false'}">
                ${open ? t.hide : t.show}
              </button>
            `}
          </div>
          <p class="group-note">${note}</p>
        </header>
        ${entries.length === 0
          ? html`
            <div class="group-empty">
              <div class="label">${t.emptyGroup}</div>
              <p>${emptyHint}</p>
            </div>
          `
          : html`
            <div class="group-body">
              ${shown.length > 0 && list(shown)}
            </div>
          `}
      </section>
    `
  }

  protected render(): void {
    const snap = cellar.getSnapshot()
    const { entries } = snap
    const nag = !isPersistent()
      || (!this.#dismissedNag && shouldSuggestExport(entries.length, Date.now()))
    const of = (kind: SeedKind) => entries.filter(e => e.kind === kind)
    const liked = of('like')
    const disliked = of('dislike')
    const skipped = of('skip')

    // Every saved SKU renders, resolved or not, so the count and the rows can
    // no longer disagree. That is what deletes the three "Loading N more…"
    // lines along with skipsRevealed and the *Total props: there is no longer
    // an asynchronous gap for them to describe.
    const t = lang.t()

    // Nothing saved at all is its own screen, not the three groups rendered
    // empty three times over.
    if (entries.length === 0) {
      mount(this, html`${firstRun()}${backup(0, nag, this.#message)}`)
      setProp<HTMLDetailsElement, 'open'>(
        this, '[data-backup]', 'open', nag || this.#message !== null)
      return
    }

    mount(this, html`
      <div class="mywines-groups">
        ${this.#group('like', liked, t.likedEmpty)}
        ${this.#group('dislike', disliked, t.dislikedEmpty)}
        ${this.#group('skip', skipped, t.skippedNote)}
      </div>

      ${backup(entries.length, nag, this.#message)}
    `)

    // `open` is a boolean attribute, so it is set rather than interpolated.
    // Opened only when there is something to say — a block that springs open
    // on every render is the kind of prompt people learn to close unread.
    setProp<HTMLDetailsElement, 'open'>(
      this, '[data-backup]', 'open', nag || this.#message !== null)
  }
}
