// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineElements } from '../src/ui/shell'
import * as cellar from '../src/lib/cellar'
import { storage } from '../src/lib/storage'
import { wine } from './helpers'

defineElements()

function mountList(): HTMLElement {
  document.body.innerHTML = '<my-wines></my-wines>'
  return document.body.querySelector('my-wines')!
}

beforeEach(() => {
  document.body.innerHTML = ''
  storage.removeItem('cellar.v2')
  storage.removeItem('cellar.lastExport')
  cellar.reload()
})

describe('the three groups', () => {
  it('files each wine under its kind', () => {
    cellar.saveWine(wine('111'), 'like')
    cellar.saveWine(wine('222'), 'dislike')
    cellar.saveWine(wine('333'), 'skip')
    const el = mountList()

    const counts = [...el.querySelectorAll('.group-count')].map(n => n.textContent)
    expect(counts).toEqual(['1', '1', '1'])
    // Asserted through the group card, which is what actually carries the
    // filing now — a row no longer repeats its own group's colour.
    expect(el.querySelector('.group--liked .mywines-name')!.textContent).toBe('Wine 111')
    expect(el.querySelector('.group--disliked .mywines-name')!.textContent).toBe('Wine 222')
    expect(el.querySelector('.group--skipped .mywines-name')!.textContent).toBe('Wine 333')
  })

  it('shows a first-run screen rather than three empty groups', () => {
    const el = mountList()
    expect(el.querySelectorAll('.mywines-row')).toHaveLength(0)
    expect(el.querySelector('.firstrun')).toBeTruthy()
    expect(el.querySelector('.mywines-groups')).toBe(null)
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

    expect(el.querySelector('.group-count')!.textContent).toBe('2')
    expect(el.querySelectorAll('.group .mywines-row')).toHaveLength(2)
    expect(el.textContent).not.toContain('Loading')
  })

  it('names the unresolved SKU and offers a way out', () => {
    // The React app rendered this as a permanent, invisible "Loading 1 more…".
    cellar.replaceAll([{ sku: '10237458', kind: 'like', addedAt: 1, wine: null, wineFetchedAt: 0 }])
    const el = mountList()

    const row = el.querySelector('.mywines-row--unresolved')!
    expect(row.textContent).toContain('10237458')
    expect(row.textContent).toContain('No longer in the catalogue')

    row.querySelector<HTMLButtonElement>('[data-act="remove"]')!.click()
    expect(cellar.getSnapshot().entries).toHaveLength(0)
  })

  it('does not claim an unresolved wine still shapes your taste', () => {
    // It does not: buildProfile is fed `liked`, which filters wine !== null.
    // A draft of the design said "it still counts towards your taste", which
    // would have been a comforting sentence that happened to be false.
    cellar.replaceAll([{ sku: '10237458', kind: 'like', addedAt: 1, wine: null, wineFetchedAt: 0 }])
    const el = mountList()

    const row = el.querySelector('.mywines-row--unresolved')!
    expect(row.textContent).not.toMatch(/still counts|towards your taste|compte toujours/i)
    // And the shaping count agrees: nothing is shaping anything.
    expect(cellar.getSnapshot().liked).toHaveLength(0)
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
    // Moved card, not just moved state: the wine is now under "Less like this".
    expect(el.querySelector('.group--disliked .mywines-name')!.textContent).toBe('Wine 111')
    expect(el.querySelector('.group--liked .mywines-row')).toBe(null)
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

describe('the backup block', () => {
  it('is honest about where the list lives', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()
    expect(el.querySelector('.backup-summary')!.textContent)
      .toContain('Saved in this browser only')
    expect(el.querySelector('.backup-head')!.textContent).toContain('Keep a copy')
    // The iOS eviction window is the sharp end of this, so it is stated —
    // somewhere in the panel, in every state, not only when storage is already
    // blocked. Asserting on the panel rather than one paragraph.
    expect(el.querySelector('[data-backup]')!.textContent).toContain('seven days')
  })

  it('stays closed and unnagging for a short list', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()
    expect(el.querySelector<HTMLDetailsElement>('[data-backup]')!.open).toBe(false)
    expect(el.querySelector('.backup-summary')!.textContent).not.toContain('back it up')
  })

  it('opens and changes its whole framing once the list is worth losing', () => {
    for (let i = 0; i < 10; i++) cellar.saveWine(wine(String(100 + i)), 'like')
    const el = mountList()
    expect(el.querySelector<HTMLDetailsElement>('[data-backup]')!.open).toBe(true)
    // Not a badge bolted onto the resting state: a different heading, and the
    // summary says what is actually at stake.
    expect(el.querySelector('.backup-summary')!.textContent).toContain('10 wines, no backup yet')
    expect(el.querySelector('.backup-head')!.textContent).toContain('Worth doing now')
  })

  it('counts what would be exported', () => {
    cellar.saveWine(wine('111'), 'like')
    cellar.saveWine(wine('222'), 'skip')
    const el = mountList()
    expect(el.querySelector('[data-act="export"]')!.textContent).toContain('Export 2 wines')
  })
})

describe('importing a file', () => {
  function file(contents: string): File {
    return new File([contents], 'wines.json', { type: 'application/json' })
  }

  async function importInto(el: HTMLElement, contents: string): Promise<void> {
    const input = el.querySelector<HTMLInputElement>('[data-act="file"]')!
    Object.defineProperty(input, 'files', { value: [file(contents)], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(el.querySelector('.backup-message')).toBeTruthy())
  }

  it('merges rather than replacing', async () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()

    await importInto(el, JSON.stringify({
      format: 'saq-wine-matcher.cellar', version: 2,
      entries: [{ sku: '222', kind: 'dislike', addedAt: 1, wine: null, wineFetchedAt: 0 }],
    }))

    // The local wine is still here — that is the whole point of merge.
    expect(cellar.getSnapshot().refs).toEqual([
      { sku: '111', kind: 'like' },
      { sku: '222', kind: 'dislike' },
    ])
    expect(el.querySelector('.backup-message')!.textContent).toContain('1 new')
  })

  it('reports a file that is not an export instead of silently doing nothing', async () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()

    await importInto(el, JSON.stringify({ some: 'other json' }))

    expect(el.querySelector('.backup-message')!.textContent).toContain('not a wine list export')
    expect(cellar.getSnapshot().entries).toHaveLength(1) // and changes nothing
  })

  it('says how many entries it could not read', async () => {
    const el = mountList()
    await importInto(el, JSON.stringify({
      format: 'saq-wine-matcher.cellar', version: 2,
      entries: [{ sku: '111', kind: 'like' }, { kind: 'like' }],
    }))
    expect(el.querySelector('.backup-message')!.textContent).toContain('1 unreadable entry was skipped')
  })

  it('escapes an error built from file contents', async () => {
    const el = mountList()
    await importInto(el, JSON.stringify({
      format: 'saq-wine-matcher.cellar',
      version: '<img src=x onerror="window.pwned=1">',
      entries: [],
    }))
    expect(el.querySelector('.backup-message img')).toBe(null)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })
})

describe('exporting', () => {
  it('offers a dated file and records that a backup was taken', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()

    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub')
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let downloaded = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download
    })

    el.querySelector<HTMLButtonElement>('[data-act="export"]')!.click()

    expect(created).toHaveBeenCalled()
    expect(revoked).toHaveBeenCalledWith('blob:stub') // no leaked object URL
    expect(downloaded).toMatch(/^my-wines-\d{4}-\d{2}-\d{2}\.json$/)
    expect(el.querySelector('.backup-message')!.textContent).toContain('Exported 1 wine')
    expect(storage.getItem('cellar.lastExport')).not.toBe(null)
  })

  it('stops nagging once an export has been taken', () => {
    for (let i = 0; i < 10; i++) cellar.saveWine(wine(String(100 + i)), 'like')
    const el = mountList()
    expect(el.querySelector('.backup-summary')!.textContent).toContain('no backup yet')

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    el.querySelector<HTMLButtonElement>('[data-act="export"]')!.click()

    expect(el.querySelector('.backup-summary')!.textContent).not.toContain('no backup yet')
    expect(el.querySelector('.backup-head')!.textContent).toContain('Keep a copy')
  })
})

