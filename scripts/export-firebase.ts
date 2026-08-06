import { writeFileSync } from 'node:fs'

/**
 * One-off migration: the private app's Firebase seed list → a cellar document.
 *
 * Run once, import the output through the app's own Import button, then delete
 * this file. It is a migration, not a feature.
 *
 *   npx tsx scripts/export-firebase.ts <database-url> [out.json]
 *
 * **Deliberately not a Firebase read path in the app.** Adding one would
 * reship the SDK this fork exists to delete — 117 KB gzipped down to ~17 KB is
 * most of the point. This is a plain fetch against the Realtime Database's
 * REST endpoint, in the same idiom as build-stores.ts, and it runs on your
 * machine rather than in anyone's browser.
 *
 * Reading `<db>/seeds.json` works under the existing rules, which grant
 * `seeds` public read.
 */

const SAQ_ENDPOINT = 'https://catalog-service.adobe.io/graphql'

// Same headers the app sends; the endpoint rejects the query without them.
const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Magento-Environment-Id': '97034d5c-8d2e-4d5b-9bcb-4bc5b5b0b0f0',
  'Magento-Store-Code': 'main_website_store',
  'Magento-Store-View-Code': 'en',
  'Magento-Website-Code': 'base',
  'x-api-key': 'search_gql',
}

const PRODUCT_FIELDS = `
  sku name urlKey inStock
  price{ final{ amount{ value } } }
  attributes(roles:"visible_in_pdp"){ name value }
`

const QUERY = `
query($phrase:String!,$size:Int!){
  productSearch(phrase:$phrase,page_size:$size,current_page:1,
    filter:[{attribute:"categories",eq:"products/wine"}]){
    items{ productView{ ${PRODUCT_FIELDS} } }
  }
}`

interface SeedRecord {
  addedAt?: number
  addedBy?: string
  kind?: string
}

interface Wine {
  sku: string
  name: string
  urlKey: string
  price: number
  inStock: boolean
  country: string | null
  region: string | null
  appellation: string | null
  grapes: string[]
  vintage: string | null
  tasteTag: string | null
  rating: number | null
  ratingCount: number | null
  availability: string[]
}

const [dbUrl, outPath = 'cellar-export.json'] = process.argv.slice(2)

if (!dbUrl) {
  console.error('usage: npx tsx scripts/export-firebase.ts <database-url> [out.json]')
  console.error('  e.g. npx tsx scripts/export-firebase.ts https://winelist-8f45c-default-rtdb.firebaseio.com')
  process.exit(1)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function strArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Resolve one SKU, refusing any substitution.
 *
 * The endpoint has no SKU lookup, so a SKU goes through the same phrase search
 * a name does — and a delisted SKU still returns whatever the relevance ranker
 * liked best. `12345678` comes back as `12345671`, a Gewurztraminer. Migrating
 * without this check is the one moment where a stranger's bottle could enter
 * the list under the name of a wine that was actually yours.
 */
async function resolveSku(sku: string): Promise<Wine | null> {
  const res = await fetch(SAQ_ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: QUERY, variables: { phrase: sku, size: 1 } }),
  })
  if (!res.ok) throw new Error(`SAQ catalog returned HTTP ${res.status}`)
  const json = await res.json() as {
    errors?: Array<{ message: string }>
    data?: { productSearch?: { items?: Array<{ productView?: Record<string, any> }> } }
  }
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '))

  const pv = json.data?.productSearch?.items?.[0]?.productView
  if (!pv) return null

  const attrs: Record<string, unknown> = {}
  for (const a of (pv.attributes ?? []) as Array<{ name: string; value: unknown }>) {
    attrs[a.name] = a.value
  }
  const found: Wine = {
    sku: String(pv.sku),
    name: String(pv.name),
    urlKey: String(pv.urlKey ?? pv.sku),
    price: Number(pv.price?.final?.amount?.value ?? 0),
    inStock: Boolean(pv.inStock),
    country: str(attrs['pays_origine']),
    region: str(attrs['region_origine']),
    appellation: str(attrs['appellation']),
    grapes: strArray(attrs['cepage']),
    vintage: str(attrs['millesime_produit']),
    tasteTag: str(attrs['pastille_gout']),
    rating: num(attrs['reviews_average_rating']),
    ratingCount: num(attrs['reviews_count_rating']),
    availability: strArray(attrs['availability_front']),
  }
  return found.sku === sku ? found : null
}

// ------------------------------------------------------------------- read

const seedsUrl = `${dbUrl.replace(/\/$/, '')}/seeds.json`
console.error(`reading ${seedsUrl}`)

const seedsRes = await fetch(seedsUrl)
if (!seedsRes.ok) throw new Error(`Realtime Database returned ${seedsRes.status}`)
const seeds = await seedsRes.json() as Record<string, SeedRecord> | null

if (!seeds || typeof seeds !== 'object') {
  console.error('no seeds found at that path — nothing to migrate')
  process.exit(1)
}

const skus = Object.keys(seeds).filter(sku => /^\d+$/.test(sku))
const junk = Object.keys(seeds).length - skus.length
if (junk > 0) console.error(`skipping ${junk} non-numeric key(s)`)
console.error(`resolving ${skus.length} SKUs…`)

// ---------------------------------------------------------------- resolve

const entries: Array<Record<string, unknown>> = []
const mismatched: string[] = []
const failed: string[] = []
const now = Date.now()

// Four at a time, matching the app's own hydration cap: this endpoint is the
// SAQ's, not ours, and a 60-request burst is rude regardless of whether it
// would be rate-limited.
const CONCURRENCY = 4
let cursor = 0

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, skus.length) }, async () => {
  for (;;) {
    const i = cursor++
    const sku = skus[i]
    if (sku === undefined) return
    const record = seeds[sku] ?? {}
    const kind = record.kind === 'dislike' || record.kind === 'skip' ? record.kind : 'like'
    try {
      const wine = await resolveSku(sku)
      if (wine === null) {
        // Reported, not written. A wine we cannot confirm is a wine we do not
        // migrate under a name that might not be its own.
        mismatched.push(sku)
        continue
      }
      entries[i] = {
        sku,
        kind,
        // addedBy is dropped: write-only dead weight the app never read back.
        addedAt: num(record.addedAt) ?? now,
        wine,
        wineFetchedAt: now,
      }
    } catch (e) {
      failed.push(`${sku}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}))

// ------------------------------------------------------------------ write

const document = {
  format: 'saq-wine-matcher.cellar',
  version: 2,
  exportedAt: new Date(now).toISOString(),
  // Holes from unresolved SKUs are compacted here, and insertion order is
  // preserved because each worker wrote to its own index.
  entries: entries.filter(Boolean),
}

writeFileSync(outPath, JSON.stringify(document, null, 2))

console.error('')
console.error(`wrote ${document.entries.length} of ${skus.length} to ${outPath}`)
if (mismatched.length > 0) {
  console.error(`\n${mismatched.length} SKU(s) could not be confirmed and were NOT written:`)
  for (const sku of mismatched) console.error(`  ${sku}  https://www.saq.com/en/${sku}`)
  console.error('These are delisted, or the catalog returned a different wine. Add them by name.')
}
if (failed.length > 0) {
  console.error(`\n${failed.length} lookup(s) failed outright — rerun to retry:`)
  for (const line of failed) console.error(`  ${line}`)
}
console.error('\nNext: open the app → My wines → "Saved in this browser only" → Import a file.')
console.error('Then delete this script. It is a migration, not a feature.')
