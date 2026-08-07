import { html, mount, delegate, setProp } from './dom'
import { openSheet } from './sheet'
import { countMatches, type CatalogFilters, type WineColour } from '../lib/catalog'
import {
  COLOURS, PRICE_PRESETS, DEFAULT_FILTERS, fullSummary, priceLabel,
  colourLabel, presetLabel,
} from '../lib/filters'
import { branchName } from '../lib/branches'
import * as appState from '../lib/appState'
import { t } from '../lib/lang'

const DEBOUNCE_MS = 300

/** Below this, the band is too narrow to rank against and the panel says so. */
const THIN_BAND = 12

/**
 * Colour and price band, with a live count of what they would return.
 *
 * The count is of the *pending* draft, debounced. While a new count is in
 * flight the previous one keeps showing rather than flashing to zero, which
 * would read as "no wines" when it only means "has not answered yet".
 */
export function openFilterSheet(): void {
  const { branch, filters } = appState.getSnapshot()
  let draft: CatalogFilters = { ...filters }
  let count: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let requestId = 0

  const sheet = openSheet({
    title: t().filtersTitle,
    cancelLabel: t().resetFilters,
    onClose: () => clearTimeout(timer),
  })

  // "Reset" restores the defaults rather than dismissing — the sheet's own
  // backdrop and Escape are the ways out.
  sheet.dialog.querySelector('[data-sheet="cancel"]')!.addEventListener('click', e => {
    e.stopImmediatePropagation()
    draft = { ...DEFAULT_FILTERS }
    count = null
    renderBody()
    scheduleCount()
  }, true)

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
        <div class="filtersheet-pricehead">
          <div class="label">${t().price}</div>
          <div class="filtersheet-priceband" data-filter-band>${priceLabel(draft)}</div>
        </div>
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
          <label class="filtersheet-numberbox">
            <span class="label">${t().min}</span>
            <input type="number" min="0" inputmode="numeric" data-filter="min" placeholder="${t().any}" />
          </label>
          <label class="filtersheet-numberbox">
            <span class="label">${t().max}</span>
            <input type="number" min="0" inputmode="numeric" data-filter="max" placeholder="${t().any}" />
          </label>
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
        <div class="filter-count-note">
          ${t().winesFit(count)}${thin ? ` ${t().thinBand}` : ''}
        </div>
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
      <button class="btn-primary" data-filter="apply">${label}</button>
      <div class="sheet-summary">${fullSummary(draft, branch ? branchName(branch) : t().thisBranch)}</div>
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
    const band = sheet.body.querySelector('[data-filter-band]')
    if (band) band.textContent = priceLabel(draft)
    scheduleCount()
  })

  delegate(sheet.foot, 'click', '[data-filter="apply"]', () => {
    appState.setFilters(draft)
    sheet.close()
  })

  renderBody()
  scheduleCount()
}
