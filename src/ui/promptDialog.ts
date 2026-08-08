import { html, mount, delegate, closePopoverFrom, type Html } from './dom'
import { CHAT_DESTINATIONS, getDestination, setDestination } from '../lib/chat'
import { t } from '../lib/lang'

/**
 * The prompt, in a dialog, with a copy button.
 *
 * Three states, and the brass fill marks the next thing to tap: Copy is
 * primary until a copy succeeds, then Open ChatGPT is. Nothing else moves.
 */
export interface PromptSource {
  /** The text, for a given "include" count. 0 means every ranked wine. */
  build(count: number): string
  /** How many wines the shelf offered, for the "All N" label. */
  total: number
  counts: readonly number[]
  count: number
  onCount(n: number): void
}

/**
 * Open the chat you use, with a way to pick a different one.
 *
 * A split control rather than a row of four: almost everyone wants the same
 * destination every time, so the common case is one press and the choice is
 * remembered. Picking from the menu both opens that one and makes it the
 * default, which is what a split button is understood to do.
 *
 * The menu items are real anchors, so middle-click and cmd-click still open a
 * background tab — the preference is saved on the way past rather than by
 * intercepting the navigation.
 */
function chatSplit(variant: 'primary' | 'secondary', id: string): Html {
  const chosen = getDestination()
  const cls = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
  return html`
    <div class="chatsplit">
      <a class="${cls} chatsplit-go" data-prompt="open" href="${chosen.url}"
         target="_blank" rel="noopener noreferrer">${t().openChat(chosen.name)}</a>
      <button type="button" class="${cls} chatsplit-more" popovertarget="${id}"
              aria-label="${t().chooseChat}">▾</button>
      <div id="${id}" popover="auto" class="wine-menu chatsplit-menu">
        ${CHAT_DESTINATIONS.map(d => html`
          <a class="wine-menu-item" href="${d.url}" data-chat="${d.id}"
             target="_blank" rel="noopener noreferrer"
             aria-current="${d.id === chosen.id ? 'true' : 'false'}">
            <span class="wine-menu-tick" aria-hidden="true">${d.id === chosen.id ? '✓' : ''}</span>
            ${d.name}
          </a>
        `)}
      </div>
    </div>
  `
}

