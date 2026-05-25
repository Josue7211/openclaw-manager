


import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate as useRouterNavigate, useLocation } from 'react-router-dom'
import { MagnifyingGlass, Plus, Gear, ArrowRight, NotePencil, CheckSquare, Sun, Moon, BellSlash, Checks, DownloadSimple, ChatText, Target, CalendarDots, Envelope, Bell, BookOpen, FileText, SpinnerGap, MusicNote, FolderPlus, FolderOpen } from '@phosphor-icons/react'
import { allNavItems } from '@/lib/nav-items'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { getKeybindings, subscribeKeybindings, formatKey } from '@/lib/keybindings'
import { markAllRead } from '@/components/NotificationCenter'
import { formatContactLabel } from '@/lib/utils'
import { api } from '@/lib/api'
import { cycleThemeMode, useThemeState } from '@/lib/theme-store'
import { chatSessionPath, notifyChatSessionsChanged, saveSelectedChatSessionKey } from '@/lib/chat-session-selection'
import type { HermesSession, GatewaySessionsResponse } from '@/chat/t3-adapters/gatewaySessionTypes'
import {
  loadAddedProjects,
  loadChatWorkspaceContext,
  mergeWorkspaceProjects,
  normalizeWorkspaceContext,
  type ChatWorkspaceProject,
} from '@/chat/t3-adapters/projectWorkspace'
import {
  attachChatSessionProjectRefs,
  findProjectForSession,
  loadChatSessionProjectRefs,
} from '@/chat/t3-adapters/sessionProjectRefs'
import {
  sessionEnvironmentId,
  sessionProjectId,
  sessionProjectName,
  sessionProjectRoot,
  sessionWorkingDir,
} from '@/chat/t3-adapters/sidebarSessionMatching'
import {
  projectEnvironmentDisplayLabel,
  projectMachineLabel,
  setProjectRouteParams,
} from '@/chat/t3-adapters/projectSidebar'
import { loadProjectSortOrder } from '@/chat/t3-adapters/sidebarPreferences'
import type { KoelSearchResults } from '@/lib/types'

const KOEL_SEARCH_ENABLED = import.meta.env.VITE_ENABLE_KOEL_SEARCH === 'true'

interface PaletteItem {
  id: string
  label: string
  icon?: React.ReactNode
  action: () => void
  shortcut?: string
  category: 'page' | 'action' | 'project' | 'pinned-chat' | 'chat' | 'conversation' | 'search'
  /** Optional secondary text shown dimmer to the right of the label */
  hint?: string
  /** Hidden searchable metadata that should not clutter the visible row. */
  keywords?: string[]
}

/* ─── DND helpers ──────────────────────────────────────────────────────── */

function isDndEnabled(): boolean {
  try {
    const raw = localStorage.getItem('dnd-enabled')
    return raw ? JSON.parse(raw) === true : false
  } catch { return false }
}

function toggleDnd(): boolean {
  const next = !isDndEnabled()
  localStorage.setItem('dnd-enabled', JSON.stringify(next))
  return next
}

/* ─── Gear export (matches Gear page) ─────────────────────────── */

