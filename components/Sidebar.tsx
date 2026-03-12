'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Brain, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MessageCircle, Settings, CalendarDays, Bot, Target, Home, CheckSquare, Bell, Timer, Mail, GitBranch, Server, Film, BookOpen, Smartphone } from 'lucide-react'
import { useState } from 'react'
import GlobalSearch from './GlobalSearch'

const agentDashboardItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/missions', label: 'Missions', icon: Target },
  { href: '/agents', label: 'Agents', icon: Bot },

  { href: '/memory', label: 'Memory', icon: Brain },
  { href: '/crons', label: 'Cron Jobs', icon: CalendarDays },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },

]

const personalDashboardItems = [
  { href: '/personal', label: 'Home', icon: Home },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/todos', label: 'Todos', icon: CheckSquare },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/messages', label: 'Messages', icon: Smartphone },
  { href: '/pomodoro', label: 'Pomodoro', icon: Timer },
  { href: '/email', label: 'Email', icon: Mail },
  { href: '/homelab', label: 'Home Lab', icon: Server },

  { href: '/media', label: 'Media Radar', icon: Film },
]

function NavSection({
  label,
  items,
  pathname,
  collapsed,
  open,
  onToggle,
  delayOffset = 0,
}: {
  label: string
  items: { href: string; label: string; icon: React.ElementType }[]
  pathname: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
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
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {label}
          <span style={{
            transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
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
        transition: 'grid-template-rows 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        overflow: 'hidden',
      }}>
        <div style={{ overflow: 'hidden' }}>
          {items.map(({ href, label: itemLabel, icon: Icon }, idx) => {
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
                  padding: collapsed ? '10px 0' : '9px 12px',
                  borderRadius: '10px',
                  marginBottom: '2px',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  background: active ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                  border: 'none',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 450,
                  transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  position: 'relative',
                  animation: `fadeInUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${(delayOffset + idx) * 30}ms both`,
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
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
                    transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                  }} />
                )}
                <Icon size={16} style={{
                  flexShrink: 0,
                  color: active ? 'var(--accent)' : undefined,
                  transition: 'color 0.2s',
                }} />
                {!collapsed && itemLabel}
              </Link>
            )
          })}
        </div>
      </div>
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
      width: collapsed ? '64px' : '240px',
      minWidth: collapsed ? '64px' : '240px',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      borderRight: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.35s cubic-bezier(0.22, 1, 0.36, 1), min-width 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px 16px',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        animation: 'fadeIn 0.5s ease both',
      }}>
        <span style={{
          fontSize: '28px',
          flexShrink: 0,
          filter: 'drop-shadow(0 2px 8px rgba(167, 139, 250, 0.2))',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}>🦬</span>
        {!collapsed && (
          <div style={{ animation: 'slideInLeft 0.3s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '0.06em',
            }}>
              MISSION CONTROL
            </div>
            <div style={{
              fontSize: '11px',
              color: 'var(--accent)',
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: '2px',
              opacity: 0.8,
            }}>
              Bjorn | Personal Agent
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{
        padding: collapsed ? 0 : '8px 0 0',
        animation: 'fadeInUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) 100ms both',
      }}>
        <GlobalSearch compact collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        <NavSection
          label="Personal Dashboard"
          items={personalDashboardItems}
          pathname={pathname}
          collapsed={collapsed}
          open={personalOpen}
          onToggle={() => setPersonalOpen(o => !o)}
          delayOffset={0}
        />
        <NavSection
          label="Agent Dashboard"
          items={agentDashboardItems}
          pathname={pathname}
          collapsed={collapsed}
          open={agentOpen}
          onToggle={() => setAgentOpen(o => !o)}
          delayOffset={personalDashboardItems.length}
        />
      </nav>

      {/* Settings */}
      <div style={{
        padding: '0 8px',
        borderTop: '1px solid var(--glass-border)',
        paddingTop: '8px',
      }}>
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
                padding: collapsed ? '10px 0' : '9px 12px',
                borderRadius: '10px',
                marginBottom: '4px',
                color: active ? '#fff' : 'var(--text-secondary)',
                background: active ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: active ? 600 : 450,
                transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
            >
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
                }} />
              )}
              <Settings size={16} style={{
                flexShrink: 0,
                color: active ? 'var(--accent)' : undefined,
                transition: 'color 0.2s',
              }} />
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
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
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
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
        }}>
          <ChevronRight size={14} />
        </span>
      </button>

      {/* Version */}
      {!collapsed && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--glass-border)',
          fontSize: '10px',
          color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', monospace",
          animation: 'fadeIn 0.5s ease both',
          opacity: 0.6,
        }}>
          openclaw v2026.3.2
        </div>
      )}
    </aside>
  )
}
