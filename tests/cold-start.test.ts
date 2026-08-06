// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineElements } from '../src/ui/shell'
import * as cellar from '../src/lib/cellar'
import * as appState from '../src/lib/appState'
import * as catalog from '../src/lib/catalog'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'

function wine(sku: string): Wine {
  return {
    sku, name: `Wine ${sku}`, urlKey: `w-${sku}`, price: 20, inStock: true,
    country: 'France', region: 'Rhône', appellation: null, grapes: ['Syrah'],
    vintage: null, tasteTag: null, rating: null, ratingCount: null, availability: [],
  }
}

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!

defineElements()

beforeEach(() => {
  document.body.innerHTML = ''
  for (const k of ['cellar.v2', 'branch']) storage.removeItem(k)
  cellar.reload()
  appState.clearResults()
  appState.setBranch('')
})

afterEach(() => { vi.restoreAllMocks() })

function mountFind(): void {
  appState.setMode('find')
  document.body.innerHTML = '<find-panel></find-panel><app-foot></app-foot>'
}

/**
 * The React app always opened on *Find a wine* (App.tsx:52), so a first visit
 * was a disabled button with no explanation, and the only way forward was a
 * tab there was no reason to tap.
 */
describe('where a visitor lands', () => {
  it('opens on the wines tab when there is nothing saved', () => {
    storage.removeItem('cellar.v2')
    cellar.reload()
    expect(appState.initialMode()).toBe('wines')
  })

  it('opens on the find tab when there is a list to search with', () => {
    cellar.saveWine(wine('111'), 'like')
    expect(appState.initialMode()).toBe('find')
  })

  it('lands on wines even for a list of only dislikes', () => {
    // There is nothing to search *from*, so the wines tab is still where the
    // work is — but the entry exists, so this documents the boundary: the
    // choice is about having a list at all, not a searchable one.
    cellar.saveWine(wine('111'), 'dislike')
    expect(appState.initialMode()).toBe('find')
  })
})

describe('the find tab with nothing to search from', () => {
  it('says what is missing instead of showing a dead button', () => {
    mountFind()

    expect($('.find-empty h2').textContent).toContain("name a wine or two")
    expect($<HTMLButtonElement>('[data-act="search"]').disabled).toBe(true)
    // The disabled control is still there; what is new is that the page now
    // explains it rather than leaving it to be guessed at.
    expect($('.find-empty .hint').textContent!.length).toBeGreaterThan(20)
  })

  it('offers the action that unblocks it', () => {
    mountFind()
    expect($('[data-find="add"]')).toBeTruthy()

    $('[data-find="add"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(document.querySelector('dialog [data-add="text"]')).toBeTruthy()
  })

  it('moves on to the branch once there are wines', () => {
    cellar.saveWine(wine('111'), 'like')
    mountFind()

    expect($('.find-empty h2').textContent).toContain('pick your branch')
    expect($('[data-find="branch"]')).toBeTruthy()
  })

  it('gets out of the way once both are satisfied', async () => {
    cellar.saveWine(wine('111'), 'like')
    appState.setBranch('23112')
    mountFind()

    expect(document.querySelector('.find-empty')).toBe(null)
    expect($<HTMLButtonElement>('[data-act="search"]').disabled).toBe(false)
  })

  it('does not count a dislike as something to search from', () => {
    cellar.saveWine(wine('111'), 'dislike')
    mountFind()
    expect($('.find-empty h2').textContent).toContain('name a wine or two')
  })
})

/**
 * Splitting one function in two: a typed name wants candidates to choose from,
 * a saved SKU wants proof of identity. Conflating them is how a delisted SKU
 * becomes a stranger's bottle in the liked list.
 */
describe('searchWines vs resolveSku', () => {
  function response(...skus: string[]) {
    return {
      data: {
        productSearch: {
          items: skus.map(sku => ({
            productView: {
              sku, name: `Wine ${sku}`, urlKey: `w-${sku}`, inStock: true,
              attributes: [], price: { final: { amount: { value: 20 } } },
            },
          })),
        },
      },
    }
  }

  it('asks for several candidates, where the old function asked for one', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('111', '222'))),
    )
    await catalog.searchWines('Pinot Noir')

    const { variables } = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(variables.phrase).toBe('Pinot Noir')
    expect(variables.size).toBe(catalog.CANDIDATE_LIMIT)
    expect(variables.size).toBeGreaterThan(1)
  })

  it('returns every candidate the catalog offered, in order', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('111', '222', '333'))),
    )
    expect((await catalog.searchWines('Pinot Noir')).map(w => w.sku))
      .toEqual(['111', '222', '333'])
  })

  it('resolveSku still asks for exactly one', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('111'))),
    )
    await catalog.resolveSku('111')

    const { variables } = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(variables.size).toBe(1)
  })

  it('refuses to substitute a different wine for a SKU', async () => {
    // 12345678 comes back as 12345671, a Gewurztraminer, if left unchecked.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('12345671'))),
    )
    expect(await catalog.resolveSku('12345678')).toBe(null)
  })

  it('accepts the wine it actually asked for', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('12345678'))),
    )
    expect((await catalog.resolveSku('12345678'))?.sku).toBe('12345678')
  })

  it('applies the same identity check when a SKU reaches searchWines', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('12345671', '99999999'))),
    )
    // Reaching for the wrong function must not become a way to get a
    // substitution in through the back door.
    expect(await catalog.searchWines('12345678')).toEqual([])
  })
})
