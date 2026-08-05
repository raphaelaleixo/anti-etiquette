import { describe, it, expect } from 'vitest'
import { filtersEqual, DEFAULT_FILTERS } from '../src/lib/filters'
import type { CatalogFilters } from '../src/lib/catalog'

const base: CatalogFilters = { colour: 'red', priceMin: 15, priceMax: 30 }

describe('filtersEqual', () => {
  it('treats an identical set as equal, so re-applying keeps the results', () => {
    expect(filtersEqual(base, { ...base })).toBe(true)
    expect(filtersEqual(DEFAULT_FILTERS, { ...DEFAULT_FILTERS })).toBe(true)
  })

  it('spots a colour change', () => {
    expect(filtersEqual(base, { ...base, colour: 'white' })).toBe(false)
  })

  it('spots either price bound moving', () => {
    expect(filtersEqual(base, { ...base, priceMin: 20 })).toBe(false)
    expect(filtersEqual(base, { ...base, priceMax: 60 })).toBe(false)
  })

  it('distinguishes null from a number — an open bound is not the same search', () => {
    expect(filtersEqual(base, { ...base, priceMin: null })).toBe(false)
    expect(filtersEqual({ ...base, priceMax: null }, base)).toBe(false)
  })

  it('compares every field of CatalogFilters', () => {
    // Guards the comment on filtersEqual: add a field and forget to compare it
    // and stale results survive a filter change. This fails loudly instead.
    expect(Object.keys(base).sort()).toEqual(['colour', 'priceMax', 'priceMin'])
  })
})
