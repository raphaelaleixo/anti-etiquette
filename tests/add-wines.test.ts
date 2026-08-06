// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openAddWines } from '../src/ui/addWines'
import * as catalog from '../src/lib/catalog'
import * as cellar from '../src/lib/cellar'
import * as appState from '../src/lib/appState'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'

function wine(sku: string, over: Partial<Wine> = {}): Wine {
  return {
    sku, name: `Wine ${sku}`, urlKey: `w-${sku}`, price: 19.95, inStock: true,
    country: 'France', region: 'Rhône', appellation: null, grapes: [],
    vintage: null, tasteTag: null, rating: null, ratingCount: null,
    availability: [], ...over,
  }
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const $$ = (sel: string) => [...document.querySelectorAll(sel)]

function type(value: string): void {
  const ta = $<HTMLTextAreaElement>('[data-add="text"]')
  ta.value = value
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Resolve names in order. A queued `null` means the catalog found nothing;
 * anything else is returned as the single candidate for that line.
 */
function stubResolve(results: Array<Wine | null>): void {
  let i = 0
  vi.spyOn(catalog, 'searchWines').mockImplementation(async () => {
    const next = results[i++]
    return next ? [next] : []
  })
}

/** Queue a whole candidate list for one line, as an ambiguous name produces. */
function stubCandidates(lists: Wine[][]): void {
  let i = 0
  vi.spyOn(catalog, 'searchWines').mockImplementation(async () => lists[i++] ?? [])
}

beforeEach(() => {
  document.body.innerHTML = ''
  storage.removeItem('cellar.v2')
  cellar.reload()
  appState.setMode('wines')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('step one: the paste box', () => {
  it('opens with an empty textarea and a disabled lookup', () => {
    openAddWines()
    expect($<HTMLTextAreaElement>('[data-add="text"]').value).toBe('')
    expect($<HTMLButtonElement>('[data-add="lookup"]').disabled).toBe(true)
  })

  it('counts lines as they are typed, without touching the textarea', () => {
    openAddWines()
    const ta = $<HTMLTextAreaElement>('[data-add="text"]')
    type('Duas Quintas\nVilla Antinori')

    expect($('[data-add="lookup"]').textContent).toContain('Look up 2 wines')
    expect($<HTMLButtonElement>('[data-add="lookup"]').disabled).toBe(false)
    // The very node being typed into must survive the footer re-render.
    expect($<HTMLTextAreaElement>('[data-add="text"]')).toBe(ta)
  })

  it('says "1 wine", not "1 wines"', () => {
    openAddWines()
    type('Duas Quintas')
    expect($('[data-add="lookup"]').textContent).toContain('Look up 1 wine')
  })

  it('ignores blank lines and surrounding whitespace', () => {
    openAddWines()
    type('  Duas Quintas  \n\n\n  Villa Antinori\n')
    expect($('[data-add="lookup"]').textContent).toContain('Look up 2 wines')
  })

  it('does not ship the previous owner\'s taste as placeholder text', () => {
    openAddWines()
    const placeholder = $<HTMLTextAreaElement>('[data-add="text"]').placeholder
    for (const old of ['Duas Quintas', 'Villa Antinori', 'Yellow Tail']) {
      expect(placeholder).not.toContain(old)
    }
  })
})

/**
 * The rule the whole sheet design exists for. A store change must not be able
 * to reach into a subtree the user is editing.
 */
describe('the sheet does not subscribe', () => {
  it('leaves the typed text alone when the cellar changes underneath it', () => {
    openAddWines()
    type('half a thought, still typing')
    const ta = $<HTMLTextAreaElement>('[data-add="text"]')

    // Hydration finishing, or another tab writing — anything at all.
    cellar.saveWine(wine('999'), 'like')
    cellar.reload()

    expect($<HTMLTextAreaElement>('[data-add="text"]')).toBe(ta)
    expect(ta.value).toBe('half a thought, still typing')
  })

  it('leaves it alone when appState changes underneath it', () => {
    openAddWines()
    type('still typing')
    appState.setStatus('Loading page 3 of 9…')
    expect($<HTMLTextAreaElement>('[data-add="text"]').value).toBe('still typing')
  })
})

describe('step two: checking the matches', () => {
  it('shows one row per line, matched or not', async () => {
    stubResolve([wine('111'), null])
    openAddWines()
    type('Good One\nNonsense')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(2))

    expect($('.resolution-row:not(.resolution-row--unmatched) .resolution-name').textContent)
      .toBe('Wine 111')
    expect($('.resolution-row--unmatched .resolution-name').textContent).toBe('Nonsense')
    expect($('.resolution-summary').textContent).toContain('1 line ignored')
  })

  it('shows the price and the line it came from', async () => {
    stubResolve([wine('111', { price: 19.95 })])
    openAddWines()
    type('Good One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution-meta')).toBeTruthy())

    expect($('.resolution-meta').textContent).toContain('$19.95')
    expect($('.resolution-meta').textContent).toContain('from "Good One"')
  })

  it('offers all three kinds, defaulting to like', async () => {
    stubResolve([wine('111')])
    openAddWines()
    type('Good One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="kind"]')).toBeTruthy())

    const select = $<HTMLSelectElement>('[data-add="kind"]')
    expect([...select.options].map(o => o.value)).toEqual(['like', 'dislike', 'skip'])
    expect(select.value).toBe('like')
  })
})

