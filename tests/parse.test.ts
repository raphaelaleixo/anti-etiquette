import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseProducts } from '../src/lib/parse'

const fixture = JSON.parse(readFileSync('tests/fixtures/catalog-23112.json', 'utf8'))

describe('parseProducts', () => {
  it('parses every item in the fixture', () => {
    const wines = parseProducts(fixture)
    expect(wines.length).toBe(fixture.data.productSearch.items.length)
  })

  it('extracts the core fields', () => {
    const wines = parseProducts(fixture)
    const w = wines[0]!
    expect(w.sku).toMatch(/^\d+$/)
    expect(w.name.length).toBeGreaterThan(0)
    expect(typeof w.price).toBe('number')
    expect(typeof w.inStock).toBe('boolean')
  })

  it('always yields grapes as a string array', () => {
    for (const w of parseProducts(fixture)) {
      expect(Array.isArray(w.grapes)).toBe(true)
      for (const g of w.grapes) expect(typeof g).toBe('string')
    }
  })

  it('finds grape data on at least some wines', () => {
    const withGrapes = parseProducts(fixture).filter(w => w.grapes.length > 0)
    expect(withGrapes.length).toBeGreaterThan(0)
  })

  it('nulls missing attributes rather than inventing them', () => {
    const wines = parseProducts(fixture)
    for (const w of wines) {
      for (const f of [w.country, w.region, w.appellation, w.tasteTag, w.vintage]) {
        expect(f === null || typeof f === 'string').toBe(true)
      }
    }
  })
})

describe('ratings', () => {
  it('parses SAQ’s own rating and its review count', () => {
    const wines = parseProducts(fixture)
    const rated = wines.filter(w => w.rating !== null)
    expect(rated.length).toBeGreaterThan(0)
    for (const w of rated) {
      expect(w.rating).toBeGreaterThanOrEqual(0)
      expect(w.rating).toBeLessThanOrEqual(100)
    }
  })

  it('keeps the review count alongside the rating, never just the score', () => {
    // A 100 from 3 reviews is noise; the count is what makes that visible,
    // so a rating without one would be misleading.
    for (const w of parseProducts(fixture)) {
      if (w.rating !== null) expect(typeof w.ratingCount).toBe('number')
    }
  })

  it('yields null rather than NaN when a wine has no rating', () => {
    for (const w of parseProducts(fixture)) {
      expect(w.rating === null || Number.isFinite(w.rating)).toBe(true)
      expect(w.ratingCount === null || Number.isFinite(w.ratingCount)).toBe(true)
    }
  })
})
