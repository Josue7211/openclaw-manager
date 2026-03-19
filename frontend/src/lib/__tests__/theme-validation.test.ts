import { describe, it, expect } from 'vitest'
import {
  validateThemeImport,
  exportTheme,
  encodeShareCode,
  decodeShareCode,
  parseImportInput,
} from '../theme-validation'
import type { ThemeDefinition, UserThemeOverrides } from '../theme-definitions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validTheme(overrides: Partial<ThemeDefinition> = {}): ThemeDefinition {
  return {
    id: 'test-theme',
    name: 'Test Theme',
    category: 'dark',
    builtIn: false,
    colors: {
      'bg-base': '#0a0a0c',
      'text-primary': '#e4e4ec',
      'accent': '#a78bfa',
    },
    ...overrides,
  }
}

function validOverrides(overrides: Partial<UserThemeOverrides> = {}): UserThemeOverrides {
  return {
    themeId: 'test-theme',
    accent: '#ff0000',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// validateThemeImport
// ---------------------------------------------------------------------------

describe('validateThemeImport', () => {
  it('rejects null input', () => {
    const result = validateThemeImport(null)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid format')
  })

  it('rejects undefined input', () => {
    const result = validateThemeImport(undefined)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid format')
  })

  it('rejects non-object input', () => {
    const result = validateThemeImport('not an object')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid format')
  })

  it('rejects object missing id', () => {
    const result = validateThemeImport({ name: 'Test', colors: {} })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Missing required fields')
  })

  it('rejects object missing name', () => {
    const result = validateThemeImport({ id: 'test', colors: {} })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Missing required fields')
  })

  it('rejects object missing colors', () => {
    const result = validateThemeImport({ id: 'test', name: 'Test' })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Missing required fields')
  })

  it('rejects color value containing url(', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': 'url(http://evil.com)' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('unsupported')
  })

  it('rejects color value containing @import', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '@import "http://evil.com"' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('unsupported')
  })

  it('rejects color value containing expression(', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': 'expression(alert(1))' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('unsupported')
  })

  it('rejects color value containing javascript:', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': 'javascript:alert(1)' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('unsupported')
  })

  it('rejects color value containing <script', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '<script>alert(1)</script>' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('unsupported')
  })

  it('rejects property name not matching whitelist', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'z-index-evil': '9999' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unsupported property')
  })

  it('rejects value longer than 200 characters', () => {
    const longValue = '#' + 'a'.repeat(200)
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': longValue },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('too long')
  })

  it('rejects non-string color value', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': 42 },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid value')
  })

  it('accepts valid theme with bg-base, text-primary, accent', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: {
        'bg-base': '#0a0a0c',
        'text-primary': '#e4e4ec',
        'accent': '#a78bfa',
      },
    })
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('accepts valid theme with all standard property patterns', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: {
        'bg-base': '#000',
        'text-primary': '#fff',
        'border': '#333',
        'accent': '#a78bfa',
        'accent-dim': '#6d28d9',
        'glow-top-rgb': '139, 92, 246',
        'glass-bg': 'rgba(0,0,0,0.5)',
        'hover-bg': 'rgba(0,0,0,0.05)',
        'active-bg': 'rgba(0,0,0,0.06)',
        'green': '#34d399',
        'red': '#f87171',
        'red-500': '#ef4444',
        'warning': '#fbbf24',
        'amber': '#f59e0b',
        'yellow': '#eab308',
        'gold': '#d4a017',
        'blue': '#60a5fa',
        'purple': '#a78bfa',
        'cyan': '#22d3ee',
        'pink': '#f472b6',
        'orange': '#fb923c',
        'shadow-low': '0 1px 2px rgba(0,0,0,0.3)',
        'overlay': 'rgba(0,0,0,0.5)',
        'font-body': 'Inter, sans-serif',
        'font-heading': 'Inter, sans-serif',
        'font-mono': 'JetBrains Mono, monospace',
        'font-ui': 'Inter, sans-serif',
      },
    })
    expect(result.valid).toBe(true)
  })

  it('validates category when provided', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      category: 'invalid-category',
      colors: { 'bg-base': '#000' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid category')
  })

  it('validates fonts when provided', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '#000' },
      fonts: { body: 'Inter', heading: 'Inter', mono: 'JetBrains Mono', ui: 'Inter' },
    })
    expect(result.valid).toBe(true)
  })

  it('rejects fonts with non-string values', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '#000' },
      fonts: { body: 42 },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid font')
  })

  it('rejects fonts with unknown keys', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '#000' },
      fonts: { body: 'Inter', evil: 'malicious' },
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid font')
  })

  it('validates fontScale when provided', () => {
    const result = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '#000' },
      fontScale: 1.0,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects fontScale out of range', () => {
    const resultLow = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '#000' },
      fontScale: 0.3,
    })
    expect(resultLow.valid).toBe(false)
    expect(resultLow.error).toContain('fontScale')

    const resultHigh = validateThemeImport({
      id: 'test',
      name: 'Test',
      colors: { 'bg-base': '#000' },
      fontScale: 2.0,
    })
    expect(resultHigh.valid).toBe(false)
    expect(resultHigh.error).toContain('fontScale')
  })
})

