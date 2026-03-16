import { describe, it, expect } from 'vitest'
import { contactLabel } from '../useConversationList'

interface Participant { address: string; service: string }
interface Conversation {
  guid: string
  chatId: string
  displayName: string | null
  participants: Participant[]
  service: string
  lastMessage: string | null
  lastDate: number | null
  lastFromMe: number
}

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    guid: 'imessage;-;+11234567890',
    chatId: '+11234567890',
    displayName: null,
    participants: [{ address: '+11234567890', service: 'iMessage' }],
    service: 'iMessage',
    lastMessage: null,
    lastDate: null,
    lastFromMe: 0,
    ...overrides,
  }
}

describe('contactLabel', () => {
  it('returns displayName when present', () => {
    expect(contactLabel(makeConv({ displayName: 'Alice' }))).toBe('Alice')
  })

  it('formats US +1 phone number from chatId', () => {
    const result = contactLabel(makeConv({ chatId: '+15551234567' }))
    expect(result).toBe('(555) 123-4567')
  })

  it('formats 11-digit US number starting with 1 from chatId', () => {
    // chatId with + and 11 digits starting with 1
    const result = contactLabel(makeConv({ chatId: '+15551234567' }))
    expect(result).toBe('(555) 123-4567')
  })

  it('returns raw id for international numbers', () => {
    const result = contactLabel(makeConv({ chatId: '+442071234567' }))
    expect(result).toBe('+442071234567')
  })

  it('falls back to first participant address when chatId is empty', () => {
    const result = contactLabel(makeConv({
      chatId: '',
      participants: [{ address: '+19995551234', service: 'iMessage' }],
    }))
    // +19995551234 has + prefix, 12 chars, starts with +1, length is 12 — matches +1 format
    expect(result).toBe('(999) 555-1234')
  })

  it('falls back to guid when chatId and participants are empty', () => {
    const result = contactLabel(makeConv({
      chatId: '',
      participants: [],
      guid: 'chat-abc-123',
    }))
    expect(result).toBe('chat-abc-123')
  })

  it('handles email chatId (returns as-is)', () => {
    const result = contactLabel(makeConv({ chatId: 'alice@example.com' }))
    expect(result).toBe('alice@example.com')
  })

  it('formats number with + prefix and 11 digits starting with 1', () => {
    // +1 prefix with area code 212 — length > 10, starts with +
    const result = contactLabel(makeConv({ chatId: '+12125551234' }))
    expect(result).toBe('(212) 555-1234')
  })
})
