/**
 * Preferences Sync — syncs user preferences between localStorage and Supabase.
 *
 * On startup: fetches remote preferences and merges them into localStorage
 * (Supabase wins on conflicts, except timestamped state which uses last-write-wins).
 * When a preference changes locally, debounces for 2 seconds then pushes the
 * full preferences object to Supabase.
 *
 * Synced keys:
 *   theme-state, dnd-enabled, system-notifs, in-app-notifs,
 *   notif-sound, sidebar-width, keybindings, enabled-modules,
 *   sidebar-config, dashboard-state, chat workspace settings
 */

import { api, ApiError } from './api'
import { LOCAL_STORAGE_STATE_EVENT } from './hooks/useLocalStorageState'
import { notifyModulesChanged } from './modules'
import { hydrateThemeState } from './theme-store'

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
  'chat-model',
  'chat-favorite-models',
  'chat-favorite-models-version',
  'harness-chat-primary-model',
  'harness-heartbeat-model',
  'chat-selected-project-path',
  'chat-selected-runtime',
  'chat-selected-branch',
  'chat-added-projects',
  'chat-project-scripts',
  'chat-project-grouping-mode',
  'chat-project-sort-order',
] as const

type SyncedKey = typeof SYNCED_KEYS[number]
const CHAT_WORKSPACE_KEYS: readonly SyncedKey[] = [
  'chat-selected-project-path',
  'chat-selected-runtime',
  'chat-selected-branch',
  'chat-added-projects',
  'chat-project-scripts',
  'chat-project-grouping-mode',
  'chat-project-sort-order',
]
export const CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT = 'clawctrl:chat-workspace-preferences-changed'

/** Keys that use last-write-wins (timestamp comparison) instead of remote-wins */
const LAST_WRITE_WINS_KEYS: readonly SyncedKey[] = ['theme-state', 'dashboard-state']

let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _initialized = false
let _originalSetItem: typeof localStorage.setItem | null = null
/** Guard: true while applying remote prefs to localStorage (skip re-pushing) */
let _applyingRemote = false
let _authenticated = false
let _runtimeConfigInFlight = false

function isAuthApiError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403)
}

