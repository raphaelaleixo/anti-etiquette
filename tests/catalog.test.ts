import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  resolveWineName, fetchBranchCatalog, buildCatalogFilter, countMatches, catalogHeaders,
  type CatalogFilters,
} from '../src/lib/catalog'

const fixture = JSON.parse(readFileSync('tests/fixtures/catalog-23112.json', 'utf8'))

const ALL: CatalogFilters =
  { colour: 'all', priceMin: null, priceMax: null }

function mockFetchOnce(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => payload,
  })
}

afterEach(() => { vi.restoreAllMocks() })

describe('catalogHeaders', () => {
  it('carries all seven headers the endpoint requires', () => {
    for (const h of [
      'x-api-key', 'Magento-Environment-Id', 'Magento-Website-Code',
      'Magento-Store-Code', 'Magento-Store-View-Code',
      'Magento-Customer-Group', 'Content-Type',
    ]) {
      expect(catalogHeaders()).toHaveProperty(h)
    }
  })
})

describe('resolveWineName', () => {
  it('returns the top hit as a Wine', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(fixture))
    const w = await resolveWineName('duas quintas')
    expect(w).not.toBeNull()
    expect(w!.sku).toBe(fixture.data.productSearch.items[0].productView.sku)
  })

  it('returns null when nothing matches', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({
      data: { productSearch: { total_count: 0, page_info: {}, items: [] } },
    }))
    expect(await resolveWineName('nonexistent xyzzy')).toBeNull()
  })

  it('throws a descriptive error on a GraphQL error', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ errors: [{ message: 'bad field' }] }))
    await expect(resolveWineName('x')).rejects.toThrow(/bad field/)
  })

  // Saved lists are re-hydrated by SKU, and the endpoint has no SKU lookup —
  // the SKU goes through the same phrase search. Verified live: asking for
  // 12345678 returns 12345671, a different wine entirely.
  describe('when the phrase is a bare SKU', () => {
    const realSku = fixture.data.productSearch.items[0].productView.sku as string

    it('returns the wine when the SKU actually matches', async () => {
      vi.stubGlobal('fetch', mockFetchOnce(fixture))
      const w = await resolveWineName(realSku)
      expect(w!.sku).toBe(realSku)
    })

    it('returns null rather than a different wine when the SKU does not match', async () => {
      vi.stubGlobal('fetch', mockFetchOnce(fixture))
      expect(await resolveWineName('99999999')).toBeNull()
    })

    it('still accepts a near-miss numeric match for a name search', async () => {
      // The guard keys off the phrase being numeric, not off the result — a
      // name search must keep its fuzzy top hit.
      vi.stubGlobal('fetch', mockFetchOnce(fixture))
      expect(await resolveWineName('duas quintas')).not.toBeNull()
    })
  })
})

describe('buildCatalogFilter', () => {
  it('maps colour "all" to products/wine', () => {
    const clauses = buildCatalogFilter('23112', ALL)
    expect(clauses).toContainEqual({ attribute: 'categories', eq: 'products/wine' })
  })

  it('maps colour "red" to products/wine/red-wine', () => {
    const clauses = buildCatalogFilter('23112', { ...ALL, colour: 'red' })
    expect(clauses).toContainEqual({ attribute: 'categories', eq: 'products/wine/red-wine' })
  })

  it('maps colour "white" to products/wine/white-wine', () => {
    const clauses = buildCatalogFilter('23112', { ...ALL, colour: 'white' })
    expect(clauses).toContainEqual({ attribute: 'categories', eq: 'products/wine/white-wine' })
  })

  it('maps colour "rose" to products/wine/rose', () => {
    const clauses = buildCatalogFilter('23112', { ...ALL, colour: 'rose' })
    expect(clauses).toContainEqual({ attribute: 'categories', eq: 'products/wine/rose' })
  })

  it('maps colour "orange" to products/wine/orange-wine', () => {
    const clauses = buildCatalogFilter('23112', { ...ALL, colour: 'orange' })
    expect(clauses).toContainEqual({ attribute: 'categories', eq: 'products/wine/orange-wine' })
  })

  it('includes both bounds of a price range', () => {
    const clauses = buildCatalogFilter('23112', { ...ALL, priceMin: 15, priceMax: 30 })
    expect(clauses).toContainEqual({ attribute: 'price', range: { from: 15, to: 30 } })
  })

  it('includes only "from" when priceMax is null', () => {
    const clauses = buildCatalogFilter('23112', { ...ALL, priceMin: 15, priceMax: null })
    expect(clauses).toContainEqual({ attribute: 'price', range: { from: 15 } })
  })

  it('includes only "to" when priceMin is null', () => {
    const clauses = buildCatalogFilter('23112', { ...ALL, priceMin: null, priceMax: 30 })
    expect(clauses).toContainEqual({ attribute: 'price', range: { to: 30 } })
  })

  it('omits the price clause entirely when both bounds are null', () => {
    const clauses = buildCatalogFilter('23112', ALL)
    expect(clauses.some(c => c.attribute === 'price')).toBe(false)
  })

  it('the in-stock clause is always present', () => {
    const clauses = buildCatalogFilter('23112', ALL)
    expect(clauses).toContainEqual({ attribute: 'availability_front', eq: 'In store' })
  })
})