function exportSettings() {
  const KNOWN_PREFIXES = [
    'dnd-enabled', 'system-notifs', 'in-app-notifs', 'notif-sound',
    'title-bar-visible', 'sidebar-header-visible', 'user-name', 'user-avatar',
    'app-version', 'keybindings', 'sidebar-collapsed', 'theme', 'theme-state',
    'enabled-modules', 'sidebar-config', 'dashboard-state', 'chat-model',
    'chat-favorite-models', 'chat-favorite-models-version',
    'harness-chat-primary-model', 'harness-heartbeat-model',
  ]
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (KNOWN_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix + '-'))) {
      data[key] = localStorage.getItem(key)!
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clawctrl-settings-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─── Recent conversations cache (read from Messages page data) ──────── */

interface RecentConversation {
  guid: string
  chatId: string
  displayName: string | null
  participants: { address: string; service: string }[]
  lastMessage: string | null
  lastDate: number | null
}

let _recentConversations: RecentConversation[] = []
const _recentListeners: Set<() => void> = new Set()

function emitRecentChange() {
  for (const l of _recentListeners) l()
}

/** Called by Messages page to share its conversation list */
export function setRecentConversations(convs: RecentConversation[]) {
  _recentConversations = convs.slice(0, 10) // top 10
  emitRecentChange()
}

function subscribeRecent(listener: () => void) {
  _recentListeners.add(listener)
  return () => { _recentListeners.delete(listener) }
}

function getRecentSnapshot(): RecentConversation[] {
  return _recentConversations
}

function sessionLastActivityMs(session: HermesSession): number {
  const timestamp = new Date(session.lastActivity).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isPinnedChatSession(session: HermesSession): boolean {
  return session.pinned === true || session.favorite === true
}

function compareChatSessions(left: HermesSession, right: HermesSession): number {
  if (isPinnedChatSession(left) !== isPinnedChatSession(right)) {
    return isPinnedChatSession(left) ? -1 : 1
  }
  return sessionLastActivityMs(right) - sessionLastActivityMs(left)
}

function projectLastActivityMs(project: ChatWorkspaceProject, sessions: HermesSession[]): number {
  let latest = 0
  for (const session of sessions) {
    if (findProjectForSession([project], session) !== project) continue
    latest = Math.max(latest, sessionLastActivityMs(session))
  }
  return latest
}

function compareWorkspaceProjects(
  left: ChatWorkspaceProject,
  right: ChatWorkspaceProject,
  sessions: HermesSession[],
): number {
  const sortOrder = loadProjectSortOrder()
  if (sortOrder === 'recent') {
    const activitySort = projectLastActivityMs(right, sessions) - projectLastActivityMs(left, sessions)
    if (activitySort) return activitySort
  }
  if (sortOrder === 'machine') {
    const machineSort = projectMachineLabel(left).localeCompare(projectMachineLabel(right))
    if (machineSort) return machineSort
  }
  return left.name.localeCompare(right.name)
    || left.path.localeCompare(right.path)
}

function chatSessionHint(session: HermesSession): string {
  const workingDir = sessionWorkingDir(session) || sessionProjectRoot(session)
  const branch = typeof session.branch === 'string' ? session.branch.trim() : ''
  const runtime = typeof session.runtime === 'string' ? session.runtime.trim() : ''
  const parts = [
    isPinnedChatSession(session) ? 'Pinned' : '',
    session.project,
    workingDir ? projectLastPathSegment(workingDir) : '',
    branch,
    runtime,
    session.environmentId,
    session.messageCount > 0 ? `${session.messageCount} messages` : '',
  ].map(part => part?.trim()).filter(Boolean)
  return parts.join(' - ')
}

function projectLastPathSegment(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/g, '')
  if (!normalized) return ''
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function projectHint(project: ChatWorkspaceProject): string {
  return [
    projectEnvironmentDisplayLabel(project),
    project.repositoryIdentity?.displayName,
    project.repositoryIdentity?.name,
    project.currentBranch || project.branches[0],
    project.path,
  ]
    .map(part => part?.trim())
    .filter((part, index, parts): part is string => Boolean(part && parts.indexOf(part) === index))
    .join(' - ')
}

function searchableKeywords(values: unknown[]): string[] {
  const keywords: string[] = []
  const seen = new Set<string>()
  const add = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const nested of value) add(nested)
      return
    }
    if (typeof value !== 'string') return
    const keyword = value.trim()
    if (!keyword) return
    const key = keyword.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    keywords.push(keyword)
  }
  for (const value of values) add(value)
  return keywords
}

