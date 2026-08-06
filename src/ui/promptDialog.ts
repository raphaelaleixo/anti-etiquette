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
    <div class="prompt-steps">
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
  const openLink = dialog.querySelector<HTMLAnchorElement>('[data-prompt="open"]')!
  // Set as a property, not interpolated: the prompt runs to tens of thousands
  // of characters and is the one string here guaranteed to contain quotes.
  textarea.value = prompt

  function close(): void {
    if (dialog.open) dialog.close()
    dialog.remove()
  }

  dialog.querySelector('[data-prompt="close"]')!.addEventListener('click', close)
  dialog.addEventListener('close', () => dialog.remove())

  const step1 = dialog.querySelector<HTMLElement>('[data-prompt="step1"]')!
  const step2 = dialog.querySelector<HTMLElement>('[data-prompt="step2"]')!
  const note = dialog.querySelector<HTMLElement>('[data-prompt="note"]')!

  copyButton.addEventListener('click', async () => {
    // `writeText` must be the FIRST statement in this handler, with no await
    // and no other call before it. That is what keeps the call inside the
    // tap's own user activation rather than a consumed one — Safari rejects
    // it otherwise, and this project has already shipped that bug once.
    try {
      await navigator.clipboard.writeText(prompt)
      copyButton.textContent = t().copiedChars(prompt.length)
      copyButton.className = 'btn-secondary'
      // The next thing to do moves from step one to step two, rather than both
      // sitting there looking equally available.
      step1.classList.add('is-done')
      step2.classList.remove('is-pending')
      openLink.className = 'btn-primary prompt-link'
      note.textContent = t().onClipboard
    } catch {
      copyButton.textContent = t().selectInstead
      note.textContent = t().clipboardRefused
      textarea.classList.add('copy-failed')
      // Select the text so the OS copy affordance (long-press, Cmd-C) is one
      // action away. No error dialog, no instructions to read.
      textarea.select()
    }
  })

  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
}
