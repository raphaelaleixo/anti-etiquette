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
  it('stays away until there is a result for it to scope', async () => {
    // Before a search the gate carries the same three chips in its own
    // "Current scope" panel; two copies of one fact on one screen is noise.
    mountPanel()
    expect($$('.scopebar')).toEqual([])

    await searchWith([wine('900')])
    expect($('.scopebar')).toBeTruthy()
  })

  it('names the branch once a search has run', async () => {
    mountPanel()
    await searchWith([wine('900')])
    expect($('[data-head="branch"]').textContent!.trim().length).toBeGreaterThan(0)
    expect($('[data-head="branch"]').textContent).not.toContain('Choose a branch')
  })

  it('summarises the scope without opening anything', async () => {
    mountPanel()
    await searchWith([wine('900')])
    const chips = $$('.scopebar .scopechip').map(c => c.textContent!.trim())
    expect(chips.join(' ')).toContain('Red')
    expect(chips.join(' ')).toContain('$15')
  })
})

/**
 * The gate the design draws: two requirements, both named, the satisfied one
 * marked. A screen that mentions only what is wrong never says what right is.
 */
describe('the scope gate', () => {
  const reqs = () => $$('.gate-req').map(r => ({
    met: r.classList.contains('is-met'),
    text: r.textContent!.replace(/\s+/g, ' ').trim(),
  }))

  it('names both requirements even when only one is missing', () => {
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    expect(reqs()).toHaveLength(2)
    expect(reqs().map(r => r.met)).toEqual([true, false])
  })

  it('marks the branch met and the wines open in the other direction', () => {
    appState.setBranch('23112')
    mountPanel()
    expect(reqs().map(r => r.met)).toEqual([false, true])
  })

  it('keeps the pair in one order whichever of them is missing', () => {
    // Reordering as they are met would make the screen jump under whoever is
    // reading it, so the branch is always second — met or not.
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    expect(reqs()[1]!.text).toContain('A branch')

    cellar.removeSeed('111')
    appState.setBranch('23112')
    expect(reqs()[1]!.text).toContain('A branch')
  })

  it('gives the action to the requirement that is missing', () => {
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    expect($('.find-empty .btn-primary').dataset.find).toBe('branch')

    cellar.removeSeed('111')
    expect($('.find-empty .btn-primary').dataset.find).toBe('add')
  })

  it('turns into a ready state once both are satisfied, never a blank page', () => {
    cellar.saveWine(wine('111'), 'like')
    appState.setBranch('23112')
    mountPanel()

    expect($$('.gate-req').map(r => r.classList.contains('is-met'))).toEqual([true, true])
    // No action in the body: the pinned footer already carries the search, and
    // the same control twice on one screen is the defect this replaced.
    expect($$('.find-empty .btn-primary')).toEqual([])
    expect($<HTMLButtonElement>('app-foot [data-act="search"]').disabled).toBe(false)
    // And the picker steps aside: there is nothing left for it to answer.
    expect($$('branch-panel')).toEqual([])
  })

  it('renders nothing only once a search has actually run', () => {
    // The guard is "has a search run", not "are both requirements met". That
    // difference is the whole of the blank-page bug: the commonest state in
    // the app fell between the two and drew zero bytes.
    cellar.saveWine(wine('111'), 'like')
    appState.setBranch('23112')
    expect(mountPanel().innerHTML.trim().length).toBeGreaterThan(0)
  })
})

/**
 * What the search would run with, as it stands. The filters carry over from
 * last time and are otherwise invisible until after a search has used them.
 */
describe('the current-scope panel', () => {
  const chips = () => $$('.scopepanel .scopechip').map(c => ({
    open: c.classList.contains('scopechip--open'),
    text: c.textContent!.trim(),
  }))

  it('marks the branch as the piece that is missing', () => {
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    expect(chips()[0]!.open).toBe(true)
    expect(chips()[0]!.text).toBe('No branch')
    // The filters are set, so they are not marked.
    expect(chips().slice(1).map(c => c.open)).toEqual([false, false])
  })

  it('names the branch, unmarked, once one is chosen', () => {
    cellar.saveWine(wine('111'), 'like')
    appState.setBranch('23112')
    mountPanel()
    expect(chips()[0]!.open).toBe(false)
    expect(chips()[0]!.text).not.toBe('No branch')
  })

  it('reports the filters that would be applied', () => {
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    expect(chips().map(c => c.text).join(' ')).toContain('Red')
    expect(chips().map(c => c.text).join(' ')).toContain('$15')
  })

  it('offers the one part of the scope it can change', () => {
    // Filters, not the branch: a second branch picker beside the first would
    // be two controls for one decision.
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    expect($('.scopepanel .scopelink').dataset.find).toBe('filters')
  })
})