function chatSessionKeywords(session: HermesSession): string[] {
  return searchableKeywords([
    session.key,
    session.agentKey,
    sessionProjectId(session),
    sessionProjectName(session),
    sessionWorkingDir(session),
    sessionProjectRoot(session),
    sessionEnvironmentId(session),
    session.branch,
    session.runtime,
  ])
}

function projectKeywords(project: ChatWorkspaceProject): string[] {
  const repository = project.repositoryIdentity
  return searchableKeywords([
    project.id,
    project.path,
    project.root,
    project.environmentId,
    project.machineLabel,
    project.machine,
    project.host,
    project.group,
    repository?.canonicalKey,
    repository?.rootPath,
    repository?.displayName,
    repository?.name,
    repository?.owner,
    repository?.remoteName,
    repository?.remoteUrl,
    project.branches,
    project.currentBranch,
  ])
}

function chatProjectPath(project: ChatWorkspaceProject): string {
  const params = new URLSearchParams()
  params.set('new', '1')
  setProjectRouteParams(params, project, {
    branch: project.currentBranch || project.branches[0] || undefined,
  })
  return `/chat?${params.toString()}`
}

function projectFromSessionRouteMetadata(session: HermesSession): ChatWorkspaceProject | null {
  const path = sessionWorkingDir(session) || sessionProjectRoot(session)
  if (!path) return null
  const branch = typeof session.branch === 'string' && session.branch.trim()
    ? session.branch.trim()
    : ''
  return {
    id: sessionProjectId(session),
    environmentId: sessionEnvironmentId(session),
    name: sessionProjectName(session) || projectLastPathSegment(path) || 'Project',
    path,
    root: sessionProjectRoot(session) || path,
    branches: branch ? [branch] : ['main'],
    currentBranch: branch || 'main',
  }
}

function chatSessionProjectPath(session: HermesSession, project: ChatWorkspaceProject | null): string {
  const environmentId = session.environmentId?.trim() || null
  const path = chatSessionPath(session.key, environmentId)
  if (!project) return path

  const [pathname, search = ''] = path.split('?')
  const params = new URLSearchParams(search)
  const branch = typeof session.branch === 'string' && session.branch.trim()
    ? session.branch.trim()
    : (project.currentBranch || project.branches[0] || undefined)
  const runtime = typeof session.runtime === 'string' && session.runtime.trim()
    ? session.runtime.trim()
    : undefined
  setProjectRouteParams(params, project, { branch, runtime })
  return `${pathname}?${params.toString()}`
}


