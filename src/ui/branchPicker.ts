import { html, mount, delegate, type Html } from './dom'
import {
  BRANCHES, fold, loadRecentBranches, loadBranchCounts, type Branch,
} from '../lib/branches'
import { t } from '../lib/lang'

/**
 * The branch list: a search box, the recently used, then all of Montréal.
 *
 * Montréal only, and it says so — this fork does not pretend to cover the
 * province. The two trade-only depots are excluded upstream in `branches.ts`:
 * they are in the store feed and were selectable in the React app, but they
 * serve restaurateurs, so a member of the public who picks one gets a branch
 * they cannot buy from.
 *
 * Extracted from the sheet because the design shows it twice: a bottom sheet
 * on a phone, and an inline panel beside the scope gate on a desktop. What
 * differs between the two is only what a tap *means* — in the sheet it
 * highlights and a footer button confirms, so the counts can be compared
 * without committing; inline there is nothing to commit away from, so a click
 * is the choice. That is the whole of the `onPick` contract.
 */

const ALPHABETICAL = [...BRANCHES].sort((a, b) => a.name.localeCompare(b.name))

/**
 * The inline panel's typed query, held outside the DOM.
 *
 * The sheet renders once and nothing can re-render it, so its query lives in
 * the closure below and starts empty every time it opens. The inline panel is
 * not so lucky: it sits inside `<find-panel>`, whose `mount()` is an
 * `innerHTML` assignment, so a publish from the cellar or a language change
 * wipes the subtree and takes whatever was half-typed with it.
 *
 * Only that one caller opts in, via `rememberQuery`. Sharing a single stash
 * between both is what made an abandoned sheet search reappear in the next
 * one — the query has to be scoped to the thing that can be rebuilt, not to
 * the module.
 */
let panelQuery = ''

export function clearBranchQuery(): void {
  panelQuery = ''
}

function row(branch: Branch, selected: boolean, count: number | undefined): Html {
  return html`
    <button type="button" class="branch-row" data-branch="${branch.id}"
            aria-pressed="${selected ? 'true' : 'false'}">
      <span class="${selected ? 'branch-radio branch-radio--on' : 'branch-radio'}" aria-hidden="true">
        ${selected ? '✓' : ''}
      </span>
      <span class="branch-body">
        <span class="branch-name">${branch.name}</span>
        <span class="branch-address">${branch.address}</span>
      </span>
      <!--
        The stock count from the last visit, in its own column: it is the one
        number worth comparing between branches, and buried in the address
        line it could not be scanned down.
      -->
      <span class="branch-count">
        ${count === undefined
          ? html`<span class="branch-count-none">${t().notVisited}</span>`
          : html`
            <span class="branch-count-n">${t().winesLastTime(count)}</span>
            <span class="branch-count-note">${t().lastTimeNote}</span>
          `}
      </span>
    </button>
  `
}

export interface BranchPicker {
  /** Redraw the list — after a pick, or after the selection moved elsewhere. */
  refresh(): void
}

/**
 * Render the picker into `host`.
 *
 * `getSelected` is read rather than passed once, so the caller stays the single
 * source of truth for what is chosen: the sheet holds a draft, the inline panel
 * reads appState, and neither has to tell the picker when it changed.
 */
export function mountBranchPicker(host: HTMLElement, opts: {
  getSelected: () => string
  onPick: (id: string) => void
  /** Survive being re-mounted. Only the inline panel can be. */
  rememberQuery?: boolean
}): BranchPicker {
  const counts = loadBranchCounts()
  const recentIds = loadRecentBranches()

  let ownQuery = ''
  const getQuery = () => (opts.rememberQuery ? panelQuery : ownQuery)
  const setQuery = (v: string) => {
    if (opts.rememberQuery) panelQuery = v
    else ownQuery = v
  }

  mount(host, html`
    <input
      type="text" class="branch-filter" data-branch-q="1"
      placeholder="${t().branchSearchPlaceholder}"
      aria-label="${t().branchFilterLabel}" autocomplete="off"
    />
    <div data-branch-results></div>
  `)

  const input = host.querySelector<HTMLInputElement>('[data-branch-q]')!
  const results = host.querySelector<HTMLElement>('[data-branch-results]')!
  // Set as a property, never interpolated: a branch name can contain a quote,
  // and this restores whatever survived the last re-render.
  input.value = getQuery()

  function refresh(): void {
    const folded = fold(getQuery().trim())
    const matches = (b: Branch) =>
      folded === '' || fold(b.name).includes(folded) || fold(b.address).includes(folded)

    const selected = opts.getSelected()
    const recent = recentIds
      .map(id => BRANCHES.find(b => b.id === id))
      .filter((b): b is Branch => b !== undefined)
      .filter(matches)
    const all = ALPHABETICAL.filter(matches)

    mount(results, html`
      ${recent.length > 0 && html`
        <div class="branch-group">
          <div class="label label--brass">${t().recent}</div>
          ${recent.map(b => row(b, b.id === selected, counts[b.id]))}
        </div>
      `}
      <div class="branch-group">
        <div class="label">${t().allBranches}</div>
        ${all.length === 0
          ? html`<p class="hint">${t().noBranchMatch}</p>`
          : all.map(b => row(b, b.id === selected, counts[b.id]))}
      </div>
    `)
  }

  // Only the results list is rebuilt as the visitor types; the input they are
  // typing into sits outside it and is never touched.
  delegate(host, 'input', '[data-branch-q]', (_e, el) => {
    setQuery((el as HTMLInputElement).value)
    refresh()
  })

  delegate(host, 'click', '[data-branch]', (_e, el) => {
    const id = el.dataset.branch
    if (id) opts.onPick(id)
  })

  refresh()
  return { refresh }
}
