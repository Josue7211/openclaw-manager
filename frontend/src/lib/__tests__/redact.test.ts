import { describe, it, expect } from 'vitest'
import { redactSecrets } from '../redact'

describe('redactSecrets', () => {
  it('preserves normal text without secrets', () => {
    const text = 'Hello, this is a normal log message with no secrets.'
    expect(redactSecrets(text)).toBe(text)
  })

  it('redacts OpenAI-style API keys (sk-...)', () => {
    const text = 'Using key sk-abc123def456ghi789jkl012mno345'
    const result = redactSecrets(text)
    expect(result).not.toContain('sk-abc123def456ghi789jkl012mno345')
    // Should keep first 4 and last 4 chars visible
    expect(result).toContain('***')
  })

  it('redacts JWT tokens (eyJ...)', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'
    const text = `Authorization: Bearer ${token}`
    const result = redactSecrets(text)
    expect(result).not.toContain(token)
    expect(result).toContain('***')
  })

  it('redacts long hex strings that look like API keys', () => {
    const hex = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'  // 32-char hex
    const text = `Config key: ${hex}`
    const result = redactSecrets(text)
    expect(result).not.toContain(hex)
    expect(result).toContain('***')
  })

  it('redacts key=value patterns with long values', () => {
    const text = 'api_key="sk_live_abcdefghijklmnopqrstuvwxyz1234"'
    const result = redactSecrets(text)
    expect(result).toContain('***')
    expect(result).not.toContain('sk_live_abcdefghijklmnopqrstuvwxyz1234')
  })

  it('redacts token: value patterns', () => {
    const text = 'token: my_super_secret_token_value_12345678'
    const result = redactSecrets(text)
    expect(result).toContain('***')
  })

  it('handles empty string', () => {
    expect(redactSecrets('')).toBe('')
  })

  it('preserves short strings that are not secrets', () => {
    const text = 'status=ok count=42'
    expect(redactSecrets(text)).toBe(text)
  })

  it('can be called multiple times without regex state issues', () => {
    const text = 'sk-abc123def456ghi789jkl012mno345'
    const result1 = redactSecrets(text)
    const result2 = redactSecrets(text)
    // Both calls should produce the same result (no lastIndex bug)
    expect(result1).toBe(result2)
    expect(result1).toContain('***')
  })
})
