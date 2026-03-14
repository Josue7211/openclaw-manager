import { describe, it, expect } from 'vitest'
import { cleanPayloadText } from '../shared'

describe('cleanPayloadText', () => {
  it('strips .pluginPayloadAttachment tokens', () => {
    // The regex matches \S*\.pluginPayload\w* plus an optional trailing newline,
    // so the token and its newline are both removed, leaving "Hello World".
    const input = 'Hello com.apple.messages.pluginPayloadAttachment\nWorld'
    expect(cleanPayloadText(input)).toBe('Hello World')
  })

  it('strips multiple plugin payload variants', () => {
    const input = 'A foo.pluginPayloadAttachment bar.pluginPayloadData B'
    const result = cleanPayloadText(input)
    expect(result).not.toContain('pluginPayload')
    expect(result).toContain('A')
    expect(result).toContain('B')
  })

  it('strips Unicode replacement characters', () => {
    const input = 'Hello\uFFFCWorld\uFFFD'
    expect(cleanPayloadText(input)).toBe('HelloWorld')
  })

  it('strips zero-width spaces and line/paragraph separators', () => {
    const input = 'A\u200BB\u2028C\u2029D'
    expect(cleanPayloadText(input)).toBe('ABCD')
  })

  it('collapses three or more newlines into two', () => {
    const input = 'Hello\n\n\n\nWorld'
    expect(cleanPayloadText(input)).toBe('Hello\n\nWorld')
  })

  it('normalizes CRLF to LF', () => {
    const input = 'Hello\r\nWorld'
    expect(cleanPayloadText(input)).toBe('Hello\nWorld')
  })

  it('returns empty string for null', () => {
    expect(cleanPayloadText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(cleanPayloadText(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(cleanPayloadText('')).toBe('')
  })

  it('passes normal text through unchanged', () => {
    expect(cleanPayloadText('Hello, World!')).toBe('Hello, World!')
  })

  it('trims leading and trailing whitespace', () => {
    expect(cleanPayloadText('  Hello  ')).toBe('Hello')
  })
})
