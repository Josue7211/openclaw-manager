const CURRENT_VERSION = 3

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

  localStorage.setItem('app-version', String(CURRENT_VERSION))
}
