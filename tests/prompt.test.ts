import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/lib/prompt'
import type { Wine } from '../src/lib/types'
import type { CatalogFilters } from '../src/lib/catalog'

function wine(over: Partial<Wine>): Wine {
  return {
    sku: '1', name: 'W', urlKey: '1', price: 20, inStock: true,
    country: null, region: null, appellation: null, grapes: [],
    vintage: null, tasteTag: null, rating: null, ratingCount: null, availability: ['In store'], ...over,
  }
}

const NO_FILTERS: CatalogFilters =
  { colour: 'all', priceMin: null, priceMax: null }

describe('buildPrompt', () => {
  it('lists seed wines by name', () => {
    const p = buildPrompt(
      [wine({ sku: 'a', name: 'Duas Quintas' })], [], [], 'Centre Eaton', NO_FILTERS,
    )
    expect(p).toContain('Duas Quintas')
  })

  it('lists candidate wines by name', () => {
    const p = buildPrompt(
      [], [], [wine({ sku: 'b', name: 'Chateau Something' })], 'Centre Eaton', NO_FILTERS,
    )
    expect(p).toContain('Chateau Something')
  })

  it('never puts a $ price in a wine line, even though the wine has a price', () => {
    const p = buildPrompt(
      [wine({ sku: 'a', name: 'Seed Wine', price: 23.35 })],
      [],
      [wine({ sku: 'b', name: 'Candidate Wine', price: 23.35 })],
      'Centre Eaton', NO_FILTERS,
    )
    expect(p).not.toContain('23.35')
    const wineLines = p.split('\n').filter(l => l.startsWith('- '))
    for (const line of wineLines) {
      expect(line).not.toContain('$')
    }
  })

  it('describes a filter with both price bounds', () => {
    const p = buildPrompt([], [], [wine({})], 'Centre Eaton',
      { colour: 'red', priceMin: 15, priceMax: 30 })
    expect(p).toContain('red wines, $15–30')
  })

  it('describes a filter with only a lower bound', () => {
    const p = buildPrompt([], [], [wine({})], 'Centre Eaton',
      { colour: 'all', priceMin: 15, priceMax: null })
    expect(p).toContain('over $15')
  })

  it('describes a filter with only an upper bound', () => {
    const p = buildPrompt([], [], [wine({})], 'Centre Eaton',
      { colour: 'all', priceMin: null, priceMax: 30 })
    expect(p).toContain('under $30')
  })

  it('describes a filter with no bounds at all', () => {
    const p = buildPrompt([], [], [wine({})], 'Centre Eaton', NO_FILTERS)
    expect(p).toContain('SAQ Centre Eaton currently has these wines:')
  })

  it('includes the store name', () => {
    const p = buildPrompt([], [], [wine({})], 'Complexe Desjardins', NO_FILTERS)
    expect(p).toContain('Complexe Desjardins')
  })

  it('produces the "still working out" line for an empty seed list', () => {
    const p = buildPrompt([], [], [wine({})], 'Centre Eaton', NO_FILTERS)
    expect(p).toContain('I am still working out what I like.')
  })

  it('produces the "has nothing matching" line for an empty candidate list', () => {
    const p = buildPrompt([wine({})], [], [], 'Centre Eaton', NO_FILTERS)
    expect(p).toContain('has nothing matching')
  })

  it('dedupes candidates sharing a name across different SKUs, keeping the first', () => {
    const p = buildPrompt(
      [],
      [],
      [
        wine({ sku: '907568', name: 'Frescobaldi Nipozzano Chianti Rufina Riserva', vintage: '2019' }),
        wine({ sku: '107276', name: 'frescobaldi nipozzano chianti rufina riserva  ', vintage: null }),
      ],
      'Centre Eaton', NO_FILTERS,
    )
    const occurrences = p.split('\n')
      .filter(l => l.toLowerCase().includes('nipozzano'))
    expect(occurrences.length).toBe(1)
    // The first occurrence (proper case) won, not the second (lowercase, padded).
    expect(occurrences[0]).toBe('- Frescobaldi Nipozzano Chianti Rufina Riserva')
  })

  it('renders a wine with no country/region/grapes as just its name', () => {
    const p = buildPrompt(
      [], [], [wine({ sku: 'b', name: 'Bare Wine', country: null, region: null, grapes: [] })],
      'Centre Eaton', NO_FILTERS,
    )
    expect(p).toContain('- Bare Wine\n')
    expect(p).not.toContain('Bare Wine —')
  })

  it('omits grape varieties but still shows country and region', () => {
    const p = buildPrompt(
      [wine({
        sku: 'a', name: 'Ramos-Pinto Duas Quintas', country: 'Portugal',
        region: 'Porto/Douro', grapes: ['Touriga Nacional', 'Touriga Franca'],
      })],
      [],
      [wine({
        sku: 'b', name: 'Osoyoos Larose', country: 'Canada',
        region: 'Okanagan Valley', grapes: ['Cabernet Sauvignon', 'Merlot'],
      })],
      'Centre Eaton', NO_FILTERS,
    )
    expect(p).toContain('- Ramos-Pinto Duas Quintas — Portugal, Porto/Douro')
    expect(p).toContain('- Osoyoos Larose — Canada, Okanagan Valley')
    expect(p).not.toContain('Touriga')
    expect(p).not.toContain('Cabernet')
    expect(p).not.toContain('Merlot')
  })

  describe('dislikes', () => {
    it('lists disliked wines under "I did not like these:" when present', () => {
      const p = buildPrompt(
        [], [wine({ sku: 'd', name: 'Bad Chianti', country: 'Italy', region: 'Tuscany' })],
        [wine({ sku: 'c', name: 'Candidate' })],
        'Centre Eaton', NO_FILTERS,
      )
      expect(p).toContain('I did not like these:')
      expect(p).toContain('- Bad Chianti — Italy, Tuscany')
    })

    it('omits the dislikes section entirely when the list is empty', () => {
      const p = buildPrompt(
        [], [], [wine({ sku: 'c', name: 'Candidate' })], 'Centre Eaton', NO_FILTERS,
      )
      expect(p).not.toContain('I did not like these')
    })

    it('never puts a $ price in a dislike line', () => {
      const p = buildPrompt(
        [], [wine({ sku: 'd', name: 'Bad Wine', price: 19.99 })],
        [wine({ sku: 'c', name: 'Candidate' })],
        'Centre Eaton', NO_FILTERS,
      )
      expect(p).not.toContain('19.99')
      const wineLines = p.split('\n').filter(l => l.startsWith('- '))
      for (const line of wineLines) {
        expect(line).not.toContain('$')
      }
    })

    it('dedupes dislikes sharing a name across different SKUs, keeping the first', () => {
      const p = buildPrompt(
        [],
        [
          wine({ sku: 'd1', name: 'Duplicate Dislike' }),
          wine({ sku: 'd2', name: 'duplicate dislike  ' }),
        ],
        [wine({ sku: 'c', name: 'Candidate' })],
        'Centre Eaton', NO_FILTERS,
      )
      const occurrences = p.split('\n').filter(l => l.toLowerCase().includes('duplicate dislike'))
      expect(occurrences.length).toBe(1)
    })

    it('sits between the liked block and the availability block', () => {
      const p = buildPrompt(
        [wine({ sku: 'a', name: 'Liked Wine' })],
        [wine({ sku: 'd', name: 'Disliked Wine' })],
        [wine({ sku: 'c', name: 'Candidate' })],
        'Centre Eaton', NO_FILTERS,
      )
      const likedIdx = p.indexOf('Liked Wine')
      const dislikedIdx = p.indexOf('I did not like these:')
      const availableIdx = p.indexOf('currently has these')
      expect(likedIdx).toBeLessThan(dislikedIdx)
      expect(dislikedIdx).toBeLessThan(availableIdx)
    })
  })
})

