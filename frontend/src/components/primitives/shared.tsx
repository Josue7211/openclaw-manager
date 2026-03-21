/**
 * Shared primitives infrastructure -- defensive config extraction helpers,
 * color resolution, and inline error fallback used by all 11 primitives.
 *
 * Every primitive imports these helpers to safely parse widget config values
 * from the Record<string, unknown> config bag without crashing on bad data.
 */

import { WarningCircle } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// Config extraction helpers
// ---------------------------------------------------------------------------

/** Extract a string value from config, returning fallback if not a string. */
export function configString(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const val = config[key]
  return typeof val === 'string' ? val : fallback
}

/** Extract a finite number from config, returning fallback if not a valid number. */
export function configNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const val = config[key]
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback
}

/** Extract a boolean from config, returning fallback if not a boolean. */
export function configBool(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const val = config[key]
  return typeof val === 'boolean' ? val : fallback
}

/** Extract an array from config, returning empty array if not an array. */
export function configArray<T>(
  config: Record<string, unknown>,
  key: string,
): T[] {
  const val = config[key]
  return Array.isArray(val) ? (val as T[]) : []
}

// ---------------------------------------------------------------------------
// Color resolution
// ---------------------------------------------------------------------------

/** Map of semantic color names to CSS variable references. */
export const COLOR_MAP: Record<string, string> = {
  accent: 'var(--accent)',
  'accent-dim': 'var(--accent-dim)',
  secondary: 'var(--secondary)',
  'secondary-dim': 'var(--secondary-dim)',
  tertiary: 'var(--tertiary)',
  'tertiary-dim': 'var(--tertiary-dim)',
  red: 'var(--red)',
  amber: 'var(--amber)',
  green: 'var(--secondary)',
  blue: 'var(--tertiary)',
}

/** Resolve a color key to its CSS variable. Falls back to accent. */
export function resolveColor(key: string): string {
  return COLOR_MAP[key] ?? 'var(--accent)'
}

// ---------------------------------------------------------------------------
// Error fallback
// ---------------------------------------------------------------------------

/**
 * Inline error display for primitives with malformed config.
 * Not an Error Boundary -- WidgetWrapper provides PageErrorBoundary for crashes.
 * This is for recoverable "bad config" situations where the primitive
 * wants to show a helpful message instead of rendering garbage.
 */
export function PrimitiveErrorFallback({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        height: '100%',
        padding: '16px',
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}
    >
      <WarningCircle
        size={24}
        weight="duotone"
        style={{ color: 'var(--amber)' }}
      />
      <span style={{ fontSize: '12px', lineHeight: 1.4 }}>{message}</span>
    </div>
  )
}
