/**
 * Preferences Sync — syncs user preferences between localStorage and Supabase.
 *
 * On startup: fetches remote preferences and merges them into localStorage
 * (Supabase wins on conflicts, except dashboard-state which uses last-write-wins).
 * When a preference changes locally, debounces for 2 seconds then pushes the
 * full preferences object to Supabase.
 *
 * Synced keys:
 *   theme-state, dnd-enabled, system-notifs, in-app-notifs,
 *   notif-sound, sidebar-width, keybindings, enabled-modules,
 *   sidebar-config, dashboard-state
 */

import { api } from './api'
import { notifyModulesChanged } from './modules'
import { applyThemeFromState } from './theme-store'

/** The localStorage keys we sync to/from Supabase */
export const SYNCED_KEYS = [
  'theme-state',
  'dnd-enabled',
  'system-notifs',
  'in-app-notifs',
  'notif-sound',
  'sidebar-width',
  'keybindings',
  'enabled-modules',
  'sidebar-config',
  'dashboard-state',
] as const

type SyncedKey = typeof SYNCED_KEYS[number]

/** Keys that use last-write-wins (timestamp comparison) instead of remote-wins */
const LAST_WRITE_WINS_KEYS: readonly SyncedKey[] = ['dashboard-state']

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

/**
 * Compare lastModified timestamps for last-write-wins resolution.
 * Returns true if remote should overwrite local.
 */
function shouldApplyRemoteDashboardState(
  localRaw: string | null,
  remoteValue: unknown
): boolean {
  if (!localRaw) return true // no local state, always apply remote
  try {
    const local = JSON.parse(localRaw) as { lastModified?: string }
    const remote = remoteValue as { lastModified?: string }
    if (!local.lastModified) return true
    if (!remote?.lastModified) return false
    // Remote wins if its timestamp is newer or equal
    return remote.lastModified >= local.lastModified
  } catch {
    return true // can't parse local, apply remote
  }
}

/** Write remote preferences into localStorage (Supabase wins, except last-write-wins keys) */
function applyRemote(remote: Record<string, unknown>) {
  _applyingRemote = true
  try {
    for (const key of SYNCED_KEYS) {
      if (key in remote && remote[key] !== undefined) {
        // For last-write-wins keys, compare timestamps before overwriting
        if ((LAST_WRITE_WINS_KEYS as readonly string[]).includes(key)) {
          const localRaw = localStorage.getItem(key)
          if (!shouldApplyRemoteDashboardState(localRaw, remote[key])) {
            continue // local is newer, skip
          }
        }
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
 * 2. Merges into localStorage (remote wins on conflicts, except last-write-wins keys)
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
      // 2. Merge remote into local (remote wins, except last-write-wins keys)
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
