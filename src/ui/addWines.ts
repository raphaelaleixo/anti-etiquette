import { html, mount, delegate, money, setProp, type Html } from './dom'
import { openSheet } from './sheet'
import { searchWines } from '../lib/catalog'
import { dismissAt, chooseCandidate, type Resolution } from '../lib/resolution'
import * as cellar from '../lib/cellar'
import * as appState from '../lib/appState'
import { KINDS, type SeedKind } from '../lib/types'
import { t, kindLabel } from '../lib/lang'

/**
 * Adding wines, start to finish, without leaving the sheet.
 *
 * Both steps live here so the typed text survives the trip to the review step.
 * Previously the sheet closed on lookup, and backing out of a bad match meant
 * retyping every name in the batch — retyping four good names because the
 * fifth matched wrong was the old flow's worst moment.
 *
 * Nothing here subscribes. The textarea is read on submit, and the kind
 * pickers are read on save, so no store change can arrive mid-edit and take
 * the user's caret with it.
 */

function parseNames(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

// ---------------------------------------------------------------- step one

function inputStep(text: string): Html {
  return html`
    <div>
      <div class="addwines-heading">${t().addHeading}</div>
      <div class="addwines-sub">${t().addSub}</div>
    </div>
    <div class="seedinput">
      <div class="seedinput-panel">
        <div class="label">${t().onePerLine}</div>
        <textarea rows="6" data-add="text" placeholder="${t().addPlaceholder}">${text}</textarea>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------- step two

/**
 * The alternatives picker.
 *
 * Only shown when the catalog offered more than one, so an unambiguous match
 * does not sprout a control implying doubt. "None of these" keeps the line in
 * the batch as unmatched rather than dropping it — dropping it is what the ×
 * does, and the two are different intentions.
 */
function candidatePicker(r: Resolution, i: number): Html | false {
  const candidates = r.candidates ?? []
  if (candidates.length < 2) return false
  return html`
    <select
      class="resolution-alt" data-add="candidate" data-index="${i}"
      aria-label="${t().whichWine(r.input)}"
    >
      ${candidates.map((w, ci) => html`
        <option value="${ci}">${w.name} · ${money(w.price)}</option>
      `)}
      <option value="-1">${t().noneOfThese}</option>
    </select>
  `
}

function resolutionRow(r: Resolution, i: number): Html {
  if (r.wine === null) {
    const tried = r.candidates?.length ?? 0
    return html`
      <li class="resolution-row resolution-row--unmatched">
        <div class="resolution-body">
          <div class="resolution-name resolution-name--warn">${r.input}</div>
          <div class="resolution-meta resolution-meta--warn">
            ${tried === 0 ? t().noMatch : t().nothingChosen}
          </div>
          ${candidatePicker(r, i)}
        </div>
        <button
          type="button" class="resolution-dismiss" data-add="dismiss" data-index="${i}"
          aria-label="${t().dismissUnmatched(r.input)}"
        >×</button>
      </li>
    `
  }
  return html`
    <li class="resolution-row">
      <div class="resolution-body">
        <div class="resolution-name">${r.wine.name}</div>
        <div class="resolution-meta">${t().fromInput(money(r.wine.price), r.input)}</div>
        ${candidatePicker(r, i)}
        <select
          class="resolution-kind" data-add="kind" data-index="${i}"
          aria-label="${t().whichList(r.wine.name)}"
        >
          ${KINDS.map(k => html`<option value="${k}">${kindLabel(k)}</option>`)}
        </select>
      </div>
      <button
        type="button" class="resolution-dismiss" data-add="dismiss" data-index="${i}"
        aria-label="${t().dismissMatched(r.wine.name)}"
      >×</button>
    </li>
  `
}

function resolutionStep(batch: Resolution[]): Html {
  const matched = batch.filter(r => r.wine !== null)
  const unmatched = batch.length - matched.length
  const count = (k: SeedKind) => matched.filter(r => r.kind === k).length

  return html`
    <section class="resolution">
      <ul class="resolution-list">${batch.map(resolutionRow)}</ul>
      <p class="sheet-summary resolution-summary">
        ${unmatched > 0 && t().linesIgnored(unmatched)}
        ${t().batchSummary(count('like'), count('dislike'))}
        ${count('skip') > 0 && t().batchSkipped(count('skip'))}
      </p>
    </section>
  `
}

// -------------------------------------------------------------------- flow

export function openAddWines(): void {
  let text = ''
  let batch: Resolution[] | null = null
  let busy = false
  let error: string | null = null

  const sheet = openSheet({ title: t().addTitle, full: true })

  function showError(): void {
    const existing = sheet.body.querySelector('.error')
    if (existing) existing.remove()
    if (error === null) return
    const p = document.createElement('p')
    p.className = 'error'
    // Shown inside the sheet, not behind it — the sheet is modal, so an error
    // on the page underneath would be invisible.
    p.textContent = error
    sheet.body.append(p)
  }

  /**
   * The kind pickers are uncontrolled: their value lives in the DOM until it
   * is needed. Anything that re-renders the list must therefore read them back
   * first, or dismissing row 3 silently resets the choices made on rows 1 and 2.
   */
  function syncKindsFromDom(): void {
    if (!batch) return
    for (const el of sheet.body.querySelectorAll<HTMLSelectElement>('[data-add="kind"]')) {
      const i = Number(el.dataset.index)
      const value = el.value
      const row = batch[i]
      if (row && (value === 'like' || value === 'dislike' || value === 'skip')) {
        row.kind = value
      }
    }
  }

  function renderFoot(): void {
    if (batch === null) {
      const n = parseNames(readText()).length
      sheet.setFoot(html`
        <button class="btn-primary" data-add="lookup">
          ${busy ? t().lookingUp : t().lookUp(n)}
        </button>
      `)
      setDisabled('[data-add="lookup"]', busy || n === 0)
      return
    }
    const matched = batch.filter(r => r.wine !== null).length
    sheet.setFoot(html`
      <div class="sheet-foot-row">
        <button type="button" class="btn-secondary" data-add="back">${t().back}</button>
        <button class="btn-primary" data-add="save">
          ${busy ? t().saving : t().save(matched)}
        </button>
      </div>
    `)
    setDisabled('[data-add="back"]', busy)
    setDisabled('[data-add="save"]', busy || matched === 0)
  }

  function setDisabled(selector: string, value: boolean): void {
    setProp<HTMLButtonElement, 'disabled'>(sheet.foot, selector, 'disabled', value)
  }

  function readText(): string {
    const el = sheet.body.querySelector<HTMLTextAreaElement>('[data-add="text"]')
    return el ? el.value : text
  }

  /**
   * `selected` is a boolean attribute — present means true whatever the value —
   * so it cannot be interpolated, for the same reason `disabled` cannot. Set
   * the value on markup this function just rendered.
   */
  function applyKindSelections(): void {
    if (!batch) return
    for (const el of sheet.body.querySelectorAll<HTMLSelectElement>('[data-add="kind"]')) {
      const row = batch[Number(el.dataset.index)]
      if (row) el.value = row.kind
    }
    for (const el of sheet.body.querySelectorAll<HTMLSelectElement>('[data-add="candidate"]')) {
      const row = batch[Number(el.dataset.index)]
      if (!row) continue
      const chosen = row.wine === null
        ? -1
        : (row.candidates ?? []).findIndex(w => w.sku === row.wine!.sku)
      el.value = String(chosen)
    }
  }

  function renderStep(): void {
    sheet.setTitle(batch === null ? t().addTitle : t().reviewTitle)
    mount(sheet.body, batch === null ? inputStep(text) : resolutionStep(batch))
    applyKindSelections()
    showError()
    renderFoot()
  }

  async function lookUp(): Promise<void> {
    text = readText()
    const names = parseNames(text)
    if (names.length === 0) return
    busy = true
    error = null
    renderFoot()
    try {
      batch = await Promise.all(names.map(async name => {
        const candidates = await searchWines(name)
        return {
          input: name,
          // Best match pre-selected, but the alternatives travel with it so a
          // wrong guess is a visible choice rather than a silent substitution.
          wine: candidates[0] ?? null,
          kind: 'like' as SeedKind,
          candidates,
        }
      }))
    } catch (e) {
      error = t().catalogUnreachable(e instanceof Error ? e.message : String(e))
    } finally {
      busy = false
      renderStep()
    }
  }

  function save(): void {
    if (!batch) return
    syncKindsFromDom()
    const items = batch
      .filter((r): r is Resolution & { wine: NonNullable<Resolution['wine']> } => r.wine !== null)
      .map(r => ({ wine: r.wine, kind: r.kind }))
    if (items.length === 0) return

    // The freshly-fetched Wine is stored, not just its SKU. The React app kept
    // only the SKU and re-fetched every record on the next load; keeping it
    // here means a wine added through the UI never needs hydrating at all.
    cellar.saveWines(items)

    // Plain setMode, not a view transition: the sheet is still open and closes
    // a beat later, so its own dismissal is the transition. Animating the page
    // underneath a modal animates something nobody sees.
    appState.setMode('wines')
    sheet.close()
  }

  delegate(sheet.body, 'input', '[data-add="text"]', () => {
    // Only the footer count changes as the user types. Re-rendering the body
    // here would take the caret and the scroll position with it.
    renderFoot()
  })

  delegate(sheet.body, 'change', '[data-add="candidate"]', (_e, el) => {
    if (!batch) return
    const i = Number(el.dataset.index)
    const row = batch[i]
    if (!row) return
    syncKindsFromDom()
    batch = batch.map((r, ri) =>
      ri === i ? chooseCandidate(r, Number((el as HTMLSelectElement).value)) : r)
    renderStep()
  })

  delegate(sheet.body, 'click', '[data-add="dismiss"]', (_e, el) => {
    if (!batch) return
    syncKindsFromDom()
    batch = dismissAt(batch, Number(el.dataset.index))
    if (batch === null) text = readText()
    renderStep()
  })

  delegate(sheet.foot, 'click', '[data-add]', (_e, el) => {
    switch (el.dataset.add) {
      case 'lookup':
        void lookUp()
        break
      case 'back':
        // Back to the text, which is still here — that is the whole point of
        // keeping both steps in one sheet.
        batch = null
        error = null
        renderStep()
        break
      case 'save':
        save()
        break
    }
  })

  renderStep()
}
