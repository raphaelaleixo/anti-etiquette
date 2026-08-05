import { html, mount } from './dom'

/**
 * The prompt, in a dialog, with a copy button.
 *
 * Three states, and the brass fill marks the next thing to tap: Copy is
 * primary until a copy succeeds, then Open ChatGPT is. Nothing else moves.
 */
export function openPromptDialog(prompt: string, total: number): void {
  const dialog = document.createElement('dialog')
  dialog.className = 'prompt-dialog'

  mount(dialog, html`
    <div class="prompt-dialog-head">
      <h2>Prompt</h2>
      <button type="button" class="icon-close" aria-label="Close" data-prompt="close">×</button>
    </div>
    <p class="hint">${total} wines available · ${prompt.length} characters</p>
    <textarea rows="14" readonly data-prompt="text"></textarea>
    <div class="prompt-dialog-footer">
      <button type="button" class="btn-primary" data-prompt="copy">Copy</button>
      <a
        class="btn-secondary prompt-link" data-prompt="open"
        href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"
      >Open ChatGPT ↗</a>
    </div>
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

  copyButton.addEventListener('click', async () => {
    // `writeText` must be the FIRST statement in this handler, with no await
    // and no other call before it. That is what keeps the call inside the
    // tap's own user activation rather than a consumed one — Safari rejects
    // it otherwise, and this project has already shipped that bug once.
    try {
      await navigator.clipboard.writeText(prompt)
      copyButton.textContent = 'Copied ✓'
      copyButton.className = 'btn-secondary'
      openLink.className = 'btn-primary prompt-link'
    } catch {
      copyButton.textContent = 'Select and copy manually'
      textarea.classList.add('copy-failed')
      // Select the text so the OS copy affordance (long-press, Cmd-C) is one
      // action away. No error dialog, no instructions to read.
      textarea.select()
    }
  })

  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
}
