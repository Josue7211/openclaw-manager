import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnreadCounts } from '@/lib/unread-store'
import { useAgentsData } from '@/lib/hooks/dashboard'
import { subscribeModules, getEnabledModules } from '@/lib/modules'
import { STORAGE_KEY as POMODORO_STORAGE_KEY, type SessionEntry } from '@/pages/pomodoro/types'

/* ─── Pomodoro localStorage reader ──────────────────────────────────────── */

function usePomodoroTodayCount(): number {
  const [count, setCount] = useState(() => countTodaySessions())

  useEffect(() => {
    // Re-check on storage events (cross-tab) and on a slow interval
    // for same-tab updates (Pomodoro page writes to localStorage)
    const onStorage = (e: StorageEvent) => {
      if (e.key === POMODORO_STORAGE_KEY) setCount(countTodaySessions())
    }
    window.addEventListener('storage', onStorage)
    const timer = setInterval(() => setCount(countTodaySessions()), 10_000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(timer)
    }
  }, [])

  return count
}

function countTodaySessions(): number {
  try {
    const raw = localStorage.getItem(POMODORO_STORAGE_KEY)
    if (!raw) return 0
    const sessions: SessionEntry[] = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    return sessions.filter(s => s.completedAt.startsWith(today) && s.type === 'work').length
  } catch {
    return 0
  }
}

/* ─── Online / Offline hook ─────────────────────────────────────────────── */

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return online
}

/* ─── Styles (hoisted) ──────────────────────────────────────────────────── */

const containerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexShrink: 0,
  fontSize: '12px',
  color: 'var(--text-muted)',
  minHeight: '36px',
}

const containerCollapsedStyle: React.CSSProperties = {
  ...containerStyle,
  flexDirection: 'column',
  gap: '8px',
  padding: '8px 4px',
  alignItems: 'center',
  justifyContent: 'center',
}

const dotStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: color,
  boxShadow: `0 0 6px ${color}60`,
  flexShrink: 0,
  transition: 'background 0.3s ease, box-shadow 0.3s ease',
})

const clickableStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: '2px 4px',
  borderRadius: '6px',
  color: 'inherit',
  fontSize: 'inherit',
  fontFamily: 'inherit',
  transition: 'background 0.15s ease',
  whiteSpace: 'nowrap',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '16px',
  height: '16px',
  padding: '0 4px',
  borderRadius: '999px',
  background: 'var(--red-500)',
  color: '#fff',
  fontSize: '10px',
  fontWeight: 700,
  lineHeight: 1,
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export const StatusBar = React.memo(function StatusBar({
  collapsed,
}: {
  collapsed: boolean
}) {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const unreadCounts = useUnreadCounts()
  const enabledModules = useSyncExternalStore(subscribeModules, getEnabledModules)
  const pomodoroCount = usePomodoroTodayCount()

  // Messages unread count — only if messages module enabled
  const messagesEnabled = enabledModules.includes('messages')
  const unreadMessages = messagesEnabled ? (unreadCounts['/messages'] || 0) : 0

  // Agents data — only if agents/dashboard module enabled
  const agentsEnabled = enabledModules.includes('dashboard') || enabledModules.includes('agents')
  const { agentsData } = useAgentsData()
  const activeAgentCount = useMemo(() => {
    if (!agentsEnabled || !agentsData?.agents) return 0
    return agentsData.agents.filter(a => a.status === 'active').length
  }, [agentsEnabled, agentsData?.agents])

  // Pomodoro — only if module enabled
  const pomodoroEnabled = enabledModules.includes('pomodoro')

  if (collapsed) {
    return (
      <div style={containerCollapsedStyle} aria-label="Status bar">
        {/* Connection dot */}
        <span
          title={online ? 'Connected' : 'Offline'}
          style={dotStyle(online ? 'var(--green-500)' : 'var(--red-500)')}
        />
        {/* Unread messages badge */}
        {messagesEnabled && unreadMessages > 0 && (
          <button
            onClick={() => navigate('/messages')}
            aria-label={`${unreadMessages} unread messages`}
            style={{ ...clickableStyle, padding: 0 }}
            className="hover-bg"
          >
            <span style={badgeStyle}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
          </button>
        )}
        {/* Agent dot */}
        {agentsEnabled && activeAgentCount > 0 && (
          <button
            onClick={() => navigate('/agents')}
            aria-label={`${activeAgentCount} active agents`}
            title={`${activeAgentCount} active`}
            style={{ ...clickableStyle, padding: 0 }}
            className="hover-bg"
          >
            <span style={dotStyle('var(--green-500)')} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={containerStyle} aria-label="Status bar">
      {/* Connection indicator */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        title={online ? 'All systems connected' : 'You are offline'}
      >
        <span style={dotStyle(online ? 'var(--green-500)' : 'var(--red-500)')} />
        <span style={{ color: online ? 'var(--text-muted)' : 'var(--red-500)', fontWeight: online ? 400 : 500 }}>
          {online ? 'Online' : 'Offline'}
        </span>
      </span>

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Pomodoro today count */}
      {pomodoroEnabled && pomodoroCount > 0 && (
        <button
          onClick={() => navigate('/pomodoro')}
          aria-label={`${pomodoroCount} pomodoro sessions today`}
          style={clickableStyle}
          className="hover-bg"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ fontSize: '11px' }}>
            {pomodoroCount} pomo
          </span>
        </button>
      )}

      {/* Unread messages */}
      {messagesEnabled && unreadMessages > 0 && (
        <button
          onClick={() => navigate('/messages')}
          aria-label={`${unreadMessages} unread messages`}
          style={clickableStyle}
          className="hover-bg"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={badgeStyle}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
        </button>
      )}

      {/* Agent status */}
      {agentsEnabled && (
        <button
          onClick={() => navigate('/agents')}
          aria-label={activeAgentCount > 0 ? `${activeAgentCount} active agents` : 'No active agents'}
          title={activeAgentCount > 0 ? `${activeAgentCount} active` : 'Idle'}
          style={clickableStyle}
          className="hover-bg"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={dotStyle(activeAgentCount > 0 ? 'var(--green-500)' : 'var(--text-muted)')} />
          {activeAgentCount > 0 && (
            <span style={{ fontSize: '11px' }}>
              {activeAgentCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
})
