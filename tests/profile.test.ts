import { describe, it, expect } from 'vitest'
import { buildProfile } from '../src/lib/profile'
import type { Wine } from '../src/lib/types'

function wine(over: Partial<Wine>): Wine {
  return {
    sku: '1', name: 'W', urlKey: '1', price: 20, inStock: true,
    country: null, region: null, appellation: null, grapes: [],
    vintage: null, tasteTag: null, rating: null, ratingCount: null, availability: [], ...over,
  }
}

describe('buildProfile', () => {
  it('counts how many seeds contain each grape', () => {
    const p = buildProfile([
      wine({ sku: 'a', grapes: ['Syrah', 'Grenache'] }),
      wine({ sku: 'b', grapes: ['Syrah'] }),
    ])
    expect(p.grapes).toEqual({ Syrah: 2, Grenache: 1 })
  })

  it('deduplicates regions, countries, appellations and tags', () => {
    const p = buildProfile([
      wine({ sku: 'a', country: 'Italy', region: 'Tuscany', tasteTag: 'Bold' }),
      wine({ sku: 'b', country: 'Italy', region: 'Tuscany', tasteTag: 'Bold' }),
    ])
    expect(p.countries).toEqual(['Italy'])
    expect(p.regions).toEqual(['Tuscany'])
    expect(p.tasteTags).toEqual(['Bold'])
  })

  it('ignores nulls rather than storing them', () => {
    const p = buildProfile([wine({ sku: 'a', country: null, region: null })])
    expect(p.countries).toEqual([])
    expect(p.regions).toEqual([])
  })

  it('takes the median price of an odd-sized set', () => {
    const p = buildProfile([
      wine({ sku: 'a', price: 10 }),
      wine({ sku: 'b', price: 20 }),
      wine({ sku: 'c', price: 60 }),
    ])
    expect(p.medianPrice).toBe(20)
  })

  it('averages the middle two for an even-sized set', () => {
    const p = buildProfile([
      wine({ sku: 'a', price: 10 }),
      wine({ sku: 'b', price: 20 }),
      wine({ sku: 'c', price: 30 }),
      wine({ sku: 'd', price: 40 }),
    ])
    expect(p.medianPrice).toBe(25)
  })

  it('uses the median, not the mean, so one outlier cannot skew it', () => {
    const p = buildProfile([
      wine({ sku: 'a', price: 20 }),
      wine({ sku: 'b', price: 22 }),
      wine({ sku: 'c', price: 500 }),
    ])
    expect(p.medianPrice).toBe(22)
  })

  it('keeps the seed wines for later attribution', () => {
    const seeds = [wine({ sku: 'a', name: 'Duas Quintas' })]
    expect(buildProfile(seeds).seeds).toEqual(seeds)
  })

  it('handles an empty seed list without throwing', () => {
    const p = buildProfile([])
    expect(p.medianPrice).toBe(0)
    expect(p.grapes).toEqual({})
    expect(p.seeds).toEqual([])
  })
})
