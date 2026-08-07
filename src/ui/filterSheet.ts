import { html, mount, delegate, setProp } from './dom'
import { openSheet } from './sheet'
import { countMatches, type CatalogFilters, type WineColour } from '../lib/catalog'
import {
  COLOURS, PRICE_PRESETS, DEFAULT_FILTERS,
  colourLabel, presetLabel,
} from '../lib/filters'
import { branchName } from '../lib/branches'
import { runSearch } from '../lib/search'
import * as appState from '../lib/appState'
import { t } from '../lib/lang'

const DEBOUNCE_MS = 300

/** Below this, the band is too narrow to rank against and the panel says so. */
const THIN_BAND = 12

/**
 * Everything the controls need from whatever is holding them.
 *
 * A sheet satisfies this and so does an inline panel, which is the whole
 * reason it is written down: the design shows one set of controls in two
 * housings — a bottom sheet on a phone, a panel on the page on a desktop —
 * and two housings should not mean two implementations.
 */
interface FilterHost {
  readonly body: HTMLElement
  readonly foot: HTMLElement
  setFoot(markup: ReturnType<typeof html>): void
  /** Done with it: dismiss the sheet, or hand the column back. */
  close(): void
}

/**
 * Colour and price band, with a live count of what they would return.
 *
 * The count is of the *pending* draft, debounced. While a new count is in
 * flight the previous one keeps showing rather than flashing to zero, which
 * would read as "no wines" when it only means "has not answered yet".
 */
function runFilters(sheet: FilterHost, register: (stop: () => void) => void): void {
  const { branch, filters } = appState.getSnapshot()
  let draft: CatalogFilters = { ...filters }
  let count: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let requestId = 0
  const stopCounting = () => clearTimeout(timer)
  // The host owns dismissal, so it needs a way to stop a debounced count that
  // would otherwise fire into a detached panel.
  register(stopCounting)

  function renderBody(): void {
    const activePreset = PRICE_PRESETS.find(p => p.min === draft.priceMin && p.max === draft.priceMax)
    mount(sheet.body, html`
      <div class="filtersheet-section">
        <div class="label">${t().colour}</div>
        <div class="filtersheet-pills">
          ${COLOURS.map(c => html`
            <button
              type="button"
              class="${draft.colour === c ? 'pill pill--brass' : 'pill'}"
              data-filter="colour" data-value="${c}"
            >${colourLabel(c)}</button>
          `)}
        </div>
      </div>
      <div class="filtersheet-section">
        <div class="label">${t().price}</div>
        <div class="filtersheet-pills">
          ${PRICE_PRESETS.map(p => html`
            <button
              type="button"
              class="${p === activePreset ? 'pill pill--brass' : 'pill'}"
              data-filter="preset" data-min="${p.min ?? ''}" data-max="${p.max ?? ''}"
            >${presetLabel(p)}</button>
          `)}
        </div>
        <div class="filtersheet-numbers">
          <input type="number" min="0" inputmode="numeric" data-filter="min"
                 placeholder="${t().any}" aria-label="${t().min}" />
          <span class="filtersheet-to">${t().to}</span>
          <input type="number" min="0" inputmode="numeric" data-filter="max"
                 placeholder="${t().any}" aria-label="${t().max}" />
        </div>
      </div>
      <!--
        The count lives beside the controls that change it, not down in the
        footer: it updates as you type, so you never apply a band blind.
      -->
      <div data-filter-count></div>
    `)
    renderCount()
    // Values are set as properties rather than interpolated, so that typing in
    // one box is not undone when the other re-renders.
    const min = sheet.body.querySelector<HTMLInputElement>('[data-filter="min"]')!
    const max = sheet.body.querySelector<HTMLInputElement>('[data-filter="max"]')!
    min.value = draft.priceMin === null ? '' : String(draft.priceMin)
    max.value = draft.priceMax === null ? '' : String(draft.priceMax)
  }

  /**
   * The live count, rendered in place.
   *
   * Only this block is redrawn as counts arrive, so a caret in one of the
   * price boxes survives — re-rendering the whole body on every keystroke
   * would take it with it. A band too thin to rank against says so rather
   * than quietly returning four wines.
   */
  function renderCount(): void {
    const slot = sheet.body.querySelector<HTMLElement>('[data-filter-count]')
    if (!slot) return
    if (count === null || count === 0) {
      mount(slot, html``)
      return
    }
    const thin = count < THIN_BAND
    mount(slot, html`
      <div class="${thin ? 'filter-count filter-thin' : 'filter-count'}">
        <div class="filter-count-n">${count}</div>
        <!-- The sentence continues from the number rather than repeating it. -->
        <div class="filter-count-note">${thin ? t().winesFitThin : t().winesFitNote}</div>
      </div>
    `)
  }

  function renderFoot(): void {
    // The apply button carries the count too, so the number is on the control
    // that acts on it as well as beside the controls that changed it.
    const label = count === 0 ? t().showNone
      : count !== null ? t().searchTheseWines(count)
      : t().showWines
    sheet.setFoot(html`
      <button type="button" class="sheet-reset" data-filter="reset">${t().resetFilters}</button>
      <button class="btn-primary" data-filter="apply">${label}</button>
    `)
    setProp<HTMLButtonElement, 'disabled'>(
      sheet.foot, '[data-filter="apply"]', 'disabled', count === 0)
  }

  function scheduleCount(): void {
    renderFoot()
    renderCount()
    if (!branch) return
    clearTimeout(timer)
    const id = ++requestId
    timer = setTimeout(() => {
      countMatches(branch, draft)
        .then(n => {
          if (id !== requestId) return
          count = n
          renderFoot()
          renderCount()
        })
        .catch(() => { /* leave the previous count showing */ })
    }, DEBOUNCE_MS)
  }

  function update(patch: Partial<CatalogFilters>): void {
    draft = { ...draft, ...patch }
    count = null
    renderBody()
    scheduleCount()
  }

  delegate(sheet.body, 'click', '[data-filter]', (_e, el) => {
    if (el.dataset.filter === 'colour') {
      update({ colour: el.dataset.value as WineColour })
    } else if (el.dataset.filter === 'preset') {
      update({
        priceMin: el.dataset.min === '' ? null : Number(el.dataset.min),
        priceMax: el.dataset.max === '' ? null : Number(el.dataset.max),
      })
    }
  })

  // Typed bounds do not re-render the body — that would take the caret with
  // it — so the draft is updated in place and only the footer refreshes.
  delegate(sheet.body, 'input', '[data-filter="min"], [data-filter="max"]', (_e, el) => {
    const raw = (el as HTMLInputElement).value.trim()
    const value = raw === '' ? null : Number(raw)
    if (value !== null && Number.isNaN(value)) return
    draft = { ...draft, [el.dataset.filter === 'min' ? 'priceMin' : 'priceMax']: value }
    count = null
    scheduleCount()
  })

  delegate(sheet.foot, 'click', '[data-filter="reset"]', () => {
    draft = { ...DEFAULT_FILTERS }
    count = null
    renderBody()
    scheduleCount()
  })

  delegate(sheet.foot, 'click', '[data-filter="apply"]', () => {
    stopCounting()
    // Close first, and mind the order. `setFilters` publishes, which re-renders
    // the panel's host and detaches it — anything the host wanted to hear about
    // dismissal has to be said while it is still on the page. The search runs
    // last, so it reads the filters that were just applied rather than the ones
    // being replaced.
    sheet.close()
    appState.setFilters(draft)
    void runSearch()
  })

  renderBody()
  scheduleCount()
}

