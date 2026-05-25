/*
 * Copied/adapted from T3 Code's settings route shortcuts.
 * ClawControl keeps the account/settings popover as a thin adapter over
 * concrete settings routes so chat does not hard-code a second settings map.
 */

export interface ChatSettingsShortcut {
  id: 'settings' | 'usage' | 'providers' | 'hermes-agent'
  label: string
  href: string
  section: 'usage' | 'providers' | 'hermes-agent' | null
}

export const CHAT_SETTINGS_SHORTCUTS: readonly ChatSettingsShortcut[] = [
  { id: 'settings', label: 'Settings', href: '/settings', section: null },
  { id: 'usage', label: 'Usage remaining', href: '/settings?section=usage', section: 'usage' },
  { id: 'providers', label: 'Providers', href: '/settings?section=providers', section: 'providers' },
  { id: 'hermes-agent', label: 'Hermes Agent', href: '/settings?section=hermes-agent', section: 'hermes-agent' },
] as const
