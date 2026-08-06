import { html, mount, delegate, setProp, type Html } from './dom'
import { openSheet } from './sheet'
import {
  BRANCHES, fold, loadRecentBranches, loadBranchCounts, type Branch,
} from '../lib/branches'
import * as appState from '../lib/appState'
import { t } from '../lib/lang'

/**
 * The branch picker.
 *
 * Montréal only, and the sheet says so — this fork does not pretend to cover
 * the province. The two trade-only depots are excluded upstream in
 * `branches.ts`: they are in the store feed and were selectable in the React
 * app, but they serve restaurateurs, so a member of the public who picks one
 * gets a branch they cannot buy from.
 *
 * Tapping a row highlights it; the footer confirms. Two steps rather than one
 * so the list can be browsed — and the counts compared — without committing.
 *
 * Renders once and reads the DOM as the user types. Nothing subscribes.
 */

const ALPHABETICAL = [...BRANCHES].sort((a, b) => a.name.localeCompare(b.name))

function row(branch: Branch, selected: boolean, count: number | undefined): Html {
  return html`
    <button type="button" class="branch-row" data-branch="${branch.id}">
      <span class="${selected ? 'branch-radio branch-radio--on' : 'branch-radio'}" aria-hidden="true">
        ${selected ? '✓' : ''}
      </span>
      <span class="branch-body">
        <span class="branch-name">${branch.name}</span>
        <span class="branch-address">
          ${branch.address}${count === undefined ? '' : t().inStockAt(count)}
        </span>
      </span>
    </button>
  `
}

export function openBranchSheet(): void {
  const sheet = openSheet({ title: t().whichShop, full: true })
  const counts = loadBranchCounts()
  const recentIds = loadRecentBranches()
  let selected = appState.getSnapshot().branch

  mount(sheet.body, html`
    <input
      type="text" class="branch-filter" data-branch-q="1"
      placeholder="${t().branchSearchPlaceholder}"
      aria-label="${t().branchFilterLabel}" autocomplete="off"
    />
    <div data-branch-results></div>
  `)

  const results = sheet.body.querySelector<HTMLElement>('[data-branch-results]')!
  const query = () => sheet.body.querySelector<HTMLInputElement>('[data-branch-q]')!.value

  function renderResults(): void {
    const folded = fold(query().trim())
    const matches = (b: Branch) =>
      folded === '' || fold(b.name).includes(folded) || fold(b.address).includes(folded)

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

  function renderFoot(): void {
    const branch = BRANCHES.find(b => b.id === selected)
    sheet.setFoot(html`
      <button class="btn-primary" data-branch-confirm="1">
        ${branch ? t().useBranch(branch.name) : t().useBranchEmpty}
      </button>
      <div class="sheet-summary">${t().montrealOnly(BRANCHES.length)}</div>
    `)
    setProp<HTMLButtonElement, 'disabled'>(
      sheet.foot, '[data-branch-confirm]', 'disabled', branch === undefined)
  }

  // Only the results list re-renders as the user types; the input they are
  // typing into sits outside it and is never rebuilt.
  delegate(sheet.body, 'input', '[data-branch-q]', () => renderResults())

  delegate(sheet.body, 'click', '[data-branch]', (_e, el) => {
    selected = el.dataset.branch ?? selected
    renderResults()
    renderFoot()
  })

  delegate(sheet.foot, 'click', '[data-branch-confirm]', () => {
    if (!selected) return
    appState.setBranch(selected)
    sheet.close()
  })

  renderResults()
  renderFoot()
}
