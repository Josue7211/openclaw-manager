'use client'

import { useEffect, useState } from 'react'
import { Target, CheckCircle, Clock, Zap, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Mission {
  id: string
  title: string
  assignee: string
  status: string
  created_at: string
  updated_at?: string
}

type Tab = 'all' | 'active' | 'pending' | 'done'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function statusColor(status: string): string {
  switch (status) {
    case 'done': return 'var(--green, #4ade80)'
    case 'active': return 'var(--accent-bright)'
    case 'pending': return 'var(--text-muted)'
    default: return 'var(--text-muted)'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'done': return <CheckCircle size={14} color="var(--green, #4ade80)" />
    case 'active': return <Zap size={14} color="var(--accent-bright)" />
    case 'pending': return <Clock size={14} color="var(--text-muted)" />
    default: return <Clock size={14} color="var(--text-muted)" />
  }
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')

  async function fetchMissions() {
    setLoading(true)
    setError(null)
    try {
      if (supabase) {
        const { data, error: sbErr } = await supabase
          .from('missions')
          .select('*')
          .order('created_at', { ascending: false })
        if (sbErr) throw new Error(sbErr.message)
        setMissions(data || [])
      } else {
        const res = await fetch('/api/missions')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to fetch')
        setMissions(json.missions || [])
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMissions() }, [])

  const filtered = missions.filter(m => {
    if (tab === 'all') return true
    return m.status === tab
  })

  const counts = {
    all: missions.length,
    active: missions.filter(m => m.status === 'active').length,
    pending: missions.filter(m => m.status === 'pending').length,
    done: missions.filter(m => m.status === 'done').length,
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'pending', label: 'Pending' },
    { key: 'done', label: 'Done' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Missions</h1>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '3px' }}>
            {missions.length} total · {counts.active} active · {counts.done} done
          </div>
        </div>
        <button
          onClick={fetchMissions}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '7px 12px',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexShrink: 0 }}>
        {tabs.map(({ key, label }) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '5px 14px',
                borderRadius: '20px',
                border: `1px solid ${active ? 'rgba(155,132,236,0.4)' : 'var(--border)'}`,
                background: active ? 'rgba(155,132,236,0.12)' : 'transparent',
                color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
                fontSize: '12px', fontWeight: active ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {label}
              <span style={{
                fontSize: '10px', fontFamily: 'monospace',
                background: active ? 'rgba(155,132,236,0.2)' : 'var(--bg-elevated)',
                padding: '1px 5px', borderRadius: '10px',
                color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
              }}>
                {counts[key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                height: '68px', borderRadius: '10px',
                background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
                backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        ) : error ? (
          <div style={{
            padding: '20px', borderRadius: '10px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            color: 'var(--red, #ef4444)', fontSize: '13px', fontFamily: 'monospace',
          }}>
            Error: {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '80px', gap: '12px', color: 'var(--text-muted)' }}>
            <Target size={40} strokeWidth={1} />
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {tab === 'all' ? 'No missions yet' : `No ${tab} missions`}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(mission => {
              const done = mission.status === 'done'
              return (
                <div
                  key={mission.id}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'var(--bg-card)',
                    border: `1px solid ${done ? 'rgba(74,222,128,0.15)' : 'var(--border)'}`,
                    opacity: done ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}
                >
                  {/* Status icon */}
                  <div style={{ flexShrink: 0 }}>
                    {statusIcon(mission.status)}
                  </div>

                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: done ? 'var(--text-secondary)' : 'var(--text-primary)',
                      textDecoration: done ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {done && <span style={{ color: 'var(--green, #4ade80)', marginRight: '6px', textDecoration: 'none', display: 'inline-block' }}>✓</span>}
                      {mission.title}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px', display: 'flex', gap: '10px' }}>
                      <span>{mission.assignee}</span>
                      <span>·</span>
                      <span>{timeAgo(mission.created_at)}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{
                    flexShrink: 0,
                    fontSize: '10px', fontFamily: 'monospace',
                    padding: '2px 8px', borderRadius: '10px',
                    color: statusColor(mission.status),
                    background: done
                      ? 'rgba(74,222,128,0.08)'
                      : mission.status === 'active'
                        ? 'rgba(155,132,236,0.1)'
                        : 'var(--bg-elevated)',
                    border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : mission.status === 'active' ? 'rgba(155,132,236,0.2)' : 'var(--border)'}`,
                  }}>
                    {mission.status}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
