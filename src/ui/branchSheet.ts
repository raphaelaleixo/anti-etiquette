import { html, delegate, setProp } from './dom'
import { openSheet } from './sheet'
import { mountBranchPicker, clearBranchQuery } from './branchPicker'
import { BRANCHES } from '../lib/branches'
import * as appState from '../lib/appState'
import { t } from '../lib/lang'

/**
 * The branch picker, as a sheet.
 *
 * Tapping a row highlights it; the footer confirms. Two steps rather than one
 * so the list can be browsed — and the counts compared — without committing,
 * which matters here because the sheet covers everything behind it. The inline
 * panel on desktop commits on click instead: nothing is covered, so there is
 * nothing to come back from.
 *
 * Renders once and nothing subscribes, so the search box the visitor is typing
 * into cannot be rebuilt underneath them.
 */
export function openBranchSheet(): void {
  const sheet = openSheet({ title: t().whichShop, full: true })
  let selected = appState.getSnapshot().branch

  const picker = mountBranchPicker(sheet.body, {
    getSelected: () => selected,
    onPick: id => {
      selected = id
      picker.refresh()
      renderFoot()
    },
  })

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

  delegate(sheet.foot, 'click', '[data-branch-confirm]', () => {
    if (!selected) return
    appState.setBranch(selected)
    // Committing from anywhere resets the inline panel's remembered search:
    // the next time that panel appears the branch has been cleared again, and
    // an old query would narrow the list without saying so.
    clearBranchQuery()
    sheet.close()
  })

  renderFoot()
}
