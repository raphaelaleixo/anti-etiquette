/**
 * The whole rendering toolkit.
 *
 * React escaped interpolated text for free. Wine names, regions and
 * appellations are third-party strings from SAQ's catalog, and the resolution
 * table echoes the user's own typed input back into markup — so plain
 * innerHTML would execute a name containing markup. Escaping is therefore the
 * default here and `raw()` is the explicit, greppable exception. Per-call
 * discipline would not survive; a structural default does.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function esc(v: unknown): string {
  return String(v).replace(/[&<>"']/g, c => ESCAPES[c]!)
}

/**
 * Markup that is known safe to insert.
 *
 * Only `html` and `raw` produce it, and only `mount` consumes it, so an
 * ordinary string can never reach innerHTML by accident.
 */
export interface Html {
  readonly __raw: string
}

/**
 * Explicit opt-out for markup that is already safe and did NOT come from
 * `html` — the only reason to reach for this is genuinely external trusted
 * markup.
 *
 * `grep 'raw('` is the audit, and it is only a useful audit if the hits are
 * few. Nested `html` results are safe automatically and must not use this.
 */
export function raw(markup: string): Html {
  return { __raw: markup }
}

function isHtml(v: unknown): v is Html {
  return typeof v === 'object' && v !== null && typeof (v as Html).__raw === 'string'
}

/**
 * Nullish and `false` render as nothing, so `${cond && html`…`}` reads the way
 * it looks. Arrays are joined, each element following the same rule. Anything
 * else is escaped.
 */
function interpolate(v: unknown): string {
  if (v === null || v === undefined || v === false) return ''
  if (isHtml(v)) return v.__raw
  if (Array.isArray(v)) return v.map(interpolate).join('')
  return esc(v)
}

/**
 * Tagged template. Interpolated *values* are HTML-escaped; interpolated
 * `html` results are not, because they were escaped when they were built.
 *
 * Returning `Html` rather than `string` is what makes composition safe without
 * an opt-out at every nesting site. An earlier draft returned a string, which
 * meant every nested template needed `raw()` — and a `raw()` on every list row
 * is not an audit trail, it is noise that hides the one call that matters.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    out += interpolate(values[i]) + (strings[i + 1] ?? '')
  }
  return { __raw: out }
}

/** The only path to innerHTML, and it accepts nothing but `Html`. */
export function mount(host: HTMLElement, markup: Html): void {
  host.innerHTML = markup.__raw
}

/**
 * One listener on the host, matched by selector.
 *
 * Handlers never bind to rows, because a full innerHTML re-render of a section
 * would orphan them. The host outlives every re-render, so this wiring cannot
 * rot.
 */
export function delegate<K extends keyof HTMLElementEventMap>(
  host: HTMLElement,
  type: K,
  selector: string,
  fn: (event: HTMLElementEventMap[K], el: HTMLElement) => void,
): void {
  host.addEventListener(type, event => {
    const target = event.target
    if (!(target instanceof Element)) return
    const el = target.closest(selector)
    if (el instanceof HTMLElement && host.contains(el)) fn(event, el)
  })
}

/** A store's subscribe function: takes a listener, returns an unsubscribe. */
export type Subscribe = (fn: () => void) => () => void

/**
 * Light-DOM custom element that subscribes on connect and unsubscribes on
 * disconnect.
 *
 * This is what vanilla otherwise lacks. A central registry of
 * `subscribe(render)` calls is only *auditable*; self-subscription is
 * structural — the element that renders is the element that subscribes, so a
 * new section cannot forget to wire itself, and tab switching cannot leak a
 * listener per switch.
 *
 * No shadow DOM: one global stylesheet, and the document-scoped rules
 * (view-transition pseudo-elements, @starting-style, prefers-reduced-motion)
 * keep working where they already do.
 */
export abstract class StoreElement extends HTMLElement {
  #unsubs: Array<() => void> = []

  protected abstract sources(): Subscribe[]
  protected abstract render(): void

  connectedCallback(): void {
    this.#release() // a moved element reconnects; never stack subscriptions
    this.#unsubs = this.sources().map(subscribe => subscribe(() => this.render()))
    this.render()
  }

  disconnectedCallback(): void {
    this.#release()
  }

  #release(): void {
    for (const unsub of this.#unsubs) unsub()
    this.#unsubs = []
  }
}
