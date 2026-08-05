import { describe, it, expect } from 'vitest'
import { storage, isPersistent, onExternalChange } from '../src/lib/storage'

/**
 * No DOM at all — the condition the data-layer tests run under, and a rough
 * stand-in for a browser that denies storage outright.
 */

describe('the storage seam with no localStorage', () => {
  it('falls back to memory rather than throwing on import', () => {
    expect(() => storage.getItem('anything')).not.toThrow()
    expect(storage.getItem('anything')).toBe(null)
  })

  it('round-trips through the fallback', () => {
    storage.setItem('k', 'v')
    expect(storage.getItem('k')).toBe('v')
    storage.removeItem('k')
    expect(storage.getItem('k')).toBe(null)
  })

  it('reports that nothing will survive a reload', () => {
    expect(isPersistent()).toBe(false)
  })

  it('returns a working no-op unsubscribe when there is no window', () => {
    const unsub = onExternalChange('k', () => {})
    expect(() => unsub()).not.toThrow()
  })
})