describe('Back preserves the batch', () => {
  it('returns to the typed text rather than an empty box', async () => {
    stubResolve([wine('111'), null])
    openAddWines()
    type('Good One\nNonsense')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="back"]')).toBeTruthy())

    $<HTMLButtonElement>('[data-add="back"]').click()

    // Retyping four good names because the fifth matched wrong was the old
    // flow's worst moment.
    expect($<HTMLTextAreaElement>('[data-add="text"]').value).toBe('Good One\nNonsense')
  })
})

describe('dismissing a line', () => {
  it('drops one row and keeps the rest', async () => {
    stubResolve([wine('111'), wine('222')])
    openAddWines()
    type('One\nTwo')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(2))

    $$('[data-add="dismiss"]')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect($$('.resolution-row')).toHaveLength(1)
    expect($('.resolution-name').textContent).toBe('Wine 222')
  })

  /**
   * The kind pickers are uncontrolled — their value lives in the DOM until it
   * is needed — so anything that re-renders the list has to read them back
   * first. Without that, dismissing row 3 silently resets rows 1 and 2.
   */
  it('keeps kinds chosen on the rows that remain', async () => {
    stubResolve([wine('111'), wine('222'), wine('333')])
    openAddWines()
    type('One\nTwo\nThree')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(3))

    const selects = $$('[data-add="kind"]') as HTMLSelectElement[]
    selects[0]!.value = 'dislike'
    selects[1]!.value = 'skip'

    $$('[data-add="dismiss"]')[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const after = $$('[data-add="kind"]') as HTMLSelectElement[]
    expect(after.map(s => s.value)).toEqual(['dislike', 'skip'])
  })

  it('returns to the text step once the last row is dismissed', async () => {
    stubResolve([wine('111')])
    openAddWines()
    type('One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(1))

    $$('[data-add="dismiss"]')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect($<HTMLTextAreaElement>('[data-add="text"]').value).toBe('One')
  })
})

describe('saving', () => {
  it('stores the whole fetched wine, not just the sku', async () => {
    stubResolve([wine('111', { name: 'Château Bonnet', price: 17.5 })])
    openAddWines()
    type('Bonnet')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="save"]')).toBeTruthy())

    $<HTMLButtonElement>('[data-add="save"]').click()

    // The React app kept only the SKU and re-fetched on the next load. Keeping
    // the record means a wine added here never needs hydrating at all.
    const entry = cellar.getSnapshot().entries[0]!
    expect(entry.sku).toBe('111')
    expect(entry.wine!.name).toBe('Château Bonnet')
    expect(entry.wine!.price).toBe(17.5)
  })

  it('honours the kind chosen in the picker', async () => {
    stubResolve([wine('111'), wine('222')])
    openAddWines()
    type('One\nTwo')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('[data-add="kind"]')).toHaveLength(2))

    ;($$('[data-add="kind"]')[1] as HTMLSelectElement).value = 'dislike'
    $<HTMLButtonElement>('[data-add="save"]').click()

    expect(cellar.getSnapshot().refs).toEqual([
      { sku: '111', kind: 'like' },
      { sku: '222', kind: 'dislike' },
    ])
  })

  it('saves nothing for unmatched lines and closes the sheet', async () => {
    stubResolve([wine('111'), null])
    openAddWines()
    type('One\nNonsense')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="save"]')).toBeTruthy())

    expect($('[data-add="save"]').textContent).toContain('Save 1 wine')
    $<HTMLButtonElement>('[data-add="save"]').click()

    expect(cellar.getSnapshot().entries).toHaveLength(1)
    expect(document.querySelector('dialog')).toBe(null)
    expect(appState.getSnapshot().mode).toBe('wines')
  })

  it('cannot save a batch with no matches at all', async () => {
    stubResolve([null])
    openAddWines()
    type('Nonsense')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="save"]')).toBeTruthy())

    expect($<HTMLButtonElement>('[data-add="save"]').disabled).toBe(true)
  })
})

