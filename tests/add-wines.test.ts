// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openAddWines } from '../src/ui/addWines'
import * as catalog from '../src/lib/catalog'
import * as cellar from '../src/lib/cellar'
import * as appState from '../src/lib/appState'
import { storage } from '../src/lib/storage'
import type { Wine } from '../src/lib/types'
import { wine } from './helpers'

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
    return next ? { wines: [next], total: 1 } : { wines: [], total: 0 }
  })
}

/**
 * Queue a whole candidate list for one line, as an ambiguous name produces.
 * `total` defaults to the list length; pass one to simulate "5 of 340".
 */
function stubCandidates(lists: Wine[][], total?: number): void {
  let i = 0
  vi.spyOn(catalog, 'searchWines').mockImplementation(async () => {
    const wines = lists[i++] ?? []
    return { wines, total: total ?? wines.length }
  })
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
  it('accounts for every line, matched or not', async () => {
    // Lines that found nothing are gathered under one explanation rather than
    // interleaved with the matches, which made a good batch look broken.
    stubResolve([wine('111'), null])
    openAddWines()
    type('Good One\nNonsense')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(1))

    expect($('.resolution-row .resolution-name').textContent).toBe('Wine 111')
    expect($('.resolution-missing-row .resolution-input').textContent).toBe('Nonsense')
    expect($('.resolution-missing-head').textContent).toContain('Found nothing')
    expect($('.resolution-head').textContent).toContain('1 found nothing')
    // Nothing is silently dropped: two lines in, two lines accounted for.
    expect($('.resolution-willsave').textContent).toContain('2')
  })

  it('shows the price and the line it came from', async () => {
    stubResolve([wine('111', { price: 19.95 })])
    openAddWines()
    type('Good One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution-meta')).toBeTruthy())

    expect($('.resolution-altprice').textContent).toContain('$19.95')
    // What was typed is its own column now, not a parenthetical on the match.
    expect($('.resolution-input').textContent).toBe('Good One')
  })

  it('offers all three kinds, defaulting to like', async () => {
    stubResolve([wine('111')])
    openAddWines()
    type('Good One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="kind"]')).toBeTruthy())

    const kinds = $$('[data-add="kind"]') as HTMLElement[]
    expect(kinds.map(b => b.dataset.kind)).toEqual(['like', 'dislike', 'skip'])
    expect($('[data-add="kind"][aria-pressed="true"]').getAttribute('data-kind')).toBe('like')
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
   * Previously the pickers were uncontrolled selects, so anything that
   * re-rendered had to read them back first or row 3's dismissal silently
   * reset rows 1 and 2. They are buttons now and every press updates the batch
   * immediately, which removes the failure mode rather than guarding it — but
   * the behaviour is still worth pinning.
   */
  it('keeps kinds chosen on the rows that remain', async () => {
    stubResolve([wine('111'), wine('222'), wine('333')])
    openAddWines()
    type('One\nTwo\nThree')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(3))

    const press = (row: number, kind: string) =>
      $$(`[data-add="kind"][data-index="${row}"][data-kind="${kind}"]`)[0]!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    press(0, 'dislike')
    press(1, 'skip')

    $$('[data-add="dismiss"]')[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const on = $$('[data-add="kind"][aria-pressed="true"]') as HTMLElement[]
    expect(on.map(b => b.dataset.kind)).toEqual(['dislike', 'skip'])
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
    // Three kind buttons per row now, so wait on rows rather than controls.
    await vi.waitFor(() => expect($$('.resolution-row')).toHaveLength(2))

    $$('[data-add="kind"][data-index="1"][data-kind="dislike"]')[0]!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    await vi.waitFor(() => expect($('.resolution-missing-row')).toBeTruthy())

    expect(document.querySelector('.resolution script')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })
})

/**
 * The blind-top-hit bug. "Pinot Noir" is not a wine — it matches hundreds —
 * and the React app resolved it to one arbitrary bottle with no way to see
 * that had happened. That bottle then shaped the taste profile.
 */
/**
 * The two-step chrome from frames 10 and 11. Both steps live in one sheet, so
 * without it the second screen arrives with no sign a first one existed.
 */
describe('the two steps say where you are', () => {
  it('marks step one on the way in, and step two after a lookup', async () => {
    stubResolve([wine('111')])
    openAddWines()
    expect($$('.addstep').map(e => e.getAttribute('aria-current'))).toEqual(['true', 'false'])

    type('Good One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution')).toBeTruthy())

    expect($$('.addstep').map(e => e.getAttribute('aria-current'))).toEqual(['false', 'true'])
  })

  it('says what closing costs, rather than just "Cancel"', () => {
    openAddWines()
    expect($('[data-sheet="cancel"]').textContent).toContain('Close without saving')
  })

  it('promises nothing is saved before the matches are checked', () => {
    openAddWines()
    expect($('.sheet-foot').textContent).toContain('Nothing is saved until')
  })
})

describe('the typing surface', () => {
  it('counts the lines as they are typed, without rebuilding the box', () => {
    openAddWines()
    const box = $<HTMLTextAreaElement>('[data-add="text"]')
    type('One\nTwo\nThree')

    expect($('[data-add="count"]').textContent).toContain('3 lines')
    // The same element, still: a rebuild here would take the caret with it.
    expect($<HTMLTextAreaElement>('[data-add="text"]')).toBe(box)
  })

  it('numbers the lines, and grows the gutter to fit them', () => {
    openAddWines()
    const gutter = () => $('[data-add="gutter"]').textContent!.trim().split('\n')
    expect(gutter()[0]).toBe('1')
    const before = gutter().length

    type(Array.from({ length: 30 }, (_, i) => `Wine ${i}`).join('\n'))

    expect(gutter().length).toBeGreaterThan(before)
    expect(gutter().at(-1)).toBe('30')
  })

  it('carries the design\'s three side notes, privacy included', () => {
    openAddWines()
    expect($$('.addwines-note')).toHaveLength(3)
    expect($('.addwines-note--ok').textContent).toContain('Nothing is sent anywhere')
    expect($('.addwines-examples').children.length).toBe(3)
  })
})