/**
 * The groups are named for what they do to results, not for how the visitor
 * feels — the consequence was the part nobody could infer.
 */
describe('the three groups explain themselves', () => {
  it('names each group by its effect', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()
    const titles = [...el.querySelectorAll('.group-name')].map(n => n.textContent!.trim())
    expect(titles).toEqual(['More like this', 'Less like this', 'Just hidden'])
  })

  it('says what each one does to results', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()
    const notes = [...el.querySelectorAll('.group-note')].map(n => n.textContent!.trim())
    expect(notes[0]).toContain('towards')
    expect(notes[1]).toContain('away')
    expect(notes[2]).toContain('No effect on your taste')
  })

  it('distinguishes wines saved from wines shaping results', () => {
    // The summary lives in <app-head> now, beside the page title.
    // An unresolved entry is saved but shapes nothing, and a hidden one is
    // saved on purpose to shape nothing. One number could not say both.
    cellar.saveWine(wine('111'), 'like')
    cellar.saveWine(wine('222'), 'skip')
    cellar.replaceAll([
      ...cellar.getSnapshot().entries,
      { sku: '333', kind: 'like', addedAt: 3, wine: null, wineFetchedAt: 0 },
    ])
    document.body.innerHTML = '<app-head></app-head><my-wines></my-wines>'

    expect(document.querySelector('.pagehead-sub')!.textContent)
      .toContain('3 saved · 1 shaping results')
  })

  it('keeps every group visible even when empty', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()
    expect(el.querySelectorAll('.group')).toHaveLength(3)
  })
})


