// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineElements } from '../src/ui/shell'
import * as catalog from '../src/lib/catalog'
import * as cellar from '../src/lib/cellar'
import * as appState from '../src/lib/appState'
import { runSearch } from '../src/lib/search'
import { openPromptDialog } from '../src/ui/promptDialog'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'
import { wine } from './helpers'

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!
const $$ = (s: string) => [...document.querySelectorAll(s)]

defineElements()

beforeEach(() => {
  document.body.innerHTML = ''
  for (const k of ['cellar.v2', 'branch', 'recentBranches', 'branchCounts', 'filters']) {
    storage.removeItem(k)
  }
  cellar.reload()
  appState.clearResults()
  appState.setBranch('')
  appState.setMode('find')
})

afterEach(() => { vi.restoreAllMocks() })

function mountPanel(): HTMLElement {
  // The scope chips live in <app-head> now; mount the row the app really has.
  document.body.innerHTML =
    '<app-head></app-head><find-panel></find-panel><app-foot></app-foot>'
  return $('find-panel')
}

async function searchWith(wines: Wine[]): Promise<void> {
  vi.spyOn(catalog, 'fetchBranchCatalog').mockResolvedValue(wines)
  appState.setBranch('23112')
  cellar.saveWine(wine('111'), 'like')
  await runSearch()
}

describe('the chip row', () => {
  it('prompts for a branch before one is chosen', () => {
    mountPanel()
    expect($('[data-head="branch"]').textContent).toContain('Choose a branch')
  })

  it('names the branch once chosen', () => {
    mountPanel()
    appState.setBranch('23112')
    expect($('[data-head="branch"]').textContent!.trim().length).toBeGreaterThan(0)
    expect($('[data-head="branch"]').textContent).not.toContain('Choose a branch')
  })

  it('summarises the scope without opening anything', () => {
    mountPanel()
    const chips = $$('.scopechip').map(c => c.textContent!.trim())
    expect(chips.join(' ')).toContain('Red')
    expect(chips.join(' ')).toContain('$15')
  })
})

describe('results', () => {
  it('renders nothing before a search', () => {
    const el = mountPanel()
    expect(el.querySelector('.results-section')).toBe(null)
  })

  it('lists ranked wines with rank, price and a reason', async () => {
    mountPanel()
    await searchWith([wine('900', { name: 'Crozes', price: 24.5, grapes: ['Syrah'] })])

    expect($('.results-rank').textContent).toBe('1')
    expect($('.results-name').textContent).toBe('Crozes')
    expect($('.results-price').textContent).toBe('$24.50')
    expect($('.reason').textContent!.length).toBeGreaterThan(0)
  })

  it('links out to SAQ by urlKey', async () => {
    mountPanel()
    await searchWith([wine('900', { urlKey: 'crozes-hermitage-900' })])
    expect($<HTMLAnchorElement>('.results-name').href).toBe('https://www.saq.com/en/crozes-hermitage-900')
  })

  it('heads the list with how many of the branch total are shown', async () => {
    mountPanel()
    await searchWith(Array.from({ length: 30 }, (_, i) => wine(String(900 + i))))
    // RESULT_COUNT is 10. "fit your filters" rather than "in stock": every
    // row is in stock by construction, so the number that carries information
    // is how many the filter admitted.
    expect($('.results-count').textContent).toContain('10 shown')
    expect($('.results-count').textContent).toContain('30 fit your filters')
  })

  /**
   * buildCatalogFilter already pins availability_front == 'In store' and
   * store_availability_list == branch, so every row is in stock here by
   * construction and the header says so. A per-row "at this branch" would
   * just repeat it.
   */
  it('carries no per-row stock line', async () => {
    mountPanel()
    await searchWith([wine('900')])
    expect($('.results-stock').textContent).not.toMatch(/in stock|at this branch|stock unknown/)
  })
})

describe('the rating', () => {
  it('always shows the review count beside the score', async () => {
    mountPanel()
    await searchWith([wine('900', { rating: 100, ratingCount: 3 })])
    // A bare "100" would read as the best wine in the shop.
    expect($('.rating').textContent).toContain('100 / 100')
    expect($('.rating').textContent).toContain('3 reviews')
  })

  it('says outright when a sample is too thin to lean on', async () => {
    mountPanel()
    await searchWith([wine('900', { rating: 100, ratingCount: 3 })])
    // Dimming alone asks the reader to do the arithmetic. This says it.
    expect($('.rating').textContent).toContain('too few to lean on')
  })

  it('dims a thin sample', async () => {
    mountPanel()
    await searchWith([wine('900', { rating: 100, ratingCount: 3 })])
    expect($('.rating').className).toContain('rating--thin')
  })

  it('does not dim a well-reviewed wine', async () => {
    mountPanel()
    await searchWith([wine('900', { rating: 88, ratingCount: 140 })])
    expect($('.rating').className).not.toContain('rating--thin')
  })

  it('says there is no rating rather than leaving a gap', async () => {
    // An empty space reads as a missing value or a bug; "no rating yet" is a
    // fact about the wine and does not imply it is bad.
    mountPanel()
    await searchWith([wine('900', { rating: null })])
    expect($('.rating--none').textContent).toContain('No community rating yet')
  })
})

