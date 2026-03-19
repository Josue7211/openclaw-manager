/**
 * Theme Validation, Import/Export, and Share Codes
 *
 * Security-critical module that prevents CSS injection attacks via malicious theme imports.
 * Also enables sharing themes as compact base64-encoded strings.
 *
 * Exports: validateThemeImport, exportTheme, encodeShareCode, decodeShareCode,
 *          downloadThemeJson, parseImportInput
 */

import LZString from 'lz-string'
import type { ThemeDefinition, UserThemeOverrides } from './theme-definitions'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CSS custom property name whitelist (without -- prefix). Only these patterns are accepted. */
const ALLOWED_PROPERTY_PATTERNS = [
  /^bg-/,
  /^text-/,
  /^border-/,
  /^border$/,
  /^accent/,
  /^glow-/,
  /^glass-/,
  /^hover-/,
  /^active-/,
  /^green/,
  /^red/,
  /^warning/,
  /^amber/,
  /^yellow/,
  /^gold/,
  /^blue/,
  /^purple/,
  /^cyan/,
  /^pink/,
  /^orange/,
  /^shadow-/,
  /^overlay/,
  /^font-(body|heading|mono|ui)$/,
]

/** Value patterns that indicate CSS injection attempts. */
const DANGEROUS_PATTERNS = [
  /url\s*\(/i,
  /@import/i,
  /expression\s*\(/i,
  /javascript:/i,
  /<script/i,
  /<\/script/i,
]

const VALID_CATEGORIES = ['dark', 'light', 'high-contrast', 'colorful'] as const

const VALID_FONT_KEYS = new Set(['body', 'heading', 'mono', 'ui'])

const SHARE_PREFIX = 'ocm-theme:v1:'

const MAX_VALUE_LENGTH = 200

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateThemeImport(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid format' }
  }

  const def = data as Record<string, unknown>

  // Required fields
  if (typeof def.id !== 'string' || typeof def.name !== 'string' || !def.colors || typeof def.colors !== 'object') {
    return { valid: false, error: 'Missing required fields' }
  }

  // Category validation (optional field, but must be valid if present)
  if (def.category !== undefined) {
    if (!(VALID_CATEGORIES as readonly string[]).includes(def.category as string)) {
      return { valid: false, error: 'Invalid category' }
    }
  }

  // Validate colors
  const colors = def.colors as Record<string, unknown>
  for (const [key, value] of Object.entries(colors)) {
    // Check property name against whitelist
    if (!ALLOWED_PROPERTY_PATTERNS.some(p => p.test(key))) {
      return { valid: false, error: `Unsupported property: ${key}` }
    }

    // Check value is a string
    if (typeof value !== 'string') {
      return { valid: false, error: `Invalid value for ${key}` }
    }

    // Check value length
    if (value.length > MAX_VALUE_LENGTH) {
      return { valid: false, error: `Value too long for ${key}` }
    }

    // Check for dangerous patterns
    if (DANGEROUS_PATTERNS.some(p => p.test(value))) {
      return {
        valid: false,
        error: "This theme file contains unsupported properties and can't be imported.",
      }
    }
  }

  // Validate fonts (optional)
  if (def.fonts !== undefined) {
    if (!def.fonts || typeof def.fonts !== 'object') {
      return { valid: false, error: 'Invalid font configuration' }
    }
    const fonts = def.fonts as Record<string, unknown>
    for (const [key, value] of Object.entries(fonts)) {
      if (!VALID_FONT_KEYS.has(key)) {
        return { valid: false, error: `Invalid font slot: ${key}` }
      }
      if (typeof value !== 'string') {
        return { valid: false, error: `Invalid font value for ${key}` }
      }
    }
  }

  // Validate fontScale (optional)
  if (def.fontScale !== undefined) {
    if (typeof def.fontScale !== 'number' || def.fontScale < 0.5 || def.fontScale > 1.5) {
      return { valid: false, error: 'fontScale must be a number between 0.5 and 1.5' }
    }
  }

  return { valid: true }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportTheme(
  theme: ThemeDefinition,
  overrides?: UserThemeOverrides,
  includeArtwork?: boolean,
): string {
  const exportedTheme = { ...theme, builtIn: false }

  if (includeArtwork === false) {
    delete exportedTheme.artwork
  }

  const payload: { theme: ThemeDefinition; overrides?: UserThemeOverrides } = {
    theme: exportedTheme,
  }

  if (overrides !== undefined) {
    payload.overrides = overrides
  }

  return JSON.stringify(payload, null, 2)
}

// ---------------------------------------------------------------------------
// Share Codes
// ---------------------------------------------------------------------------

export function encodeShareCode(theme: ThemeDefinition, overrides?: UserThemeOverrides): string {
  const exportedTheme = { ...theme, builtIn: false, artwork: undefined }
  const payload: { theme: ThemeDefinition; overrides?: UserThemeOverrides } = {
    theme: exportedTheme,
  }
  if (overrides !== undefined) {
    payload.overrides = overrides
  }
  const json = JSON.stringify(payload)
  return SHARE_PREFIX + LZString.compressToBase64(json)
}

export function decodeShareCode(
  code: string,
): { theme: ThemeDefinition; overrides?: UserThemeOverrides } | null {
  if (!code.startsWith(SHARE_PREFIX)) return null

  const compressed = code.slice(SHARE_PREFIX.length)
  const json = LZString.decompressFromBase64(compressed)
  if (!json) return null

  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || !parsed.theme) return null
    return parsed
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function downloadThemeJson(
  theme: ThemeDefinition,
  overrides?: UserThemeOverrides,
  includeArtwork?: boolean,
): void {
  const json = exportTheme(theme, overrides, includeArtwork)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${theme.name.toLowerCase().replace(/\s+/g, '-')}.json`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Import Parsing
// ---------------------------------------------------------------------------

export function parseImportInput(
  input: string,
): { theme: ThemeDefinition; overrides?: UserThemeOverrides } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Check for share code
  if (trimmed.startsWith(SHARE_PREFIX)) {
    return decodeShareCode(trimmed)
  }

  // Try JSON parse
  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object') return null

    // Wrapped format: { theme: {...}, overrides: {...} }
    if (parsed.theme && typeof parsed.theme === 'object') {
      return { theme: parsed.theme, overrides: parsed.overrides }
    }

    // Bare theme format: { id, name, colors, ... }
    if (parsed.id && parsed.name && parsed.colors) {
      return { theme: parsed }
    }

    return null
  } catch {
    return null
  }
}
