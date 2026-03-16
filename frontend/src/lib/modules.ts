export interface AppModule {
  id: string
  name: string
  description: string
  icon: string // lucide icon name
  route: string
  requiresConfig?: string[] // env vars or secrets needed
  platform?: 'macos' | 'linux' | 'windows' | 'all'
}

export const APP_MODULES: AppModule[] = [
  { id: 'messages', name: 'Messages', description: 'iMessage via BlueBubbles', icon: 'Smartphone', route: '/messages', platform: 'macos' },
  { id: 'chat', name: 'Chat', description: 'AI chat with agents', icon: 'MessageCircle', route: '/chat' },
  { id: 'todos', name: 'Todos', description: 'Task management', icon: 'CheckSquare', route: '/todos' },
  { id: 'calendar', name: 'Calendar', description: 'Calendar (CalDAV)', icon: 'CalendarDays', route: '/calendar' },
  { id: 'reminders', name: 'Reminders', description: 'Apple Reminders (CalDAV)', icon: 'Bell', route: '/reminders' },
  { id: 'email', name: 'Email', description: 'Email digest (IMAP)', icon: 'Mail', route: '/email' },
  { id: 'pomodoro', name: 'Pomodoro', description: 'Focus timer', icon: 'Timer', route: '/pomodoro' },
  { id: 'homelab', name: 'Home Lab', description: 'Proxmox + OPNsense', icon: 'Server', route: '/homelab' },
  { id: 'media', name: 'Media Radar', description: 'Plex + Sonarr + Radarr', icon: 'Film', route: '/media' },
  { id: 'dashboard', name: 'Dashboard', description: 'Agent dashboard', icon: 'LayoutDashboard', route: '/dashboard' },
  { id: 'missions', name: 'Missions', description: 'Agent missions', icon: 'Target', route: '/missions' },
  { id: 'agents', name: 'Agents', description: 'Agent management', icon: 'Bot', route: '/agents' },
  { id: 'memory', name: 'Memory', description: 'Agent memory files', icon: 'Brain', route: '/memory' },
  { id: 'crons', name: 'Cron Jobs', description: 'Scheduled tasks', icon: 'CalendarDays', route: '/crons' },
  { id: 'pipeline', name: 'Pipeline', description: 'Code review pipeline', icon: 'GitBranch', route: '/pipeline' },
  { id: 'knowledge', name: 'Knowledge', description: 'Documentation', icon: 'BookOpen', route: '/knowledge' },
  { id: 'notes', name: 'Notes', description: 'Personal notes', icon: 'FileText', route: '/notes' },
]

const STORAGE_KEY = 'enabled-modules'

/** All module IDs — used as default when nothing is stored */
const ALL_MODULE_IDS = APP_MODULES.map(m => m.id)

const _listeners = new Set<() => void>()

// Cached snapshot — useSyncExternalStore requires stable references
let _cached: string[] = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* fall through */ }
  return ALL_MODULE_IDS
})()

export function getEnabledModules(): string[] {
  return _cached
}

export function setEnabledModules(ids: string[]): void {
  _cached = ids
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  _listeners.forEach(fn => fn())
}

/** Notify all subscribers that enabled modules changed (e.g. after remote sync) */
export function notifyModulesChanged(): void {
  _listeners.forEach(fn => fn())
}

/** Subscribe to module changes (for useSyncExternalStore) */
export function subscribeModules(callback: () => void): () => void {
  _listeners.add(callback)
  return () => { _listeners.delete(callback) }
}