export function setPreferencesSyncAuthenticated(authenticated: boolean): void {
  _authenticated = authenticated
  if (!authenticated) {
    _initialized = false
    if (_debounceTimer) {
      clearTimeout(_debounceTimer)
      _debounceTimer = null
    }
  }
}

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
function lastModifiedMillis(value: unknown): number | null {
  const lastModified = (value as { lastModified?: unknown } | null)?.lastModified
  if (typeof lastModified === 'number' && Number.isFinite(lastModified)) return lastModified
  if (typeof lastModified === 'string' && lastModified.trim()) {
    const numeric = Number(lastModified)
    if (Number.isFinite(numeric)) return numeric
    const parsed = Date.parse(lastModified)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function shouldApplyRemoteLastWriteWins(localRaw: string | null, remoteValue: unknown): boolean {
  if (!localRaw) return true // no local state, always apply remote
  try {
    const local = JSON.parse(localRaw)
    const localModified = lastModifiedMillis(local)
    const remoteModified = lastModifiedMillis(remoteValue)
    if (localModified === null) return true
    if (remoteModified === null) return false
    // Remote wins if its timestamp is newer or equal
    return remoteModified >= localModified
  } catch {
    return true // can't parse local, apply remote
  }
}

/** Write remote preferences into localStorage (Supabase wins, except last-write-wins keys) */
function applyRemote(remote: Record<string, unknown>): {
  applied: Record<string, unknown>
  skippedLocalWins: boolean
} {
  const applied: Record<string, unknown> = {}
  let skippedLocalWins = false
  _applyingRemote = true
  try {
    for (const key of SYNCED_KEYS) {
      if (key in remote && remote[key] !== undefined) {
        // For last-write-wins keys, compare timestamps before overwriting
        if ((LAST_WRITE_WINS_KEYS as readonly string[]).includes(key)) {
          const localRaw = localStorage.getItem(key)
          if (!shouldApplyRemoteLastWriteWins(localRaw, remote[key])) {
            skippedLocalWins = true
            continue // local is newer, skip
          }
        }
        const value = remote[key]
        localStorage.setItem(key, JSON.stringify(value))
        applied[key] = value
      }
    }
  } finally {
    _applyingRemote = false
  }
  return { applied, skippedLocalWins }
}

/** Apply side effects for preferences that need immediate DOM updates */
function applySideEffects(remote: Record<string, unknown>) {
  // Theme state — apply mode (full theme application is handled by Plan 02-02)
  if ('theme-state' in remote) {
    try {
      const state = remote['theme-state'] as Parameters<typeof hydrateThemeState>[0]
      if (state) {
        hydrateThemeState(state)
      }
    } catch {
      // Non-fatal — theme will be applied on next full render
    }
  }

  // Enabled modules — notify the modules store so sidebar re-renders
  if ('enabled-modules' in remote) {
    notifyModulesChanged()
  }

  if (CHAT_WORKSPACE_KEYS.some((key) => key in remote)) {
    window.dispatchEvent(new CustomEvent(CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT))
  }
}

export async function initHarnessRuntimeConfig(): Promise<void> {
  if (!_authenticated || _runtimeConfigInFlight) return
  _runtimeConfigInFlight = true
  try {
    const config = await api.get<{
      chatPrimaryModel?: string | null
      heartbeatModel?: string | null
      favoriteModels?: string[]
    }>('/api/hermes/runtime-config')

    _applyingRemote = true
    try {
      if (typeof config.chatPrimaryModel === 'string') {
        localStorage.setItem('harness-chat-primary-model', JSON.stringify(config.chatPrimaryModel))
        localStorage.setItem('chat-model', JSON.stringify(config.chatPrimaryModel))
      }
      if (typeof config.heartbeatModel === 'string') {
        localStorage.setItem('harness-heartbeat-model', JSON.stringify(config.heartbeatModel))
      }
      if (Array.isArray(config.favoriteModels)) {
        localStorage.setItem('chat-favorite-models', JSON.stringify(config.favoriteModels))
      }
    } finally {
      _applyingRemote = false
    }
  } catch (err) {
    if (isAuthApiError(err)) {
      setPreferencesSyncAuthenticated(false)
      return
    }
    console.warn('[preferences-sync] failed to fetch harness runtime config:', err)
  } finally {
    _runtimeConfigInFlight = false
  }
}

/** Push current local preferences to Supabase (debounced) */
function schedulePush() {
  if (!_authenticated) return
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    if (!_authenticated) return
    const prefs = collectLocal()
    api.patch('/api/user-preferences', { preferences: prefs }).catch((err) => {
      if (isAuthApiError(err)) {
        setPreferencesSyncAuthenticated(false)
        return
      }
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
  if (!_authenticated) return
  if (_initialized) return
  _initialized = true

  // 1. Fetch remote preferences
  try {
    const res = await api.get<{ ok: boolean; data: Record<string, unknown> }>('/api/user-preferences')
    const remote = res?.data ?? {}

    if (Object.keys(remote).length > 0) {
      // 2. Merge remote into local (remote wins, except last-write-wins keys)
      const { applied, skippedLocalWins } = applyRemote(remote)
      applySideEffects(applied)
      if (skippedLocalWins) {
        api.patch('/api/user-preferences', { preferences: collectLocal() }).catch((err) => {
          if (isAuthApiError(err)) {
            setPreferencesSyncAuthenticated(false)
            return
          }
          console.warn('[preferences-sync] failed to restore newer local preferences:', err)
        })
      }
    } else {
      // No remote prefs yet — push current local prefs as initial seed
      const local = collectLocal()
      if (Object.keys(local).length > 0) {
        api.patch('/api/user-preferences', { preferences: local }).catch((err) => {
          if (isAuthApiError(err)) {
            setPreferencesSyncAuthenticated(false)
            return
          }
          console.warn('[preferences-sync] failed to seed remote preferences:', err)
        })
      }
    }
  } catch (err) {
    if (isAuthApiError(err)) {
      setPreferencesSyncAuthenticated(false)
      return
    }
    // Non-fatal — the app works fine with just localStorage
    console.warn('[preferences-sync] failed to fetch remote preferences:', err)
  }

  // 3. Intercept localStorage.setItem to detect preference changes
  if (!_originalSetItem) {
    _originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = function (key: string, value: string) {
      _originalSetItem!(key, value)
      window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_STATE_EVENT, {
        detail: { key },
      }))
      if (!_applyingRemote && isSyncedKey(key)) {
        schedulePush()
      }
    }
  }
}