/**
 * The branch list beside the gate, as the design draws it on desktop.
 *
 * Whether it is *visible* is CSS — hidden below 62rem, where the sheet is the
 * right shape — so these assert the DOM-level contract: when it exists, what
 * a click on it means, and that typing in it survives a re-render.
 */
describe('the inline branch panel', () => {
  it('sits beside the gate when the branch is what is missing', () => {
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    expect($$('branch-panel')).toHaveLength(1)
    expect($$('branch-panel .branch-row').length).toBeGreaterThan(1)
  })

  it('stays away when the visitor has no wines yet', () => {
    // Their next step is naming a wine; a shop to stand in answers a question
    // they have not reached.
    appState.setBranch('23112')
    mountPanel()
    expect($$('branch-panel')).toEqual([])
  })

  it('commits on click, unlike the sheet', () => {
    // Nothing is covering the page, so there is nothing to come back from —
    // and the requirement card flipping to satisfied is the confirmation.
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    const row = $<HTMLElement>('branch-panel [data-branch]')
    const id = row.dataset.branch!

    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(appState.getSnapshot().branch).toBe(id)
    // The card beside it flips to satisfied — that is the confirmation — and
    // the picker, having been answered, takes itself off the page.
    expect($$('.gate-req').map(r => r.classList.contains('is-met'))).toEqual([true, true])
    expect($$('branch-panel')).toEqual([])
  })

  it('keeps a half-typed search when the panel is rebuilt under it', () => {
    // <find-panel> mounts by assigning innerHTML, so any publish destroys the
    // search box. Losing what was typed to an unrelated cellar write is the
    // bug this guards.
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    const box = $<HTMLInputElement>('branch-panel [data-branch-q]')
    box.value = 'atwater'
    box.dispatchEvent(new Event('input', { bubbles: true }))
    const narrowed = $$('branch-panel [data-branch]').length

    cellar.saveWine(wine('222'), 'like')

    expect($<HTMLInputElement>('branch-panel [data-branch-q]').value).toBe('atwater')
    expect($$('branch-panel [data-branch]')).toHaveLength(narrowed)
  })

  it('starts clean again after a branch is chosen', () => {
    cellar.saveWine(wine('111'), 'like')
    mountPanel()
    const box = $<HTMLInputElement>('branch-panel [data-branch-q]')
    box.value = 'atwater'
    box.dispatchEvent(new Event('input', { bubbles: true }))

    $<HTMLElement>('branch-panel [data-branch]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
    appState.setBranch('')

    expect($<HTMLInputElement>('branch-panel [data-branch-q]').value).toBe('')
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

  it('states how many of the branch total are shown, once', async () => {
    mountPanel()
    await searchWith(Array.from({ length: 30 }, (_, i) => wine(String(900 + i))))
    // RESULT_COUNT is 10. "fit your filters" rather than "in stock": every
    // row is in stock by construction, so the number that carries information
    // is how many the filter admitted.
    //
    // It belongs to the scope bar, which is where the design puts it. The
    // results head used to repeat it, which is the same fact twice on one
    // screen.
    expect($('.scopebar-count').textContent).toContain('10 shown')
    expect($('.scopebar-count').textContent).toContain('30 fit your filters')
    expect(document.querySelector('.results-count')).toBe(null)
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

describe('the results footer', () => {
  it('offers the two actions the design draws, and says what this screen can file', async () => {
    mountPanel()
    expect($('[data-act="search"]')).toBeTruthy()
    await searchWith([wine('900')])

    // "Search again" and "Ask an AI" — and the note explaining why only
    // exclusions can be filed from a list of things you have not drunk.
    expect($('app-foot [data-act="search"]').textContent).toContain('Search again')
    expect($('[data-act="prompt"]').textContent).toContain('Ask an AI')
    expect($('.foot-note').textContent).toContain('Only exclusions')
  })

  it('keeps the include control out of the footer', async () => {
    // It belongs beside the text it changes, in the prompt panel, where the
    // character count next to it is the only visible consequence of choosing.
    mountPanel()
    await searchWith([wine('900')])
    expect(document.querySelector('app-foot [data-prompt="count"]')).toBe(null)
    expect(document.querySelector('app-foot .prompt-include')).toBe(null)
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

  /** The smallest thing that satisfies the dialog's contract. */
  function promptSource(text: string) {
    return { build: () => text, total: 412, counts: [20, 40, 0] as const, count: 20, onCount: () => {} }
  }

  function stubClipboard(impl: (text: string) => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(impl) }, configurable: true, writable: true,
    })
  }

  it('shows the prompt without interpolating it into markup', () => {
    // The prompt runs to tens of thousands of characters and is the one string
    // here guaranteed to contain quotes.
    const prompt = 'Wines: "Château" <script>window.pwned=1</script>'
    openPromptDialog(promptSource(prompt), 'Marché Central')

    expect($<HTMLTextAreaElement>('[data-prompt="text"]').value).toBe(prompt)
    expect(document.querySelector('.prompt-dialog script')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('chooses how much of the shelf to include, beside the text it changes', () => {
    let asked: number[] = []
    const chosen: number[] = []
    openPromptDialog({
      build: n => { asked.push(n); return 'x'.repeat(n === 0 ? 900 : n * 10) },
      total: 412, counts: [20, 40, 0], count: 20, onCount: n => chosen.push(n),
    }, 'Marché Central')

    expect($$('[data-prompt="count"]').map(b => b.textContent!.trim()))
      .toEqual(['Top 20', 'Top 40', 'All 412'])
    expect($('[data-prompt="count"].active').textContent!.trim()).toBe('Top 20')
    expect($<HTMLTextAreaElement>('[data-prompt="text"]').value).toHaveLength(200)

    $$('[data-prompt="count"]')[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // The text, the character count and the marked segment all follow.
    expect($<HTMLTextAreaElement>('[data-prompt="text"]').value).toHaveLength(900)
    expect($('[data-prompt="chars"]').textContent).toContain('900')
    expect($('[data-prompt="count"].active').textContent!.trim()).toBe('All 412')
    // And the choice is handed back, so it survives closing the panel.
    expect(chosen).toEqual([0])
  })

  it('names the branch and the prompt length', () => {
    openPromptDialog(promptSource('abcde'), 'Marché Central')
    expect($('.hint').textContent).toContain('Marché Central')
    expect($('[data-prompt="chars"]').textContent).toContain('5 characters')
  })

  it('replaces the steps with where the text went and what to do next', async () => {
    stubClipboard(async () => {})
    openPromptDialog(promptSource('the prompt'), 'Marché Central')
    expect($('[data-prompt="copy"]').className).toBe('btn-primary')

    $<HTMLButtonElement>('[data-prompt="copy"]').click()
    await vi.waitFor(() => expect($('.prompt-done')).toBeTruthy())

    // Relabelling the button left a control that still looked like the next
    // thing to press, and a visitor holding a clipboard with nowhere to put
    // it. The steps are replaced by the answer instead.
    expect(document.querySelector('[data-prompt="copy"]')).toBe(null)
    expect($('.prompt-done-count').textContent).toContain('Copied')
    expect($('.prompt-done h3').textContent).toContain('Now open a chat')
    expect($('.prompt-done-actions .btn-primary').textContent).toContain('ChatGPT')
    expect($('[data-prompt="again"]').textContent).toContain('Copy again')
  })

  it('can copy again from the panel that says it copied', async () => {
    const writes: string[] = []
    stubClipboard(async text => { writes.push(text) })
    openPromptDialog(promptSource('the prompt'), 'Marché Central')
    $<HTMLButtonElement>('[data-prompt="copy"]').click()
    await vi.waitFor(() => expect($('[data-prompt="again"]')).toBeTruthy())

    $<HTMLButtonElement>('[data-prompt="again"]').click()
    await vi.waitFor(() => expect(writes).toHaveLength(2))
    expect(writes.every(w => w === 'the prompt')).toBe(true)
  })

  it('falls back to selecting the text when the clipboard refuses', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    openPromptDialog(promptSource('the prompt'), 'Marché Central')
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
    openPromptDialog(promptSource('the prompt'), 'Marché Central')

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
