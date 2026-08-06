import { html, mount, delegate, money, setProp, type Html } from './dom'
import { openSheet } from './sheet'
import { searchWines } from '../lib/catalog'
import { dismissAt, chooseCandidate, type Resolution } from '../lib/resolution'
import * as cellar from '../lib/cellar'
import * as appState from '../lib/appState'
import { KINDS, type SeedKind } from '../lib/types'
import * as lang from '../lib/lang'
const t = lang.t

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
/**
 * The alternatives, listed rather than hidden in a select.
 *
 * This is the moment the product either earns trust or loses it: "Pinot Noir"
 * is a grape, not a bottle, and picking the top hit silently is how a stranger's
 * wine ends up shaping someone's taste. So when the catalog matched far more
 * than it returned, the row says so and shows the candidates outright.
 */
function candidateList(r: Resolution, i: number): Html | false {
  const candidates = r.candidates ?? []
  if (candidates.length < 2) return false
  const t = lang.t()
  const total = r.candidateTotal ?? candidates.length
  const chosen = r.wine === null ? -1 : candidates.findIndex(w => w.sku === r.wine!.sku)

  return html`
    <div class="resolution-alts">
      ${total > candidates.length && html`
        <p class="resolution-many">${t.manyMatch(total)}</p>
      `}
      <div class="resolution-altlist">
        ${candidates.map((w, ci) => html`
          <button
            type="button"
            class="${ci === chosen ? 'resolution-alt is-chosen' : 'resolution-alt'}"
            data-add="candidate" data-index="${i}" data-choice="${ci}"
            aria-pressed="${ci === chosen ? 'true' : 'false'}"
          >
            <span class="resolution-altname">${w.name}</span>
            <span class="resolution-altmeta">${[w.region, w.country].filter(Boolean).join(', ')}</span>
            <span class="resolution-altprice">${money(w.price)}</span>
          </button>
        `)}
      </div>
      <div class="resolution-altfoot">
        <button type="button" class="resolution-none"
                data-add="candidate" data-index="${i}" data-choice="-1">
          ${t.noneDropLine}
        </button>
        ${total > candidates.length && html`
          <span class="hint">${t.showingOf(candidates.length, total)}</span>
        `}
      </div>
    </div>
  `
}

/** The three groups, as buttons — the same vocabulary as My wines. */
function kindPicker(r: Resolution, i: number): Html {
  return html`
    <div class="resolution-kinds" role="group" aria-label="${lang.t().whichList(r.wine?.name ?? r.input)}">
      ${KINDS.map(k => html`
        <button
          type="button"
          class="${k === r.kind ? 'resolution-kind is-on' : 'resolution-kind'}"
          data-add="kind" data-index="${i}" data-kind="${k}"
          aria-pressed="${k === r.kind ? 'true' : 'false'}"
        >${lang.kindLabel(k)}</button>
      `)}
    </div>
  `
}

