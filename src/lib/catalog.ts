import { parseProducts } from './parse'
import type { Wine } from './types'

const ENDPOINT = 'https://catalog-service.adobe.io/graphql'

/**
 * Public front-end credentials, scraped from any saq.com page source.
 * If these rotate, re-scrape from https://www.saq.com/en/products/wine.
 */
export const CATALOG_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'x-api-key': '7a7d7422bd784f2481a047e03a73feaf',
  'Magento-Environment-Id': '2ce24571-9db9-4786-84a9-5f129257ccbb',
  'Magento-Website-Code': 'base',
  'Magento-Store-Code': 'main_website_store',
  'Magento-Store-View-Code': 'en',
  'Magento-Customer-Group': 'b6589fc6ab0dc82cf12099d1c2d40ab994e8410c',
}

const PRODUCT_FIELDS = `
  sku name urlKey inStock
  attributes{name value}
  ... on SimpleProductView{ price{ final{ amount{ value currency } } } }
`

const SEARCH_QUERY = `
query($phrase:String!,$filter:[SearchClauseInput!]!,$size:Int!,$page:Int!){
  productSearch(phrase:$phrase,filter:$filter,page_size:$size,current_page:$page,
                sort:[{attribute:"name",direction:ASC}]){
    total_count
    page_info{current_page page_size total_pages}
    items{ productView{ ${PRODUCT_FIELDS} } }
  }
}`

async function query(variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: CATALOG_HEADERS,
    body: JSON.stringify({ query: SEARCH_QUERY, variables }),
  })
  if (!res.ok) {
    throw new Error(`SAQ catalog returned HTTP ${res.status} from ${ENDPOINT}`)
  }
  let json: any
  try {
    json = await res.json()
  } catch {
    throw new Error(`SAQ catalog returned a non-JSON response from ${ENDPOINT}`)
  }
  if (json.errors) {
    throw new Error(
      `SAQ catalog rejected the query: ${json.errors.map((e: any) => e.message).join('; ')}`
    )
  }
  return json
}

/** How many alternatives a typed name is worth offering. */
export const CANDIDATE_LIMIT = 5

const NUMERIC = /^\d+$/

/**
 * Candidates for a typed wine name, best first.
 *
 * This and `resolveSku` were one function taking `size: 1`, which meant a
 * typed name got the blind top hit and no way to see it was wrong. "Pinot
 * Noir" is not a wine — it matches hundreds — and silently resolving it to one
 * arbitrary bottle then feeds that bottle into the taste profile. Returning
 * the list lets the caller show what else it could have been.
 */
export async function searchWines(name: string, limit = CANDIDATE_LIMIT): Promise<Wine[]> {
  const json = await query({
    phrase: name,
    filter: [{ attribute: 'categories', eq: 'products/wine' }],
    size: limit,
    page: 1,
  })
  const wines = parseProducts(json)
  // A numeric phrase is a SKU, not a name: demand identity even here, so a
  // caller that reaches for the wrong function cannot get a substitution.
  return NUMERIC.test(name) ? wines.filter(w => w.sku === name) : wines
}

/**
 * Resolve one SKU to its wine, or null.
 *
 * The endpoint has no SKU lookup, so the SKU goes through the same phrase
 * search — and a SKU that no longer exists still returns whatever the
 * relevance ranker liked best. `12345678` comes back as `12345671`, a
 * Gewurztraminer. Left unchecked, the day SAQ delists a saved wine is the day
 * a stranger's bottle quietly joins the liked list and starts shaping the
 * taste profile. So demand the SKU we asked for.
 */
export async function resolveSku(sku: string): Promise<Wine | null> {
  const json = await query({
    phrase: sku,
    filter: [{ attribute: 'categories', eq: 'products/wine' }],
    size: 1,
    page: 1,
  })
  const found = parseProducts(json)[0]
  if (!found) return null
  return found.sku === sku ? found : null
}

/**
 * Resolve one free-text wine name or SKU to a single best match.
 *
 * Kept for callers that genuinely want one answer. Prefer `searchWines` when a
 * human is going to look at the result, and `resolveSku` when the input is
 * known to be a SKU.
 */
export async function resolveWineName(name: string): Promise<Wine | null> {
  if (NUMERIC.test(name)) return resolveSku(name)
  return (await searchWines(name, 1))[0] ?? null
}

export type WineColour = 'all' | 'red' | 'white' | 'rose' | 'orange'

export interface CatalogFilters {
  colour: WineColour
  priceMin: number | null
  priceMax: number | null
}

export const CATEGORY_BY_COLOUR: Record<WineColour, string> = {
  all: 'products/wine',
  red: 'products/wine/red-wine',
  white: 'products/wine/white-wine',
  rose: 'products/wine/rose',
  orange: 'products/wine/orange-wine',
}

export function buildCatalogFilter(
  branch: string,
  filters: CatalogFilters,
): Array<Record<string, unknown>> {
  const clauses: Array<Record<string, unknown>> = [
    { attribute: 'store_availability_list', eq: branch },
    { attribute: 'categories', eq: CATEGORY_BY_COLOUR[filters.colour] },
  ]
  if (filters.priceMin !== null || filters.priceMax !== null) {
    const range: Record<string, number> = {}
    if (filters.priceMin !== null) range.from = filters.priceMin
    if (filters.priceMax !== null) range.to = filters.priceMax
    clauses.push({ attribute: 'price', range })
  }
  clauses.push({ attribute: 'availability_front', eq: 'In store' })
  return clauses
}

/** How many wines match, without fetching them. One cheap query. */
export async function countMatches(
  branch: string,
  filters: CatalogFilters,
): Promise<number> {
  const json = await query({
    phrase: '',
    filter: buildCatalogFilter(branch, filters),
    size: 1,
    page: 1,
  })
  const n = json?.data?.productSearch?.total_count
  if (typeof n !== 'number') {
    throw new Error(
      'Unexpected catalog response: total_count missing. The Adobe endpoint may have changed.',
    )
  }
  return n
}

/** Every wine the given branch carries. Pages are fetched in parallel. */
export async function fetchBranchCatalog(
  branch: string,
  filters: CatalogFilters,
  onProgress?: (pagesDone: number, pagesTotal: number) => void,
): Promise<Wine[]> {
  const filter = buildCatalogFilter(branch, filters)

  const first = await query({ phrase: '', filter, size: 100, page: 1 })
  const info = first?.data?.productSearch?.page_info
  if (!info) {
    throw new Error(
      'Unexpected catalog response shape: no page_info. The Adobe endpoint may have changed.'
    )
  }

  const totalPages = info.total_pages
  if (typeof totalPages !== 'number' || !Number.isFinite(totalPages) || totalPages < 1) {
    throw new Error(
      `Unexpected catalog response: page_info.total_pages was ${JSON.stringify(totalPages)}, ` +
      `expected a positive number. The Adobe endpoint may have changed.`
    )
  }
  const wines = parseProducts(first)
  let done = 1
  onProgress?.(done, totalPages)

  if (totalPages <= 1) return wines

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      query({ phrase: '', filter, size: 100, page: i + 2 }).then(json => {
        done += 1
        onProgress?.(done, totalPages)
        return parseProducts(json)
      }),
    ),
  )

  return wines.concat(...rest)
}
