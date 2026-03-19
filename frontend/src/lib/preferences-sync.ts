/**
 * Preferences Sync — syncs user preferences between localStorage and Supabase.
 *
 * On startup: fetches remote preferences and merges them into localStorage
 * (Supabase wins on conflicts). When a preference changes locally, debounces
 * for 2 seconds then pushes the full preferences object to Supabase.
 *
 * Synced keys:
 *   theme, accent-color, dnd-enabled, system-notifs, in-app-notifs,
 *   notif-sound, sidebar-width, keybindings, enabled-modules
 */

import { api } from './api'
import { notifyModulesChanged } from './modules'
import { applyThemeFromState } from './theme-store'

/** The localStorage keys we sync to/from Supabase */
const SYNCED_KEYS = [
  'theme-state',
  'dnd-enabled',
  'system-notifs',
  'in-app-notifs',
  'notif-sound',
  'sidebar-width',
  'keybindings',
  'enabled-modules',
  'sidebar-config',
] as const

type SyncedKey = typeof SYNCED_KEYS[number]

let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _initialized = false
let _originalSetItem: typeof localStorage.setItem | null = null
/** Guard: true while applying remote prefs to localStorage (skip re-pushing) */
let _applyingRemote = false

/** Read all synced preferences from localStorage into a plain object */
function collectLocal(): Record<string, unknown> {
  const prefs: Record<string, unknown> = {}
  for (const key of SYNCED_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      try {
        prefs[key] = JSON.parse(raw)
      } catch {
        prefs[key] = raw
      }
    }
  }
  return prefs
}

/** Write remote preferences into localStorage (Supabase wins) */
function applyRemote(remote: Record<string, unknown>) {
  _applyingRemote = true
  try {
    for (const key of SYNCED_KEYS) {
      if (key in remote && remote[key] !== undefined) {
        const value = remote[key]
        localStorage.setItem(key, JSON.stringify(value))
      }
    }
  } finally {
    _applyingRemote = false
  }
}

/** Apply side effects for preferences that need immediate DOM updates */
function applySideEffects(remote: Record<string, unknown>) {
  // Theme state — apply mode (full theme application is handled by Plan 02-02)
  if ('theme-state' in remote) {
    try {
      const state = remote['theme-state'] as { mode?: string }
      if (state) {
        applyThemeFromState(state as Parameters<typeof applyThemeFromState>[0])
      }
    } catch {
      // Non-fatal — theme will be applied on next full render
    }
  }

  // Enabled modules — notify the modules store so sidebar re-renders
  if ('enabled-modules' in remote) {
    notifyModulesChanged()
  }
}

/** Push current local preferences to Supabase (debounced) */
function schedulePush() {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    const prefs = collectLocal()
    api.patch('/api/user-preferences', { preferences: prefs }).catch((err) => {
      console.warn('[preferences-sync] failed to push preferences:', err)
    })
  }, 2000)
}

/** Check if a localStorage key is one we sync */
function isSyncedKey(key: string): key is SyncedKey {
  return (SYNCED_KEYS as readonly string[]).includes(key)
}

/**
 * Initialize preferences sync.
 * Call once after authentication is confirmed.
 *
 * 1. Fetches remote preferences from Supabase
 * 2. Merges into localStorage (remote wins on conflicts)
 * 3. Installs a localStorage interceptor to auto-push changes
 */
export async function initPreferencesSync(): Promise<void> {
  if (_initialized) return
  _initialized = true

  // 1. Fetch remote preferences
  try {
    const res = await api.get<{ ok: boolean; data: Record<string, unknown> }>('/api/user-preferences')
    const remote = res?.data ?? {}

    if (Object.keys(remote).length > 0) {
      // 2. Merge remote into local (remote wins)
      applyRemote(remote)
      applySideEffects(remote)
    } else {
      // No remote prefs yet — push current local prefs as initial seed
      const local = collectLocal()
      if (Object.keys(local).length > 0) {
        api.patch('/api/user-preferences', { preferences: local }).catch((err) => {
          console.warn('[preferences-sync] failed to seed remote preferences:', err)
        })
      }
    }
  } catch (err) {
    // Non-fatal — the app works fine with just localStorage
    console.warn('[preferences-sync] failed to fetch remote preferences:', err)
  }

  // 3. Intercept localStorage.setItem to detect preference changes
  if (!_originalSetItem) {
    _originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = function (key: string, value: string) {
      _originalSetItem!(key, value)
      if (!_applyingRemote && isSyncedKey(key)) {
        schedulePush()
      }
    }
  }
}
