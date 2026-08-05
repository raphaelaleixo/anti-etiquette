// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
  storage.removeItem('cellar.lastExport')
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

describe('the backup block', () => {
  it('is honest about where the list lives', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()
    expect(el.querySelector('.backup-summary')!.textContent)
      .toContain('Saved in this browser only')
    // The iOS eviction window is the sharp end of this, so it is stated.
    expect(el.querySelector('.backup .hint')!.textContent).toContain('seven days')
  })

  it('stays closed and unnagging for a short list', () => {
    cellar.saveWine(wine('111'), 'like')
    const el = mountList()
    expect(el.querySelector<HTMLDetailsElement>('[data-backup]')!.open).toBe(false)
    expect(el.querySelector('.backup-summary')!.textContent).not.toContain('back it up')
  })

  it('opens and nags once the list is worth losing', () => {
    for (let i = 0; i < 10; i++) cellar.saveWine(wine(String(100 + i)), 'like')
    const el = mountList()
    expect(el.querySelector<HTMLDetailsElement>('[data-backup]')!.open).toBe(true)
    expect(el.querySelector('.backup-summary')!.textContent).toContain('back it up')
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
    expect(el.querySelector('.backup-summary')!.textContent).toContain('back it up')

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    el.querySelector<HTMLButtonElement>('[data-act="export"]')!.click()

    expect(el.querySelector('.backup-summary')!.textContent).not.toContain('back it up')
  })
})
