import { describe, it, expect } from 'vitest'
import {
  MODEL_OPTIONS,
  cleanText,
  cleanMessages,
  SLASH_CMDS,
  isSlashCommand,
} from '../types'
import type { ChatMessage } from '../types'

/* ── cleanText ────────────────────────────────────────────────────────── */

describe('cleanText', () => {
  it('strips leading [timestamp] prefix', () => {
    expect(cleanText('[Fri, 03/13/2026, 10:30 AM] Hello'))
      .toBe('Hello')
  })

  it('strips [[reply_to_current]] tag', () => {
    expect(cleanText('[[reply_to_current]] Thanks'))
      .toBe('Thanks')
  })

  it('strips [[reply_to: ...]] tag with arbitrary content', () => {
    expect(cleanText('[[reply_to: msg-abc-123]] Got it'))
      .toBe('Got it')
  })

  it('strips both timestamp and reply_to tags together', () => {
    expect(cleanText('[Mon, 03/10/2026, 9:00 AM] [[reply_to_current]] Sure'))
      .toBe('Sure')
  })

  it('strips multiple [[reply_to: ...]] tags', () => {
    expect(cleanText('[[reply_to: a]] [[reply_to: b]] OK'))
      .toBe('OK')
  })

  it('returns plain text unchanged', () => {
    expect(cleanText('Hello world')).toBe('Hello world')
  })

  it('trims leading and trailing whitespace', () => {
    expect(cleanText('  spaced  ')).toBe('spaced')
  })

  it('handles empty string', () => {
    expect(cleanText('')).toBe('')
  })

  it('handles text that is only a timestamp prefix', () => {
    expect(cleanText('[2026-03-15T12:00:00Z] ')).toBe('')
  })

  it('does not strip brackets that are not a leading prefix', () => {
    expect(cleanText('Hello [world]')).toBe('Hello [world]')
  })

  it('strips [[reply_to_current]] with extra whitespace inside', () => {
    expect(cleanText('[[  reply_to_current  ]] Yes'))
      .toBe('Yes')
  })

  it('strips [[reply_to : id]] with extra whitespace around colon', () => {
    expect(cleanText('[[  reply_to  :  some-id  ]] No'))
      .toBe('No')
  })
})

/* ── cleanMessages ────────────────────────────────────────────────────── */

describe('cleanMessages', () => {
  it('cleans text on all messages', () => {
    const msgs: ChatMessage[] = [
      { id: '1', role: 'user', text: '[Fri, 03/13/2026] Hi', timestamp: '2026-03-13' },
      { id: '2', role: 'assistant', text: '[[reply_to_current]] Hey', timestamp: '2026-03-13' },
    ]
    const result = cleanMessages(msgs)
    expect(result[0].text).toBe('Hi')
    expect(result[1].text).toBe('Hey')
  })

  it('preserves other fields', () => {
    const msgs: ChatMessage[] = [
      { id: 'a', role: 'user', text: 'plain', timestamp: 't1', images: ['img.png'] },
    ]
    const result = cleanMessages(msgs)
    expect(result[0].id).toBe('a')
    expect(result[0].role).toBe('user')
    expect(result[0].timestamp).toBe('t1')
    expect(result[0].images).toEqual(['img.png'])
  })

  it('returns empty array for empty input', () => {
    expect(cleanMessages([])).toEqual([])
  })

  it('does not mutate the original array', () => {
    const msgs: ChatMessage[] = [
      { id: '1', role: 'user', text: '[ts] Original', timestamp: 't' },
    ]
    const result = cleanMessages(msgs)
    expect(msgs[0].text).toBe('[ts] Original')
    expect(result[0].text).toBe('Original')
  })
})

/* ── isSlashCommand ───────────────────────────────────────────────────── */

describe('isSlashCommand', () => {
  it('recognizes /new', () => {
    expect(isSlashCommand('/new')).toBe(true)
  })

  it('recognizes /reset', () => {
    expect(isSlashCommand('/reset')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isSlashCommand('/NEW')).toBe(true)
    expect(isSlashCommand('/Reset')).toBe(true)
  })

  it('rejects unknown slash commands', () => {
    expect(isSlashCommand('/help')).toBe(false)
    expect(isSlashCommand('/quit')).toBe(false)
  })

  it('rejects plain text', () => {
    expect(isSlashCommand('new')).toBe(false)
    expect(isSlashCommand('hello')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSlashCommand('')).toBe(false)
  })
})

/* ── SLASH_CMDS ───────────────────────────────────────────────────────── */

describe('SLASH_CMDS', () => {
  it('contains /new and /reset', () => {
    expect(SLASH_CMDS).toContain('/new')
    expect(SLASH_CMDS).toContain('/reset')
  })

  it('has exactly 2 entries', () => {
    expect(SLASH_CMDS).toHaveLength(2)
  })
})

/* ── MODEL_OPTIONS ────────────────────────────────────────────────────── */

describe('MODEL_OPTIONS', () => {
  it('has exactly 3 model options', () => {
    expect(MODEL_OPTIONS).toHaveLength(3)
  })

  it('each option has value and label', () => {
    for (const option of MODEL_OPTIONS) {
      expect(typeof option.value).toBe('string')
      expect(typeof option.label).toBe('string')
      expect(option.value.length).toBeGreaterThan(0)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('values are claude model identifiers', () => {
    const values = MODEL_OPTIONS.map(o => o.value)
    expect(values).toContain('claude-sonnet-4-6')
    expect(values).toContain('claude-opus-4-6')
    expect(values).toContain('claude-haiku-4-5')
  })

  it('labels are human-readable short names', () => {
    const labels = MODEL_OPTIONS.map(o => o.label)
    expect(labels).toContain('Sonnet 4.6')
    expect(labels).toContain('Opus 4.6')
    expect(labels).toContain('Haiku 4.5')
  })
})
