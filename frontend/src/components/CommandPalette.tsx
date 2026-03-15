


import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate as useRouterNavigate, useLocation } from 'react-router-dom'
import {
  Search, Plus, Settings, ArrowRight, PenSquare, CheckSquare,
  Sun, Moon, BellOff, CheckCheck, Download, MessageSquare,
  Target, CalendarDays, Mail, Bell, BookOpen, Loader2,
} from 'lucide-react'
import { allNavItems } from '@/lib/nav-items'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { getKeybindings, subscribeKeybindings, formatKey } from '@/lib/keybindings'
import { markAllRead } from '@/components/NotificationCenter'
import { formatContactLabel } from '@/lib/utils'
import { api } from '@/lib/api'

interface PaletteItem {
  id: string
  label: string
  icon?: React.ReactNode
  action: () => void
  shortcut?: string
  category: 'page' | 'action' | 'conversation' | 'search'
  /** Optional secondary text shown dimmer to the right of the label */
  hint?: string
}

/* ─── Theme helpers (mirror Settings page logic) ───────────────────────── */

function getStoredTheme(): 'dark' | 'light' | 'system' {
  try {
    const raw = localStorage.getItem('theme')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed === 'dark' || parsed === 'light' || parsed === 'system') return parsed
    }
  } catch { /* ignore */ }
  return 'dark'
}

function cycleTheme(): string {
  const order: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system']
  const current = getStoredTheme()
  const next = order[(order.indexOf(current) + 1) % order.length]
  localStorage.setItem('theme', JSON.stringify(next))
  const resolved: 'dark' | 'light' = next === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : next
  document.documentElement.dataset.theme = resolved
  return next
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

/* ─── Settings export (matches Settings page) ─────────────────────────── */

function exportSettings() {
  const KNOWN_PREFIXES = [
    'dnd-enabled', 'system-notifs', 'in-app-notifs', 'notif-sound',
    'title-bar-visible', 'sidebar-header-visible', 'user-name', 'user-avatar',
    'app-version', 'keybindings', 'sidebar-collapsed', 'theme', 'enabled-modules',
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
  a.download = `mission-control-settings-${new Date().toISOString().slice(0, 10)}.json`
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
let _recentListeners: Set<() => void> = new Set()

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
        const data = await api.get<Record<string, unknown[]>>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        const results: PaletteItem[] = []
        const iconMap: Record<string, React.ReactNode> = {
          todos: <CheckSquare size={16} />,
          missions: <Target size={16} />,
          calendar: <CalendarDays size={16} />,
          emails: <Mail size={16} />,
          reminders: <Bell size={16} />,
          knowledge: <BookOpen size={16} />,
        }
        const routeMap: Record<string, string> = {
          todos: '/todos',
          missions: '/missions',
          calendar: '/calendar',
          emails: '/email',
          reminders: '/reminders',
          knowledge: '/knowledge',
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
              icon: iconMap[type] || <Search size={16} />,
              hint: type,
              action: () => { router(routeMap[type] || '/'); onClose() },
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

  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)
  const recentConvs = useSyncExternalStore(subscribeRecent, getRecentSnapshot)
  const isOnMessages = location.pathname === '/messages'

  const items: PaletteItem[] = useMemo(() => {
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
        id: 'action-new-message',
        label: 'New message',
        icon: <PenSquare size={16} />,
        action: () => {
          // Navigate to messages with compose=1 query param
          router('/messages?compose=1')
          onClose()
        },
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
        icon: getStoredTheme() === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        action: () => {
          cycleTheme()
          onClose()
        },
        hint: getStoredTheme(),
        category: 'action',
      },
      {
        id: 'action-toggle-dnd',
        label: 'Toggle Do Not Disturb',
        icon: <BellOff size={16} />,
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
        icon: <CheckCheck size={16} />,
        action: () => {
          markAllRead()
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action-export-settings',
        label: 'Export settings',
        icon: <Download size={16} />,
        action: () => {
          exportSettings()
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action-settings',
        label: 'Go to Settings',
        icon: <Settings size={16} />,
        action: () => navigate('/settings'),
        shortcut: 'G S',
        category: 'action',
      },
    ]

    // Build conversation items when on Messages page
    const conversations: PaletteItem[] = isOnMessages
      ? recentConvs.map((conv) => ({
          id: `conv-${conv.guid}`,
          label: formatContactLabel(conv),
          icon: <MessageSquare size={16} />,
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

    return [...pages, ...actions, ...conversations]
  }, [navigate, bindings, isOnMessages, recentConvs, router, onClose])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter((item) => {
      if (item.label.toLowerCase().includes(q)) return true
      if (item.hint && item.hint.toLowerCase().includes(q)) return true
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
  const groupedConversations = useMemo(
    () => filtered.filter((i) => i.category === 'conversation'),
    [filtered],
  )

  // Flat list for keyboard navigation
  const flatList = useMemo(
    () => [...groupedPages, ...groupedActions, ...groupedConversations, ...searchResults],
    [groupedPages, groupedActions, groupedConversations, searchResults],
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
          background: query.trim() ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.5)',
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
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '560px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '460px',
          background: 'rgba(18, 18, 24, 0.96)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          boxShadow:
            '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04)',
          zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'],
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'cp-scalein 0.2s var(--ease-spring)',
        }}
      >
        {/* Search input */}
        <span id="cp-title" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
          Command Palette
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexShrink: 0,
          }}
        >
          <Search
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
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
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
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
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
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
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
                      ? '1px solid rgba(255, 255, 255, 0.04)'
                      : undefined,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
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
                      ? '1px solid rgba(255, 255, 255, 0.04)'
                      : undefined,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
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
                  borderTop: flatIdx > 0 ? '1px solid rgba(255, 255, 255, 0.04)' : undefined,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                Results
                {searching && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />}
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
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
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
        background: active ? 'rgba(167, 139, 250, 0.1)' : 'transparent',
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
            ? 'rgba(167, 139, 250, 0.15)'
            : 'rgba(255, 255, 255, 0.04)',
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
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
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
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  marginRight: '4px',
  lineHeight: 1.5,
}
