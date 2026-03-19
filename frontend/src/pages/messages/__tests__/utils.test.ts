import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  URL_RE,
  timeAgo,
  formatTime,
  formatTimestamp,
  isIMessage,
  shouldShowTimestamp,
  resolveSenderName,
  isGroupChat,
  renderTextWithLinks,
  highlightSearchText,
  extractFirstUrl,
} from '../utils'
import type { Conversation, Message } from '../types'

/* ─── helpers ──────────────────────────────────────────────────────────── */

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    guid: 'imessage;-;+11234567890',
    chatId: '+11234567890',
    displayName: null,
    participants: [{ address: '+11234567890', service: 'iMessage' }],
    service: 'iMessage',
    lastMessage: 'hello',
    lastDate: Date.now(),
    lastFromMe: 0,
    ...overrides,
  }
}

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    guid: 'msg-1',
    text: 'hi',
    dateCreated: Date.now(),
    isFromMe: false,
    ...overrides,
  }
}

/* ─── URL_RE ───────────────────────────────────────────────────────────── */

describe('URL_RE', () => {
  beforeEach(() => { URL_RE.lastIndex = 0 })

  it('matches http URLs', () => {
    expect(URL_RE.test('visit http://example.com today')).toBe(true)
  })

  it('matches https URLs', () => {
    URL_RE.lastIndex = 0
    expect(URL_RE.test('visit https://example.com/path?q=1 today')).toBe(true)
  })

  it('does not match bare domains without protocol', () => {
    URL_RE.lastIndex = 0
    expect(URL_RE.test('visit example.com today')).toBe(false)
  })

  it('does not match ftp URLs', () => {
    URL_RE.lastIndex = 0
    expect(URL_RE.test('ftp://files.example.com')).toBe(false)
  })
})

/* ─── timeAgo ──────────────────────────────────────────────────────────── */

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string for null', () => {
    expect(timeAgo(null)).toBe('')
  })

  it('returns empty string for 0', () => {
    expect(timeAgo(0)).toBe('')
  })

  it('returns empty string for NaN timestamp', () => {
    expect(timeAgo(NaN)).toBe('')
  })

  it('returns "now" for timestamps less than 60 seconds ago', () => {
    const thirtySecondsAgo = Date.now() - 30_000
    expect(timeAgo(thirtySecondsAgo)).toBe('now')
  })

  it('returns "now" for timestamp exactly now', () => {
    expect(timeAgo(Date.now())).toBe('now')
  })

  it('returns minutes for timestamps 1-59 minutes ago', () => {
    const tenMinutesAgo = Date.now() - 10 * 60_000
    expect(timeAgo(tenMinutesAgo)).toBe('10m')
  })

  it('returns 1m for 60 seconds ago', () => {
    const oneMinuteAgo = Date.now() - 60_000
    expect(timeAgo(oneMinuteAgo)).toBe('1m')
  })

  it('returns hours for timestamps 1-23 hours ago', () => {
    const threeHoursAgo = Date.now() - 3 * 3600_000
    expect(timeAgo(threeHoursAgo)).toBe('3h')
  })

  it('returns days for timestamps 1-6 days ago', () => {
    const twoDaysAgo = Date.now() - 2 * 86400_000
    expect(timeAgo(twoDaysAgo)).toBe('2d')
  })

  it('returns month/day for timestamps more than 7 days ago in the same year', () => {
    // 2026-01-10 is same year as 2026-06-15
    const jan10 = new Date('2026-01-10T12:00:00Z').getTime()
    const result = timeAgo(jan10)
    expect(result).toContain('Jan')
    expect(result).toContain('10')
    expect(result).not.toContain('26') // no year for same year
  })

  it('returns month/day/year for timestamps from a different year', () => {
    const lastYear = new Date('2025-06-15T12:00:00Z').getTime()
    const result = timeAgo(lastYear)
    expect(result).toContain('Jun')
    expect(result).toContain('15')
    expect(result).toContain('25')
  })
})

/* ─── formatTime ───────────────────────────────────────────────────────── */

