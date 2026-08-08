import { storage } from './storage'

/**
 * Where the prompt gets pasted.
 *
 * The app runs no model of its own — it writes the text and hands it over —
 * so the only thing to decide is which chat the visitor already uses. That is
 * a preference, not a setting: it is asked once by being used, remembered, and
 * never mentioned again.
 *
 * These are plain links. Choosing one sends nothing anywhere; it navigates,
 * which is the visitor's own action and the reason the privacy claim survives
 * this feature at all.
 */

export interface ChatDestination {
  readonly id: string
  /** A product name, so it is the same in every language. */
  readonly name: string
  readonly url: string
}

/**
 * ChatGPT first because it is where most people already are, and the default
 * should be the one that needs the least explaining.
 */
export const CHAT_DESTINATIONS: readonly ChatDestination[] = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'mistral', name: 'Le Chat', url: 'https://chat.mistral.ai/chat' },
]

const KEY = 'chat'

/**
 * The chosen destination, or the default.
 *
 * Falls back rather than trusting the stored value: it is a string from disk
 * that a previous version — or another tab, or a hand-edited devtools session
 * — could have left in any state, and an unknown id must not produce an
 * undefined link.
 */
export function getDestination(): ChatDestination {
  let id: string | null = null
  try {
    id = storage.getItem(KEY)
  } catch {
    // Storage denied. The default is a perfectly good answer.
  }
  return CHAT_DESTINATIONS.find(d => d.id === id) ?? CHAT_DESTINATIONS[0]!
}

export function setDestination(id: string): void {
  if (!CHAT_DESTINATIONS.some(d => d.id === id)) return
  try {
    storage.setItem(KEY, id)
  } catch {
    // A lost preference is not worth interrupting anyone for; the link they
    // just pressed still opens, it simply will not be remembered.
  }
}
