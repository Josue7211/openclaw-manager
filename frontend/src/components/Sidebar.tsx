

import { Link } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { ChevronRight, ChevronDown, Settings } from 'lucide-react'
import { useState } from 'react'
import GlobalSearch from './GlobalSearch'
import { personalDashboardItems, agentDashboardItems } from '@/lib/nav-items'

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
                to={href}
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
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [agentOpen, setAgentOpen] = useState(true)
  const [personalOpen, setPersonalOpen] = useState(true)

  return (
    <nav aria-label="Main navigation" style={{
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
      <header style={{
        padding: collapsed ? '14px 0' : '14px 16px',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        animation: 'fadeIn 0.5s ease both',
      }}>
        <span style={{
          fontSize: '20px',
          flexShrink: 0,
          filter: 'drop-shadow(0 2px 8px rgba(167, 139, 250, 0.2))',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}>🦬</span>
        {!collapsed && (
          <div style={{ animation: 'slideInLeft 0.3s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.06em',
            }}>
              MISSION CONTROL
            </div>
          </div>
        )}
      </header>

      {/* Search */}
      <div style={{
        padding: collapsed ? 0 : '8px 0 0',
        animation: 'fadeInUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) 100ms both',
      }}>
        <GlobalSearch compact collapsed={collapsed} />
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
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
      </div>

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
              to="/settings"
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
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
          padding: '8px 16px',
          borderTop: '1px solid var(--glass-border)',
          fontSize: '9px',
          color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', monospace",
          opacity: 0.6,
        }}>
          v2026.3.2
        </div>
      )}
    </nav>
  )
}