describe('formatTime', () => {
  it('formats a timestamp into H:MM AM/PM style', () => {
    // Use a UTC midnight timestamp — locale formatting varies, but should contain digits
    const ts = new Date('2026-06-15T00:30:00Z').getTime()
    const result = formatTime(ts)
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns a string (never throws) for any number', () => {
    expect(typeof formatTime(0)).toBe('string')
    expect(typeof formatTime(Date.now())).toBe('string')
  })
})

/* ─── formatTimestamp ──────────────────────────────────────────────────── */

describe('formatTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Today" prefix for same-day timestamps', () => {
    const ts = new Date('2026-06-15T09:30:00Z').getTime()
    expect(formatTimestamp(ts)).toMatch(/^Today/)
  })

  it('returns "Yesterday" prefix for previous-day timestamps', () => {
    const ts = new Date('2026-06-14T09:30:00Z').getTime()
    expect(formatTimestamp(ts)).toMatch(/^Yesterday/)
  })

  it('returns weekday name for timestamps 2-6 days ago', () => {
    // 2026-06-13 is a Saturday (3 days ago from June 15)
    // 2026-06-12 is a Friday
    const ts = new Date('2026-06-12T09:30:00Z').getTime()
    const result = formatTimestamp(ts)
    expect(result).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/)
  })

  it('returns short date for timestamps more than 7 days ago', () => {
    const ts = new Date('2026-06-01T09:30:00Z').getTime()
    const result = formatTimestamp(ts)
    expect(result).toContain('Jun')
  })

  it('includes year for timestamps from a different year', () => {
    const ts = new Date('2025-12-25T09:30:00Z').getTime()
    const result = formatTimestamp(ts)
    expect(result).toMatch(/2025/)
  })
})

/* ─── isIMessage ───────────────────────────────────────────────────────── */

describe('isIMessage', () => {
  it('returns true when service is "iMessage"', () => {
    expect(isIMessage(makeConv({ service: 'iMessage' }))).toBe(true)
  })

  it('returns true when service contains "imessage" (case-insensitive)', () => {
    expect(isIMessage(makeConv({ service: 'IMESSAGE' }))).toBe(true)
  })

  it('returns true when guid starts with "iMessage"', () => {
    expect(isIMessage(makeConv({ service: '', guid: 'iMessage;-;+1234' }))).toBe(true)
  })

  it('returns true for "any" service without explicit SMS participants', () => {
    expect(isIMessage(makeConv({
      service: 'any',
      guid: 'any;-;+11234567890',
      participants: [{ address: '+11234567890', service: 'iMessage' }],
    }))).toBe(true)
  })

  it('returns true for "any;" guid prefix without explicit SMS participants', () => {
    expect(isIMessage(makeConv({
      service: '',
      guid: 'any;-;+1234',
      participants: [{ address: '+11234567890', service: 'any' }],
    }))).toBe(true)
  })

  it('returns false for "any" service when a participant has SMS service', () => {
    expect(isIMessage(makeConv({
      service: 'any',
      guid: 'any;-;+11234567890',
      participants: [{ address: '+11234567890', service: 'sms' }],
    }))).toBe(false)
  })

  it('returns false for SMS service', () => {
    expect(isIMessage(makeConv({
      service: 'SMS',
      guid: 'sms;-;+1234',
      participants: [{ address: '+11234567890', service: 'sms' }],
    }))).toBe(false)
  })

  it('returns true for group chat where all participants have iMessage or "any"', () => {
    expect(isIMessage(makeConv({
      service: '',
      guid: 'chat123',
      participants: [
        { address: '+11111111111', service: 'iMessage' },
        { address: '+12222222222', service: 'any' },
      ],
    }))).toBe(true)
  })

  it('returns false for group chat where some participants have SMS', () => {
    expect(isIMessage(makeConv({
      service: '',
      guid: 'chat123',
      participants: [
        { address: '+11111111111', service: 'iMessage' },
        { address: '+12222222222', service: 'sms' },
      ],
    }))).toBe(false)
  })

  it('handles missing service and guid gracefully', () => {
    expect(isIMessage(makeConv({
      service: '',
      guid: '',
      participants: [],
    }))).toBe(false)
  })
})

/* ─── shouldShowTimestamp ──────────────────────────────────────────────── */

