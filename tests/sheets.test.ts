// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openBranchSheet } from '../src/ui/branchSheet'
import { openFilterSheet } from '../src/ui/filterSheet'
import * as catalog from '../src/lib/catalog'
import * as appState from '../src/lib/appState'
import { BRANCHES } from '../src/lib/branches'
import { DEFAULT_FILTERS } from '../src/lib/filters'
import { storage } from '../src/lib/storage'

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!
const $$ = (s: string) => [...document.querySelectorAll(s)]

beforeEach(() => {
  document.body.innerHTML = ''
  for (const k of ['branch', 'filters', 'recentBranches', 'branchCounts']) storage.removeItem(k)
  appState.setBranch('')
  appState.setFilters(DEFAULT_FILTERS)
  vi.useRealTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('the branch sheet', () => {
  it('lists every Montréal branch', () => {
    openBranchSheet()
    expect($$('[data-branch]')).toHaveLength(BRANCHES.length)
  })

  it('says it is Montréal only', () => {
    openBranchSheet()
    expect($('.sheet-summary').textContent).toContain('Montréal')
  })

  it('promises only the fields it can actually search', () => {
    // An earlier design offered "street, neighbourhood, postal code"; the
    // branch records carry a name and a street address and nothing else.
    openBranchSheet()
    const placeholder = $<HTMLInputElement>('[data-branch-q]').placeholder
    expect(placeholder).toBe('Name or street')
    expect(placeholder).not.toMatch(/postal|neighbourhood/i)
  })

  /**
   * These are in the store feed and were selectable in the React app, but they
   * serve restaurateurs — a member of the public who picks one gets a branch
   * they cannot buy from.
   */
  it('excludes the two trade-only depots', () => {
    openBranchSheet()
    const ids = $$('[data-branch]').map(b => (b as HTMLElement).dataset.branch)
    expect(ids).not.toContain('23385')
    expect(ids).not.toContain('23390')
  })

  it('filters as you type, without rebuilding the search box', () => {
    openBranchSheet()
    const input = $<HTMLInputElement>('[data-branch-q]')
    input.value = BRANCHES[0]!.name.slice(0, 6)
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect($$('[data-branch]').length).toBeLessThan(BRANCHES.length)
    expect($<HTMLInputElement>('[data-branch-q]')).toBe(input)
  })

  it('matches without accents, so "Marche" finds "Marché"', () => {
    const accented = BRANCHES.find(b => /[éèêô]/.test(b.name))
    expect(accented).toBeDefined()
    openBranchSheet()
    const input = $<HTMLInputElement>('[data-branch-q]')
    input.value = accented!.name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))

    const ids = $$('[data-branch]').map(b => (b as HTMLElement).dataset.branch)
    expect(ids).toContain(accented!.id)
  })

  it('says so when nothing matches', () => {
    openBranchSheet()
    const input = $<HTMLInputElement>('[data-branch-q]')
    input.value = 'zzzzzzzz'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect($('.hint').textContent).toContain('No Montréal branch matches')
  })

  it('highlights on tap but does not commit until confirmed', () => {
    // Two steps so the list — and the stock counts on it — can be browsed
    // without committing.
    openBranchSheet()
    const first = $<HTMLElement>('[data-branch]')
    const id = first.dataset.branch!
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(appState.getSnapshot().branch).toBe('')
    expect($('.branch-radio--on')).toBeTruthy()
    expect($('[data-branch-confirm]').textContent).toContain('Use ')

    $('[data-branch-confirm]').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(appState.getSnapshot().branch).toBe(id)
    expect(document.querySelector('dialog')).toBe(null)
  })

  it('cannot confirm before anything is chosen', () => {
    openBranchSheet()
    expect($<HTMLButtonElement>('[data-branch-confirm]').disabled).toBe(true)
  })

  it('opens on the full list, whatever was typed the time before', () => {
    // The inline panel keeps its query, because it can be rebuilt underneath
    // whoever is typing. The sheet cannot be, and an abandoned search
    // reappearing in the next one is a filtered list nobody asked for.
    openBranchSheet()
    const box = $<HTMLInputElement>('[data-branch-q]')
    box.value = 'atwater'
    box.dispatchEvent(new Event('input', { bubbles: true }))
    const narrowed = $$('[data-branch]').length
    expect(narrowed).toBeLessThan(BRANCHES.length)
    document.querySelector('dialog')!.remove()

    openBranchSheet()
    expect($<HTMLInputElement>('[data-branch-q]').value).toBe('')
    expect($$('[data-branch]')).toHaveLength(BRANCHES.length)
  })

  it('lists all branches alphabetically', () => {
    openBranchSheet()
    const names = $$('.branch-name').map(n => n.textContent!.trim())
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('shows recents first when the search is empty', () => {
    storage.setItem('recentBranches', JSON.stringify([BRANCHES[5]!.id]))
    openBranchSheet()
    expect($('.label').textContent).toContain('Recent')
    expect($('[data-branch]').getAttribute('data-branch')).toBe(BRANCHES[5]!.id)
    expect($$('.branch-group')).toHaveLength(2)
  })
})

describe('the filter sheet', () => {
  beforeEach(() => {
    appState.setBranch('23112')
    vi.spyOn(catalog, 'countMatches').mockResolvedValue(42)
  })

  it('offers every colour and the price presets', () => {
    openFilterSheet()
    expect($$('[data-filter="colour"]')).toHaveLength(5)
    expect($$('[data-filter="preset"]')).toHaveLength(4)
  })

  it('shows the live price band beside the heading', () => {
    openFilterSheet()
    expect($('[data-filter-band]').textContent).toContain('$15')

    const min = $<HTMLInputElement>('[data-filter="min"]')
    min.value = '25'
    min.dispatchEvent(new Event('input', { bubbles: true }))

    expect($('[data-filter-band]').textContent).toContain('$25')
  })

  it('marks the current colour', () => {
    openFilterSheet()
    const active = $$('[data-filter="colour"]').filter(b => b.className.includes('pill--brass'))
    expect(active).toHaveLength(1)
    expect((active[0] as HTMLElement).dataset.value).toBe('red')
  })

  it('shows a debounced count of what the draft would return', async () => {
    openFilterSheet()
    expect($('[data-filter="apply"]').textContent).toContain('Show wines')
    // The count rides on the button, so a band is never applied blind.
    await vi.waitFor(() => expect($('[data-filter="apply"]').textContent).toContain('42'))
    expect($('[data-filter="apply"]').textContent).toContain('Search these 42 wines')
  })

  it('disables applying when the band is empty', async () => {
    vi.spyOn(catalog, 'countMatches').mockResolvedValue(0)
    openFilterSheet()
    await vi.waitFor(() => {
      expect($<HTMLButtonElement>('[data-filter="apply"]').disabled).toBe(true)
    })
    expect($('[data-filter="apply"]').textContent).toContain('No wines in this band')
  })

  it('keeps the previous count showing while a new one is in flight', async () => {
    openFilterSheet()
    await vi.waitFor(() => expect($('[data-filter="apply"]').textContent).toContain('42'))

    vi.spyOn(catalog, 'countMatches').mockRejectedValue(new Error('down'))
    $$('[data-filter="colour"]')[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // Flashing to zero would read as "no wines" when it only means "has not
    // answered yet".
    expect($('[data-filter="apply"]').textContent).not.toContain('No wines')
  })

  it('applies the draft and closes', async () => {
    openFilterSheet()
    $$('[data-filter="colour"]').find(b => (b as HTMLElement).dataset.value === 'white')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect($('[data-filter="apply"]').textContent).toContain('42'))

    $('[data-filter="apply"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(appState.getSnapshot().filters.colour).toBe('white')
    expect(document.querySelector('dialog')).toBe(null)
  })

  it('does not touch the live filters until applied', () => {
    openFilterSheet()
    $$('[data-filter="colour"]').find(b => (b as HTMLElement).dataset.value === 'orange')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(appState.getSnapshot().filters.colour).toBe('red')
  })

  it('resets to the defaults from the header action', () => {
    openFilterSheet()
    $$('[data-filter="preset"]')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect($<HTMLInputElement>('[data-filter="max"]').value).toBe('15')

    $('[data-sheet="cancel"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect($<HTMLInputElement>('[data-filter="min"]').value).toBe('15')
    expect($<HTMLInputElement>('[data-filter="max"]').value).toBe('30')
    expect(document.querySelector('dialog')).not.toBe(null) // reset, not dismiss
  })

  it('does not rebuild the number inputs while they are being typed into', () => {
    openFilterSheet()
    const min = $<HTMLInputElement>('[data-filter="min"]')
    min.value = '25'
    min.dispatchEvent(new Event('input', { bubbles: true }))

    expect($<HTMLInputElement>('[data-filter="min"]')).toBe(min)
    expect(min.value).toBe('25')
  })
})
