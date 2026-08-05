import { storage } from './storage'
import stores from '../data/montreal-stores.json'

/**
 * Branch list and the small preferences that hang off it.
 *
 * These lived in `BranchSheet.tsx` and read `localStorage` directly, so a
 * browser that denied storage threw during render. Everything here goes
 * through the storage seam, which cannot throw.
 */

export interface Branch { id: string; name: string; address: string }

const RECENT_KEY = 'recentBranches'
const COUNTS_KEY = 'branchCounts'
const MAX_RECENT = 3

/**
 * Trade-only depots. They appear in the store feed and are selectable in the
 * React app, but they serve restaurateurs — a member of the public who picks
 * one gets a branch they cannot buy from.
 */
const TRADE_ONLY = new Set(['23385', '23390'])

/** Montréal only, and the branch sheet says so. */
export const BRANCHES: Branch[] = (stores as Branch[]).filter(b => !TRADE_ONLY.has(b.id))

/**
 * Accent-insensitive fold: NFD-normalise and strip combining marks, so "Cote"
 * matches "Côte-des-Neiges" and "Marche" matches "Marché Central".
 */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function branchName(id: string): string {
  return BRANCHES.find(b => b.id === id)?.name ?? id
}

function readJson<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return valid(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // A lost preference is not worth interrupting the user for.
  }
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string')

const isCountMap = (v: unknown): v is Record<string, number> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function loadRecentBranches(): string[] {
  return readJson(RECENT_KEY, [], isStringArray)
}

/** Records a branch as most-recently-used. Call whenever a search runs. */
export function rememberBranch(id: string): void {
  writeJson(RECENT_KEY, [id, ...loadRecentBranches().filter(b => b !== id)].slice(0, MAX_RECENT))
}

export function loadBranchCounts(): Record<string, number> {
  return readJson(COUNTS_KEY, {}, isCountMap)
}

/**
 * Caches a branch's last-known result count, so the picker can show it without
 * ever querying all 66 branches up front.
 */
export function rememberBranchCount(id: string, count: number): void {
  writeJson(COUNTS_KEY, { ...loadBranchCounts(), [id]: count })
}