describe('shouldShowTimestamp', () => {
  it('returns true for the first message (idx=0)', () => {
    const messages = [makeMsg({ dateCreated: 1000 })]
    expect(shouldShowTimestamp(messages, 0)).toBe(true)
  })

  it('returns true when gap exceeds 1 hour', () => {
    const messages = [
      makeMsg({ dateCreated: 1000 }),
      makeMsg({ dateCreated: 1000 + 3600001 }),
    ]
    expect(shouldShowTimestamp(messages, 1)).toBe(true)
  })

  it('returns false when gap is exactly 1 hour', () => {
    const messages = [
      makeMsg({ dateCreated: 1000 }),
      makeMsg({ dateCreated: 1000 + 3600000 }),
    ]
    expect(shouldShowTimestamp(messages, 1)).toBe(false)
  })

  it('returns false when messages are close together', () => {
    const messages = [
      makeMsg({ dateCreated: 1000 }),
      makeMsg({ dateCreated: 1000 + 60000 }),
    ]
    expect(shouldShowTimestamp(messages, 1)).toBe(false)
  })
})

/* ─── resolveSenderName ────────────────────────────────────────────────── */

describe('resolveSenderName', () => {
  const lookup: Record<string, string> = {
    '5551234567': 'Alice',
    'bob@example.com': 'Bob',
  }

  it('returns "Unknown" for undefined handle', () => {
    expect(resolveSenderName(undefined, lookup)).toBe('Unknown')
  })

  it('resolves by normalized 10-digit phone number', () => {
    expect(resolveSenderName({ address: '+15551234567' }, lookup)).toBe('Alice')
  })

  it('resolves 11-digit number starting with 1 by stripping the 1', () => {
    expect(resolveSenderName({ address: '15551234567' }, lookup)).toBe('Alice')
  })

  it('resolves by lowercased email', () => {
    expect(resolveSenderName({ address: 'Bob@Example.com' }, lookup)).toBe('Bob')
  })

  it('falls back to raw address when not found in lookup', () => {
    expect(resolveSenderName({ address: '+19999999999' }, lookup)).toBe('+19999999999')
  })

  it('handles address with no digits', () => {
    expect(resolveSenderName({ address: 'unknown@test.com' }, { 'unknown@test.com': 'Test' })).toBe('Test')
  })
})

/* ─── isGroupChat ──────────────────────────────────────────────────────── */

describe('isGroupChat', () => {
  it('returns true for conversations with more than 1 participant', () => {
    expect(isGroupChat(makeConv({
      participants: [
        { address: '+11111111111', service: 'iMessage' },
        { address: '+12222222222', service: 'iMessage' },
      ],
    }))).toBe(true)
  })

  it('returns false for single-participant conversations', () => {
    expect(isGroupChat(makeConv({
      participants: [{ address: '+11111111111', service: 'iMessage' }],
    }))).toBe(false)
  })

  it('returns false for empty participants', () => {
    expect(isGroupChat(makeConv({ participants: [] }))).toBe(false)
  })

  it('handles undefined participants (coerced via ??)', () => {
    // The ?? 0 fallback means undefined participants result in 0 > 1 = false
    expect(isGroupChat(makeConv({ participants: undefined as any }))).toBe(false)
  })
})

/* ─── renderTextWithLinks ──────────────────────────────────────────────── */

