const CURRENT_VERSION = 1

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

  localStorage.setItem('app-version', String(CURRENT_VERSION))
}