export function openPromptDialog(source: PromptSource, branchName: string): void {
  const dialog = document.createElement('dialog')
  dialog.className = 'prompt-dialog'
  let prompt = source.build(source.count)

  /*
   * A block of text whose job is to leave.
   *
   * Laid out as the two steps it actually is — copy, then paste somewhere else
   * — rather than as a textarea with a button beside it. The second step stays
   * visible but inert until the first has happened, so the order is legible
   * before either is done.
   */
  mount(dialog, html`
    <div class="prompt-dialog-head">
      <h2>${t().secondOpinion}</h2>
      <button type="button" class="icon-close" aria-label="${t().close}" data-prompt="close">×</button>
    </div>
    <p class="hint">${t().promptExplain(branchName)}</p>
    <!--
      Choosing how much of the shelf to include belongs beside the text it
      changes, not in the app's footer bar: the character count next to it is
      the only place the choice has a visible consequence.
    -->
    <div class="prompt-include">
      <span class="label">${t().include}</span>
      <div class="prompt-include-seg" data-prompt="counts"></div>
      <span class="prompt-chars" data-prompt="chars">${t().characters(prompt.length)}</span>
    </div>
    <textarea rows="12" readonly data-prompt="text"></textarea>
    <div class="prompt-steps" data-prompt="steps">
      <div class="prompt-step" data-prompt="step1">
        <span class="prompt-steplabel">${t().stepCopy}</span>
        <button type="button" class="btn-primary" data-prompt="copy">${t().copySummary}</button>
      </div>
      <div class="prompt-step is-pending" data-prompt="step2">
        <span class="prompt-steplabel">${t().stepPaste}</span>
        ${chatSplit('secondary', 'chat-pick-step')}
      </div>
    </div>
    <p class="hint" data-prompt="note"></p>
  `)

  const textarea = dialog.querySelector<HTMLTextAreaElement>('[data-prompt="text"]')!
  const copyButton = dialog.querySelector<HTMLButtonElement>('[data-prompt="copy"]')!
  // Set as a property, not interpolated: the prompt runs to tens of thousands
  // of characters and is the one string here guaranteed to contain quotes.
  textarea.value = prompt

  function close(): void {
    if (dialog.open) dialog.close()
    dialog.remove()
  }

  delegate(dialog, 'click', '[data-chat]', (_e, el) => {
    setDestination(el.dataset.chat ?? '')
    closePopoverFrom(el)
  })

  dialog.querySelector('[data-prompt="close"]')!.addEventListener('click', close)
  dialog.addEventListener('close', () => dialog.remove())

  const note = dialog.querySelector<HTMLElement>('[data-prompt="note"]')!
  const seg = dialog.querySelector<HTMLElement>('[data-prompt="counts"]')!
  const chars = dialog.querySelector<HTMLElement>('[data-prompt="chars"]')!

  /**
   * Redraw the include control and the text it produces.
   *
   * The textarea's value is set as a property, never interpolated: the prompt
   * runs to tens of thousands of characters and is the one string here
   * guaranteed to contain quotes.
   */
  function renderCounts(): void {
    mount(seg, html`
      ${source.counts.map(n => html`
        <button type="button" class="${n === source.count ? 'active' : ''}"
                data-prompt="count" data-count="${n}"
                aria-pressed="${n === source.count ? 'true' : 'false'}"
        >${n === 0 ? t().allN(source.total) : t().topN(n)}</button>
      `)}
    `)
  }

  delegate(seg, 'click', '[data-prompt="count"]', (_e, el) => {
    source.count = Number(el.dataset.count)
    source.onCount(source.count)
    prompt = source.build(source.count)
    textarea.value = prompt
    chars.textContent = t().characters(prompt.length)
    renderCounts()
  })

  renderCounts()

  /**
   * What replaces the two steps once the text is actually on the clipboard.
   *
   * The design swaps the region rather than relabelling the button: "copied"
   * on a button that still looks like the next thing to press leaves the
   * visitor holding a clipboard with nowhere to put it. This says where.
   */
  function showCopied(): void {
    const steps = dialog.querySelector<HTMLElement>('[data-prompt="steps"]')!
    mount(steps, html`
      <div class="prompt-done">
        <div class="prompt-done-head">
          <span class="prompt-done-tick" aria-hidden="true">✓</span>
          <span class="prompt-done-count">${t().copiedChars(prompt.length)}</span>
        </div>
        <h3>${t().nowOpenChat}</h3>
        <p>${t().onClipboard}</p>
        <div class="prompt-done-actions">
          ${chatSplit('primary', 'chat-pick-done')}
          <button type="button" class="btn-secondary" data-prompt="again">${t().copyAgain}</button>
        </div>
      </div>
    `)
    steps.classList.remove('prompt-steps')
    steps.querySelector('[data-prompt="again"]')!
      .addEventListener('click', () => { void copy() })
  }

  async function copy(): Promise<void> {
    // `writeText` must be the FIRST statement in this handler, with no await
    // and no other call before it. That is what keeps the call inside the
    // tap's own user activation rather than a consumed one — Safari rejects
    // it otherwise, and this project has already shipped that bug once.
    try {
      await navigator.clipboard.writeText(prompt)
      note.textContent = ''
      showCopied()
    } catch {
      copyButton.textContent = t().selectInstead
      note.textContent = t().clipboardRefused
      textarea.classList.add('copy-failed')
      // Select the text so the OS copy affordance (long-press, Cmd-C) is one
      // action away. No error dialog, no instructions to read.
      textarea.select()
    }
  }

  copyButton.addEventListener('click', () => { void copy() })

  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
}
