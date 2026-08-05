import { describe, it, expect } from 'vitest'
import { describeMatch } from '../src/lib/reasons'
import { buildProfile } from '../src/lib/profile'
import { scoreWine } from '../src/lib/score'
import type { Wine } from '../src/lib/types'

function wine(over: Partial<Wine>): Wine {
  return {
    sku: '1', name: 'W', urlKey: '1', price: 20, inStock: true,
    country: null, region: null, appellation: null, grapes: [],
    vintage: null, tasteTag: null, rating: null, ratingCount: null, availability: ['In store'], ...over,
  }
}

describe('describeMatch', () => {
  it('names the shared grapes and the seed wine they came from', () => {
    const profile = buildProfile([
      wine({ sku: 'a', name: 'Duas Quintas', grapes: ['Touriga Nacional'] }),
    ])
    const scored = scoreWine(
      wine({ sku: 'b', grapes: ['Touriga Nacional'] }), profile)!
    const text = describeMatch(scored, profile)
    expect(text).toContain('Touriga Nacional')
    expect(text).toContain('Duas Quintas')
  })

  it('joins two grapes with "and"', () => {
    const profile = buildProfile([
      wine({ sku: 'a', name: 'Seed', grapes: ['Syrah', 'Grenache'] }),
    ])
    const scored = scoreWine(
      wine({ sku: 'b', grapes: ['Syrah', 'Grenache'] }), profile)!
    expect(describeMatch(scored, profile)).toMatch(/Syrah and Grenache|Grenache and Syrah/)
  })

  it('mentions the shared taste tag', () => {
    const profile = buildProfile([
      wine({ sku: 'a', name: 'Seed', tasteTag: 'Aromatic and robust' }),
    ])
    const scored = scoreWine(
      wine({ sku: 'b', tasteTag: 'Aromatic and robust' }), profile)!
    expect(describeMatch(scored, profile)).toContain('Aromatic and robust')
  })

  it('mentions the region when it matches', () => {
    const profile = buildProfile([wine({ sku: 'a', name: 'Seed', region: 'Tuscany' })])
    const scored = scoreWine(wine({ sku: 'b', region: 'Tuscany' }), profile)!
    expect(describeMatch(scored, profile)).toContain('Tuscany')
  })

  it('mentions at most three things so the line stays readable', () => {
    const profile = buildProfile([wine({
      sku: 'a', name: 'Seed', grapes: ['Syrah'], tasteTag: 'Bold',
      region: 'Douro', appellation: 'DOC', country: 'Portugal', price: 25,
    })])
    const scored = scoreWine(wine({
      sku: 'b', grapes: ['Syrah'], tasteTag: 'Bold',
      region: 'Douro', appellation: 'DOC', country: 'Portugal', price: 25,
    }), profile)!
    const text = describeMatch(scored, profile)
    expect(text.split('.').filter(s => s.trim()).length).toBeLessThanOrEqual(3)
  })

  it('always returns a non-empty sentence ending in a period', () => {
    const profile = buildProfile([wine({ sku: 'a', name: 'Seed', price: 20 })])
    const scored = scoreWine(wine({ sku: 'b', price: 20 }), profile)!
    const text = describeMatch(scored, profile)
    expect(text.length).toBeGreaterThan(0)
    expect(text.trim().endsWith('.')).toBe(true)
  })

  it('uses generic form when grapes come from different seeds', () => {
    const profile = buildProfile([
      wine({ sku: 'a', name: 'Seed A', grapes: ['Syrah'] }),
      wine({ sku: 'c', name: 'Seed B', grapes: ['Grenache'] }),
    ])
    const scored = scoreWine(
      wine({ sku: 'b', grapes: ['Syrah', 'Grenache'] }), profile)!
    const text = describeMatch(scored, profile)
    expect(text).toContain('with your wines')
    expect(text).not.toContain('Seed A')
    expect(text).not.toContain('Seed B')
  })

  it('names the seed when it contains all shared grapes', () => {
    const profile = buildProfile([
      wine({ sku: 'a', name: 'Multi-Grape', grapes: ['Syrah', 'Grenache'] }),
      wine({ sku: 'c', name: 'Single-Grape', grapes: ['Cabernet'] }),
    ])
    const scored = scoreWine(
      wine({ sku: 'b', grapes: ['Syrah', 'Grenache'] }), profile)!
    const text = describeMatch(scored, profile)
    expect(text).toContain('Multi-Grape')
    expect(text).not.toContain('with your wines')
  })

  it('merges region and country into one clause', () => {
    const profile = buildProfile([wine({
      sku: 'a', name: 'Seed', region: 'Tuscany', country: 'Italy',
    })])
    const scored = scoreWine(wine({
      sku: 'b', region: 'Tuscany', country: 'Italy',
    }), profile)!
    const text = describeMatch(scored, profile)
    expect(text).toContain('Tuscany')
    expect(text).toContain('Italy')
    const alsoFromCount = (text.match(/Also from/g) || []).length
    expect(alsoFromCount).toBe(1)
  })
})
