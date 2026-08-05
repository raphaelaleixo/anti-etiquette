// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { defineElements } from '../src/ui/shell'
import * as appState from '../src/lib/appState'
import * as cellar from '../src/lib/cellar'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'

function wine(sku: string): Wine {
  return {
    sku, name: `Wine ${sku}`, urlKey: `w-${sku}`, price: 20, inStock: true,
    country: 'France', region: null, appellation: null, grapes: [],
    vintage: null, tasteTag: null, rating: null, ratingCount: null, availability: [],
  }
}

defineElements()

beforeEach(() => {
  document.body.innerHTML = ''
  storage.removeItem('cellar.v2')
  cellar.reload()
  appState.setMode('wines')
  appState.clearResults()
})

function mountShell(): HTMLElement {
  document.body.innerHTML = `
    <mode-switch></mode-switch>
    <app-status></app-status>
    <app-panel></app-panel>
    <app-foot></app-foot>`
  return document.body
}

describe('defineElements', () => {
  it('is idempotent, so a second call cannot throw on redefinition', () => {
    expect(() => defineElements()).not.toThrow()
  })

  it('registers every tag the static shell markup emits', () => {
    for (const tag of ['mode-switch', 'app-status', 'app-panel', 'app-foot']) {
      expect(customElements.get(tag)).toBeDefined()
    }
  })
})

describe('mode-switch', () => {
  it('upgrades from static markup and renders the liked count', () => {
    cellar.saveWine(wine('111'), 'like')
    cellar.saveWine(wine('222'), 'dislike')
    mountShell()

    const el = document.querySelector('mode-switch')!
    expect(el.textContent).toContain('My wines · 1') // dislikes are not "my wines"
    expect(el.getAttribute('data-mode')).toBe('wines')
  })

  it('re-renders the count when the cellar changes, with no wiring in the shell', () => {
    mountShell()
    const el = document.querySelector('mode-switch')!
    expect(el.textContent).toContain('My wines · 0')

    cellar.saveWine(wine('111'), 'like')

    expect(el.textContent).toContain('My wines · 1')
  })

  it('switches mode on click and moves the pill via data-mode', () => {
    mountShell()
    const el = document.querySelector('mode-switch')!

    el.querySelector<HTMLButtonElement>('[data-mode="find"]')!.click()

    expect(appState.getSnapshot().mode).toBe('find')
    expect(el.getAttribute('data-mode')).toBe('find')
    expect(el.querySelector('[data-mode="find"]')!.getAttribute('aria-current')).toBe('true')
    expect(el.querySelector('[data-mode="wines"]')!.getAttribute('aria-current')).toBe('false')
  })

  it('ignores a click on the already-selected tab', () => {
    mountShell()
    const el = document.querySelector('mode-switch')!
    let publishes = 0
    const unsub = appState.subscribe(() => { publishes++ })

    el.querySelector<HTMLButtonElement>('[data-mode="wines"]')!.click()

    unsub()
    expect(publishes).toBe(0)
  })
})

describe('app-panel', () => {
  it('swaps the body on a mode change', () => {
    mountShell()
    const panel = document.querySelector('app-panel')!
    expect(panel.querySelector('[data-panel="wines"]')).not.toBe(null)

    appState.setMode('find')

    expect(panel.querySelector('[data-panel="wines"]')).toBe(null)
    expect(panel.querySelector('[data-panel="find"]')).not.toBe(null)
  })

  /**
   * The structural claim behind self-subscription. A central registry would
   * keep this element listening after the shell dropped it, and the leak would
   * be invisible — the element still renders, just into a detached tree.
   */
  it('goes silent once removed from the document', () => {
    mountShell()
    const panel = document.querySelector('app-panel')!
    const before = panel.innerHTML

    panel.remove()
    appState.setMode('find')

    expect(panel.innerHTML).toBe(before)
  })

  it('does not accumulate listeners across repeated tab switches', () => {
    mountShell()
    const panel = document.querySelector('app-panel')!

    for (let i = 0; i < 10; i++) {
      appState.setMode(i % 2 === 0 ? 'find' : 'wines')
    }

    // One panel, one live view. If subscriptions stacked, the element would
    // still be correct — which is why the removal test above is the real one —
    // but a duplicated panel would show up here.
    expect(document.querySelectorAll('app-panel')).toHaveLength(1)
    expect(panel.querySelectorAll('[data-panel]')).toHaveLength(1)
  })
})

describe('app-status', () => {
  it('shows a search status and clears it', () => {
    mountShell()
    const el = document.querySelector('app-status')!

    appState.setStatus('Loading page 2 of 9…')
    expect(el.querySelector('.status')!.textContent).toContain('Loading page 2 of 9')

    appState.setResults([])
    expect(el.querySelector('.status')).toBe(null)
  })

  it('shows a search error', () => {
    mountShell()
    appState.setError('The catalog did not answer.')
    expect(document.querySelector('app-status .error')!.textContent)
      .toContain('The catalog did not answer.')
  })

  it('escapes an error message rather than rendering it as markup', () => {
    mountShell()
    appState.setError('<img src=x onerror="window.pwned=1">')
    const el = document.querySelector('app-status')!
    expect(el.querySelector('img')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })
})

describe('app-foot', () => {
  it('offers add and find on the wines tab', () => {
    mountShell()
    const el = document.querySelector('app-foot')!
    expect(el.querySelector('[data-act="add-wines"]')).not.toBe(null)
    expect(el.querySelector('[data-act="go-find"]')).not.toBe(null)
  })

  it('moves to the find tab from the footer', () => {
    mountShell()
    document.querySelector<HTMLButtonElement>('[data-act="go-find"]')!.click()
    expect(appState.getSnapshot().mode).toBe('find')
  })

  it('disables the search until there is both a branch and a liked wine', () => {
    mountShell()
    appState.setMode('find')
    const button = () => document.querySelector<HTMLButtonElement>('[data-act="search"]')!

    expect(button().disabled).toBe(true)

    appState.setBranch('23112')
    expect(button().disabled).toBe(true) // a branch alone is not enough

    cellar.saveWine(wine('111'), 'like')
    expect(button().disabled).toBe(false)

    appState.setStatus('Searching…')
    expect(button().disabled).toBe(true) // and not while one is already running
  })
})
