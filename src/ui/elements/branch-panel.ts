import { StoreElement, html, mount } from '../dom'
import { mountBranchPicker, clearBranchQuery } from '../branchPicker'
import { BRANCHES } from '../../lib/branches'
import * as appState from '../../lib/appState'
import * as lang from '../../lib/lang'

/**
 * The branch list, on the page rather than over it.
 *
 * On a desktop the list is wide enough to live beside the gate that is asking
 * for it, which is what the design draws: the visitor reads "a branch is
 * missing" and the branches are right there, instead of being sent to a modal
 * to fetch one. A phone has neither the room nor a spare thumb, so it keeps
 * the sheet — this element is hidden below the desktop breakpoint.
 *
 * A click commits. The two-step tap-then-confirm the sheet uses exists because
 * a sheet covers the page and browsing it should not be a commitment; nothing
 * is covered here, and committing makes the requirement card beside it flip to
 * satisfied, which is the clearest possible confirmation that the click landed.
 */
export class BranchPanel extends StoreElement {
  protected sources() {
    // Language only. Deliberately *not* appState: committing a branch removes
    // this panel from the page altogether, so there is nothing it would
    // usefully redraw, and every extra subscription is another way for the
    // search box to be rebuilt while someone is typing in it.
    return [lang.subscribe]
  }

  connectedCallback(): void {
    this.className = 'branchpanel'
    super.connectedCallback()
  }

  protected render(): void {
    const t = lang.t()
    mount(this, html`
      <div class="branchpanel-head">
        <h3>${t.chooseBranch}</h3>
        <span class="branchpanel-count">${t.nInMontreal(BRANCHES.length)}</span>
      </div>
      <div class="branchpanel-body"></div>
    `)

    mountBranchPicker(this.querySelector<HTMLElement>('.branchpanel-body')!, {
      getSelected: () => appState.getSnapshot().branch,
      // The one caller that can be rebuilt underneath whoever is typing.
      rememberQuery: true,
      onPick: id => {
        // Cleared first: setBranch publishes, which removes this whole panel,
        // so anything done after it would be running against a detached tree.
        clearBranchQuery()
        appState.setBranch(id)
      },
    })
  }
}