/** The phone housing, and the one the results screen still uses. */
export function openFilterSheet(): void {
  let stop = () => {}
  const { branch } = appState.getSnapshot()
  const sheet = openSheet({
    title: t().narrowTheShelf,
    // The branch, not a control: it names what is being narrowed. Reset lives
    // in the footer, beside the button that applies what it undoes.
    cancelLabel: branch ? branchName(branch) : t().thisBranch,
    onClose: () => stop(),
  })
  sheet.dialog.querySelector<HTMLElement>('.sheet-cancel')!.className = 'sheet-scope'
  runFilters(sheet, fn => { stop = fn })
}

/**
 * The desktop housing: the same controls, on the page.
 *
 * `done` is called when the visitor is finished with it — applying runs the
 * search, so the column that held this has something else to show.
 */
export function mountFilterPanel(host: HTMLElement, done: () => void): void {
  const { branch } = appState.getSnapshot()
  mount(host, html`
    <div class="filterpanel-head">
      <h3>${t().narrowTheShelf}</h3>
      <span class="filterpanel-scope">${branch ? branchName(branch) : t().thisBranch}</span>
    </div>
    <div class="filterpanel-body"></div>
    <div class="filterpanel-foot"></div>
  `)
  const body = host.querySelector<HTMLElement>('.filterpanel-body')!
  const foot = host.querySelector<HTMLElement>('.filterpanel-foot')!
  let stop = () => {}
  runFilters(
    { body, foot, setFoot: markup => mount(foot, markup), close: () => { stop(); done() } },
    fn => { stop = fn },
  )
}
