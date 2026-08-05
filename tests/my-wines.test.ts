// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineElements } from '../src/ui/shell'
import * as cellar from '../src/lib/cellar'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'

function wine(sku: string, over: Partial<Wine> = {}): Wine {
  return {
    sku, name: `Wine ${sku}`, urlKey: `w-${sku}`, price: 20, inStock: true,
    country: 'France', region: 'Rhône', appellation: null, grapes: [],
    vintage: null, tasteTag: null, rating: null, ratingCount: null,
    availability: [], ...over,
  }
}

defineElements()

function mountList(): HTMLElement {
  document.body.innerHTML = '<my-wines></my-wines>'
  return document.body.querySelector('my-wines')!
}

beforeEach(() => {
  document.body.innerHTML = ''
  storage.removeItem('cellar.v2')
  cellar.reload()
})

describe('the three groups', () => {
  it('files each wine under its kind', () => {
    cellar.saveWine(wine('111'), 'like')
    cellar.saveWine(wine('222'), 'dislike')
    cellar.saveWine(wine('333'), 'skip')
    const el = mountList()

    const counts = [...el.querySelectorAll('.mywines-count')].map(n => n.textContent)
    expect(counts).toEqual(['1', '1', '1'])
    expect(el.querySelector('.mywines-row--liked .mywines-name')!.textContent).toBe('Wine 111')
    expect(el.querySelector('.mywines-row--disliked .mywines-name')!.textContent).toBe('Wine 222')
    expect(el.querySelector('.mywines-row--skipped .mywines-name')!.textContent).toBe('Wine 333')
  })

  it('shows a hint instead of an empty list', () => {
    const el = mountList()
    expect(el.querySelectorAll('.mywines-row')).toHaveLength(0)
    expect(el.textContent).toContain('Add wines you have drunk and liked')
  })

  it('re-renders when the cellar changes, with nothing wiring it', () => {
    const el = mountList()
    cellar.saveWine(wine('111'), 'like')
    expect(el.querySelector('.mywines-name')!.textContent).toBe('Wine 111')
  })
})

/**
 * The count and the rows are drawn from the same list, so they cannot
 * disagree. That is what removes skipsRevealed, the three *Total props and
 * every "Loading N more…" line: there is no asynchronous gap left to describe.
 */
describe('no loading gap', () => {
  it('counts a wine with no cached record and still renders a row for it', () => {
    cellar.replaceAll([
      { sku: '111', kind: 'like', addedAt: 1, wine: null, wineFetchedAt: 0 },
      { sku: '222', kind: 'like', addedAt: 2, wine: wine('222'), wineFetchedAt: 1 },
    ])
    const el = mountList()

    expect(el.querySelector('.mywines-count')!.textContent).toBe('2')
    expect(el.querySelectorAll('.mywines-group .mywines-row')).toHaveLength(2)
    expect(el.textContent).not.toContain('Loading')
  })

  it('names the unresolved SKU and offers a way out', () => {
    // The React app rendered this as a permanent, invisible "Loading 1 more…".
    cellar.replaceAll([{ sku: '10237458', kind: 'like', addedAt: 1, wine: null, wineFetchedAt: 0 }])
    const el = mountList()

    const row = el.querySelector('.mywines-row--unresolved')!
    expect(row.textContent).toContain('SKU 10237458')
    expect(row.textContent).toContain("couldn't look this up")

    row.querySelector<HTMLButtonElement>('[data-act="remove"]')!.click()
    expect(cellar.getSnapshot().entries).toHaveLength(0)
  })
})

describe('row actions', () => {
  it('re-files a wine between kinds', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()

    el.querySelector<HTMLButtonElement>(
      '[data-act="set-kind"][data-sku="111"][data-kind="dislike"]',
    )!.click()

    expect(cellar.getSnapshot().refs).toEqual([{ sku: '111', kind: 'dislike' }])
    expect(el.querySelector('.mywines-row--disliked')).not.toBe(null)
  })

  it('removes a wine', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()

    el.querySelector<HTMLButtonElement>('[data-act="remove"][data-sku="111"]')!.click()

    expect(cellar.getSnapshot().entries).toHaveLength(0)
    expect(el.querySelectorAll('.mywines-row')).toHaveLength(0)
  })

  it('marks the current kind as pressed in the menu', () => {
    cellar.saveWine(wine('111'), 'skip')
    const el = mountList()

    const pressed = [...el.querySelectorAll('[data-act="set-kind"][data-sku="111"]')]
      .filter(b => b.getAttribute('aria-pressed') === 'true')
      .map(b => (b as HTMLElement).dataset.kind)

    expect(pressed).toEqual(['skip'])
  })
})

/**
 * The Task 5 hazard. In React, `choose()` called the action and *then*
 * hidePopover(); in vanilla that order destroys the popover's own node
 * mid-handler, because the mutation re-renders this section synchronously.
 *
 * happy-dom implements no Popover API, so the ordering is observed through a
 * stub. That is the right level anyway: top-layer behaviour and anchor
 * positioning are a real-browser concern and stay on the manual checklist.
 */
describe('popover ordering', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover')
  let events: string[]
  let unsub: () => void

  beforeEach(() => {
    events = []
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      writable: true,
      value: function hidePopover(this: HTMLElement) {
        events.push(`hide:${this.id}`)
      },
    })
    unsub = cellar.subscribe(() => events.push('mutate'))
  })

  afterEach(() => {
    unsub()
    if (original) Object.defineProperty(HTMLElement.prototype, 'hidePopover', original)
    else delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
  })

  it('hides the popover BEFORE re-filing, not after', () => {
    cellar.saveWine(wine('111'), 'like')
    events.length = 0
    const el = mountList()

    el.querySelector<HTMLButtonElement>(
      '[data-act="set-kind"][data-sku="111"][data-kind="skip"]',
    )!.click()

    expect(events).toEqual(['hide:wine-menu-111', 'mutate'])
  })

  it('hides the popover BEFORE removing', () => {
    cellar.saveWine(wine('111'), 'like')
    events.length = 0
    const el = mountList()

    el.querySelector<HTMLButtonElement>(
      '.wine-menu [data-act="remove"][data-sku="111"]',
    )!.click()

    expect(events).toEqual(['hide:wine-menu-111', 'mutate'])
  })

  it('does not throw when the engine has no Popover API at all', () => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()

    expect(() => {
      el.querySelector<HTMLButtonElement>('[data-act="remove"][data-sku="111"]')!.click()
    }).not.toThrow()
    expect(cellar.getSnapshot().entries).toHaveLength(0)
  })
})

describe('third-party names are data, not markup', () => {
  it('renders a script in a wine name inert', () => {
    cellar.saveWine(wine('111', { name: 'Château <script>window.pwned=1</script>' }), 'like')
    const el = mountList()

    expect(el.querySelector('script')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
    expect(el.querySelector('.mywines-name')!.textContent).toContain('<script>')
  })

  it('escapes a name inside the menu aria-label too', () => {
    cellar.saveWine(wine('111', { name: '" onmouseover="window.pwned=1' }), 'like')
    const el = mountList()

    const button = el.querySelector('.mywines-menu-btn')!
    expect(button.getAttribute('onmouseover')).toBe(null)
    expect(button.getAttribute('aria-label')).toContain('onmouseover')
  })
})
