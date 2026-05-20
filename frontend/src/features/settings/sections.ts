export const SETTINGS_SECTION_KEYS = [
  'agent',
  'gateway',
  'app',
  'user',
  'connections',
  'usage',
  'providers',
  'codex-lb',
  'display',
  'keybindings',
  'modules',
  'notifications',
  'privacy',
  'status',
] as const

export type SettingsSection = typeof SETTINGS_SECTION_KEYS[number]
