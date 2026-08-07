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

/** Nothing came back at all. There is nothing to choose between. */
function isMissing(r: Resolution): boolean {
  return r.wine === null && (r.candidates?.length ?? 0) === 0
}

/**
 * The line was too vague to guess at.
 *
 * The signal is the catalogue having far more matches than it handed back:
 * "pinot noir" returns five of three hundred and forty. That is a different
 * situation from a name that matched four bottles and got the right one, and
 * the design treats them differently — a card that asks, versus a row that
 * mentions the alternatives exist.
 *
 * A line the visitor has explicitly rejected with "None of these" counts too:
 * they have said the top hit is wrong, so the question is open again.
 */
function isAmbiguous(r: Resolution): boolean {
  if (isMissing(r)) return false
  const shown = r.candidates?.length ?? 0
  return r.wine === null || (r.candidateTotal ?? shown) > shown
}

/**
 * Where you are in a two-step task, and the way out of it.
 *
 * Both steps live in one sheet, so without this the second screen arrives with
 * no warning that a first one existed — and no sign that there is a way back
 * to the text you typed. Step 1 stays clickable from step 2 for that reason.
 */
function stepBar(onReview: boolean): Html {
  return html`
    <div class="addsteps">
      <span class="${onReview ? 'addstep addstep--done' : 'addstep addstep--on'}"
            aria-current="${onReview ? 'false' : 'true'}">${t().stepName}</span>
      <span class="addstep-arrow" aria-hidden="true">→</span>
      <span class="${onReview ? 'addstep addstep--on' : 'addstep'}"
            aria-current="${onReview ? 'true' : 'false'}">${t().stepCheck}</span>
    </div>
  `
}

// ---------------------------------------------------------------- step one

/**
 * The text area is the page, not a field on it.
 *
 * Numbered lines, room for many of them, and the count stated underneath — the
 * design treats this as a keyboard task and gives it a keyboard-sized surface.
 * The gutter is desktop-only: it can only stay aligned while lines do not wrap,
 * which is why the textarea stops wrapping at the same breakpoint, and neither
 * is a trade worth making on a 390px screen.
 */