function resolutionRow(r: Resolution, i: number): Html {
  const t = lang.t()
  const ambiguous = r.wine === null && (r.candidates?.length ?? 0) > 0

  if (r.wine === null) {
    return html`
      <li class="resolution-row resolution-row--unmatched">
        <div class="resolution-typed">
          <span class="resolution-typedlabel">${t.colYouTyped}</span>
          <span class="resolution-input">${r.input}</span>
        </div>
        <div class="resolution-body">
          <div class="resolution-name resolution-name--warn">
            ${ambiguous ? t.needsDecision : t.notSavedNotThrown}
          </div>
          ${!ambiguous && html`<p class="hint">${t.foundNothingWhy}</p>`}
          ${candidateList(r, i)}
        </div>
        <div class="resolution-rowactions">
          <button type="button" class="resolution-dismiss" data-add="edit"
                  aria-label="${t.editTheText}">${t.editTheText}</button>
          <button type="button" class="resolution-dismiss" data-add="dismiss" data-index="${i}"
                  aria-label="${t.dismissUnmatched(r.input)}">${t.dropIt}</button>
        </div>
      </li>
    `
  }

  return html`
    <li class="resolution-row">
      <div class="resolution-typed">
        <span class="resolution-typedlabel">${t.colYouTyped}</span>
        <span class="resolution-input">${r.input}</span>
      </div>
      <div class="resolution-body">
        <div class="resolution-name">${r.wine.name}</div>
        <div class="resolution-meta">
          ${money(r.wine.price)} · ${[r.wine.region, r.wine.country].filter(Boolean).join(', ')}
        </div>
        ${candidateList(r, i)}
      </div>
      <div class="resolution-file">
        <span class="resolution-typedlabel">${t.colFileIn}</span>
        ${kindPicker(r, i)}
      </div>
      <div class="resolution-rowactions">
        <button type="button" class="resolution-dismiss" data-add="dismiss" data-index="${i}"
                aria-label="${t.dismissMatched(r.wine.name)}">×</button>
      </div>
    </li>
  `
}

function resolutionStep(batch: Resolution[]): Html {
  const t = lang.t()
  const matched = batch.filter(r => r.wine !== null)
  const ambiguous = batch.filter(r => r.wine === null && (r.candidates?.length ?? 0) > 0).length
  const missing = batch.length - matched.length - ambiguous

  return html`
    <section class="resolution">
      <div class="resolution-head">
        <h2>${t.reviewHeading}</h2>
        <p class="hint">${t.reviewTally(matched.length, ambiguous, missing)}</p>
      </div>
      <ul class="resolution-list">${batch.map(resolutionRow)}</ul>
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
  /*
   * The kind and candidate pickers are buttons now, and every press updates
   * `batch` immediately, so there is no uncontrolled DOM state to read back
   * before a re-render. The previous select-based version needed exactly that
   * and forgetting it silently reset the other rows.
   */

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
    const kept = batch.filter(r => r.wine !== null)
    const matched = kept.length
    const of = (k: SeedKind) => kept.filter(r => r.kind === k).length
    sheet.setFoot(html`
      <div class="sheet-summary">${t().tally(of('like'), of('dislike'), of('skip'))}</div>
      <div class="sheet-foot-row">
        <button type="button" class="btn-secondary" data-add="back">${t().backToText}</button>
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
  function renderStep(): void {
    sheet.setTitle(batch === null ? t().addTitle : t().reviewTitle)
    mount(sheet.body, batch === null ? inputStep(text) : resolutionStep(batch))
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
        const { wines: candidates, total } = await searchWines(name)
        return {
          input: name,
          // Best match pre-selected, but the alternatives travel with it so a
          // wrong guess is a visible choice rather than a silent substitution.
          wine: candidates[0] ?? null,
          kind: 'like' as SeedKind,
          candidates,
          candidateTotal: total,
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

  delegate(sheet.body, 'click', '[data-add="candidate"]', (_e, el) => {
    if (!batch) return
    const i = Number(el.dataset.index)
    batch = batch.map((r, ri) =>
      ri === i ? chooseCandidate(r, Number(el.dataset.choice)) : r)
    renderStep()
  })

  delegate(sheet.body, 'click', '[data-add="kind"]', (_e, el) => {
    if (!batch) return
    const i = Number(el.dataset.index)
    const kind = el.dataset.kind
    if (kind !== 'like' && kind !== 'dislike' && kind !== 'skip') return
    batch = batch.map((r, ri) => (ri === i ? { ...r, kind } : r))
    renderStep()
  })

  // "Edit the text" is Back by another name: the typed lines are still there.
  delegate(sheet.body, 'click', '[data-add="edit"]', () => {
    batch = null
    renderStep()
  })

  delegate(sheet.body, 'click', '[data-add="dismiss"]', (_e, el) => {
    if (!batch) return
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
