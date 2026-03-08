'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Brain, MessageSquare, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MessageCircle, Settings, CalendarDays, Bot, Target } from 'lucide-react'
import { useState } from 'react'

const agentDashboardItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/missions', label: 'Missions', icon: Target },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/sessions', label: 'Sessions', icon: MessageSquare },
]

const personalDashboardItems = [
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/memory', label: 'Memory', icon: Brain },
  { href: '/crons', label: 'Calendar', icon: CalendarDays },
]

function NavSection({
  label,
  items,
  pathname,
  collapsed,
  open,
  onToggle,
}: {
  label: string
  items: { href: string; label: string; icon: React.ElementType }[]
  pathname: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ marginBottom: '4px' }}>
      {!collapsed && (
        <button
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '6px 12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            borderRadius: '6px',
          }}
        >
          {label}
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}
      {(open || collapsed) && items.map(({ href, label: itemLabel, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? itemLabel : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: collapsed ? '10px 0' : '10px 12px',
              borderRadius: '8px',
              marginBottom: '4px',
              color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
              background: active ? 'rgba(155, 132, 236, 0.12)' : 'transparent',
              border: active ? '1px solid rgba(155, 132, 236, 0.2)' : '1px solid transparent',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: active ? 600 : 400,
              transition: 'all 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            <Icon size={16} style={{ flexShrink: 0, color: active ? 'var(--accent)' : undefined }} />
            {!collapsed && itemLabel}
          </Link>
        )
      })}
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [agentOpen, setAgentOpen] = useState(true)
  const [personalOpen, setPersonalOpen] = useState(true)

  return (
    <aside style={{
      width: collapsed ? '60px' : '240px',
      minWidth: collapsed ? '60px' : '240px',
      background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.25s ease, min-width 0.25s ease',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <span style={{ fontSize: '32px', flexShrink: 0 }}>🦬</span>
        {!collapsed && (
          <div>
            <div style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.05em',
            }}>
              MISSION CONTROL
            </div>
            <div style={{
              fontSize: '11px',
              color: 'var(--accent)',
              fontFamily: 'monospace',
              marginTop: '1px',
            }}>
              Bjorn | Personal Agent
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        <NavSection
          label="Agent Dashboard"
          items={agentDashboardItems}
          pathname={pathname}
          collapsed={collapsed}
          open={agentOpen}
          onToggle={() => setAgentOpen(o => !o)}
        />
        <NavSection
          label="Personal Dashboard"
          items={personalDashboardItems}
          pathname={pathname}
          collapsed={collapsed}
          open={personalOpen}
          onToggle={() => setPersonalOpen(o => !o)}
        />
      </nav>

      {/* Settings — pinned bottom */}
      <div style={{ padding: '0 8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
        {(() => {
          const active = pathname === '/settings'
          return (
            <Link
              href="/settings"
              title={collapsed ? 'Settings' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: collapsed ? '10px 0' : '10px 12px',
                borderRadius: '8px',
                marginBottom: '4px',
                color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
                background: active ? 'rgba(155, 132, 236, 0.12)' : 'transparent',
                border: active ? '1px solid rgba(155, 132, 236, 0.2)' : '1px solid transparent',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                transition: 'all 0.15s',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <Settings size={16} style={{ flexShrink: 0, color: active ? 'var(--accent)' : undefined }} />
              {!collapsed && 'Settings'}
            </Link>
          )
        })()}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          margin: '12px 8px',
          padding: '8px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Version */}
      {!collapsed && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: '10px',
          color: 'var(--text-muted)',
          fontFamily: 'monospace',
        }}>
          openclaw v2026.3.2
        </div>
      )}
    </aside>
  )
}
