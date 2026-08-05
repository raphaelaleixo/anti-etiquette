/** Which way the new view should come from. */
export type Direction = 'forward' | 'backward'

interface StartViewTransitionOptions {
  update: () => void
  types?: string[]
}

type Doc = Document & {
  startViewTransition?: (
    cb: (() => void) | StartViewTransitionOptions,
  ) => { finished: Promise<void> }
}

/**
 * Chrome 111–124 shipped `startViewTransition(callback)` before the
 * `{update, types}` object form landed in 125. Passing the object to an older
 * build would treat it as the callback and throw, so probe for the pseudo-class
 * that the types form exists to drive.
 */
function supportsTypes(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('selector(:active-view-transition-type(forward))')
  )
}

/**
 * Run a DOM update inside a directional view transition.
 *
 * The React version wrapped `update` in `flushSync`, because
 * `startViewTransition` snapshots the DOM when its callback returns and a
 * pending `setState` would not have committed by then — you would capture the
 * old view twice and see no transition. Vanilla DOM writes are synchronous, so
 * the callback is already the committed new view and the snapshot is correct
 * for free.
 *
 * Degrades in two steps: no view-transition support at all runs the update
 * plainly; support without transition types runs the default cross-fade.
 */
export function transitionTo(update: () => void, direction: Direction): void {
  const doc = document as Doc
  if (!doc.startViewTransition) {
    update()
    return
  }
  if (supportsTypes()) {
    doc.startViewTransition({ update, types: [direction] })
  } else {
    doc.startViewTransition(update)
  }
}
