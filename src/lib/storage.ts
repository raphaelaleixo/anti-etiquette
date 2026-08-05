/**
 * A thin seam over localStorage.
 *
 * Two jobs. First, the data layer tests in `environment: 'node'` with no DOM,
 * because nothing above it should need a browser to be exercised. Second,
 * reading a preference must never be able to throw: the React app called
 * `localStorage.getItem('branch')` during render, and a browser that denies
 * storage — Safari with cookies blocked, some embedded webviews — turned that
 * into a white screen rather than a degraded one.
 */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: key => { map.delete(key) },
  }
}

const PROBE_KEY = '__anti_etiquette_probe__'

/**
 * Presence of `localStorage` is not enough — Safari in private mode exposes it
 * and throws on write. The only reliable test is to write.
 */
function detect(): { store: StorageLike; persistent: boolean } {
  try {
    const ls = globalThis.localStorage as StorageLike | undefined
    if (!ls) return { store: memoryStorage(), persistent: false }
    ls.setItem(PROBE_KEY, '1')
    ls.removeItem(PROBE_KEY)
    return { store: ls, persistent: true }
  } catch {
    return { store: memoryStorage(), persistent: false }
  }
}

const detected = detect()

/** Real localStorage, or an in-memory stand-in when the browser denies it. */
export const storage: StorageLike = detected.store

/** False means the list will not survive a reload — worth saying out loud in the UI. */
export function isPersistent(): boolean {
  return detected.persistent
}

/**
 * Notify when another tab writes this key.
 *
 * Notification, not merge. Two tabs are last-write-wins by design; this exists
 * so the losing tab at least stops showing a stale list.
 */
export function onExternalChange(key: string, cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {}
  const handler = (e: StorageEvent) => {
    // A null key means the whole store was cleared, which concerns every key.
    if (e.key === null || e.key === key) cb()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
