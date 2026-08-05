import { describe, it, expect } from 'vitest'
import stores from '../src/data/montreal-stores.json'

describe('montreal-stores.json', () => {
  it('contains a plausible number of branches', () => {
    expect(stores.length).toBeGreaterThan(40)
    expect(stores.length).toBeLessThan(120)
  })

  it('gives every branch an id, name and address', () => {
    for (const s of stores) {
      expect(s.id).toMatch(/^\d+$/)
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.address.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    expect(new Set(stores.map(s => s.id)).size).toBe(stores.length)
  })

  it('includes Centre Eaton, the branch used in the catalog fixture', () => {
    expect(stores.some(s => s.id === '23112')).toBe(true)
  })
})