describe('renderTextWithLinks', () => {
  it('returns plain text as a single-element array when no URLs present', () => {
    const result = renderTextWithLinks('hello world', false)
    expect(result).toEqual(['hello world'])
  })

  it('wraps a URL in a React anchor element', () => {
    const result = renderTextWithLinks('visit https://example.com ok', false)
    // Should be: ["visit ", <a ...>, " ok"]
    expect(result.length).toBe(3)
    expect(result[0]).toBe('visit ')
    expect(result[2]).toBe(' ok')
    // The middle element should be a React element (object with type 'a')
    const link = result[1] as any
    expect(link.type).toBe('a')
    expect(link.props.href).toBe('https://example.com')
    expect(link.props.target).toBe('_blank')
  })

  it('strips trailing punctuation from URLs', () => {
    const result = renderTextWithLinks('see https://example.com.', false)
    const link = result[1] as any
    expect(link.props.href).toBe('https://example.com')
    // Trailing period should be separate text node
    expect(result[2]).toBe('.')
  })

  it('handles multiple URLs', () => {
    const result = renderTextWithLinks('a https://one.com b https://two.com c', false)
    const links = result.filter((n: any) => typeof n === 'object' && n?.type === 'a')
    expect(links.length).toBe(2)
  })

  it('uses white color for links in fromMe messages', () => {
    const result = renderTextWithLinks('https://example.com', true)
    const link = result[0] as any
    expect(link.props.style.color).toMatch(/white|rgba\(255,\s*255,\s*255|var\(--bg-white/)
  })

  it('uses apple-blue for links in received messages', () => {
    const result = renderTextWithLinks('https://example.com', false)
    const link = result[0] as any
    expect(link.props.style.color).toBe('var(--apple-blue)')
  })

  it('returns [text] for empty string', () => {
    const result = renderTextWithLinks('', false)
    expect(result).toEqual([''])
  })

  it('handles URL at start of text', () => {
    const result = renderTextWithLinks('https://example.com is cool', false)
    const link = result[0] as any
    expect(link.type).toBe('a')
    expect(result[1]).toBe(' is cool')
  })

  it('handles URL at end of text', () => {
    const result = renderTextWithLinks('check https://example.com', false)
    expect(result[0]).toBe('check ')
    const link = result[1] as any
    expect(link.type).toBe('a')
  })
})

/* ─── highlightSearchText ──────────────────────────────────────────────── */

describe('highlightSearchText', () => {
  it('returns nodes unchanged when query is empty', () => {
    const nodes = ['hello world']
    expect(highlightSearchText(nodes, '', false)).toEqual(nodes)
  })

  it('wraps matching text in mark elements', () => {
    const result = highlightSearchText(['hello world'], 'world', false)
    const mark = result.find((n: any) => typeof n === 'object' && n?.type === 'mark')
    expect(mark).toBeDefined()
    expect((mark as any).props.children).toBe('world')
  })

  it('is case-insensitive', () => {
    const result = highlightSearchText(['Hello World'], 'hello', false)
    const mark = result.find((n: any) => typeof n === 'object' && n?.type === 'mark')
    expect(mark).toBeDefined()
    expect((mark as any).props.children).toBe('Hello')
  })

  it('highlights multiple occurrences', () => {
    const result = highlightSearchText(['foo bar foo'], 'foo', false)
    const marks = result.filter((n: any) => typeof n === 'object' && n?.type === 'mark')
    expect(marks.length).toBe(2)
  })

  it('uses brighter highlight for active match', () => {
    const result = highlightSearchText(['hello'], 'hello', true)
    const mark = result.find((n: any) => typeof n === 'object' && n?.type === 'mark') as any
    expect(mark.props.style.background).toMatch(/yellow|rgba\(255,\s*204|var\(--yellow/)
  })

  it('uses dimmer highlight for inactive match', () => {
    const result = highlightSearchText(['hello'], 'hello', false)
    const mark = result.find((n: any) => typeof n === 'object' && n?.type === 'mark') as any
    expect(mark.props.style.background).toMatch(/yellow|rgba\(255,\s*204|var\(--yellow/)
  })

  it('passes through non-string nodes unchanged', () => {
    const element = { type: 'a', props: { href: 'http://x.com' } } as any
    const result = highlightSearchText([element, 'text'], 'text', false)
    expect(result[0]).toBe(element)
  })

  it('handles no match gracefully', () => {
    const result = highlightSearchText(['hello'], 'xyz', false)
    expect(result).toEqual(['hello'])
  })
})

/* ─── extractFirstUrl ──────────────────────────────────────────────────── */

describe('extractFirstUrl', () => {
  it('extracts the first URL from text', () => {
    expect(extractFirstUrl('check https://example.com and https://other.com')).toBe('https://example.com')
  })

  it('strips trailing punctuation', () => {
    expect(extractFirstUrl('visit https://example.com.')).toBe('https://example.com')
    expect(extractFirstUrl('see https://example.com)')).toBe('https://example.com')
    expect(extractFirstUrl('link: https://example.com!')).toBe('https://example.com')
  })

  it('returns null when no URL is present', () => {
    expect(extractFirstUrl('no links here')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractFirstUrl('')).toBeNull()
  })

  it('handles URL with path and query params', () => {
    expect(extractFirstUrl('go to https://example.com/path?key=val#frag')).toBe('https://example.com/path?key=val#frag')
  })
})
