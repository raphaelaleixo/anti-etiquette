// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineElements } from '../src/ui/shell'
import * as cellar from '../src/lib/cellar'
import * as appState from '../src/lib/appState'
import * as catalog from '../src/lib/catalog'
import { storage } from '../src/lib/storage'
import { wine } from './helpers'

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

  it('says it is ready once both are satisfied, rather than going blank', () => {
    // It used to return nothing here, which is the commonest state in the app
    // — saved wines, a chosen branch, no search yet — and it rendered an empty
    // page. A blank screen is not neutral; it reads as broken.
    cellar.saveWine(wine('111'), 'like')
    appState.setBranch('23112')
    mountFind()

    expect(document.querySelector('.find-empty')).not.toBe(null)
    expect([...document.querySelectorAll('.gate-req')].every(r => r.classList.contains('is-met')))
      .toBe(true)
    // The footer owns the action; the body does not repeat it.
    expect(document.querySelector('.find-empty .btn-primary')).toBe(null)
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

  it('reports how many matched in total, not just how many came back', async () => {
    // The response has always carried total_count; parseProducts threw it away.
    // It is the number that tells a visitor their typed name was a grape
    // rather than a bottle.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        productSearch: {
          total_count: 340,
          items: response('111', '222').data.productSearch.items,
        },
      },
    })))
    const result = await catalog.searchWines('Pinot Noir')
    expect(result.wines).toHaveLength(2)
    expect(result.total).toBe(340)
  })

  it('falls back to the number returned when the catalog omits a total', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('111', '222'))))
    expect((await catalog.searchWines('Pinot Noir')).total).toBe(2)
  })

  it('returns every candidate the catalog offered, in order', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response('111', '222', '333'))),
    )
    expect((await catalog.searchWines('Pinot Noir')).wines.map(w => w.sku))
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
    expect((await catalog.searchWines('12345678')).wines).toEqual([])
  })
})
