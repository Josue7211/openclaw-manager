import React, { useState, useCallback, useRef, useMemo, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, ChevronDown, Settings, Plus, StickyNote, CheckSquare, Lightbulb, Flag } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import GlobalSearch from './GlobalSearch'
import { NotificationBell } from './NotificationCenter'
import { personalDashboardItems, agentDashboardItems, type NavItem } from '@/lib/nav-items'
import { subscribeSidebarSettings, getSidebarHeaderVisible } from '@/lib/sidebar-settings'
import { subscribeModules, getEnabledModules } from '@/lib/modules'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/lib/api'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SidebarProps {
  width: number
  onWidthChange: (w: number) => void
  draggingRef: React.MutableRefObject<boolean>
}

type CaptureType = 'note' | 'task' | 'idea' | 'decision'

const CAPTURE_TYPES: { type: CaptureType; label: string; icon: React.ElementType }[] = [
  { type: 'note', label: 'Note', icon: StickyNote },
  { type: 'task', label: 'Task', icon: CheckSquare },
  { type: 'idea', label: 'Idea', icon: Lightbulb },
  { type: 'decision', label: 'Decision', icon: Flag },
]

const PREFETCH_ROUTES: Record<string, { key: readonly string[]; path: string }> = {
  '/': { key: queryKeys.todos, path: '/api/todos' },
  '/missions': { key: queryKeys.missions, path: '/api/missions' },
  '/settings': { key: queryKeys.prefs, path: '/api/prefs' },
}

/* ─── NavSection (memoized) ──────────────────────────────────────────────── */