// ---------------------------------------------------------------------------
// exportTheme
// ---------------------------------------------------------------------------

describe('exportTheme', () => {
  it('returns JSON with theme and overrides keys', () => {
    const theme = validTheme()
    const overrides = validOverrides()
    const result = JSON.parse(exportTheme(theme, overrides))
    expect(result).toHaveProperty('theme')
    expect(result).toHaveProperty('overrides')
    expect(result.theme.id).toBe('test-theme')
    expect(result.theme.builtIn).toBe(false)
    expect(result.overrides.accent).toBe('#ff0000')
  })

  it('returns JSON without overrides when not provided', () => {
    const theme = validTheme()
    const result = JSON.parse(exportTheme(theme))
    expect(result).toHaveProperty('theme')
    expect(result.overrides).toBeUndefined()
  })

  it('with includeArtwork=false removes artwork field', () => {
    const theme = validTheme({ artwork: 'data:image/png;base64,abc123' })
    const result = JSON.parse(exportTheme(theme, undefined, false))
    expect(result.theme.artwork).toBeUndefined()
  })

  it('with includeArtwork=true keeps artwork field', () => {
    const theme = validTheme({ artwork: 'data:image/png;base64,abc123' })
    const result = JSON.parse(exportTheme(theme, undefined, true))
    expect(result.theme.artwork).toBe('data:image/png;base64,abc123')
  })

  it('sets builtIn to false in exported theme', () => {
    const theme = validTheme({ builtIn: true })
    const result = JSON.parse(exportTheme(theme))
    expect(result.theme.builtIn).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// encodeShareCode / decodeShareCode
// ---------------------------------------------------------------------------

describe('encodeShareCode / decodeShareCode', () => {
  it('encodeShareCode produces string starting with ocm-theme:v1:', () => {
    const theme = validTheme()
    const code = encodeShareCode(theme)
    expect(code.startsWith('ocm-theme:v1:')).toBe(true)
  })

  it('round-trips a theme through encode/decode', () => {
    const theme = validTheme()
    const overrides = validOverrides()
    const code = encodeShareCode(theme, overrides)
    const decoded = decodeShareCode(code)
    expect(decoded).not.toBeNull()
    expect(decoded!.theme.id).toBe('test-theme')
    expect(decoded!.theme.name).toBe('Test Theme')
    expect(decoded!.theme.colors).toEqual(theme.colors)
    expect(decoded!.overrides?.accent).toBe('#ff0000')
  })

  it('encodeShareCode strips artwork from theme', () => {
    const theme = validTheme({ artwork: 'data:image/png;base64,largecontent' })
    const code = encodeShareCode(theme)
    const decoded = decodeShareCode(code)
    expect(decoded!.theme.artwork).toBeUndefined()
  })

  it('decodeShareCode returns null for string not starting with ocm-theme:v1:', () => {
    expect(decodeShareCode('random-string')).toBeNull()
    expect(decodeShareCode('ocm-theme:v2:something')).toBeNull()
    expect(decodeShareCode('')).toBeNull()
  })

  it('decodeShareCode returns null for invalid base64 content', () => {
    expect(decodeShareCode('ocm-theme:v1:!@#$%not-valid-base64')).toBeNull()
  })

  it('round-trips theme without overrides', () => {
    const theme = validTheme()
    const code = encodeShareCode(theme)
    const decoded = decodeShareCode(code)
    expect(decoded).not.toBeNull()
    expect(decoded!.theme.id).toBe('test-theme')
    expect(decoded!.overrides).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// parseImportInput
// ---------------------------------------------------------------------------

describe('parseImportInput', () => {
  it('handles raw JSON string with theme wrapper', () => {
    const theme = validTheme()
    const json = JSON.stringify({ theme, overrides: validOverrides() })
    const result = parseImportInput(json)
    expect(result).not.toBeNull()
    expect(result!.theme.id).toBe('test-theme')
    expect(result!.overrides?.accent).toBe('#ff0000')
  })

  it('handles raw JSON string without wrapper (bare theme)', () => {
    const theme = validTheme()
    const json = JSON.stringify(theme)
    const result = parseImportInput(json)
    expect(result).not.toBeNull()
    expect(result!.theme.id).toBe('test-theme')
  })

  it('handles share code string starting with ocm-theme:v1:', () => {
    const theme = validTheme()
    const code = encodeShareCode(theme)
    const result = parseImportInput(code)
    expect(result).not.toBeNull()
    expect(result!.theme.id).toBe('test-theme')
  })

  it('returns null for garbage input', () => {
    expect(parseImportInput('garbage')).toBeNull()
    expect(parseImportInput('')).toBeNull()
    expect(parseImportInput('   ')).toBeNull()
    expect(parseImportInput('{broken json')).toBeNull()
  })

  it('handles whitespace-padded input', () => {
    const theme = validTheme()
    const json = '  ' + JSON.stringify({ theme }) + '  '
    const result = parseImportInput(json)
    expect(result).not.toBeNull()
    expect(result!.theme.id).toBe('test-theme')
  })
})
