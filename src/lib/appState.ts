import { storage } from './storage'
import { DEFAULT_FILTERS } from './filters'
import type { CatalogFilters } from './catalog'
import type { ScoredWine } from './types'

/**
 * Everything on screen that is not the wine list.
 *
 * Same publish shape as `cellar.ts` — identity-stable snapshot, subscribe,
 * mutators that notify from inside themselves — so a `StoreElement` can take
 * either as a source without caring which.
 *
 * `branch` and `filters` persist; `mode`, `results`, `status` and `error` do
 * not. Results are cheap to recompute and stale ones would be worse than none.
 */

export type Mode = 'find' | 'wines'

export interface AppState {
  mode: Mode
  branch: string
  filters: CatalogFilters
  results: readonly ScoredWine[]
  /** Non-empty while a search is running; drives the disabled state. */
  status: string
  error: string | null
}

const BRANCH_KEY = 'branch'
const FILTERS_KEY = 'filters'

function readBranch(): string {
  try {
    return storage.getItem(BRANCH_KEY) ?? ''
  } catch {
    return ''
  }
}

function readFilters(): CatalogFilters {
  try {
    const raw = storage.getItem(FILTERS_KEY)
    if (!raw) return DEFAULT_FILTERS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_FILTERS
    // Merge over the defaults so a filter added later cannot arrive undefined.
    return { ...DEFAULT_FILTERS, ...(parsed as Partial<CatalogFilters>) }
  } catch {
    return DEFAULT_FILTERS
  }
}

function persist(key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    // A lost preference is not worth interrupting the user for.
  }
}

let state: AppState = {
  mode: 'wines',
  branch: readBranch(),
  filters: readFilters(),
  results: [],
  status: '',
  error: null,
}

const listeners = new Set<() => void>()

export function getSnapshot(): AppState {
  return state
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The only way state changes. Identity changes exactly once per mutation. */
function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  for (const fn of [...listeners]) fn()
}

export function setMode(mode: Mode): void {
  set({ mode })
}

export function setBranch(branch: string): void {
  persist(BRANCH_KEY, branch)
  set({ branch })
}

export function setFilters(filters: CatalogFilters): void {
  persist(FILTERS_KEY, JSON.stringify(filters))
  set({ filters })
}

export function setResults(results: readonly ScoredWine[]): void {
  set({ results, status: '', error: null })
}

export function setStatus(status: string): void {
  set({ status })
}

export function setError(error: string | null): void {
  set({ error, status: '' })
}

export function clearResults(): void {
  set({ results: [], status: '', error: null })
}
