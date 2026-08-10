// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { defineElements } from '../src/ui/shell'
import * as appState from '../src/lib/appState'
import * as cellar from '../src/lib/cellar'
import * as catalog from '../src/lib/catalog'
import { runSearch } from '../src/lib/search'
import { DEFAULT_FILTERS } from '../src/lib/filters'
import { storage } from '../src/lib/storage'
import { wine } from './helpers'

/**
 * The structure a screen reader gets, as opposed to the one a browser draws.
 *
 * Everything here was found by reading markup rather than by looking at the
 * app, because none of it changes a single pixel: two h1s look exactly like
 * one, a status line nobody announces looks exactly like one that is, and a
 * button labelled "Rosemont" looks like it says what it does.
 */

defineElements()

beforeEach(() => {
  document.body.innerHTML = ''
  for (const k of ['cellar.v2', 'branch', 'recentBranches', 'branchCounts', 'filters']) {
    storage.removeItem(k)
  }
  cellar.reload()
  appState.clearResults()
  appState.setBranch('')
  appState.setFilters(DEFAULT_FILTERS)
  appState.setMode('wines')
})

afterEach(() => { vi.restoreAllMocks() })

/** A real search, so the rendered tree is the one the app actually builds. */
async function search(): Promise<void> {
  vi.spyOn(catalog, 'fetchBranchCatalog').mockResolvedValue([wine('999')])
  appState.setBranch('23112')
  cellar.saveWine(wine('111'), 'like')
  await runSearch()
  appState.setMode('find')
}

const levels = (root: ParentNode) =>
  [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => Number(h.tagName[1]))

describe('headings describe one document, not several', () => {
  it('gives the app shell exactly one h1, and it names the app', () => {
    const shell = readFileSync('app/index.html', 'utf8')
    const h1s = [...shell.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
    expect(h1s).toHaveLength(1)
    expect(h1s[0]![1]).toContain('Anti-Étiquette')
  })

  it('starts each section at h2, below the h1 the shell already carries', () => {
    // My wines used to render its own h1, which put two of them on the page.
    cellar.saveWine(wine('111'), 'like')
    document.body.innerHTML = '<app-head></app-head>'
    const head = document.querySelector('app-head')!
    expect(head.querySelector('h1')).toBeNull()
    expect(head.querySelector('h2')!.textContent).toContain('My wines')
  })

  it('skips no level on My wines', () => {
    // h2 section, h3 per group. A jump from h2 to h4 reads as a missing
    // section to anyone navigating by heading.
    cellar.saveWine(wine('111'), 'like')
    document.body.innerHTML = '<app-head></app-head><app-panel></app-panel>'
    const seen = levels(document.body)
    expect(seen[0]).toBe(2)
    for (const [i, level] of seen.entries()) {
      if (i > 0) expect(level - seen[i - 1]!).toBeLessThanOrEqual(1)
    }
  })

  it('gives the results their own h2 rather than a styled div', async () => {
    await search()
    document.body.innerHTML = '<find-panel></find-panel>'
    const title = document.querySelector('.results-title')!
    expect(title.tagName).toBe('H2')
  })

  it('names the wine groups with headings', () => {
    cellar.saveWine(wine('111'), 'like')
    document.body.innerHTML = '<app-panel></app-panel>'
    const group = document.querySelector('.group-name')!
    expect(group.tagName).toBe('H3')
  })
})

describe('the status line is announced', () => {
  it('puts the live region on the host, which survives a re-render', () => {
    // The point of the test: app-status assigns innerHTML on every store
    // change, so a region rendered inside it is a different node each time —
    // and a live region that appeared together with its text is not reliably
    // read out. Only the host persists.
    document.body.innerHTML = '<app-status></app-status>'
    const host = document.querySelector('app-status')!
    expect(host.getAttribute('aria-live')).toBe('polite')

    appState.setStatus('Fetching…')
    expect(host.textContent).toContain('Fetching…')
    expect(host.getAttribute('aria-live')).toBe('polite')

    appState.setError('Search failed: offline')
    expect(host.querySelector('.error')!.textContent).toContain('offline')
    expect(host.getAttribute('aria-live')).toBe('polite')
  })

  it('does not read the progress bar out page by page', () => {
    document.body.innerHTML = '<app-status></app-status>'
    appState.setStatus('Fetching…', { done: 3, total: 9 })
    const bar = document.querySelector('.progress')!
    // Inside a polite region, so it has to opt out explicitly.
    expect(bar.getAttribute('aria-live')).toBe('off')
    // And it needs a name of its own: "33%" alone says nothing about what is
    // at 33%.
    expect(bar.getAttribute('aria-label')).toBeTruthy()
  })
})

describe('controls say what they do, not only what they hold', () => {
  it('labels the scope chips with the verb', async () => {
    await search()
    document.body.innerHTML = '<app-head></app-head>'
    const chips = [...document.querySelectorAll('.scopechip')]
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      const label = chip.getAttribute('aria-label') ?? ''
      // The visible text is the current value; the label must add the action,
      // so it cannot simply repeat what is already rendered.
      expect(label).not.toBe('')
      expect(label.trim()).not.toBe(chip.textContent!.trim())
      expect(label).toContain(chip.textContent!.trim())
    }
  })
})

describe('the landing names itself once', () => {
  const landing = readFileSync('index.html', 'utf8')

  it('declares a canonical URL', () => {
    expect(landing).toMatch(/<link rel="canonical" href="https:\/\/[^"]+"/)
  })

  it('claims no hreflang, because there is no second URL to claim', () => {
    // Both languages are one document behind a toggle. An hreflang pair would
    // be advertising addresses that return 404.
    // The attribute, not the word — the markup explains the decision in a
    // comment that would otherwise match.
    expect(landing).not.toMatch(/hreflang=/)
  })
})