describe('the review step names its columns', () => {
  it('states the three questions once instead of on every row', async () => {
    stubResolve([wine('111')])
    openAddWines()
    type('Good One')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution-cols')).toBeTruthy())

    const cols = [...$('.resolution-cols').children].map(c => c.textContent!.trim())
    expect(cols.slice(0, 3)).toEqual(['You typed', 'Catalogue match', 'File it in'])
  })

  it('tallies what will be saved, in the colours it will land in', async () => {
    stubResolve([wine('111'), wine('222')])
    openAddWines()
    type('One\nTwo')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.addtally')).toBeTruthy())

    expect($$('.addtally-dot')).toHaveLength(3)
    expect($('.addtally').textContent).toContain('2 More like this')
    expect($('.resolution-willsave').textContent).toContain('2 will be saved')
  })
})

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
    // Three of three is a confident match, so the alternatives start folded
    // behind a link that says how many there are. Open them.
    await vi.waitFor(() => expect($('[data-add="expand"]')).toBeTruthy())
    $('[data-add="expand"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('never picks silently: a folded row still says the others exist', async () => {
    stubCandidates([candidates])
    openAddWines()
    type('Pinot Noir')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="expand"]')).toBeTruthy())

    // The safety property survives the design's compact row: a wrong top hit
    // is one click from being seen, never a silent substitution.
    expect($('[data-add="expand"]').textContent).toContain('2 other matches')
  })

  it('preselects the best match but lists the others on request', async () => {
    await openWithCandidates()

    expect($('.resolution-name').textContent).toBe('Bourgogne Pinot Noir')
    const alts = $$('[data-add="candidate"][data-choice]')
      .filter(b => (b as HTMLElement).dataset.choice !== '-1')
    expect(alts.map(b => b.querySelector('.resolution-altname')!.textContent!.trim()))
      .toEqual(['Bourgogne Pinot Noir', 'Alsace Pinot Noir', 'Oregon Pinot Noir'])
    expect($('[data-add="candidate"][aria-pressed="true"]').getAttribute('data-choice')).toBe('0')
  })

  it('switches the match when another is chosen', async () => {
    await openWithCandidates()

    $('[data-add="candidate"][data-choice="2"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect($('.resolution-name').textContent).toBe('Oregon Pinot Noir')
    expect($('[data-add="candidate"][aria-pressed="true"]').getAttribute('data-choice')).toBe('2')
  })

  it('saves the chosen alternative, not the top hit', async () => {
    await openWithCandidates()
    $('[data-add="candidate"][data-choice="1"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    $<HTMLButtonElement>('[data-add="save"]').click()

    expect(cellar.getSnapshot().entries[0]!.wine!.name).toBe('Alsace Pinot Noir')
  })

  it('"None of these" keeps the line but adds nothing', async () => {
    await openWithCandidates()
    $('[data-add="candidate"][data-choice="-1"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // Different intention from dismissing: the line stays visible, so the
    // typed text is not silently forgotten. Rejecting the top hit reopens the
    // question, so the row becomes the card that asks it.
    expect($$('.resolution-row')).toHaveLength(1)
    expect($('.resolution-row--ambiguous')).toBeTruthy()
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

    $$('[data-add="kind"][data-index="1"][data-kind="dislike"]')[0]!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    // Row 0's alternatives are folded until asked for.
    $('[data-add="expand"][data-index="0"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    $('[data-add="candidate"][data-choice="1"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect($$('[data-add="kind"][data-index="1"][aria-pressed="true"]')[0]!
      .getAttribute('data-kind')).toBe('dislike')
  })
})


/**
 * "Pinot Noir" is a grape, not a bottle. The count is what tells the visitor
 * that, and it is the moment the product either earns trust or loses it.
 */
describe('an ambiguous name says how ambiguous it is', () => {
  const five = Array.from({ length: 5 }, (_, i) =>
    wine(String(900 + i), { name: `Pinot Noir ${i}` }))

  async function openAmbiguous(): Promise<void> {
    stubCandidates([five], 340)
    openAddWines()
    type('pinot noir')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('.resolution-alts')).toBeTruthy())
  }

  it('says how many wines match the name', async () => {
    await openAmbiguous()
    expect($('.resolution-row--ambiguous .resolution-name').textContent)
      .toContain('340 wines match that name')
  })

  it('says how many of them it is showing', async () => {
    await openAmbiguous()
    // Said once, in the card's foot, beneath the choices it describes.
    expect($('.resolution-ambfoot').textContent).toContain('Showing 5 of 340')
  })

  it('stays quiet when the catalog matched only what it returned', async () => {
    // Two candidates out of two is a choice, not an ambiguity worth a warning.
    stubCandidates([[wine('111'), wine('222')]])
    openAddWines()
    type('Something specific')
    $<HTMLButtonElement>('[data-add="lookup"]').click()
    await vi.waitFor(() => expect($('[data-add="expand"]')).toBeTruthy())

    // Two of two is a choice, not an ambiguity: no card, no warning.
    expect(document.querySelector('.resolution-many')).toBe(null)
    expect(document.querySelector('.resolution-row--ambiguous')).toBe(null)
  })
})
