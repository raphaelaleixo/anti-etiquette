// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { esc, html, raw, mount, delegate, StoreElement, type Subscribe } from '../src/ui/dom'

let host: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.append(host)
})

describe('esc', () => {
  it('escapes the five characters that can break out of markup', () => {
    expect(esc('&')).toBe('&amp;')
    expect(esc('<')).toBe('&lt;')
    expect(esc('>')).toBe('&gt;')
    expect(esc('"')).toBe('&quot;')
    expect(esc("'")).toBe('&#39;')
  })

  it('escapes the ampersand first, so entities are not double-decoded', () => {
    expect(esc('&lt;')).toBe('&amp;lt;')
  })

  it('coerces non-strings rather than throwing', () => {
    expect(esc(42)).toBe('42')
  })
})

describe('html', () => {
  it('escapes interpolations but not the literal parts', () => {
    const name = '<b>Château</b>'
    expect(html`<p>${name}</p>`).toBe('<p>&lt;b&gt;Château&lt;/b&gt;</p>')
  })

  it('escapes quotes, so an interpolation cannot break out of an attribute', () => {
    const sku = '" onclick="steal()'
    const markup = html`<li data-sku="${sku}"></li>`
    mount(host, markup)
    expect(host.firstElementChild?.getAttribute('onclick')).toBe(null)
    expect(host.firstElementChild?.getAttribute('data-sku')).toBe('" onclick="steal()')
  })

  it('composes nested html through raw()', () => {
    const row = (n: string) => html`<li>${n}</li>`
    const markup = html`<ul>${raw([row('a'), row('b')].join(''))}</ul>`
    expect(markup).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('joins arrays, escaping each element', () => {
    expect(html`<p>${['<a>', '<b>']}</p>`).toBe('<p>&lt;a&gt;&lt;b&gt;</p>')
  })

  it('renders nullish and false as nothing, so `cond && …` reads as it looks', () => {
    expect(html`<p>${null}${undefined}${false}</p>`).toBe('<p></p>')
  })

  it('renders zero, which is falsy but meaningful', () => {
    expect(html`<p>${0}</p>`).toBe('<p>0</p>')
  })
})

describe('the regression React used to prevent', () => {
  it('renders a script in a wine name inert', () => {
    // A SAQ catalog name is third-party text. Under plain innerHTML this line
    // is the whole vulnerability.
    const wine = { name: 'Château <script>window.pwned = true</script> Margaux' }
    mount(host, html`<h2>${wine.name}</h2>`)

    expect(host.querySelector('script')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
    expect(host.textContent).toContain('<script>')
  })

  it('renders an img onerror payload inert', () => {
    const typed = '<img src=x onerror="window.pwned = true">'
    mount(host, html`<p>from "${typed}"</p>`)

    expect(host.querySelector('img')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })
})

describe('delegate', () => {
  it('survives a full re-render of the host', () => {
    const clicked: string[] = []
    delegate(host, 'click', '[data-act="remove"]', (_e, el) => {
      clicked.push(el.dataset.sku!)
    })

    mount(host, html`<button data-act="remove" data-sku="111">x</button>`)
    host.querySelector('button')!.click()

    // The listener is on the host, so replacing every child cannot orphan it.
    mount(host, html`<button data-act="remove" data-sku="222">x</button>`)
    host.querySelector('button')!.click()

    expect(clicked).toEqual(['111', '222'])
  })

  it('matches when the event target is nested inside the selector', () => {
    const hits: string[] = []
    delegate(host, 'click', '[data-act]', (_e, el) => hits.push(el.dataset.act!))
    mount(host, html`<button data-act="open"><span>label</span></button>`)

    host.querySelector('span')!.click()

    expect(hits).toEqual(['open'])
  })

  it('ignores clicks that match nothing', () => {
    let calls = 0
    delegate(host, 'click', '[data-act]', () => { calls++ })
    mount(host, html`<p>nothing actionable</p>`)

    host.querySelector('p')!.click()

    expect(calls).toBe(0)
  })
})

/** Minimal store with the shape cellar.ts will have. */
function makeStore() {
  const listeners = new Set<() => void>()
  return {
    subscribe: ((fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }) as Subscribe,
    publish: () => listeners.forEach(fn => fn()),
    count: () => listeners.size,
  }
}

describe('StoreElement', () => {
  it('renders on connect, re-renders on publish, and stops after removal', () => {
    const store = makeStore()
    let renders = 0

    class Section extends StoreElement {
      protected sources() { return [store.subscribe] }
      protected render() { renders++ }
    }
    customElements.define('test-section', Section)

    const el = document.createElement('test-section')
    document.body.append(el)
    expect(renders).toBe(1)

    store.publish()
    expect(renders).toBe(2)

    el.remove()
    store.publish()
    expect(renders).toBe(2) // the whole point: a removed section is silent
  })

  it('unsubscribes from every source on disconnect', () => {
    const a = makeStore()
    const b = makeStore()

    class TwoSource extends StoreElement {
      protected sources() { return [a.subscribe, b.subscribe] }
      protected render() {}
    }
    customElements.define('test-two-source', TwoSource)

    const el = document.createElement('test-two-source')
    document.body.append(el)
    expect([a.count(), b.count()]).toEqual([1, 1])

    el.remove()
    expect([a.count(), b.count()]).toEqual([0, 0])
  })

  it('does not stack subscriptions when moved between hosts', () => {
    const store = makeStore()

    class Movable extends StoreElement {
      protected sources() { return [store.subscribe] }
      protected render() {}
    }
    customElements.define('test-movable', Movable)

    const el = document.createElement('test-movable')
    const other = document.createElement('div')
    document.body.append(other)

    document.body.append(el)
    other.append(el) // a move is a disconnect followed by a connect

    expect(store.count()).toBe(1)
  })

  it('upgrades and subscribes when created through innerHTML', () => {
    // Rows arrive as markup strings, not createElement calls, so this is the
    // path that actually matters.
    const store = makeStore()
    let renders = 0

    class Row extends StoreElement {
      protected sources() { return [store.subscribe] }
      protected render() { renders++ }
    }
    customElements.define('test-row', Row)

    mount(host, html`<test-row data-sku="${'111'}"></test-row>`)

    expect(renders).toBe(1)
    expect(store.count()).toBe(1)
  })
})