describe('favourites here', () => {
  it('calls out saved wines stocked at this branch', async () => {
    mountPanel()
    await searchWith([wine('111', { name: 'My Own' }), wine('900')])
    expect($('.favourites-title').textContent).toContain('wines you already know')
    expect($('.favourites-name').textContent).toBe('My Own')
  })

  it('lists every saved wine the branch stocks', async () => {
    vi.spyOn(catalog, 'fetchBranchCatalog').mockResolvedValue([wine('111'), wine('222')])
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')
    cellar.saveWine(wine('222'), 'like')
    mountPanel()
    await runSearch()
    expect($$('.favourites-row')).toHaveLength(2)
  })
})

/**
 * Re-filing after a search must reflow the list without another catalog fetch —
 * the rendered rows already hold the wine.
 */
describe('re-filing after a search', () => {
  it('drops a newly disliked wine from the results with no new request', async () => {
    mountPanel()
    const spy = vi.spyOn(catalog, 'fetchBranchCatalog').mockResolvedValue([wine('900'), wine('901')])
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')
    await runSearch()
    expect($$('.results-row')).toHaveLength(2)
    spy.mockClear()

    cellar.saveWine(wine('900'), 'dislike')

    expect($$('.results-row')).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('keeps the underlying results intact, so undoing restores the row', async () => {
    mountPanel()
    await searchWith([wine('900'), wine('901')])
    cellar.saveWine(wine('900'), 'dislike')
    expect($$('.results-row')).toHaveLength(1)

    cellar.removeSeed('900')

    expect($$('.results-row')).toHaveLength(2)
  })
})

describe('the prompt footer', () => {
  it('replaces the search button once a search has run', async () => {
    mountPanel()
    expect($('[data-act="search"]')).toBeTruthy()
    await searchWith([wine('900')])
    expect(document.querySelector('[data-act="search"]')).toBe(null)
    expect($('[data-act="prompt"]')).toBeTruthy()
  })

  it('offers 20 / 40 / All and marks the active one', async () => {
    mountPanel()
    await searchWith([wine('900')])

    const labels = $$('[data-act="prompt-count"]').map(b => b.textContent!.trim())
    expect(labels).toEqual(['Top 20', 'Top 40', 'All 1'])
    expect($('[data-act="prompt-count"].active').textContent!.trim()).toBe('Top 20')
  })

  it('changes the included count', async () => {
    mountPanel()
    await searchWith([wine('900')])
    $$('[data-act="prompt-count"]')[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(appState.getSnapshot().promptCount).toBe(0)
    expect($('[data-act="prompt-count"].active').textContent!.trim()).toContain('All')
  })
})

describe('the prompt dialog', () => {
  const originalClipboard = navigator.clipboard

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard, configurable: true, writable: true,
    })
    document.body.innerHTML = ''
  })

  function stubClipboard(impl: () => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(impl) }, configurable: true, writable: true,
    })
  }

  it('shows the prompt without interpolating it into markup', () => {
    // The prompt runs to tens of thousands of characters and is the one string
    // here guaranteed to contain quotes.
    const prompt = 'Wines: "Château" <script>window.pwned=1</script>'
    openPromptDialog(prompt, 'Marché Central')

    expect($<HTMLTextAreaElement>('[data-prompt="text"]').value).toBe(prompt)
    expect(document.querySelector('.prompt-dialog script')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('names the branch and the prompt length', () => {
    openPromptDialog('abcde', 'Marché Central')
    expect($('.hint').textContent).toContain('Marché Central')
    expect($('[data-prompt="chars"]').textContent).toContain('5 characters')
  })

  it('copies, then moves the brass to Open ChatGPT', async () => {
    stubClipboard(async () => {})
    openPromptDialog('the prompt', 'Marché Central')
    expect($('[data-prompt="copy"]').className).toBe('btn-primary')

    $<HTMLButtonElement>('[data-prompt="copy"]').click()
    await vi.waitFor(() => expect($('[data-prompt="copy"]').textContent).toContain('Copied'))

    // Brass marks the next thing to tap. Nothing else moves.
    expect($('[data-prompt="copy"]').className).toBe('btn-secondary')
    expect($('[data-prompt="open"]').className).toContain('btn-primary')
  })

  it('falls back to selecting the text when the clipboard refuses', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    openPromptDialog('the prompt', 'Marché Central')
    const textarea = $<HTMLTextAreaElement>('[data-prompt="text"]')
    const select = vi.spyOn(textarea, 'select')

    $<HTMLButtonElement>('[data-prompt="copy"]').click()
    await vi.waitFor(() => expect($('[data-prompt="note"]').textContent).toContain('would not let'))

    // The OS copy affordance is one action away, and the note says why.
    expect(select).toHaveBeenCalled()
    expect(textarea.className).toContain('copy-failed')
    expect($('[data-prompt="copy"]').textContent).toContain('Select the text')
  })

  it('calls writeText synchronously within the click, before any await', () => {
    // Safari rejects clipboard writes on a consumed user activation, and this
    // project has already shipped that bug once. Anything awaited before
    // writeText would reintroduce it.
    const order: string[] = []
    stubClipboard(async () => { order.push('writeText') })
    openPromptDialog('the prompt', 'Marché Central')

    $<HTMLButtonElement>('[data-prompt="copy"]').click()
    order.push('after-click-returns')

    expect(order).toEqual(['writeText', 'after-click-returns'])
  })
})

