import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { storage } from '../src/lib/storage'
import * as app from '../src/lib/appState'
import { DEFAULT_FILTERS } from '../src/lib/filters'

beforeEach(() => {
  storage.removeItem('branch')
  storage.removeItem('filters')
  app.clearResults()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('appState publishes like the cellar does', () => {
  const cases: Array<[string, () => void]> = [
    ['setMode', () => app.setMode('find')],
    ['setBranch', () => app.setBranch('23112')],
    ['setFilters', () => app.setFilters(DEFAULT_FILTERS)],
    ['setResults', () => app.setResults([])],
    ['setStatus', () => app.setStatus('Searching…')],
    ['setError', () => app.setError('nope')],
    ['clearResults', () => app.clearResults()],
  ]

  for (const [name, run] of cases) {
    it(`${name} notifies exactly once`, () => {
      let calls = 0
      const unsub = app.subscribe(() => { calls++ })
      run()
      unsub()
      expect(calls).toBe(1)
    })
  }

  it('hands out an identity-stable snapshot between mutations', () => {
    expect(app.getSnapshot()).toBe(app.getSnapshot())
    const before = app.getSnapshot()
    app.setMode('find')
    expect(app.getSnapshot()).not.toBe(before)
  })
})

describe('persistence', () => {
  it('writes the branch through the seam', () => {
    app.setBranch('23112')
    expect(storage.getItem('branch')).toBe('23112')
  })

  it('does not throw when the browser refuses the write', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => app.setBranch('23112')).not.toThrow()
    expect(app.getSnapshot().branch).toBe('23112') // still applied in memory
  })

  it('clears status when results arrive and when an error is set', () => {
    app.setStatus('Searching…')
    app.setResults([])
    expect(app.getSnapshot().status).toBe('')

    app.setStatus('Searching…')
    app.setError('nope')
    expect(app.getSnapshot().status).toBe('')
  })
})
