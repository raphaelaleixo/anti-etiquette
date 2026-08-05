import { html, mount, delegate } from './dom'
import { openSheet } from './sheet'
import { countMatches, type CatalogFilters, type WineColour } from '../lib/catalog'
import { COLOURS, PRICE_PRESETS, DEFAULT_FILTERS, fullSummary, priceLabel } from '../lib/filters'
import { branchName } from '../lib/branches'
import * as appState from '../lib/appState'

const DEBOUNCE_MS = 300

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
    title: 'Filters',
    cancelLabel: 'Reset',
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
        <div class="label">Colour</div>
        <div class="filtersheet-pills">
          ${COLOURS.map(c => html`
            <button
              type="button"
              class="${draft.colour === c.value ? 'pill pill--brass' : 'pill'}"
              data-filter="colour" data-value="${c.value}"
            >${c.label}</button>
          `)}
        </div>
      </div>
      <div class="filtersheet-section">
        <div class="filtersheet-pricehead">
          <div class="label">Price</div>
          <div class="filtersheet-priceband" data-filter-band>${priceLabel(draft)}</div>
        </div>
        <div class="filtersheet-pills">
          ${PRICE_PRESETS.map(p => html`
            <button
              type="button"
              class="${p === activePreset ? 'pill pill--brass' : 'pill'}"
              data-filter="preset" data-min="${p.min ?? ''}" data-max="${p.max ?? ''}"
            >${p.label}</button>
          `)}
        </div>
        <div class="filtersheet-numbers">
          <label class="filtersheet-numberbox">
            <span class="label">Min</span>
            <input type="number" min="0" inputmode="numeric" data-filter="min" placeholder="Any" />
          </label>
          <label class="filtersheet-numberbox">
            <span class="label">Max</span>
            <input type="number" min="0" inputmode="numeric" data-filter="max" placeholder="Any" />
          </label>
        </div>
      </div>
    `)
    // Values are set as properties rather than interpolated, so that typing in
    // one box is not undone when the other re-renders.
    const min = sheet.body.querySelector<HTMLInputElement>('[data-filter="min"]')!
    const max = sheet.body.querySelector<HTMLInputElement>('[data-filter="max"]')!
    min.value = draft.priceMin === null ? '' : String(draft.priceMin)
    max.value = draft.priceMax === null ? '' : String(draft.priceMax)
  }

  function renderFoot(): void {
    const label = count === 0 ? 'No wines in this band'
      : count !== null ? `Show ${count} wines`
      : 'Show wines'
    sheet.setFoot(html`
      <button class="btn-primary" data-filter="apply">${label}</button>
      <div class="sheet-summary">${fullSummary(draft, branch ? branchName(branch) : 'this branch')}</div>
    `)
    const apply = sheet.foot.querySelector('[data-filter="apply"]')
    if (apply instanceof HTMLButtonElement) apply.disabled = count === 0
  }

  function scheduleCount(): void {
    renderFoot()
    if (!branch) return
    clearTimeout(timer)
    const id = ++requestId
    timer = setTimeout(() => {
      countMatches(branch, draft)
        .then(n => {
          if (id !== requestId) return
          count = n
          renderFoot()
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
