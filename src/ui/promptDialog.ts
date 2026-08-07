import { html, mount } from './dom'
import { t } from '../lib/lang'

/**
 * The prompt, in a dialog, with a copy button.
 *
 * Three states, and the brass fill marks the next thing to tap: Copy is
 * primary until a copy succeeds, then Open ChatGPT is. Nothing else moves.
 */
export function openPromptDialog(prompt: string, branchName: string): void {
  const dialog = document.createElement('dialog')
  dialog.className = 'prompt-dialog'

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
    <textarea rows="12" readonly data-prompt="text"></textarea>
    <p class="hint" data-prompt="chars">${t().characters(prompt.length)}</p>
    <div class="prompt-steps" data-prompt="steps">
      <div class="prompt-step" data-prompt="step1">
        <span class="prompt-steplabel">${t().stepCopy}</span>
        <button type="button" class="btn-primary" data-prompt="copy">${t().copySummary}</button>
      </div>
      <div class="prompt-step is-pending" data-prompt="step2">
        <span class="prompt-steplabel">${t().stepPaste}</span>
        <a class="btn-secondary prompt-link" data-prompt="open"
           href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"
        >${t().openChatGpt}</a>
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

  dialog.querySelector('[data-prompt="close"]')!.addEventListener('click', close)
  dialog.addEventListener('close', () => dialog.remove())

  const note = dialog.querySelector<HTMLElement>('[data-prompt="note"]')!

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
          <a class="btn-primary" href="https://chatgpt.com/"
             target="_blank" rel="noopener noreferrer">${t().openChatGpt}</a>
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
