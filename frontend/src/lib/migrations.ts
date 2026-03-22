const CURRENT_VERSION = 7

export function runMigrations() {
  const stored = localStorage.getItem('app-version')
  const version = stored ? parseInt(stored, 10) : 0

  if (version < 1) {
    // v0 -> v1: useLocalStorageState stores JSON via JSON.stringify/JSON.parse.
    // Old code may have stored raw strings. Migrate boolean settings so that
    // JSON.parse works correctly.  In practice "true"/"false" are already valid
    // JSON, so this is a no-op safeguard for future migrations.
    for (const key of [
      'dnd-enabled',
      'system-notifs',
      'in-app-notifs',
      'notif-sound',
      'title-bar-visible',
      'sidebar-header-visible',
    ]) {
      const val = localStorage.getItem(key)
      if (val === 'true') localStorage.setItem(key, 'true')
      if (val === 'false') localStorage.setItem(key, 'false')
    }
  }

  if (version < 2) {
    // v1 -> v2: New modules (notes, status) were added. If a user has a saved
    // enabled-modules list, those new modules won't be in it, making them
    // invisible. Append any missing modules from the current set so upgrading
    // users see newly added pages without losing their existing selection.
    const CURRENT_MODULE_IDS = [
      'messages', 'chat', 'todos', 'calendar', 'reminders', 'email',
      'pomodoro', 'homelab', 'media', 'dashboard', 'missions', 'agents',
      'memory', 'crons', 'pipeline', 'knowledge', 'notes', 'status',
    ]
    const raw = localStorage.getItem('enabled-modules')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const existing = new Set(parsed as string[])
          const updated = [...parsed]
          for (const id of CURRENT_MODULE_IDS) {
            if (!existing.has(id)) updated.push(id)
          }
          if (updated.length !== parsed.length) {
            localStorage.setItem('enabled-modules', JSON.stringify(updated))
          }
        }
      } catch { /* invalid JSON — leave it, modules.ts will fall back to defaults */ }
    }

    // sidebar-config gained deletedItems and unusedCategories fields, and
    // ensureComplete() already self-heals at runtime, so no migration needed.
    // Theme keys (glow-color, secondary-color, logo-color) are new — users
    // without them will get defaults, so no migration needed either.
  }

  if (version < 3) {
    // v2 -> v3: Remove note content from localStorage. The old vault cache
    // (mc-notes-vault) and legacy Notes page (notes-data) stored full note
    // bodies in localStorage, which is a security concern. Note content is
    // now held in memory only; only metadata is cached (mc-notes-meta).
    localStorage.removeItem('mc-notes-vault')
    localStorage.removeItem('notes-data')
  }

  if (version < 4) {
    // v3 -> v4: Set default toast position for existing users
    if (!localStorage.getItem('toast-position')) {
      localStorage.setItem('toast-position', 'top-left')
    }
  }

  if (version < 5) {
    // v4 -> v5: Migrate old per-key theme settings to unified theme-state.
    // Old keys: 'theme' (mode string), 'accent-color', 'glow-color',
    // 'secondary-color', 'logo-color' (each JSON-encoded hex strings).
    // New key: 'theme-state' (ThemeState JSON object).
    try {
      // Skip if theme-state already exists (idempotent)
      if (!localStorage.getItem('theme-state')) {
        // Read old mode
        let mode: 'dark' | 'light' | 'system' = 'dark'
        const oldTheme = localStorage.getItem('theme')
        if (oldTheme) {
          try {
            const parsed = JSON.parse(oldTheme) as string
            if (parsed === 'light') mode = 'light'
            else if (parsed === 'system') mode = 'system'
          } catch {
            // raw string fallback
            if (oldTheme === 'light' || oldTheme === '"light"') mode = 'light'
            else if (oldTheme === 'system' || oldTheme === '"system"') mode = 'system'
          }
        }

        const activeThemeId = mode === 'light' ? 'default-light' : 'default-dark'

        // Read old color overrides
        const readOldColor = (key: string): string | null => {
          try {
            const raw = localStorage.getItem(key)
            if (raw) return JSON.parse(raw)
          } catch { /* ignore */ }
          return null
        }

        const accent = readOldColor('accent-color')
        const glow = readOldColor('glow-color')
        const secondary = readOldColor('secondary-color')
        const logo = readOldColor('logo-color')

        // Build overrides object (only if any color was set)
        const overrides: Record<string, { themeId: string; accent?: string; glow?: string; secondary?: string; logo?: string }> = {}
        if (accent || glow || secondary || logo) {
          overrides[activeThemeId] = {
            themeId: activeThemeId,
            ...(accent ? { accent } : {}),
            ...(glow ? { glow } : {}),
            ...(secondary ? { secondary } : {}),
            ...(logo ? { logo } : {}),
          }
        }

        const themeState = {
          mode,
          activeThemeId,
          overrides,
          customThemes: [],
        }

        localStorage.setItem('theme-state', JSON.stringify(themeState))
      }

      // Remove old keys regardless (they are superseded)
      localStorage.removeItem('theme')
      localStorage.removeItem('accent-color')
      localStorage.removeItem('glow-color')
      localStorage.removeItem('secondary-color')
      localStorage.removeItem('logo-color')
    } catch {
      // Non-fatal — user will get default theme
    }
  }

  if (version < 6) {
    // v5 -> v6: Rename old "secondary" (blue) override to "tertiary".
    // In the new 3-tier color hierarchy, "secondary" means green (functional/status)
    // and "tertiary" means blue (chat/dashboard). Old overrides stored blue values
    // under "secondary", so we move them to "tertiary" and clear "secondary" to
    // let it default to green.
    try {
      const raw = localStorage.getItem('theme-state')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.overrides) {
          for (const [key, override] of Object.entries(parsed.overrides)) {
            const ov = override as Record<string, unknown>
            if (ov.secondary) {
              ov.tertiary = ov.secondary
              delete ov.secondary
              parsed.overrides[key] = ov
            }
          }
          localStorage.setItem('theme-state', JSON.stringify(parsed))
        }
      }
    } catch {
      // Non-fatal — migration failure is acceptable
    }
  }

  if (version < 7) {
    // v6 -> v7: Reset corrupted dashboard state.
    // Widget cards were migrated from prop-based to context-based data access
    // and named exports were fixed in widget-registry. Old dashboard state
    // may have broken layouts from crash-induced corruption.
    localStorage.removeItem('dashboard-state')
  }

  localStorage.setItem('app-version', String(CURRENT_VERSION))
}