describe('when the catalog is unreachable', () => {
  it('reports it inside the sheet and keeps the typed text', async () => {
    vi.spyOn(catalog, 'searchWines').mockRejectedValue(new Error('network down'))
    openAddWines()
    type('One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.error')).toBeTruthy())

    // The sheet is modal, so an error rendered behind it would be invisible.
    expect($('dialog .error').textContent).toContain('network down')
    expect($<HTMLTextAreaElement>('[data-add="text"]').value).toBe('One')
  })
})

describe('third-party names are data', () => {
  it('escapes a catalog name in the resolution row', async () => {
    stubResolve([wine('111', { name: '<img src=x onerror="window.pwned=1">' })])
    openAddWines()
    type('One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution-name')).toBeTruthy())

    expect(document.querySelector('.resolution-list img')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('escapes the user\'s own typed line, which is echoed back', async () => {
    stubResolve([null])
    openAddWines()
    type('<script>window.pwned=1</script>')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution-row--unmatched')).toBeTruthy())

    expect(document.querySelector('.resolution-list script')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })
})

/**
 * The blind-top-hit bug. "Pinot Noir" is not a wine — it matches hundreds —
 * and the React app resolved it to one arbitrary bottle with no way to see
 * that had happened. That bottle then shaped the taste profile.
 */
describe('ambiguous names offer alternatives', () => {
  const candidates = [
    wine('111', { name: 'Bourgogne Pinot Noir', price: 24 }),
    wine('222', { name: 'Alsace Pinot Noir', price: 19 }),
    wine('333', { name: 'Oregon Pinot Noir', price: 32 }),
  ]

  async function openWithCandidates(): Promise<void> {
    stubCandidates([candidates])
    openAddWines()
    type('Pinot Noir')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="candidate"]')).toBeTruthy())
  }

  it('preselects the best match but lists the others', async () => {
    await openWithCandidates()

    const select = $<HTMLSelectElement>('[data-add="candidate"]')
    expect(select.value).toBe('0')
    expect($('.resolution-name').textContent).toBe('Bourgogne Pinot Noir')
    expect([...select.options].map(o => o.textContent!.trim())).toEqual([
      'Bourgogne Pinot Noir · $24.00',
      'Alsace Pinot Noir · $19.00',
      'Oregon Pinot Noir · $32.00',
      'None of these',
    ])
  })

  it('switches the match when another is chosen', async () => {
    await openWithCandidates()

    const select = $<HTMLSelectElement>('[data-add="candidate"]')
    select.value = '2'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect($('.resolution-name').textContent).toBe('Oregon Pinot Noir')
    expect($<HTMLSelectElement>('[data-add="candidate"]').value).toBe('2')
  })

  it('saves the chosen alternative, not the top hit', async () => {
    await openWithCandidates()
    const select = $<HTMLSelectElement>('[data-add="candidate"]')
    select.value = '1'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    $<HTMLButtonElement>('[data-add="save"]').click()

    expect(cellar.getSnapshot().entries[0]!.wine!.name).toBe('Alsace Pinot Noir')
  })

  it('"None of these" keeps the line but adds nothing', async () => {
    await openWithCandidates()
    const select = $<HTMLSelectElement>('[data-add="candidate"]')
    select.value = '-1'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    // Different intention from dismissing: the line stays visible, so the
    // typed text is not silently forgotten.
    expect($$('.resolution-row')).toHaveLength(1)
    expect($('.resolution-row--unmatched')).toBeTruthy()
    expect($('.resolution-meta').textContent).toContain('nothing chosen')
    expect($<HTMLButtonElement>('[data-add="save"]').disabled).toBe(true)
  })

  it('offers no picker when the catalog was unambiguous', async () => {
    stubCandidates([[wine('111')]])
    openAddWines()
    type('Château Bonnet')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution-row')).toBeTruthy())

    // A control implying doubt where there is none is its own kind of noise.
    expect(document.querySelector('[data-add="candidate"]')).toBe(null)
  })

  it('keeps other lines\' kinds when one line switches match', async () => {
    stubCandidates([candidates, [wine('900')]])
    openAddWines()
    type('Pinot Noir\nSomething Else')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(2))

    ;($$('[data-add="kind"]')[1] as HTMLSelectElement).value = 'dislike'
    const alt = $<HTMLSelectElement>('[data-add="candidate"]')
    alt.value = '1'
    alt.dispatchEvent(new Event('change', { bubbles: true }))

    expect(($$('[data-add="kind"]')[1] as HTMLSelectElement).value).toBe('dislike')
  })
})