const NavSection = React.memo(function NavSection({
  label,
  items,
  pathname,
  collapsed,
  textOpacity,
  open,
  onToggle,
  onHoverItem,
  delayOffset = 0,
}: {
  label: string
  items: NavItem[]
  pathname: string
  collapsed: boolean
  textOpacity: number
  open: boolean
  onToggle: () => void
  onHoverItem: (href: string) => void
  delayOffset?: number
}) {
  return (
    <div style={{ marginBottom: '8px' }}>
      {!collapsed && (
        <button
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            borderRadius: '8px',
            transition: `color var(--duration-fast)`,
            opacity: textOpacity,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {label}
          <span style={{
            transition: 'transform 0.3s var(--ease-spring)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            display: 'flex',
          }}>
            <ChevronDown size={12} />
          </span>
        </button>
      )}
      <div style={{
        display: 'grid',
        gridTemplateRows: (open || collapsed) ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--duration-normal) var(--ease-spring)',
        overflow: 'hidden',
      }}>
        <div style={{ overflow: 'hidden' }}>
          {items.map(({ href, label: itemLabel, icon: Icon }, idx) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                to={href}
                title={collapsed ? itemLabel : undefined}
                onMouseEnter={e => {
                  onHoverItem(href)
                  if (!active) {
                    e.currentTarget.style.background = 'var(--hover-bg)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                    e.currentTarget.style.transform = 'translateX(2px)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                    e.currentTarget.style.transform = 'translateX(0)'
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: collapsed ? '10px 0' : '9px 16px',
                  borderRadius: '10px',
                  marginBottom: '2px',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  background: active ? 'var(--active-bg)' : 'transparent',
                  border: 'none',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 450,
                  transition: `all 0.25s var(--ease-spring)`,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  position: 'relative',
                  animation: `fadeInUp 0.4s var(--ease-spring) ${(delayOffset + idx) * 30}ms both`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {/* Active indicator bar */}
                {active && (
                  <span style={{
                    position: 'absolute',
                    left: collapsed ? '50%' : '0',
                    top: collapsed ? 'auto' : '50%',
                    bottom: collapsed ? '-2px' : 'auto',
                    transform: collapsed ? 'translateX(-50%)' : 'translateY(-50%)',
                    width: collapsed ? '16px' : '3px',
                    height: collapsed ? '3px' : '16px',
                    borderRadius: '100px',
                    background: 'var(--accent)',
                    boxShadow: '0 0 12px rgba(167, 139, 250, 0.4)',
                    transition: `all 0.3s var(--ease-spring)`,
                  }} />
                )}
                <Icon size={16} style={{
                  flexShrink: 0,
                  color: active ? 'var(--accent)' : undefined,
                  transition: `color var(--duration-fast)`,
                }} />
                {!collapsed && (
                  <span style={{ opacity: textOpacity, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {itemLabel}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
})

/* ─── SidebarQuickCapture (memoized) ─────────────────────────────────────── */

const SidebarQuickCapture = React.memo(function SidebarQuickCapture({
  collapsed,
  textOpacity,
}: {
  collapsed: boolean
  textOpacity: number
}) {
  const [open, setOpen] = useState(false)
  const [captureType, setCaptureType] = useState<CaptureType>('note')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSave = useCallback(async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await api.post('/api/capture', { type: captureType, content: text.trim() })
      setText('')
      setOpen(false)
    } catch {
      // Silently fail -- offline queue will handle retry
    } finally {
      setSaving(false)
    }
  }, [text, captureType, saving])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }, [handleSave])

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setOpen(o => !o)
          setTimeout(() => inputRef.current?.focus(), 100)
        }}
        title={collapsed ? 'Quick Capture' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: collapsed ? '10px 0' : '9px 16px',
          background: open ? 'var(--active-bg)' : 'transparent',
          border: 'none',
          borderRadius: '10px',
          color: open ? '#fff' : 'var(--text-secondary)',
          cursor: 'pointer',
          transition: `all 0.25s var(--ease-spring)`,
          fontSize: '13px',
          fontWeight: open ? 600 : 450,
          justifyContent: collapsed ? 'center' : 'flex-start',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          outline: 'none',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = 'var(--hover-bg)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = open ? 'var(--active-bg)' : 'transparent'
          e.currentTarget.style.color = open ? '#fff' : 'var(--text-secondary)'
        }}
      >
        <Plus size={16} style={{ flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ opacity: textOpacity, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Quick Capture
          </span>
        )}
      </button>

      {/* Inline capture form */}
      {open && !collapsed && (
        <div style={{
          padding: '8px',
          animation: 'fadeInUp 0.2s var(--ease-spring)',
        }}>
          {/* Type selector */}
          <div style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '8px',
          }}>
            {CAPTURE_TYPES.map(({ type, label, icon: CIcon }) => (
              <button
                key={type}
                onClick={() => setCaptureType(type)}
                title={label}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '4px 6px',
                  background: captureType === type ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                  border: `1px solid ${captureType === type ? 'var(--border-accent)' : 'var(--border)'}`,
                  borderRadius: '6px',
                  color: captureType === type ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                  transition: `all var(--duration-fast) var(--ease-spring)`,
                }}
              >
                <CIcon size={11} />
              </button>
            ))}
          </div>
          {/* Input */}
          <div style={{
            display: 'flex',
            gap: '6px',
          }}>
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`New ${captureType}...`}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none',
                minWidth: 0,
              }}
            />
            <button
              onClick={handleSave}
              disabled={!text.trim() || saving}
              style={{
                padding: '6px 10px',
                background: text.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                border: 'none',
                borderRadius: '8px',
                color: text.trim() ? '#fff' : 'var(--text-muted)',
                cursor: text.trim() ? 'pointer' : 'default',
                fontSize: '11px',
                fontWeight: 600,
                transition: `all var(--duration-fast) var(--ease-spring)`,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

/* ─── Typewriter title ───────────────────────────────────────────────────── */

function TypewriterTitle({ width }: { width: number }) {
  const text = 'MISSION\nCONTROL'
  // Characters revealed based on width: 0 at 80px, full at 200px
  const progress = Math.min(1, Math.max(0, (width - 80) / 120))
  const totalChars = text.replace('\n', '').length
  const visibleCount = Math.floor(progress * totalChars)

  // Split into lines
  const line1 = 'MISSION'
  const line2 = 'CONTROL'
  const line1Visible = Math.min(visibleCount, line1.length)
  const line2Visible = Math.max(0, visibleCount - line1.length)

  const showCursor = progress > 0 && progress < 1

  return (
    <div style={{
      fontSize: '22px',
      fontWeight: 700,
      fontFamily: "'Bitcount Prop Double', monospace",
      color: 'var(--text-primary)',
      letterSpacing: '0.08em',
      lineHeight: 0.9,
      whiteSpace: 'pre',
    }}>
      {line1.slice(0, line1Visible)}
      {line1Visible < line1.length && showCursor && <span className="type-cursor">|</span>}
      {line1Visible === line1.length && (
        <>
          {'\n'}
          {line2.slice(0, line2Visible)}
          {line2Visible < line2.length && showCursor && <span className="type-cursor">|</span>}
        </>
      )}
    </div>
  )
}

/* ─── Gradient divider ───────────────────────────────────────────────────── */

function SectionDivider({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null
  return (
    <div style={{
      height: '1px',
      margin: '4px 12px',
      background: 'linear-gradient(to right, transparent, var(--border-hover), transparent)',
    }} />
  )
}

/* ─── Main Sidebar ───────────────────────────────────────────────────────── */

export default function Sidebar({ width, onWidthChange, draggingRef }: SidebarProps) {
  const { pathname } = useLocation()
  const queryClient = useQueryClient()

  const [agentOpen, setAgentOpen] = useState(true)
  const [personalOpen, setPersonalOpen] = useState(true)

  // External stores
  const headerVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarHeaderVisible)
  const enabledModules = useSyncExternalStore(subscribeModules, getEnabledModules)

  // Derived state
  const collapsed = width <= 64
  const textOpacity = Math.min(1, Math.max(0, (width - 80) / 80))

  // Filter nav items by enabled modules
  const filteredPersonal = useMemo(
    () => personalDashboardItems.filter(item => !item.moduleId || enabledModules.includes(item.moduleId)),
    [enabledModules],
  )
  const filteredAgent = useMemo(
    () => agentDashboardItems.filter(item => !item.moduleId || enabledModules.includes(item.moduleId)),
    [enabledModules],
  )

  /* ── Resize handle ─────────────────────────────────────────────────────── */

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const startX = e.clientX
    const startWidth = width

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidth = Math.max(64, Math.min(320, startWidth + delta))
      onWidthChange(newWidth)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', function handleUp(ev: MouseEvent) {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      // Snap: if released below 110px, snap to 64px
      const delta = ev.clientX - startX
      const finalWidth = Math.max(64, Math.min(320, startWidth + delta))
      if (finalWidth < 110) {
        onWidthChange(64)
      } else {
        onWidthChange(finalWidth)
      }
    })
  }, [width, onWidthChange, draggingRef])

  /* ── Prefetch on hover ─────────────────────────────────────────────────── */

  const handleHoverItem = useCallback((href: string) => {
    const config = PREFETCH_ROUTES[href]
    if (config) {
      queryClient.prefetchQuery({
        queryKey: config.key,
        queryFn: () => api.get(config.path),
        staleTime: 30_000,
      })
    }
  }, [queryClient])

  /* ── Collapse toggle ───────────────────────────────────────────────────── */

  const toggleCollapse = useCallback(() => {
    onWidthChange(collapsed ? 260 : 64)
  }, [collapsed, onWidthChange])

  /* ── Render ────────────────────────────────────────────────────────────── */

  const settingsActive = pathname === '/settings'

  return (
    <nav aria-label="Main navigation" style={{
      width: `${width}px`,
      minWidth: `${width}px`,
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      borderRight: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      transition: draggingRef.current ? 'none' : `width var(--duration-normal) var(--ease-spring), min-width var(--duration-normal) var(--ease-spring)`,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 100,
    }}>

      {/* ── Logo header ──────────────────────────────────────────────────── */}
      {headerVisible && (
        <header style={{
          padding: collapsed ? '6px 0' : '6px 16px',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          animation: 'fadeIn 0.5s ease both',
          flexShrink: 0,
        }}>
          <img
            src="/logo-40.png"
            alt="Mission Control"
            width={45}
            height={45}
            style={{
              flexShrink: 0,
              filter: 'drop-shadow(0 2px 8px rgba(167, 139, 250, 0.3))',
              transition: `transform 0.3s var(--ease-spring)`,
            }}
          />
          {!collapsed && (
            <div style={{
              animation: 'slideInLeft 0.3s var(--ease-spring) both',
              overflow: 'hidden',
            }}>
              <TypewriterTitle width={width} />
            </div>
          )}
        </header>
      )}

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div style={{
        padding: collapsed ? 0 : '8px 0 0',
        animation: 'fadeInUp 0.4s var(--ease-spring) 100ms both',
        flexShrink: 0,
      }}>
        <GlobalSearch compact collapsed={collapsed} />
      </div>

      {/* ── Scrollable nav items ─────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        padding: '12px 8px',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <NavSection
          label="Personal Dashboard"
          items={filteredPersonal}
          pathname={pathname}
          collapsed={collapsed}
          textOpacity={textOpacity}
          open={personalOpen}
          onToggle={() => setPersonalOpen(o => !o)}
          onHoverItem={handleHoverItem}
          delayOffset={0}
        />

        {/* Gradient divider */}
        <SectionDivider collapsed={collapsed} />

        <NavSection
          label="Agent Dashboard"
          items={filteredAgent}
          pathname={pathname}
          collapsed={collapsed}
          textOpacity={textOpacity}
          open={agentOpen}
          onToggle={() => setAgentOpen(o => !o)}
          onHoverItem={handleHoverItem}
          delayOffset={filteredPersonal.length}
        />
      </div>

      {/* ── Bottom section (non-scrollable) ──────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--glass-border)',
        padding: '8px 8px 0',
      }}>
        {/* Quick Capture */}
        <SidebarQuickCapture collapsed={collapsed} textOpacity={textOpacity} />

        {/* Notifications */}
        <NotificationBell collapsed={collapsed} textOpacity={textOpacity} />

        {/* Settings */}
        <Link
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          onMouseEnter={e => {
            handleHoverItem('/settings')
            if (!settingsActive) {
              e.currentTarget.style.background = 'var(--hover-bg)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }
          }}
          onMouseLeave={e => {
            if (!settingsActive) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: collapsed ? '10px 0' : '9px 16px',
            borderRadius: '10px',
            marginBottom: '4px',
            color: settingsActive ? '#fff' : 'var(--text-secondary)',
            background: settingsActive ? 'var(--active-bg)' : 'transparent',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: settingsActive ? 600 : 450,
            transition: `all 0.25s var(--ease-spring)`,
            justifyContent: collapsed ? 'center' : 'flex-start',
            position: 'relative',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {settingsActive && (
            <span style={{
              position: 'absolute',
              left: collapsed ? '50%' : '0',
              top: collapsed ? 'auto' : '50%',
              bottom: collapsed ? '-2px' : 'auto',
              transform: collapsed ? 'translateX(-50%)' : 'translateY(-50%)',
              width: collapsed ? '16px' : '3px',
              height: collapsed ? '3px' : '16px',
              borderRadius: '100px',
              background: 'var(--accent)',
              boxShadow: '0 0 12px rgba(167, 139, 250, 0.4)',
            }} />
          )}
          <Settings size={16} style={{
            flexShrink: 0,
            color: settingsActive ? 'var(--accent)' : undefined,
            transition: `color var(--duration-fast)`,
          }} />
          {!collapsed && (
            <span style={{ opacity: textOpacity, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Settings
            </span>
          )}
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: '100%',
            margin: '4px 0 12px',
            padding: '8px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `all 0.25s var(--ease-spring)`,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.borderColor = 'var(--border-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <span style={{
            display: 'flex',
            transition: `transform 0.3s var(--ease-spring)`,
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          }}>
            <ChevronRight size={14} />
          </span>
        </button>
      </div>

      {/* ── Resize handle (right edge) ───────────────────────────────────── */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '5px',
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(167, 139, 250, 0.2)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }}
      />
    </nav>
  )
}
