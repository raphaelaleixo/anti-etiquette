import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { scoreWine, rankWines, WEIGHTS } from '../src/lib/score'
import { buildProfile } from '../src/lib/profile'
import { parseProducts } from '../src/lib/parse'
import type { Wine } from '../src/lib/types'

function wine(over: Partial<Wine>): Wine {
  return {
    sku: '1', name: 'W', urlKey: '1', price: 20, inStock: true,
    country: null, region: null, appellation: null, grapes: [],
    vintage: null, tasteTag: null, rating: null, ratingCount: null, availability: ['In store'], ...over,
  }
}

const points = (s: ReturnType<typeof scoreWine>, kind: string) =>
  s!.components.find(c => c.kind === kind)?.points ?? 0

describe('scoreWine', () => {
  it('gives full grape points when grape sets are identical', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    const s = scoreWine(wine({ sku: 'b', grapes: ['Syrah'] }), profile)
    expect(points(s, 'grape')).toBeCloseTo(WEIGHTS.grape)
  })

  it('gives partial grape points by Jaccard overlap', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    // intersection 1, union {Syrah, Merlot} = 2 -> 0.5
    const s = scoreWine(wine({ sku: 'b', grapes: ['Syrah', 'Merlot'] }), profile)
    expect(points(s, 'grape')).toBeCloseTo(WEIGHTS.grape * 0.5)
  })

  it('gives zero grape points when nothing overlaps', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    const s = scoreWine(wine({ sku: 'b', grapes: ['Merlot'] }), profile)
    expect(points(s, 'grape')).toBe(0)
  })

  it('records which grapes matched', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah', 'Grenache'] })])
    const s = scoreWine(wine({ sku: 'b', grapes: ['Syrah', 'Grenache'] }), profile)
    const c = s!.components.find(c => c.kind === 'grape')!
    expect(c.detail.sort()).toEqual(['Grenache', 'Syrah'])
  })

  it('awards exact matches on tag, region, appellation and country', () => {
    const profile = buildProfile([wine({
      sku: 'a', tasteTag: 'Bold', region: 'Douro',
      appellation: 'DOC', country: 'Portugal',
    })])
    const s = scoreWine(wine({
      sku: 'b', tasteTag: 'Bold', region: 'Douro',
      appellation: 'DOC', country: 'Portugal',
    }), profile)
    expect(points(s, 'tasteTag')).toBe(WEIGHTS.tasteTag)
    expect(points(s, 'region')).toBe(WEIGHTS.region)
    expect(points(s, 'appellation')).toBe(WEIGHTS.appellation)
    expect(points(s, 'country')).toBe(WEIGHTS.country)
  })

  it('gives full price points at the median', () => {
    const profile = buildProfile([wine({ sku: 'a', price: 25 })])
    const s = scoreWine(wine({ sku: 'b', price: 25 }), profile)
    expect(points(s, 'price')).toBeCloseTo(WEIGHTS.price)
  })

  it('gives zero price points at double the median', () => {
    const profile = buildProfile([wine({ sku: 'a', price: 25 })])
    const s = scoreWine(wine({ sku: 'b', price: 50 }), profile)
    expect(points(s, 'price')).toBeCloseTo(0)
  })

  it('never returns negative price points far above the median', () => {
    const profile = buildProfile([wine({ sku: 'a', price: 25 })])
    const s = scoreWine(wine({ sku: 'b', price: 500 }), profile)
    expect(points(s, 'price')).toBe(0)
  })

  it('omits components that scored nothing', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    const s = scoreWine(wine({ sku: 'b', grapes: ['Merlot'] }), profile)
    expect(s!.components.some(c => c.kind === 'grape')).toBe(false)
  })

  it('excludes a wine that is already a seed', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    expect(scoreWine(wine({ sku: 'a', grapes: ['Syrah'] }), profile)).toBeNull()
  })

  it('excludes wines marked unavailable', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    const s = scoreWine(
      wine({ sku: 'b', grapes: ['Syrah'], availability: ['Unavailable'] }),
      profile,
    )
    expect(s).toBeNull()
  })

  it('excludes wines only available in a lottery', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    const s = scoreWine(
      wine({ sku: 'b', grapes: ['Syrah'], availability: ['In a lottery'] }),
      profile,
    )
    expect(s).toBeNull()
  })

  it('returns null for an empty profile', () => {
    const profile = buildProfile([])
    const s = scoreWine(wine({ sku: 'b', grapes: ['Syrah'] }), profile)
    expect(s).toBeNull()
  })

  it('totals its own components exactly', () => {
    const profile = buildProfile([wine({
      sku: 'a', grapes: ['Syrah'], tasteTag: 'Bold', price: 25,
    })])
    const s = scoreWine(wine({
      sku: 'b', grapes: ['Syrah'], tasteTag: 'Bold', price: 25,
    }), profile)!
    const sum = s.components.reduce((t, c) => t + c.points, 0)
    expect(s.total).toBeCloseTo(sum)
  })
})

describe('rankWines', () => {
  it('sorts descending and honours the limit', () => {
    const profile = buildProfile([wine({ sku: 'a', grapes: ['Syrah'] })])
    const ranked = rankWines([
      wine({ sku: 'b', grapes: ['Merlot'], price: 999 }),
      wine({ sku: 'c', grapes: ['Syrah'] }),
    ], profile, 1)
    expect(ranked.length).toBe(1)
    expect(ranked[0]!.wine.sku).toBe('c')
  })

  it('returns nothing for an empty profile rather than arbitrary wines', () => {
    const ranked = rankWines([wine({ sku: 'b' })], buildProfile([]), 10)
    expect(ranked).toEqual([])
  })

  it('ranks the real catalog without throwing and respects the limit', () => {
    const fixture = JSON.parse(
      readFileSync('tests/fixtures/catalog-23112.json', 'utf8'))
    const all = parseProducts(fixture)
    const profile = buildProfile(all.slice(0, 3))
    const ranked = rankWines(all, profile, 10)
    expect(ranked.length).toBeLessThanOrEqual(10)
    for (const r of ranked) {
      expect(profile.seeds.some(s => s.sku === r.wine.sku)).toBe(false)
    }
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.total).toBeGreaterThanOrEqual(ranked[i]!.total)
    }
  })
})