describe('ratings in the prompt', () => {
  it('gives shelf candidates their rating and its sample size', () => {
    const out = buildPrompt(
      [wine({ sku: 'a', name: 'Seed' })],
      [],
      [wine({ sku: 'b', name: 'Shelf Wine', rating: 88, ratingCount: 33 })],
      'Centre Eaton',
      { colour: 'red', priceMin: 15, priceMax: 30 },
    )
    expect(out).toContain('rated 88/100 by 33')
  })

  it('never states a score without its sample size', () => {
    const out = buildPrompt(
      [wine({ sku: 'a', name: 'Seed' })],
      [],
      [wine({ sku: 'b', name: 'Thin', rating: 100, ratingCount: 3 })],
      'Centre Eaton',
      { colour: 'red', priceMin: null, priceMax: null },
    )
    expect(out).toContain('rated 100/100 by 3')
    expect(out).not.toMatch(/rated 100\/100(?! by)/)
  })

  it('omits the rating entirely when a wine has none', () => {
    const out = buildPrompt(
      [wine({ sku: 'a', name: 'Seed' })],
      [],
      [wine({ sku: 'b', name: 'Plain Wine' })],
      'Centre Eaton',
      { colour: 'all', priceMin: null, priceMax: null },
    )
    expect(out).toContain('Plain Wine')
    // Match the actual shape, not the substring "rated" — a wine could
    // legitimately be named "Unrated" and pass a naive toContain check.
    expect(out).not.toMatch(/rated \d+\/100/)
  })

  it('leaves the liked and disliked lists unrated — they are not the decision', () => {
    const out = buildPrompt(
      [wine({ sku: 'a', name: 'Seed', rating: 91, ratingCount: 50 })],
      [wine({ sku: 'c', name: 'Nope', rating: 60, ratingCount: 12 })],
      [wine({ sku: 'b', name: 'Shelf' })],
      'Centre Eaton',
      { colour: 'all', priceMin: null, priceMax: null },
    )
    expect(out).not.toContain('91/100')
    expect(out).not.toContain('60/100')
  })
})
