import type { Wine } from './types'

/** Multi-value attributes arrive as an array, a JSON string, or a comma list. */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed.replace(/'/g, '"'))
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      /* fall through to comma split */
    }
  }
  return trimmed.split(',').map(s => s.trim()).filter(Boolean)
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(n) ? n : null
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.length ? String(value[0]) : null
  const s = String(value).trim()
  return s.length ? s : null
}

export function parseProducts(json: unknown): Wine[] {
  const items =
    (json as any)?.data?.productSearch?.items as unknown[] | undefined
  if (!Array.isArray(items)) {
    throw new Error(
      'Unexpected catalog response shape: no data.productSearch.items. ' +
      'The Adobe endpoint may have changed.'
    )
  }

  return items.map((item): Wine => {
    const pv = (item as any).productView
    const attrs: Record<string, unknown> = {}
    for (const a of (pv.attributes ?? []) as Array<{ name: string; value: unknown }>) {
      attrs[a.name] = a.value
    }
    return {
      sku: String(pv.sku),
      name: String(pv.name),
      urlKey: String(pv.urlKey ?? pv.sku),
      price: Number(pv.price?.final?.amount?.value ?? 0),
      inStock: Boolean(pv.inStock),
      country: toStringOrNull(attrs['pays_origine']),
      region: toStringOrNull(attrs['region_origine']),
      appellation: toStringOrNull(attrs['appellation']),
      grapes: toStringArray(attrs['cepage']),
      vintage: toStringOrNull(attrs['millesime_produit']),
      tasteTag: toStringOrNull(attrs['pastille_gout']),
      rating: toNumberOrNull(attrs['reviews_average_rating']),
      ratingCount: toNumberOrNull(attrs['reviews_count_rating']),
      availability: toStringArray(attrs['availability_front']),
    }
  })
}