/* ─── Component ────────────────────────────────────────────────────────── */

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [searchResults, setSearchResults] = useState<PaletteItem[]>([])
  const [recentChatSessions, setRecentChatSessions] = useState<HermesSession[]>([])
  const [workspaceProjects, setWorkspaceProjects] = useState<ChatWorkspaceProject[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouterNavigate()
  const location = useLocation()
  const trapRef = useFocusTrap(open)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      // Focus input after portal renders
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    api.get<GatewaySessionsResponse>('/api/gateway/sessions?includeUnscoped=1')
      .then((response) => {
        if (cancelled) return
        const sessions = attachChatSessionProjectRefs(response.sessions ?? [], loadChatSessionProjectRefs())
          .filter((session) => session.key?.trim())
          .sort(compareChatSessions)
        setRecentChatSessions(sessions)
      })
      .catch(() => {
        if (!cancelled) setRecentChatSessions([])
      })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    loadChatWorkspaceContext()
      .then((response) => {
        if (cancelled) return
        const normalized = normalizeWorkspaceContext(response)
        const merged = mergeWorkspaceProjects(normalized, loadAddedProjects())
        setWorkspaceProjects(
          merged.projects
            .filter((project) => project.path.trim()),
        )
      })
      .catch(() => {
        if (!cancelled) setWorkspaceProjects([])
      })

    return () => {
      cancelled = true
    }
  }, [open])

  // Debounced global search via API
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      try {
        const musicPromise = KOEL_SEARCH_ENABLED
          ? api.get<{ data: KoelSearchResults }>(
              `/api/koel/search?q=${encodeURIComponent(query.trim())}`
            ).catch(() => null)
          : Promise.resolve(null)

        const data = await api.get<Record<string, unknown[]>>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        const results: PaletteItem[] = []
        const iconMap: Record<string, React.ReactNode> = {
          todos: <CheckSquare size={16} />,
          missions: <Target size={16} />,
          events: <CalendarDots size={16} />,
          emails: <Envelope size={16} />,
          reminders: <Bell size={16} />,
          knowledge: <BookOpen size={16} />,
          notes: <FileText size={16} />,
        }
        const routeMap: Record<string, string> = {
          todos: '/todos',
          missions: '/missions',
          events: '/calendar',
          emails: '/email',
          reminders: '/reminders',
          knowledge: '/knowledge',
          notes: '/notes',
        }
        for (const [type, items] of Object.entries(data)) {
          if (!Array.isArray(items)) continue
          for (const item of items) {
            const r = item as Record<string, unknown>
            const label = String(r.title || r.text || r.subject || r.name || '')
            if (!label) continue
            results.push({
              id: `search-${type}-${r.id || label}`,
              label,
              icon: iconMap[type] || <MagnifyingGlass size={16} />,
              hint: type,
              action: () => { router(routeMap[type] || '/'); onClose() },
              category: 'search',
            })
          }
        }

        // Merge music results from Koel
        const musicData = await musicPromise
        if (musicData?.data) {
          const { songs, albums } = musicData.data
          for (const song of (songs || []).slice(0, 5)) {
            results.push({
              id: `music-song-${song.id}`,
              label: song.title,
              icon: <MusicNote size={16} />,
              hint: song.artist?.name || 'music',
              action: () => {
                api.post<{ url: string }>(`/api/koel/play/${song.id}`)
                  .then(r => { window.open(r.url, '_blank') })
                  .catch(() => {})
                onClose()
              },
              category: 'search',
            })
          }
          for (const album of (albums || []).slice(0, 3)) {
            results.push({
              id: `music-album-${album.id}`,
              label: album.name,
              icon: <MusicNote size={16} />,
              hint: `${album.artist?.name || ''} album`.trim(),
              action: () => { onClose() },
              category: 'search',
            })
          }
        }

        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, router, onClose])

  const navigate = useCallback(
    (href: string) => {
      router(href)
      onClose()
    },
    [router, onClose],
  )

  const startNewChat = useCallback(() => {
    saveSelectedChatSessionKey(null)
    notifyChatSessionsChanged({ sessionKey: null })
    router(chatSessionPath(null))
    onClose()
  }, [router, onClose])

  const openChatSession = useCallback((session: HermesSession) => {
    const environmentId = session.environmentId?.trim() || null
    const project = findProjectForSession(workspaceProjects, session) ?? projectFromSessionRouteMetadata(session)
    saveSelectedChatSessionKey(session.key, environmentId)
    notifyChatSessionsChanged({ sessionKey: session.key, environmentId })
    router(chatSessionProjectPath(session, project))
    onClose()
  }, [router, onClose, workspaceProjects])

  const openWorkspaceProject = useCallback((project: ChatWorkspaceProject) => {
    saveSelectedChatSessionKey(null)
    notifyChatSessionsChanged({ sessionKey: null })
    router(chatProjectPath(project))
    onClose()
  }, [router, onClose])

  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)
  const recentConvs = useSyncExternalStore(subscribeRecent, getRecentSnapshot)
  const themeState = useThemeState()
  const isOnMessages = location.pathname === '/messages'
  const sortedWorkspaceProjects = useMemo(
    () => [...workspaceProjects]
      .sort((left, right) => compareWorkspaceProjects(left, right, recentChatSessions)),
    [workspaceProjects, recentChatSessions],
  )

  const items: PaletteItem[] = useMemo(() => {
    const hasQuery = Boolean(query.trim())
    // Build route->shortcut map from keybindings
    const routeShortcuts: Record<string, string> = {}
    for (const b of bindings) {
      if (b.route) {
        routeShortcuts[b.route] = formatKey(b).join(' ')
      }
    }

    const pages: PaletteItem[] = allNavItems.map((nav) => {
      const Icon = nav.icon
      return {
        id: `page-${nav.href}`,
        label: nav.label,
        icon: <Icon size={16} />,
        action: () => navigate(nav.href),
        shortcut: routeShortcuts[nav.href],
        category: 'page' as const,
      }
    })

    const actions: PaletteItem[] = [
      {
        id: 'action-new-chat',
        label: 'New chat',
        icon: <ChatText size={16} />,
        action: startNewChat,
        category: 'action',
      },
      {
        id: 'action-add-chat-project',
        label: 'Add project folder',
        icon: <FolderPlus size={16} />,
        action: () => {
          router('/chat?addProject=1')
          onClose()
        },
        hint: 'chat',
        category: 'action',
      },
      {
        id: 'action-new-message',
        label: 'New message',
        icon: <NotePencil size={16} />,
        action: () => {
          // Navigate to messages with compose=1 query param
          router('/messages?compose=1')
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action-chat-providers',
        label: 'Hermes models',
        icon: <ChatText size={16} />,
        action: () => navigate('/settings?section=providers'),
        hint: 'settings',
        category: 'action',
      },
      {
        id: 'action-chat-usage',
        label: 'Hermes usage',
        icon: <Target size={16} />,
        action: () => navigate('/settings?section=usage'),
        hint: 'settings',
        category: 'action',
      },
      {
        id: 'action-hermes-agent-settings',
        label: 'Hermes Agent settings',
        icon: <Gear size={16} />,
        action: () => navigate('/settings?section=hermes-agent'),
        hint: 'settings',
        category: 'action',
      },
      {
        id: 'action-new-todo',
        label: 'New todo',
        icon: <CheckSquare size={16} />,
        action: () => {
          router('/todos?focus=add')
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action-new-mission',
        label: 'New Mission',
        icon: <Plus size={16} />,
        action: () => navigate('/missions'),
        category: 'action',
      },
      {
        id: 'action-toggle-theme',
        label: 'Toggle theme',
        icon: themeState.mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        action: () => {
          cycleThemeMode()
          onClose()
        },
        hint: themeState.mode,
        category: 'action',
      },
      {
        id: 'action-toggle-dnd',
        label: 'Toggle Do Not Disturb',
        icon: <BellSlash size={16} />,
        action: () => {
          toggleDnd()
          onClose()
        },
        hint: isDndEnabled() ? 'on' : 'off',
        category: 'action',
      },
      {
        id: 'action-mark-all-read',
        label: 'Mark all notifications read',
        icon: <Checks size={16} />,
        action: () => {
          markAllRead()
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action-export-settings',
        label: 'Export settings',
        icon: <DownloadSimple size={16} />,
        action: () => {
          exportSettings()
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action-settings',
        label: 'Go to Gear',
        icon: <Gear size={16} />,
        action: () => navigate('/settings'),
        shortcut: 'G S',
        category: 'action',
      },
    ]

    const visibleChatSessions = hasQuery ? recentChatSessions : recentChatSessions.slice(0, 6)
    const chatSessions: PaletteItem[] = visibleChatSessions.map((session) => ({
      id: `chat-session-${session.environmentId || 'default'}-${session.key}`,
      label: session.label || session.key,
      icon: <ChatText size={16} />,
      hint: chatSessionHint(session),
      keywords: chatSessionKeywords(session),
      action: () => openChatSession(session),
      category: isPinnedChatSession(session) ? 'pinned-chat' as const : 'chat' as const,
    }))

    const visibleProjects = hasQuery ? sortedWorkspaceProjects : sortedWorkspaceProjects.slice(0, 8)
    const projects: PaletteItem[] = visibleProjects.map((project) => ({
      id: `project-${project.environmentId || 'local'}-${project.id || project.path}`,
      label: project.name || projectLastPathSegment(project.path) || 'Project',
      icon: <FolderOpen size={16} />,
      hint: projectHint(project),
      keywords: projectKeywords(project),
      action: () => openWorkspaceProject(project),
      category: 'project' as const,
    }))

    // Build conversation items when on Messages page
    const conversations: PaletteItem[] = isOnMessages
      ? recentConvs.map((conv) => ({
          id: `conv-${conv.guid}`,
          label: formatContactLabel(conv),
          icon: <ChatText size={16} />,
          hint: conv.lastMessage
            ? conv.lastMessage.length > 40
              ? conv.lastMessage.slice(0, 40) + '...'
              : conv.lastMessage
            : undefined,
          action: () => {
            // Navigate to messages with the conversation selected
            router(`/messages?open=${encodeURIComponent(conv.guid)}`)
            onClose()
          },
          category: 'conversation' as const,
        }))
      : []

    return [...pages, ...actions, ...projects, ...chatSessions, ...conversations]
  }, [navigate, bindings, isOnMessages, query, recentConvs, recentChatSessions, sortedWorkspaceProjects, openChatSession, openWorkspaceProject, router, onClose, startNewChat, themeState.mode])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (item.label.toLowerCase().includes(q)) return true
      if (item.hint && item.hint.toLowerCase().includes(q)) return true
      if (item.keywords?.some((keyword) => keyword.toLowerCase().includes(q))) return true
      return false
    })
  }, [query, items])

  // Group by category for display
  const groupedPages = useMemo(
    () => filtered.filter((i) => i.category === 'page'),
    [filtered],
  )
  const groupedActions = useMemo(
    () => filtered.filter((i) => i.category === 'action'),
    [filtered],
  )
  const groupedChatSessions = useMemo(
    () => filtered.filter((i) => i.category === 'chat'),
    [filtered],
  )
  const groupedPinnedChatSessions = useMemo(
    () => filtered.filter((i) => i.category === 'pinned-chat'),
    [filtered],
  )
  const groupedProjects = useMemo(
    () => filtered.filter((i) => i.category === 'project'),
    [filtered],
  )
  const groupedConversations = useMemo(
    () => filtered.filter((i) => i.category === 'conversation'),
    [filtered],
  )

  // Flat list for keyboard navigation
  const flatList = useMemo(
    () => [...groupedPages, ...groupedActions, ...groupedConversations, ...groupedProjects, ...groupedPinnedChatSessions, ...groupedChatSessions, ...searchResults],
    [groupedPages, groupedActions, groupedConversations, groupedProjects, groupedPinnedChatSessions, groupedChatSessions, searchResults],
  )

  // Clamp selected index when list changes
  useEffect(() => {
    setSelectedIdx((prev) => Math.min(prev, Math.max(0, flatList.length - 1)))
  }, [flatList.length])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(
      `[data-idx="${selectedIdx}"]`,
    ) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIdx])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, flatList.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (flatList[selectedIdx]) {
          flatList[selectedIdx].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  if (!open || !mounted) return null

  let flatIdx = 0

  return createPortal(
    <>
      <style>{`
        @keyframes cp-fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cp-scalein {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: query.trim() ? 'var(--overlay-heavy)' : 'var(--overlay)',
          backdropFilter: query.trim() ? 'blur(16px)' : 'blur(8px)',
          WebkitBackdropFilter: query.trim() ? 'blur(16px)' : 'blur(8px)',
          zIndex: 'var(--z-modal-backdrop)' as React.CSSProperties['zIndex'],
          animation: 'cp-fadein 0.15s ease',
          transition: 'backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease, background 0.3s ease',
        }}
      />

      {/* Modal */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-title"
        data-testid="command-palette"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '560px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '460px',
          background: 'var(--bg-modal)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid var(--hover-bg-bright)',
          borderRadius: '16px',
          boxShadow:
            '0 24px 80px var(--overlay-heavy), 0 0 0 1px var(--bg-white-04)',
          zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'],
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'cp-scalein 0.2s var(--ease-spring)',
        }}
      >
        {/* MagnifyingGlass input */}
        <span id="cp-title" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
          Command Palette
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderBottom: '1px solid var(--active-bg)',
            flexShrink: 0,
          }}
        >
          <MagnifyingGlass
            size={16}
            style={{ color: 'var(--text-muted)', flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIdx(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search everything..."
            aria-label="Command palette search"
            role="combobox"
            aria-expanded={true}
            aria-controls="cp-results"
            aria-activedescendant={selectedIdx >= 0 ? `cp-result-${selectedIdx}` : undefined}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '15px',
              fontWeight: 450,
              caretColor: 'var(--accent)',
            }}
          />
          <kbd
            style={{
              padding: '2px 6px',
              borderRadius: '5px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              background: 'var(--active-bg)',
              border: '1px solid var(--hover-bg-bright)',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="cp-results"
          role="listbox"
          aria-live="polite"
          style={{
            overflowY: 'auto',
            flex: 1,
            padding: '6px 0',
          }}
        >
          {flatList.length === 0 && !searching && (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              {query.trim() ? <>No results for &ldquo;{query}&rdquo;</> : 'Start typing to search...'}
            </div>
          )}
          {flatList.length === 0 && searching && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <SpinnerGap size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Searching...
            </div>
          )}

          {groupedPages.length > 0 && (
            <div>
              <div
                style={{
                  padding: '8px 18px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid var(--bg-white-04)',
                  marginBottom: '2px',
                }}
              >
                {query.trim() ? 'Pages' : 'All Pages'}
              </div>
              {groupedPages.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}

          {groupedActions.length > 0 && (
            <div>
              <div
                style={{
                  padding:
                    groupedPages.length > 0
                      ? '12px 18px 6px'
                      : '8px 18px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderTop:
                    groupedPages.length > 0
                      ? '1px solid var(--bg-white-04)'
                      : undefined,
                  borderBottom: '1px solid var(--bg-white-04)',
                  marginBottom: '2px',
                }}
              >
                Actions
              </div>
              {groupedActions.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}

          {groupedConversations.length > 0 && (
            <div>
              <div
                style={{
                  padding:
                    (groupedPages.length > 0 || groupedActions.length > 0)
                      ? '12px 18px 6px'
                      : '8px 18px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderTop:
                    (groupedPages.length > 0 || groupedActions.length > 0)
                      ? '1px solid var(--bg-white-04)'
                      : undefined,
                  borderBottom: '1px solid var(--bg-white-04)',
                  marginBottom: '2px',
                }}
              >
                Recent Conversations
              </div>
              {groupedConversations.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}

          {groupedProjects.length > 0 && (
            <div>
              <div
                style={{
                  padding:
                    (groupedPages.length > 0 || groupedActions.length > 0)
                      ? '12px 18px 6px'
                      : '8px 18px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderTop:
                    (groupedPages.length > 0 || groupedActions.length > 0)
                      ? '1px solid var(--bg-white-04)'
                      : undefined,
                  borderBottom: '1px solid var(--bg-white-04)',
                  marginBottom: '2px',
                }}
              >
                Projects
              </div>
              {groupedProjects.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}

          {groupedPinnedChatSessions.length > 0 && (
            <div>
              <div
                style={{
                  padding:
                    (groupedPages.length > 0 || groupedActions.length > 0 || groupedProjects.length > 0)
                      ? '12px 18px 6px'
                      : '8px 18px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderTop:
                    (groupedPages.length > 0 || groupedActions.length > 0 || groupedProjects.length > 0)
                      ? '1px solid var(--bg-white-04)'
                      : undefined,
                  borderBottom: '1px solid var(--bg-white-04)',
                  marginBottom: '2px',
                }}
              >
                Pinned Chats
              </div>
              {groupedPinnedChatSessions.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}

          {groupedChatSessions.length > 0 && (
            <div>
              <div
                style={{
                  padding:
                    (groupedPages.length > 0 || groupedActions.length > 0 || groupedProjects.length > 0 || groupedPinnedChatSessions.length > 0)
                      ? '12px 18px 6px'
                      : '8px 18px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderTop:
                    (groupedPages.length > 0 || groupedActions.length > 0 || groupedProjects.length > 0 || groupedPinnedChatSessions.length > 0)
                      ? '1px solid var(--bg-white-04)'
                      : undefined,
                  borderBottom: '1px solid var(--bg-white-04)',
                  marginBottom: '2px',
                }}
              >
                Recent Chats
              </div>
              {groupedChatSessions.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}

          {/* Global search results */}
          {(searchResults.length > 0 || searching) && (
            <div>
              <div
                style={{
                  padding: flatIdx > 0 ? '12px 18px 6px' : '8px 18px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderTop: flatIdx > 0 ? '1px solid var(--bg-white-04)' : undefined,
                  borderBottom: '1px solid var(--bg-white-04)',
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                Results
                {searching && <SpinnerGap size={10} style={{ animation: 'spin 1s linear infinite' }} />}
              </div>
              {searchResults.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div
          style={{
            padding: '8px 18px',
            borderTop: '1px solid var(--active-bg)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <span>
            <kbd style={kbdSmall}>&#8593;&#8595;</kbd> navigate
          </span>
          <span>
            <kbd style={kbdSmall}>&#8629;</kbd> open
          </span>
          <span>
            <kbd style={kbdSmall}>esc</kbd> close
          </span>
        </div>
      </div>
    </>,
    document.body,
  )
}

function PaletteRow({
  item,
  active,
  dataIdx,
  onMouseEnter,
  onClick,
}: {
  item: PaletteItem
  active: boolean
  dataIdx: number
  onMouseEnter: () => void
  onClick: () => void
}) {
  return (
    <div
      data-idx={dataIdx}
      role="option"
      id={`cp-result-${dataIdx}`}
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 18px',
        margin: '0 6px',
        borderRadius: '10px',
        cursor: 'pointer',
        background: active ? 'var(--purple-a10)' : 'transparent',
        transition: 'background 0.15s ease, transform 0.15s var(--ease-spring)',
        transform: active ? 'translateX(1px)' : 'translateX(0)',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: active
            ? 'var(--purple-a15)'
            : 'var(--bg-white-04)',
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      >
        {item.icon || <ArrowRight size={14} />}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: '13px',
          fontWeight: active ? 500 : 400,
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          transition: 'color 0.1s ease',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </span>
      {item.hint && !item.shortcut && (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            flexShrink: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '180px',
          }}
        >
          {item.hint}
        </span>
      )}
      {item.shortcut && (
        <span
          style={{
            display: 'flex',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          {item.shortcut.split(' ').map((key, i) => (
            <kbd key={i} style={kbdHint}>
              {key}
            </kbd>
          ))}
        </span>
      )}
    </div>
  )
}

const kbdHint: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '20px',
  height: '20px',
  padding: '0 5px',
  borderRadius: '5px',
  fontSize: '11px',
  fontWeight: 500,
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--text-muted)',
  background: 'var(--active-bg)',
  border: '1px solid var(--hover-bg-bright)',
  lineHeight: 1,
}

const kbdSmall: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  borderRadius: '4px',
  fontSize: '10px',
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--text-muted)',
  background: 'var(--active-bg)',
  border: '1px solid var(--active-bg)',
  marginRight: '4px',
  lineHeight: 1.5,
}