/**
 * The first screen anyone sees. Three empty groups were technically complete
 * and gave no reason to believe the product would do anything useful.
 */
describe('first run', () => {
  it('says what to do first', () => {
    const el = mountList()
    // The heading is the sentence, not the label above it: "Start here" names
    // the region and would be a poor thing to land on when tabbing headings.
    expect(el.querySelector('.firstrun h2')!.textContent)
      .toContain('Three wines is enough to begin')
    expect(el.querySelector('.firstrun-eyebrow')!.textContent).toContain('Start here')
  })

  it('offers both ways in — typing, and a file', () => {
    const el = mountList()
    expect(el.querySelector('[data-act="add-wines"]')).toBeTruthy()
    expect(el.querySelector('[data-act="import"]')).toBeTruthy()
  })

  it('shows what a suggestion will look like before there is one', () => {
    const el = mountList()
    expect(el.querySelector('.firstrun-quote')!.textContent).toContain('Shares Syrah')
  })

  it('explains the three groups, which are the part nobody can guess', () => {
    const el = mountList()
    const names = [...el.querySelectorAll('.firstrun-groupname')].map(n => n.textContent!.trim())
    expect(names).toEqual(['More like this', 'Less like this', 'Just hidden'])
    const notes = [...el.querySelectorAll('.firstrun-groupnote')].map(n => n.textContent!.trim())
    expect(notes[0]).toContain('towards')
    expect(notes[1]).toContain('away')
    expect(notes[2]).toContain('No effect')
  })

  it('opens the add flow from the first-run screen', () => {
    const el = mountList()
    el.querySelector<HTMLButtonElement>('[data-act="add-wines"]')!.click()
    expect(document.querySelector('dialog [data-add="text"]')).toBeTruthy()
  })

  it('gives way to the groups as soon as anything is saved', () => {
    const el = mountList()
    expect(el.querySelector('.firstrun')).toBeTruthy()
    cellar.saveWine(wine('111'), 'like')
    expect(el.querySelector('.firstrun')).toBe(null)
    expect(el.querySelectorAll('.group')).toHaveLength(3)
  })
})
