export const SETTINGS_SECTION_KEYS = [
  'agent',
  'gateway',
  'app',
  'user',
  'connections',
  'usage',
  'providers',
  'hermes-agent',
  'codex-lb',
  'display',
  'keybindings',
  'modules',
  'notifications',
  'privacy',
  'status',
] as const

export type SettingsSection = typeof SETTINGS_SECTION_KEYS[number]

export function normalizeSettingsSection(value: string | null | undefined): SettingsSection | null {
  if (!value) return null
  if (value === 'codex-lb') return 'hermes-agent'
  return (SETTINGS_SECTION_KEYS as readonly string[]).includes(value)
    ? value as SettingsSection
    : null
}