/**
 * The design's row actions, and the one it deliberately does not have.
 */
describe('acting on a result', () => {
  it('pushes results away from a wine', async () => {
    mountPanel()
    await searchWith([wine('900'), wine('901')])

    $('[data-find="less"][data-sku="900"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))

    expect(cellar.getSnapshot().refs).toContainEqual({ sku: '900', kind: 'dislike' })
    // And it leaves the results immediately, without another search.
    expect($$('.results-row')).toHaveLength(1)
  })

  it('hides a wine without saying anything about taste', async () => {
    mountPanel()
    await searchWith([wine('900'), wine('901')])

    $('[data-find="hide"][data-sku="900"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))

    expect(cellar.getSnapshot().refs).toContainEqual({ sku: '900', kind: 'skip' })
  })

  it('offers no way to file a suggestion as liked', async () => {
    // Filing a recommendation as liked would feed the ranking its own output,
    // and the visitor has not drunk the bottle. The profile is built only from
    // wines they have.
    mountPanel()
    await searchWith([wine('900')])

    expect(document.querySelector('[data-find="more"]')).toBe(null)
    expect($('.results-actions').textContent).not.toMatch(/more like this/i)
  })
})

describe('the reason leads the row', () => {
  it('comes before the name in the document', async () => {
    mountPanel()
    await searchWith([wine('900', { grapes: ['Syrah'] })])

    const body = $('.results-body')
    const kids = [...body.children]
    expect(kids.findIndex(k => k.classList.contains('reason')))
      .toBeLessThan(kids.findIndex(k => k.classList.contains('results-name-row')))
  })

  it('shows provenance and grapes under it', async () => {
    mountPanel()
    await searchWith([wine('900', { region: 'Douro', country: 'Portugal', grapes: ['Syrah', 'Touriga'] })])
    expect($('.results-meta').textContent).toContain('Douro, Portugal')
    expect($('.results-meta').textContent).toContain('Syrah, Touriga')
  })

  it('says what the ranking was built from', async () => {
    mountPanel()
    await searchWith([wine('900')])
    expect($('.results-against').textContent).toContain('ranked against your 1 wines')
  })
})

/**
 * A catalog fetch runs to several pages and several seconds. The design shows
 * real progress rather than a spinner, and the numbers the bar is drawn from
 * are the ones a screen reader is given.
 */
describe('search progress', () => {
  it('reports paging as a progressbar with its bounds set', async () => {
    document.body.innerHTML = '<app-status></app-status>'
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')

    let seen: Element | null = null
    vi.spyOn(catalog, 'fetchBranchCatalog').mockImplementation(async (_b, _f, onProgress) => {
      onProgress?.(3, 9)
      seen = document.querySelector('[role="progressbar"]')
      return [wine('900')]
    })
    await runSearch()

    expect(seen).not.toBe(null)
    expect(seen!.getAttribute('aria-valuenow')).toBe('3')
    expect(seen!.getAttribute('aria-valuemax')).toBe('9')
  })

  it('clears the bar when the results land', async () => {
    document.body.innerHTML = '<app-status></app-status>'
    appState.setBranch('23112')
    cellar.saveWine(wine('111'), 'like')
    vi.spyOn(catalog, 'fetchBranchCatalog').mockImplementation(async (_b, _f, onProgress) => {
      onProgress?.(9, 9)
      return [wine('900')]
    })
    await runSearch()

    expect(document.querySelector('[role="progressbar"]')).toBe(null)
  })
})