describe('fetchBranchCatalog', () => {
  it('follows total_pages and concatenates every page', async () => {
    const page = (current: number, total: number) => ({
      data: {
        productSearch: {
          total_count: 200,
          page_info: { current_page: current, page_size: 100, total_pages: total },
          items: fixture.data.productSearch.items.slice(0, 2),
        },
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page(1, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => page(2, 2) })
    vi.stubGlobal('fetch', fetchMock)

    const wines = await fetchBranchCatalog('23112', ALL)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wines.length).toBe(4)
  })

  it('reports progress as pages arrive', async () => {
    const page = (current: number, total: number) => ({
      data: {
        productSearch: {
          total_count: 200,
          page_info: { current_page: current, page_size: 100, total_pages: total },
          items: [],
        },
      },
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page(1, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => page(2, 2) }))

    const seen: number[] = []
    await fetchBranchCatalog('23112', ALL, (done) => seen.push(done))
    expect(seen.length).toBeGreaterThan(0)
  })

  it('surfaces an unexpected response shape loudly', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ data: {} }))
    await expect(fetchBranchCatalog('23112', ALL)).rejects.toThrow(/Adobe endpoint|shape/)
  })

  it('throws when page_info is present but total_pages is missing', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({
      data: {
        productSearch: {
          total_count: 200,
          page_info: { current_page: 1, page_size: 100 },
          items: [],
        },
      },
    }))
    await expect(fetchBranchCatalog('23112', ALL)).rejects.toThrow(/total_pages/)
  })

  it('throws when total_pages is 0', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({
      data: {
        productSearch: {
          total_count: 0,
          page_info: { current_page: 1, page_size: 100, total_pages: 0 },
          items: [],
        },
      },
    }))
    await expect(fetchBranchCatalog('23112', ALL)).rejects.toThrow(/total_pages/)
  })
})

describe('countMatches', () => {
  it('returns the total_count without fetching items', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({
      data: { productSearch: { total_count: 412, page_info: {}, items: [] } },
    }))
    expect(await countMatches('23112', ALL)).toBe(412)
  })

  it('throws a descriptive error when total_count is missing', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ data: { productSearch: {} } }))
    await expect(countMatches('23112', ALL)).rejects.toThrow(/total_count/)
  })

  it('sends the same filter clauses buildCatalogFilter produces', async () => {
    const fetchMock = mockFetchOnce({
      data: { productSearch: { total_count: 5, page_info: {}, items: [] } },
    })
    vi.stubGlobal('fetch', fetchMock)
    const filters: CatalogFilters = { colour: 'red', priceMin: 15, priceMax: 30 }
    await countMatches('23112', filters)
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.variables.filter).toEqual(buildCatalogFilter('23112', filters))
  })
})

describe('query error handling', () => {
  it('throws a descriptive error on a non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({}),
    }))
    await expect(resolveWineName('x')).rejects.toThrow(/500/)
  })

  it('throws a descriptive error when the response body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <') },
    }))
    await expect(resolveWineName('x')).rejects.toThrow(/non-JSON/)
  })
})
