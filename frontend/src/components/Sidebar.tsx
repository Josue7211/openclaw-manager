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
  width,
  open,
  onToggle,
  onHoverItem,
  isDragging,
  delayOffset = 0,
}: {
  label: string
  items: NavItem[]
  pathname: string
  collapsed: boolean
  textOpacity: number
  width: number
  open: boolean
  onToggle: () => void
  onHoverItem: (href: string) => void
  isDragging: boolean
  delayOffset?: number
}) {
  // Typewriter effect — calculate chars that physically fit in available space
  const labelCharWidth = 7 // ~10px uppercase font + letter-spacing
  const labelAvailable = Math.max(0, width - 40) // sidebar minus container + button padding
  const labelCharsVisible = Math.min(label.length, Math.floor(labelAvailable / labelCharWidth))
  const labelText = label.slice(0, labelCharsVisible)
  const labelIsTyping = labelCharsVisible > 0 && labelCharsVisible < label.length
  const chevronOpacity = Math.min(1, Math.max(0, (width - 180) / 40))
  // Slide up AFTER search finishes (search: 200→130, labels: 110→70)
  const labelOpacity = width >= 110 ? 1 : width <= 70 ? 0 : (width - 70) / 40
  const labelHeight = width >= 110 ? 36 : width <= 70 ? 0 : ((width - 70) / 40) * 36

  return (
    <div style={{ marginBottom: collapsed ? '2px' : '4px' }}>
      {/* Section label — slides up like search bar below 130px */}
      <div style={{
        height: `${labelHeight}px`,
        opacity: labelOpacity,
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
      }}>
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
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <span>
            {labelText}
            {labelIsTyping && <span className="type-cursor">|</span>}
          </span>
          {chevronOpacity > 0 && (
            <span style={{
              transition: isDragging ? 'none' : 'transform 0.3s var(--ease-spring), opacity 0.2s ease',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              display: 'flex',
              opacity: chevronOpacity,
            }}>
              <ChevronDown size={12} />
            </span>
          )}
        </button>
      </div>
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
                onMouseEnter={() => onHoverItem(href)}
                className="hover-bg"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 16px',
                  borderRadius: '10px',
                  marginBottom: '2px',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  background: active ? 'var(--active-bg)' : 'transparent',
                  border: 'none',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 450,
                  transition: isDragging ? 'none' : `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring), transform 0.25s var(--ease-spring)`,
                  justifyContent: 'flex-start',
                  position: 'relative',
                  animation: `fadeInUp 0.4s var(--ease-spring) ${(delayOffset + idx) * 30}ms both`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  pointerEvents: isDragging ? 'none' : 'auto',
                }}
              >
                <Icon size={16} style={{
                  flexShrink: 0,
                  transition: `color var(--duration-fast)`,
                }} />
                {textOpacity > 0 && (
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
          transition: `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)`,
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
        {textOpacity > 0 && (
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

function TypewriterTitle({ availableWidth }: { availableWidth: number }) {
  const text = 'MISSION CONTROL'
  // Calculate how many chars physically fit in the available pixel space
  const charWidth = 15 // conservative for Bitcount Prop Double at 22px + 0.08em spacing
  const visibleCount = Math.min(text.length, Math.max(0, Math.floor(availableWidth / charWidth)))
  const visibleText = text.slice(0, visibleCount)
  const showCursor = visibleCount > 0 && visibleCount < text.length

  if (visibleCount === 0) return null

  return (
    <div style={{
      fontSize: '22px',
      fontWeight: 700,
      fontFamily: "'Bitcount Prop Double', monospace",
      color: 'var(--text-primary)',
      letterSpacing: '0.08em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      {visibleText}
      {showCursor && <span className="type-cursor">|</span>}
    </div>
  )
}

/* ─── Gradient divider ───────────────────────────────────────────────────── */

function SectionDivider() {
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
  const [isDragging, setIsDragging] = useState(false)

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
    setIsDragging(true)
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
      // Brief delay before re-enabling pointer events to prevent instant hover flash
      setTimeout(() => setIsDragging(false), 100)
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
    onWidthChange(collapsed ? 320 : 64)
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
      display: 'flex',
      flexDirection: 'column',
      transition: draggingRef.current ? 'none' : `width var(--duration-normal) var(--ease-spring), min-width var(--duration-normal) var(--ease-spring)`,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 100,
      pointerEvents: isDragging ? 'none' : 'auto',
    }}>

      {/* ── Logo header ──────────────────────────────────────────────────── */}
      {headerVisible && (() => {
        // Logo always 45px, never shrinks or centers
        const titleAvailable = Math.max(0, width - 16 - 45 - 14) // padding(16) + logo(45) + gap+buffer(14)
        return (
          <header style={{
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'flex-start',
            animation: 'fadeIn 0.5s ease both',
            flexShrink: 0,
          }}>
            <img
              src="/logo-128.png"
              alt="Mission Control"
              width={45}
              height={45}
              style={{
                flexShrink: 0,
                width: '45px',
                height: '45px',
                minWidth: '45px',
                filter: 'drop-shadow(0 2px 8px rgba(167, 139, 250, 0.3))',
              }}
            />
            <div style={{
              overflow: 'hidden',
              minWidth: 0,
              flex: 1,
            }}>
              <TypewriterTitle availableWidth={titleAvailable} />
            </div>
          </header>
        )
      })()}

      {/* ── Search — slides up exactly like Messages ─────────────────────── */}
      {(() => {
        const searchOpacity = width >= 200 ? 1 : width <= 130 ? 0 : (width - 130) / 70
        const searchHeight = width >= 200 ? 46 : width <= 130 ? 0 : ((width - 130) / 70) * 46
        return (
          <div style={{
            height: `${searchHeight}px`,
            opacity: searchOpacity,
            overflow: 'hidden',
            transition: draggingRef.current ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
            flexShrink: 0,
            pointerEvents: searchOpacity === 0 ? 'none' : 'auto',
          }}>
            <GlobalSearch compact collapsed={collapsed} />
          </div>
        )
      })()}

      {/* ── Divider between header/search and nav items ────────────────── */}
      <div style={{
        height: '1px',
        margin: '4px 12px',
        background: 'linear-gradient(to right, transparent, var(--border-hover), transparent)',
        flexShrink: 0,
      }} />

      {/* ── Scrollable nav items ─────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        padding: collapsed ? '4px 8px' : '12px 8px',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: draggingRef.current ? 'none' : 'padding 0.25s var(--ease-spring)',
      }}>
        <NavSection
          label="Personal Dashboard"
          items={filteredPersonal}
          pathname={pathname}
          collapsed={collapsed}
          textOpacity={textOpacity}
          width={width}
          open={personalOpen}
          onToggle={() => setPersonalOpen(o => !o)}
          onHoverItem={handleHoverItem}
          isDragging={isDragging}
          delayOffset={0}
        />

        {/* Gradient divider */}
        <SectionDivider />

        <NavSection
          label="Agent Dashboard"
          items={filteredAgent}
          pathname={pathname}
          collapsed={collapsed}
          textOpacity={textOpacity}
          width={width}
          open={agentOpen}
          onToggle={() => setAgentOpen(o => !o)}
          onHoverItem={handleHoverItem}
          isDragging={isDragging}
          delayOffset={filteredPersonal.length}
        />
      </div>

      {/* ── Bottom section (non-scrollable) ──────────────────────────────── */}
      <div style={{
        flexShrink: 0,
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
            color: (settingsActive && !isDragging) ? '#fff' : 'var(--text-secondary)',
            background: (settingsActive && !isDragging) ? 'var(--active-bg)' : 'transparent',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: settingsActive ? 600 : 450,
            transition: `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)`,
            justifyContent: collapsed ? 'center' : 'flex-start',
            position: 'relative',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <Settings size={16} style={{
            flexShrink: 0,
            transition: `color var(--duration-fast)`,
          }} />
          {textOpacity > 0 && (
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
            transition: `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)`,
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
      />
    </nav>
  )
}
