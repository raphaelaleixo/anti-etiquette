import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CHAT_DESTINATIONS, getDestination, setDestination } from '../src/lib/chat'
import { storage } from '../src/lib/storage'

beforeEach(() => { storage.removeItem('chat') })

/**
 * Which chat the prompt gets pasted into. A preference, not a setting: asked
 * once by being used, remembered, and never mentioned again.
 */
describe('the chat destination', () => {
  it('defaults to the first, which is where most people already are', () => {
    expect(getDestination()).toBe(CHAT_DESTINATIONS[0])
    expect(getDestination().name).toBe('ChatGPT')
  })

  it('remembers a choice', () => {
    setDestination('claude')
    expect(getDestination().name).toBe('Claude')
  })

  it('falls back rather than trusting what is on disk', () => {
    // The value is a string from storage that an older version, another tab or
    // a devtools session could have left in any state. An unknown id must not
    // produce a link with an undefined href.
    storage.setItem('chat', 'some-service-that-shut-down')
    expect(getDestination()).toBe(CHAT_DESTINATIONS[0])
    expect(getDestination().url).toMatch(/^https:\/\//)
  })

  it('refuses to store an id it does not know', () => {
    setDestination('claude')
    setDestination('nonsense')
    expect(getDestination().name).toBe('Claude')
  })

  it('survives storage being denied', () => {
    // Private browsing. The link still opens; it just is not remembered.
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => setDestination('gemini')).not.toThrow()
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(getDestination()).toBe(CHAT_DESTINATIONS[0])
    vi.restoreAllMocks()
  })

  it('offers real, distinct destinations', () => {
    expect(CHAT_DESTINATIONS.length).toBeGreaterThan(1)
    expect(new Set(CHAT_DESTINATIONS.map(d => d.id)).size).toBe(CHAT_DESTINATIONS.length)
    for (const d of CHAT_DESTINATIONS) expect(d.url).toMatch(/^https:\/\/\S+$/)
  })
})
