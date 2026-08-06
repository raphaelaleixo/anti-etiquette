import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildCatalogFilter, catalogHeaders, productUrl,
  setCatalogLang, getCatalogLang, type CatalogLang,
} from '../src/lib/catalog'
import { DEFAULT_FILTERS } from '../src/lib/filters'

/**
 * The SAQ runs one search index per store view, and the *values* differ, not
 * just the prose. Measured against the live endpoint at branch 23112:
 *
 *   categories=products/wine   →  20335 rows from `en`,      0 from `fr`
 *   categories=produits/vin    →      0 rows from `en`,  20335 from `fr`
 *   availability_front=In store       →  736 from `en`
 *   availability_front=En succursale  →  736 from `fr`
 *
 * A request that mixes them returns an empty result set with no error, so the
 * app would look broken rather than misconfigured. These tests exist to keep
 * the halves from drifting apart.
 */

afterEach(() => {
  setCatalogLang('en')
})

function clause(lang: CatalogLang, attribute: string): unknown {
  setCatalogLang(lang)
  return buildCatalogFilter('23112', DEFAULT_FILTERS)
    .find(c => c.attribute === attribute)
}

describe('the app is English until something says otherwise', () => {
  it('defaults to the English store view', () => {
    expect(getCatalogLang()).toBe('en')
    expect(catalogHeaders()['Magento-Store-View-Code']).toBe('en')
  })
})

describe('one switch moves every language-coupled value together', () => {
  const cases: Array<[CatalogLang, string, string, string]> = [
    ['en', 'en', 'products/wine/red-wine', 'In store'],
    ['fr', 'fr', 'produits/vin/vin-rouge', 'En succursale'],
  ]

  for (const [lang, code, category, inStore] of cases) {
    it(`${lang}: header, category and availability agree`, () => {
      setCatalogLang(lang)
      expect(catalogHeaders()['Magento-Store-View-Code']).toBe(code)
      expect(buildCatalogFilter('23112', DEFAULT_FILTERS)).toContainEqual(
        { attribute: 'categories', eq: category },
      )
      expect(buildCatalogFilter('23112', DEFAULT_FILTERS)).toContainEqual(
        { attribute: 'availability_front', eq: inStore },
      )
      expect(productUrl('14947051')).toBe(`https://www.saq.com/${lang}/14947051`)
    })
  }

  it('never emits an English category under the French store view', () => {
    // The specific failure: `fr` header, `en` category, zero rows, no error.
    // Every colour, not just the default — `all` is the one searchWines and
    // resolveSku use, so a stale root there breaks name lookup rather than
    // search, which is a different symptom in a different place.
    setCatalogLang('fr')
    for (const colour of ['all', 'red', 'white', 'rose', 'orange'] as const) {
      const filter = buildCatalogFilter('23112', { ...DEFAULT_FILTERS, colour })
      const category = filter.find(c => c.attribute === 'categories') as { eq: string }
      expect(category.eq, colour).toMatch(/^produits\/vin/)
    }
    const availability = clause('fr', 'availability_front') as { eq: string }
    expect(availability.eq).not.toBe('In store')
  })

  it('never emits a French category under the English store view', () => {
    setCatalogLang('en')
    for (const colour of ['all', 'red', 'white', 'rose', 'orange'] as const) {
      const filter = buildCatalogFilter('23112', { ...DEFAULT_FILTERS, colour })
      const category = filter.find(c => c.attribute === 'categories') as { eq: string }
      expect(category.eq, colour).toMatch(/^products\/wine/)
    }
  })

  it('gives every colour a distinct path in both languages', () => {
    for (const lang of ['en', 'fr'] as const) {
      setCatalogLang(lang)
      const paths = (['all', 'red', 'white', 'rose', 'orange'] as const).map(colour => {
        const filter = buildCatalogFilter('23112', { ...DEFAULT_FILTERS, colour })
        return (filter.find(c => c.attribute === 'categories') as { eq: string }).eq
      })
      // A copy-paste that leaves two colours pointing at the same path would
      // otherwise just silently return the wrong wines.
      expect(new Set(paths).size, lang).toBe(paths.length)
    }
  })

  it('leaves the branch and price clauses alone — those are not language', () => {
    setCatalogLang('fr')
    const filter = buildCatalogFilter('23112', { colour: 'red', priceMin: 15, priceMax: 30 })
    expect(filter).toContainEqual({ attribute: 'store_availability_list', eq: '23112' })
    expect(filter).toContainEqual({ attribute: 'price', range: { from: 15, to: 30 } })
  })
})

/**
 * The static half of the guarantee.
 *
 * A table only helps while everything goes through it. This is the same
 * technique as the dependency guard: the failure would not show up as a test
 * failure anywhere else, only as an empty result set in one language.
 */
describe('no language-coupled literal escapes the table', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const path = join(dir, e.name)
      if (e.isDirectory()) return sourceFiles(path)
      return e.name.endsWith('.ts') ? [path] : []
    })
  }

  const offenders = (needle: string, allow: string) =>
    sourceFiles('src')
      .filter(f => f !== allow)
      .filter(f => readFileSync(f, 'utf8').includes(needle))

  it('keeps category paths inside catalog.ts', () => {
    expect(offenders('products/wine', 'src/lib/catalog.ts')).toEqual([])
    expect(offenders('produits/vin', 'src/lib/catalog.ts')).toEqual([])
  })

  it('keeps the availability value inside catalog.ts', () => {
    expect(offenders("'In store'", 'src/lib/catalog.ts')).toEqual([])
    expect(offenders("'En succursale'", 'src/lib/catalog.ts')).toEqual([])
  })

  it('builds every saq.com link through productUrl', () => {
    // A hard-coded /en/ would point at the English page beside French data.
    expect(offenders('saq.com/en/', 'src/lib/catalog.ts')).toEqual([])
    expect(offenders('saq.com/fr/', 'src/lib/catalog.ts')).toEqual([])
  })
})
