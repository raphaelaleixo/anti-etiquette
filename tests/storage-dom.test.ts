// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { storage, isPersistent, onExternalChange } from '../src/lib/storage'

/** The normal case: a browser that allows storage. */

beforeEach(() => {
  localStorage.clear()
})

describe('the storage seam with a real localStorage', () => {
  it('uses it, so writes survive', () => {
    storage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })

  it('reports itself persistent', () => {
    expect(isPersistent()).toBe(true)
  })
})

describe('onExternalChange', () => {
  function fire(key: string | null): void {
    window.dispatchEvent(new StorageEvent('storage', { key }))
  }

  it('fires when another tab writes the watched key', () => {
    let calls = 0
    const unsub = onExternalChange('cellar.v2', () => { calls++ })
    fire('cellar.v2')
    expect(calls).toBe(1)
    unsub()
  })

  it('ignores unrelated keys', () => {
    let calls = 0
    const unsub = onExternalChange('cellar.v2', () => { calls++ })
    fire('something-else')
    expect(calls).toBe(0)
    unsub()
  })

  it('fires on a whole-store clear, which carries a null key', () => {
    // "Clear browsing data" is exactly the case the export feature exists for,
    // so the app must at least notice it rather than show a phantom list.
    let calls = 0
    const unsub = onExternalChange('cellar.v2', () => { calls++ })
    fire(null)
    expect(calls).toBe(1)
    unsub()
  })

  it('stops firing after unsubscribe', () => {
    let calls = 0
    const unsub = onExternalChange('cellar.v2', () => { calls++ })
    unsub()
    fire('cellar.v2')
    expect(calls).toBe(0)
  })
})
