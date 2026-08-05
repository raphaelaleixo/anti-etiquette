import { html, mount, type Html } from './dom'

/**
 * A bottom sheet on native `<dialog>`, so Escape-to-close and focus trapping
 * come free — do not hand-roll either.
 *
 * Sheets are deliberately NOT `StoreElement`s and never subscribe to anything.
 * That is the answer to the focus-and-scroll problem: a textarea the user is
 * typing into must never sit inside a subtree that something else can decide
 * to re-render. A sheet renders when it opens, re-renders only in response to
 * its own controls, and reads the DOM on submit.
 */

export interface Sheet {
  readonly dialog: HTMLDialogElement
  readonly body: HTMLElement
  readonly foot: HTMLElement
  setTitle(title: string): void
  setBody(markup: Html): void
  setFoot(markup: Html): void
  close(): void
}

export function openSheet(opts: {
  title: string
  /** true = tall sheet inset from the top; false = auto-height from the bottom */
  full?: boolean
  /** Overrides the default "Cancel" control in the title row. */
  cancelLabel?: string
  onClose?: () => void
}): Sheet {
  const dialog = document.createElement('dialog')
  dialog.className = opts.full ? 'sheet sheet-full' : 'sheet'

  mount(dialog, html`
    <div class="sheet-inner">
      <div class="sheet-head">
        <div class="sheet-grip"></div>
        <div class="sheet-titlerow">
          <div class="sheet-title"></div>
          <button type="button" class="sheet-cancel" data-sheet="cancel">
            ${opts.cancelLabel ?? 'Cancel'}
          </button>
        </div>
      </div>
      <div class="sheet-body"></div>
      <div class="sheet-foot"></div>
    </div>
  `)

  const titleEl = dialog.querySelector('.sheet-title')!
  const body = dialog.querySelector<HTMLElement>('.sheet-body')!
  const foot = dialog.querySelector<HTMLElement>('.sheet-foot')!
  titleEl.textContent = opts.title

  let closed = false
  function close(): void {
    if (closed) return
    closed = true
    if (dialog.open) dialog.close()
    dialog.remove()
    opts.onClose?.()
  }

  dialog.addEventListener('close', close)
  dialog.querySelector('[data-sheet="cancel"]')!.addEventListener('click', () => close())
  // A click landing on the dialog itself is a click on the backdrop; anything
  // inside the sheet targets a descendant.
  dialog.addEventListener('click', e => { if (e.target === dialog) close() })

  document.body.append(dialog)
  // Guarded: jsdom-style test environments implement <dialog> without the
  // modal machinery, and a missing showModal must not take down the flow.
  if (typeof dialog.showModal === 'function') dialog.showModal()

  return {
    dialog,
    body,
    foot,
    setTitle: (t: string) => { titleEl.textContent = t },
    setBody: (markup: Html) => mount(body, markup),
    setFoot: (markup: Html) => mount(foot, markup),
    close,
  }
}