function inputStep(text: string): Html {
  const lines = Math.max(parseNames(text).length, text.split('\n').length)
  return html`
    <div class="addwines-grid">
      <div class="addwines-main">
        <div>
          <div class="addwines-heading">${t().addHeading}</div>
          <div class="addwines-sub">${t().addSub}</div>
        </div>
        <div class="seedinput">
          <div class="seedinput-panel">
            <div class="seedinput-gutter" data-add="gutter" aria-hidden="true"
            >${Array.from({ length: Math.max(lines, 14) }, (_, i) => i + 1).join('\n')}</div>
            <textarea rows="6" data-add="text" placeholder="${t().addPlaceholder}"
                      aria-label="${t().onePerLine}">${text}</textarea>
          </div>
          <div class="seedinput-foot">
            <span class="seedinput-count" data-add="count">${t().linesEntered(parseNames(text).length)}</span>
            <span class="hint">${t().pasteAWholeList}</span>
          </div>
        </div>
      </div>

      <aside class="addwines-side">
        <div class="addwines-note">
          <div class="label">${t().bothKindsHelp}</div>
          <p>${t().bothKindsHelpNote}</p>
        </div>
        <div class="addwines-note">
          <div class="label">${t().whatALineLooks}</div>
          <div class="addwines-examples">
            ${t().lineExamples.map(e => html`<div>${e}</div>`)}
          </div>
          <p class="hint">${t().vagueIsFine}</p>
        </div>
        <!-- The one claim on this screen worth making in colour. -->
        <div class="addwines-note addwines-note--ok">
          <span class="addwines-dot" aria-hidden="true"></span>
          <p>${t().lookupStaysHere}</p>
        </div>
      </aside>
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
function candidateList(r: Resolution, i: number, open: boolean, keepsCount = 0): Html | false {
  const candidates = r.candidates ?? []
  if (candidates.length < 2) return false
  // A row the catalogue is confident about does not sprout a picker implying
  // doubt: it says how many others there were, and opens them if asked.
  if (r.wine !== null && !open) {
    return html`
      <button type="button" class="resolution-others" data-add="expand" data-index="${i}">
        ${lang.t().otherMatches(candidates.length - 1)}
      </button>
    `
  }
  const t = lang.t()
  const chosen = r.wine === null ? -1 : candidates.findIndex(w => w.sku === r.wine!.sku)

  return html`
    <div class="resolution-alts">
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
      <button type="button" class="resolution-none"
              data-add="candidate" data-index="${i}" data-choice="-1">
        <span>${t.noneDropLine}</span>
        <span class="hint">${t.keepsTheRest(keepsCount)}</span>
      </button>

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

/** A line the catalogue could not place at all: nothing to pick, only to fix. */
function missingRow(r: Resolution, i: number): Html {
  const t = lang.t()
  return html`
    <div class="resolution-missing-row">
      <span class="resolution-input">${r.input}</span>
      <div class="resolution-rowactions">
        <button type="button" class="resolution-dismiss" data-add="edit"
                aria-label="${t.editTheText}">${t.editTheText}</button>
        <button type="button" class="resolution-dismiss" data-add="dismiss" data-index="${i}"
                aria-label="${t.dismissUnmatched(r.input)}">${t.dropIt}</button>
      </div>
    </div>
  `
}

/**
 * A line that matched too many things to guess at.
 *
 * "Pinot noir" is a grape, not a bottle, and picking the top hit silently is
 * how a stranger's wine ends up shaping someone's taste. So this is its own
 * card rather than a row: it states the problem, shows the candidates, and
 * makes dropping the line an explicit alternative to choosing one.
 */
function ambiguousRow(r: Resolution, i: number, keeps: number): Html {
  const t = lang.t()
  return html`
    <li class="resolution-row resolution-row--ambiguous">
      <div class="resolution-ambhead">
        <span class="resolution-input">${r.input}</span>
        <div class="resolution-body">
          <div class="label label--brass">${t.needsDecision}</div>
          <div class="resolution-name">${t.manyMatch(r.candidateTotal ?? 0)}</div>
        </div>
        <span class="hint">${t.pickOrDrop}</span>
      </div>
      ${candidateList(r, i, true, keeps)}
      <div class="resolution-ambfoot">
        <span class="hint">${r.candidateTotal !== undefined && (r.candidates?.length ?? 0) < r.candidateTotal
          ? t.showingOf(r.candidates?.length ?? 0, r.candidateTotal)
          : ''}</span>
        ${kindPicker(r, i)}
      </div>
    </li>
  `
}

function resolutionRow(r: Resolution, i: number, open: boolean, keeps: number): Html {
  const t = lang.t()
  if (isAmbiguous(r)) return ambiguousRow(r, i, keeps)
  if (r.wine === null) return html``

  return html`
    <li class="resolution-row">
      <span class="resolution-input">${r.input}</span>
      <div class="resolution-body">
        <div class="resolution-name-row">
          <span class="resolution-name">${r.wine.name}</span>
          <span class="resolution-altprice">${money(r.wine.price)}</span>
          <span class="resolution-meta">${[r.wine.region, r.wine.country].filter(Boolean).join(', ')}</span>
          ${candidateList(r, i, open)}
        </div>
      </div>
      <div class="resolution-file">${kindPicker(r, i)}</div>
      <div class="resolution-rowactions">
        <button type="button" class="resolution-dismiss resolution-x" data-add="dismiss" data-index="${i}"
                aria-label="${t.dismissMatched(r.wine.name)}">×</button>
      </div>
    </li>
  `
}

function resolutionStep(batch: Resolution[], expanded: ReadonlySet<number>): Html {
  const t = lang.t()
  const willSave = batch.filter(r => r.wine !== null)
  const matched = batch.filter(r => r.wine !== null && !isAmbiguous(r))
  const ambiguousCount = batch.filter(isAmbiguous).length
  const missing = batch.map((r, i) => [r, i] as const).filter(([r]) => isMissing(r))

  return html`
    <section class="resolution">
      <div class="resolution-head">
        <div>
          <h2>${t.reviewHeading}</h2>
          <p class="hint">${t.reviewTally(matched.length, ambiguousCount, missing.length)}</p>
        </div>
        <span class="resolution-willsave">${t.linesWillSave(batch.length, willSave.length)}</span>
      </div>

      <!--
        Column headings, stated once. Every row repeats the same three
        questions — what you typed, what was found, where it goes — and saying
        them per row is what made the old layout read as a stack of cards.
      -->
      <div class="resolution-cols" aria-hidden="true">
        <span>${t.colYouTyped}</span>
        <span>${t.colMatch}</span>
        <span>${t.colFileIn}</span>
        <span></span>
      </div>

      <ul class="resolution-list">
        ${batch.map((r, i) =>
          isMissing(r) ? false : resolutionRow(r, i, expanded.has(i), batch.length - 1))}
      </ul>

      <!--
        The lines that found nothing are gathered rather than scattered: they
        share one explanation, and interleaving them with matches makes a good
        batch look broken.
      -->
      ${missing.length > 0 && html`
        <div class="resolution-missing">
          <div class="resolution-missing-head">
            <span class="label">${t.foundNothing(missing.length)}</span>
            <span class="hint">${t.notSavedNotThrown}</span>
          </div>
          ${missing.map(([r, i]) => missingRow(r, i))}
          <p class="hint">${t.foundNothingWhy}</p>
        </div>
      `}
    </section>
  `
}

// -------------------------------------------------------------------- flow

export function openAddWines(): void {
  let text = ''
  let batch: Resolution[] | null = null
  let busy = false
  let error: string | null = null
  /** Rows whose alternatives the visitor asked to see. */
  const expanded = new Set<number>()

  // The design labels the way out "Close without saving", which says what it
  // costs. "Cancel" says nothing about the typing you are about to lose.
  const sheet = openSheet({
    title: t().addTitle, full: true, cancelLabel: t().closeWithoutSaving,
  })
  // Frame 10 gives this step the whole page, not a panel on it: numbered
  // lines, room for forty of them, and the guidance beside rather than under.
  // At the sheet's usual width the heading breaks one word to a line.
  sheet.dialog.classList.add('sheet-wide')

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
        <span class="sheet-summary">${t().nothingSavedUntil}</span>
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
      <div class="addtally">
        ${KINDS.map(k => html`
          <span class="addtally-part">
            <span class="addtally-dot addtally-dot--${k}" aria-hidden="true"></span>
            ${of(k)} ${lang.kindLabel(k)}
          </span>
        `)}
      </div>
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
    mount(sheet.body, html`
      ${stepBar(batch !== null)}
      ${batch === null ? inputStep(text) : resolutionStep(batch, expanded)}
    `)
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

  delegate(sheet.body, 'input', '[data-add="text"]', (_e, el) => {
    // Only the footer count, the gutter and the line tally follow the typing.
    // Re-rendering the body would take the caret and the scroll with it.
    const value = (el as HTMLTextAreaElement).value
    const gutter = sheet.body.querySelector('[data-add="gutter"]')
    if (gutter) {
      const n = Math.max(value.split('\n').length, 14)
      gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n')
    }
    const count = sheet.body.querySelector('[data-add="count"]')
    if (count) count.textContent = t().linesEntered(parseNames(value).length)
    renderFoot()
  })

  // The gutter is a separate element, so it has to be told when the textarea
  // scrolls or the numbers drift away from the lines they belong to. Capture
  // phase, not `delegate`: scroll does not bubble, so a delegated listener on
  // the body would simply never run.
  sheet.body.addEventListener('scroll', e => {
    const el = e.target
    if (!(el instanceof HTMLTextAreaElement)) return
    const gutter = sheet.body.querySelector<HTMLElement>('[data-add="gutter"]')
    if (gutter) gutter.scrollTop = el.scrollTop
  }, true)

  delegate(sheet.body, 'click', '[data-add="expand"]', (_e, el) => {
    expanded.add(Number(el.dataset.index))
    renderStep()
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
