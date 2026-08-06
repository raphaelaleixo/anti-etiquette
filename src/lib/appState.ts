import { storage } from './storage'
import { getSnapshot as getCellarSnapshot } from './cellar'
import { DEFAULT_FILTERS, filtersEqual } from './filters'
import type { CatalogFilters } from './catalog'
import type { ScoredWine, TasteProfile, Wine } from './types'

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
  /** Saved wines that happen to be stocked at this branch. */
  favourites: readonly Wine[]
  /** The branch's whole filtered catalog, kept for the prompt's "N available". */
  catalog: readonly Wine[]
  profile: TasteProfile | null
  /** True once a search has completed, which is what swaps the footer. */
  searched: boolean
  /** How many ranked wines go into the prompt. 0 means all of them. */
  promptCount: number
  /** Catalog paging, for the header progress bar. */
  progress: { done: number; total: number } | null
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

/**
 * Where a visitor lands.
 *
 * The React app always opened on *Find a wine* (`App.tsx:52`), which meant a
 * first visit was a disabled button with no explanation and no reason to guess
 * that the answer was behind the other tab. Land where there is something to
 * do: the wines list when it is empty, the search when it is not.
 */
export function initialMode(): Mode {
  return getCellarSnapshot().entries.length > 0 ? 'find' : 'wines'
}

let state: AppState = {
  mode: initialMode(),
  branch: readBranch(),
  filters: readFilters(),
  results: [],
  favourites: [],
  catalog: [],
  profile: null,
  searched: false,
  promptCount: 20,
  progress: null,
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

/** Changing the branch invalidates results — they were for the old one. */
export function setBranch(branch: string): void {
  persist(BRANCH_KEY, branch)
  set({ branch, ...blankResults() })
}

/**
 * Only discards results when the filters would actually produce a different
 * search, so opening the sheet to check what is set and applying it unchanged
 * does not throw away a search.
 */
export function setFilters(filters: CatalogFilters): void {
  persist(FILTERS_KEY, JSON.stringify(filters))
  set(filtersEqual(filters, state.filters) ? { filters } : { filters, ...blankResults() })
}

export function setResults(payload: {
  results: readonly ScoredWine[]
  favourites: readonly Wine[]
  catalog: readonly Wine[]
  profile: TasteProfile
}): void {
  set({ ...payload, searched: true, status: '', error: null, progress: null })
}

export function setStatus(status: string, progress: AppState['progress'] = null): void {
  set({ status, progress })
}

export function setError(error: string | null): void {
  set({ error, status: '', progress: null })
}

export function setPromptCount(promptCount: number): void {
  set({ promptCount })
}

function blankResults() {
  return {
    results: [] as readonly ScoredWine[],
    favourites: [] as readonly Wine[],
    catalog: [] as readonly Wine[],
    profile: null,
    searched: false,
    status: '',
    error: null,
    progress: null,
  }
}

export function clearResults(): void {
  set(blankResults())
}
