'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Target, CheckCircle, Clock, Zap, RefreshCw, Check,
  FileText, Terminal, Eye, Pencil, Lightbulb, CircleDot,
  ChevronDown, Play, Pause, Search, User, XCircle, Cpu,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'

interface Mission {
  id: string
  title: string
  assignee: string
  status: string
  progress: number
  created_at: string
  updated_at?: string
  log_path?: string | null
  complexity?: number | null
  task_type?: string | null
  review_status?: string | null
  review_notes?: string | null
  retry_count?: number
  routed_agent?: string | null
}

interface Agent {
  id: string
  display_name: string
  emoji: string
}

interface MissionEvent {
  id: string
  mission_id: string
  event_type: 'write' | 'edit' | 'bash' | 'read' | 'think' | 'result' | 'glob' | 'grep' | 'user'
  content: string
  file_path: string | null
  seq: number
  elapsed_seconds: number | null
  created_at: string
  tool_input?: string | null
  model_name?: string | null
}

type Tab = 'all' | 'active' | 'pending' | 'done' | 'review'

function statusColor(status: string): string {
  switch (status) {
    case 'done': return 'var(--green, #4ade80)'
    case 'active': return 'var(--accent-bright)'
    case 'awaiting_review': return '#f59e0b'
    case 'failed': return '#ef4444'
    case 'pending': return 'var(--text-muted)'
    default: return 'var(--text-muted)'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'done': return <CheckCircle size={14} color="var(--green, #4ade80)" />
    case 'active': return <Zap size={14} color="var(--accent-bright)" />
    case 'awaiting_review': return <Eye size={14} color="#f59e0b" />
    case 'failed': return <XCircle size={14} color="#ef4444" />
    case 'pending': return <Clock size={14} color="var(--text-muted)" />
    default: return <Clock size={14} color="var(--text-muted)" />
  }
}

const EVENT_META: Record<string, { tickColor: string; icon: React.ReactNode; label: string; labelColor: string; bg: string; border: string }> = {
  user:   { tickColor: '#ec4899', icon: <User size={11} />,      label: 'User',   labelColor: '#f472b6', bg: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.3)' },
  think:  { tickColor: '#9b84ec', icon: <Lightbulb size={11} />, label: 'Think',  labelColor: '#c4b5fd', bg: 'rgba(155,132,236,0.12)', border: 'rgba(155,132,236,0.25)' },
  write:  { tickColor: '#22c55e', icon: <FileText size={11} />,  label: 'Write',  labelColor: '#4ade80', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.35)' },
  edit:   { tickColor: '#10b981', icon: <Pencil size={11} />,    label: 'Edit',   labelColor: '#34d399', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)' },
  bash:   { tickColor: '#3b82f6', icon: <Terminal size={11} />,  label: 'Bash',   labelColor: '#60a5fa', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.35)' },
  read:   { tickColor: '#06b6d4', icon: <Eye size={11} />,       label: 'Read',   labelColor: '#22d3ee', bg: 'rgba(6,182,212,0.12)',   border: 'rgba(6,182,212,0.3)' },
  glob:   { tickColor: '#f97316', icon: <Search size={11} />,    label: 'Glob',   labelColor: '#fb923c', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)' },
  grep:   { tickColor: '#f97316', icon: <Search size={11} />,    label: 'Grep',   labelColor: '#fb923c', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)' },
  result: { tickColor: '#f59e0b', icon: <CircleDot size={11} />, label: 'Result', labelColor: '#fbbf24', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.35)' },
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `+${m}:${s.toString().padStart(2, '0')}`
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Replay Event Row (Readout style) ──────────────────────────────────────────

function ReplayEventRow({
  event, index, isActive, elapsed, isExpanded, onToggleExpand, onClick,
}: {
  event: MissionEvent
  index: number
  isActive: boolean
  elapsed: number
  isExpanded: boolean
  onToggleExpand: () => void
  onClick: () => void
}) {
  const meta = EVENT_META[event.event_type] || EVENT_META.think
  const isThink = event.event_type === 'think'
  const isUser  = event.event_type === 'user'
  const isFile  = event.event_type === 'write' || event.event_type === 'edit' || event.event_type === 'read' || event.event_type === 'glob'
  const isBash  = event.event_type === 'bash' || event.event_type === 'grep'
  const isResult = event.event_type === 'result'
  const isError  = isResult && (event.content.toLowerCase().includes('error') || event.content.toLowerCase().includes('fail'))

  const displayContent = isFile
    ? (event.file_path || event.content)
    : isBash
    ? `$ ${event.content}`
    : event.content

  const activeColor = meta.tickColor

  return (
    <div
      data-idx={index}
      onClick={isThink || isUser ? onToggleExpand : onClick}
      style={{
        display: 'flex',
        alignItems: isThink && isExpanded ? 'flex-start' : 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        background: isActive ? hexToRgba(activeColor, 0.06) : 'transparent',
        borderLeft: `2px solid ${isActive ? activeColor : 'transparent'}`,
        transition: 'background 0.08s, border-color 0.08s',
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Timestamp */}
      <span style={{
        flexShrink: 0,
        fontSize: '11px',
        fontFamily: 'monospace',
        color: isActive ? meta.labelColor : '#71717a',
        minWidth: '44px',
      }}>
        {formatElapsed(elapsed)}
      </span>

      {/* Icon */}
      <span style={{
        flexShrink: 0,
        color: meta.labelColor,
        display: 'flex',
        alignItems: 'center',
        width: '14px',
        opacity: 1,
      }}>
        {meta.icon}
      </span>

      {/* Type label */}
      <span style={{
        flexShrink: 0,
        fontSize: '10px',
        fontWeight: 700,
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        color: meta.labelColor,
        minWidth: '44px',
      }}>
        {meta.label}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontFamily: isFile || isBash ? 'monospace' : 'inherit',
          color: isThink ? '#a1a1aa' : isError ? '#fca5a5' : '#e4e4e7',
          fontStyle: isThink ? 'italic' : 'normal',
          overflow: isThink && isExpanded ? 'visible' : 'hidden',
          textOverflow: isThink && isExpanded ? undefined : 'ellipsis',
          whiteSpace: isThink && isExpanded ? 'normal' : 'nowrap',
          lineHeight: 1.4,
        }}>
          {displayContent}
        </div>
        {/* Expanded think/user content */}
        {(isThink || isUser) && isExpanded && (
          <div style={{
            marginTop: '4px',
            fontSize: '11px',
            color: isThink ? '#a1a1aa' : 'var(--text-primary)',
            fontStyle: isThink ? 'italic' : 'normal',
            lineHeight: 1.5,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '4px',
            padding: '6px 8px',
            whiteSpace: 'pre-wrap',
          }}>
            {event.content}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Accordion Body (replay viewer) ────────────────────────────────────────────

function AccordionBody({ missionId, mission, agent }: { missionId: string; mission: Mission; agent?: Agent }) {
  const [events, setEvents]         = useState<MissionEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [ingesting, setIngesting]   = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [playing, setPlaying]       = useState(false)
  const [speed, setSpeed]           = useState<1 | 2 | 4>(1)
  const [expandedThinks, setExpandedThinks] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredTick, setHoveredTick] = useState<number | null>(null)

  const scrubberRef  = useRef<HTMLDivElement>(null)
  const listRef      = useRef<HTMLDivElement>(null)
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventsRef    = useRef<MissionEvent[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setIngesting(false)
      try {
        const res = await fetch(`/api/mission-events?mission_id=${missionId}`)
        const j = await res.json()
        let evts: MissionEvent[] = j.events || []

        if (evts.length === 0 && mission.log_path) {
          setLoading(false)
          setIngesting(true)
          try {
            const ir = await fetch(
              `/api/mission-events?action=ingest&mission_id=${missionId}&log_path=${encodeURIComponent(mission.log_path)}`
            )
            const ij = await ir.json()
            if (ij.success && ij.events_inserted > 0) {
              const res2 = await fetch(`/api/mission-events?mission_id=${missionId}`)
              const j2 = await res2.json()
              evts = j2.events || []
            }
          } catch { /* auto-ingest failed — show empty state */ }
          if (!cancelled) {
            setIngesting(false)
            setEvents(evts)
            eventsRef.current = evts
            setCurrentIdx(0)
          }
          return
        }

        if (!cancelled) {
          setEvents(evts)
          eventsRef.current = evts
          setCurrentIdx(0)
        }
      } catch {
        if (!cancelled) { setEvents([]); eventsRef.current = [] }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [missionId, mission.log_path])

  // Estimated mission duration
  const totalDuration = useMemo(() => {
    if (mission.updated_at) {
      const d = (new Date(mission.updated_at).getTime() - new Date(mission.created_at).getTime()) / 1000
      return Math.max(d, 10)
    }
    return 120
  }, [mission.created_at, mission.updated_at])

  // Tool call counts
  const toolCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of events) {
      if (e.event_type !== 'think') {
        counts[e.event_type] = (counts[e.event_type] || 0) + 1
      }
    }
    return counts
  }, [events])

  // Detected model from events
  const detectedModel = useMemo(() => {
    for (const e of events) {
      if (e.model_name) return e.model_name
    }
    return null
  }, [events])

  function getElapsed(idx: number): number {
    const e = events[idx]
    if (e?.elapsed_seconds != null) return e.elapsed_seconds
    if (events.length <= 1) return 0
    return (idx / (events.length - 1)) * totalDuration
  }

  function clientXToIdx(clientX: number): number {
    const el = scrubberRef.current
    if (!el || eventsRef.current.length === 0) return 0
    const rect = el.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(pct * (eventsRef.current.length - 1))
  }

  function handleScrubberMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setIsDragging(true)
    setCurrentIdx(clientXToIdx(e.clientX))
  }

  function handleScrubberMouseMove(e: React.MouseEvent) {
    if (isDragging) {
      setCurrentIdx(clientXToIdx(e.clientX))
    } else {
      setHoveredTick(clientXToIdx(e.clientX))
    }
  }

  function handleScrubberMouseLeave() {
    setHoveredTick(null)
  }

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => setCurrentIdx(clientXToIdx(e.clientX))
    const onUp   = () => setIsDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging])

  // Playback interval
  useEffect(() => {
    if (playTimerRef.current) clearInterval(playTimerRef.current)
    if (!playing) return
    playTimerRef.current = setInterval(() => {
      setCurrentIdx(prev => {
        if (prev >= eventsRef.current.length - 1) {
          setPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 700 / speed)
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current) }
  }, [playing, speed])

  // Auto-scroll event into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${currentIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentIdx])

  // Files touched: modified (write/edit) and read-only (read)
  const { filesModified, filesRead } = useMemo(() => {
    const modMap = new Map<string, number>()
    const readMap = new Map<string, number>()
    for (const e of events) {
      if (!e.file_path) continue
      if (e.event_type === 'write' || e.event_type === 'edit') {
        modMap.set(e.file_path, (modMap.get(e.file_path) || 0) + 1)
      } else if (e.event_type === 'read') {
        if (!modMap.has(e.file_path)) {
          readMap.set(e.file_path, (readMap.get(e.file_path) || 0) + 1)
        }
      }
    }
    return {
      filesModified: Array.from(modMap.entries()),
      filesRead: Array.from(readMap.entries()),
    }
  }, [events])

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    if (m === 0) return `${s}s`
    return `${m}m ${s}s`
  }

  // ── Loading skeleton
  if (loading) return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: '32px', borderRadius: '10px',
          background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.05) 25%, rgba(22, 22, 28, 0.65) 50%, rgba(255, 255, 255, 0.05) 75%)',
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
          opacity: 1 - i * 0.15,
        }} />
      ))}
    </div>
  )

  // ── Ingesting state
  if (ingesting) return (
    <div style={{
      borderTop: '1px solid var(--border)', marginTop: '4px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '8px', padding: '24px 0 16px',
      color: 'var(--text-muted)',
    }}>
      <div style={{
        width: '20px', height: '20px', borderRadius: '50%',
        border: '2px solid rgba(155,132,236,0.3)',
        borderTopColor: 'var(--accent-bright)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--accent-bright)' }}>
        Ingesting log…
      </div>
    </div>
  )

  // ── Empty state
  if (events.length === 0) return (
    <div style={{
      borderTop: '1px solid var(--border)', marginTop: '4px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '8px', padding: '24px 0 16px',
      color: 'var(--text-muted)',
    }}>
      <Eye size={28} strokeWidth={1} style={{ opacity: 0.4 }} />
      <div style={{ fontSize: '12px', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.5 }}>
        No replay — logs auto-captured going forward
      </div>
    </div>
  )

  const playheadPct  = events.length > 1 ? (currentIdx / (events.length - 1)) * 100 : 0
  const totalElapsed = getElapsed(events.length - 1)

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>

      {/* ── Header: compact single line ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        marginBottom: '8px', overflow: 'hidden',
      }}>
        {/* Assignee */}
        {agent && (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
            {agent.emoji && <span>{agent.emoji}</span>}
            <span style={{ fontWeight: 600 }}>{agent.display_name}</span>
          </span>
        )}

        {agent && (detectedModel || true) && (
          <span style={{ color: 'var(--border)', flexShrink: 0, fontSize: '10px' }}>|</span>
        )}

        {/* Model pill */}
        {detectedModel && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            fontSize: '10px', fontFamily: 'monospace',
            background: 'rgba(6,182,212,0.1)',
            border: '1px solid rgba(6,182,212,0.25)',
            borderRadius: '10px', padding: '1px 6px',
            color: '#22d3ee', flexShrink: 0,
          }}>
            <Cpu size={9} />
            {detectedModel.replace('claude-', '')}
          </span>
        )}

        {/* Duration */}
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)', flexShrink: 0 }}>
          Built in {formatDuration(totalElapsed)}
        </span>

        {/* Stats */}
        <span style={{ marginLeft: 'auto', fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {[
            (toolCounts.edit || toolCounts.write) && `${(toolCounts.edit || 0) + (toolCounts.write || 0)} edits`,
            toolCounts.bash && `${toolCounts.bash} bash`,
            toolCounts.read && `${toolCounts.read} reads`,
          ].filter(Boolean).join(' · ')}
        </span>
      </div>

      {/* ── Scrubber bar (Readout waveform style) ─────────────────── */}
      <div
        ref={scrubberRef}
        onMouseDown={handleScrubberMouseDown}
        onMouseMove={handleScrubberMouseMove}
        onMouseLeave={handleScrubberMouseLeave}
        style={{
          position: 'relative',
          height: '48px',
          cursor: 'col-resize',
          marginBottom: '10px',
          userSelect: 'none',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '4px',
        }}
      >
        {/* Tick marks — waveform/barcode style */}
        {(() => {
          const step = events.length > 100 ? Math.ceil(events.length / 100) : 1
          return events.map((e, i) => {
            if (i % step !== 0 && i !== events.length - 1) return null
            const meta = EVENT_META[e.event_type] || EVENT_META.think
            const pct  = events.length > 1 ? (i / (events.length - 1)) * 100 : 0
            return (
              <div key={e.id || i} style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                height: '36px',
                width: '3px',
                left: `calc(${pct}% - 1.5px)`,
                background: meta.tickColor,
                opacity: 1.0,
                borderRadius: '2px',
                pointerEvents: 'none',
              }} />
            )
          })
        })()}

        {/* Playhead glowing vertical line */}
        <div style={{
          position: 'absolute',
          top: '-4px',
          left: `${playheadPct}%`,
          transform: 'translateX(-50%)',
          width: '2px',
          height: 'calc(100% + 8px)',
          background: '#e4e4e7',
          borderRadius: '2px',
          boxShadow: '0 0 4px 1px rgba(155,132,236,0.9), 0 0 8px 3px rgba(155,132,236,0.4)',
          zIndex: 3,
          pointerEvents: 'none',
          transition: isDragging ? 'none' : 'left 0.1s ease',
        }}>
          {/* Diamond indicator at top */}
          <div style={{
            position: 'absolute',
            top: '0',
            left: '50%',
            transform: 'translateX(-50%) translateY(-50%) rotate(45deg)',
            width: '5px',
            height: '5px',
            background: '#e4e4e7',
            borderRadius: '1px',
            boxShadow: '0 0 6px 1px rgba(155,132,236,0.9), 0 0 12px 2px rgba(155,132,236,0.5)',
          }} />
        </div>

        {/* Hover tooltip */}
        {hoveredTick !== null && events[hoveredTick] && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: `${events.length > 1 ? (hoveredTick / (events.length - 1)) * 100 : 0}%`,
            transform: 'translateX(-50%)',
            marginBottom: '4px',
            background: 'rgba(22, 22, 28, 0.65)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '3px 6px',
            fontSize: '9px', fontFamily: 'monospace',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            zIndex: 10,
            pointerEvents: 'none',
          }}>
            {EVENT_META[events[hoveredTick].event_type]?.label || 'Event'} · {formatElapsed(getElapsed(hoveredTick))}
          </div>
        )}

        {/* Time labels */}
        <span style={{ position: 'absolute', bottom: '-14px', left: '0', fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', pointerEvents: 'none' }}>
          +0:00
        </span>
        <span style={{ position: 'absolute', bottom: '-14px', right: '0', fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', pointerEvents: 'none' }}>
          {formatElapsed(totalElapsed)}
        </span>
      </div>

      {/* Spacer for time labels */}
      <div style={{ height: '8px' }} />

      {/* ── Files touched (inline compact strip) ─────────────────── */}
      {(filesModified.length > 0 || filesRead.length > 0) && (() => {
        const modifiedPaths = new Set(filesModified.map(([p]) => p))
        const allFiles = [
          ...filesModified.map(([p]) => ({ path: p, color: '#4ade80' })),
          ...filesRead.filter(([p]) => !modifiedPaths.has(p)).map(([p]) => ({ path: p, color: '#52525b' })),
        ]
        const shown = allFiles.slice(0, 6)
        const extra = allFiles.length - 6
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {shown.map(({ path, color }) => (
              <button
                key={path}
                title={path}
                onClick={() => navigator.clipboard.writeText(path)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', fontFamily: 'monospace',
                  color, background: 'none', border: 'none',
                  padding: 0, cursor: 'pointer',
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                {path.split('/').pop()}
              </button>
            ))}
            {extra > 0 && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>+{extra} more</span>
            )}
          </div>
        )
      })()}

      {/* ── Controls row (play/pause + speed + counter + timestamp) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
        {/* Play / pause */}
        <button
          onClick={() => {
            if (currentIdx >= events.length - 1) setCurrentIdx(0)
            setPlaying(p => !p)
          }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '22px', height: '22px', borderRadius: '50%',
            border: '1px solid var(--border)',
            background: playing ? 'rgba(155,132,236,0.15)' : 'rgba(255, 255, 255, 0.05)',
            color: playing ? 'var(--accent-bright)' : 'var(--text-secondary)',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {playing ? <Pause size={9} /> : <Play size={9} />}
        </button>

        {/* Speed toggle */}
        <button
          onClick={() => setSpeed(s => s === 1 ? 2 : s === 2 ? 4 : 1)}
          style={{
            fontSize: '9px', fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 5px', borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {speed}×
        </button>

        {/* Event counter */}
        <div style={{ flex: 1, fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {currentIdx + 1} / {events.length}
        </div>

        {/* Current timestamp */}
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {formatElapsed(getElapsed(currentIdx))}
        </div>
      </div>

      {/* ── Event list ───────────────────────────────────────────────── */}
      <div
        ref={listRef}
        style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}
      >
        {events.map((event, i) => (
          <ReplayEventRow
            key={event.id || i}
            event={event}
            index={i}
            isActive={i === currentIdx}
            elapsed={getElapsed(i)}
            isExpanded={expandedThinks.has(event.id || String(i))}
            onToggleExpand={() => {
              const key = event.id || String(i)
              setExpandedThinks(prev => {
                const next = new Set(prev)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })
            }}
            onClick={() => setCurrentIdx(i)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [agents, setAgents]     = useState<Agent[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [tab, setTab]           = useState<Tab>('all')
  const [markingDone, setMarkingDone]   = useState<string | null>(null)
  const [expandedId, setExpandedId]     = useState<string | null>(null)

  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]))

  const fetchMissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (supabase) {
        const [{ data: mData, error: mErr }, { data: aData }] = await Promise.all([
          supabase.from('missions').select('*').order('created_at', { ascending: false }),
          supabase.from('agents').select('id, display_name, emoji'),
        ])
        if (mErr) throw new Error(mErr.message)
        setMissions(mData || [])
        setAgents(aData || [])
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
  }, [])

  async function markDone(missionId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setMarkingDone(missionId)
    try {
      const res = await fetch('/api/missions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: missionId, status: 'done', progress: 100 }),
      })
      if (!res.ok) throw new Error('Failed to mark done')
      setMissions(prev => prev.map(m =>
        m.id === missionId ? { ...m, status: 'done', progress: 100 } : m
      ))
    } catch {
      // silently fail
    } finally {
      setMarkingDone(null)
    }
  }

  useEffect(() => { fetchMissions() }, [fetchMissions])

  const filtered = missions.filter(m => {
    if (tab === 'all') return true
    if (tab === 'review') return m.status === 'awaiting_review'
    return m.status === tab
  })

  const counts = {
    all:     missions.length,
    active:  missions.filter(m => m.status === 'active').length,
    pending: missions.filter(m => m.status === 'pending').length,
    review:  missions.filter(m => m.status === 'awaiting_review').length,
    done:    missions.filter(m => m.status === 'done').length,
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all',     label: 'All' },
    { key: 'active',  label: 'Active' },
    { key: 'review',  label: 'Review' },
    { key: 'pending', label: 'Pending' },
    { key: 'done',    label: 'Done' },
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
            background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '7px 12px',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
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
                padding: '5px 14px', borderRadius: '20px',
                border: `1px solid ${active ? 'rgba(155,132,236,0.4)' : 'var(--border)'}`,
                background: active ? 'rgba(155,132,236,0.12)' : 'transparent',
                color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
                fontSize: '12px', fontWeight: active ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {label}
              <span style={{
                fontSize: '10px', fontFamily: 'monospace',
                background: active ? 'rgba(155,132,236,0.2)' : 'rgba(255, 255, 255, 0.05)',
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
                background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.05) 25%, rgba(22, 22, 28, 0.65) 50%, rgba(255, 255, 255, 0.05) 75%)',
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
              const canMarkDone = !done
              const barPct = done ? 100 : (mission.progress ?? 0)
              const barColor = done
                ? 'var(--green, #4ade80)'
                : mission.status === 'active'
                  ? 'var(--accent)'
                  : 'var(--text-muted)'
              const assigneeAgent = agentMap[mission.assignee]
              const assigneeLabel = assigneeAgent
                ? `${assigneeAgent.emoji ? assigneeAgent.emoji + ' ' : ''}${assigneeAgent.display_name}`
                : null
              const isMarkingThis = markingDone === mission.id
              const isExpanded    = expandedId === mission.id

              return (
                <div
                  key={mission.id}
                  style={{
                    borderRadius: '10px',
                    background: isExpanded ? 'rgba(255, 255, 255, 0.05)' : 'rgba(22, 22, 28, 0.65)',
                    border: `1px solid ${isExpanded ? 'rgba(155,132,236,0.35)' : done ? 'rgba(74,222,128,0.15)' : 'var(--border)'}`,
                    opacity: done ? 0.88 : 1,
                    transition: 'border-color 0.15s, background 0.15s',
                    overflow: 'hidden',
                  }}
                >
                  {/* Card header */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : mission.id)}
                    style={{
                      padding: '12px 16px 10px',
                      display: 'flex', flexDirection: 'column', gap: '8px',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      if (!isExpanded) {
                        const card = e.currentTarget.parentElement!
                        card.style.borderColor = 'rgba(155,132,236,0.25)'
                        card.style.background  = 'rgba(255, 255, 255, 0.05)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isExpanded) {
                        const card = e.currentTarget.parentElement!
                        card.style.borderColor = done ? 'rgba(74,222,128,0.15)' : 'var(--border)'
                        card.style.background  = 'rgba(22, 22, 28, 0.65)'
                      }
                    }}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flexShrink: 0 }}>{statusIcon(mission.status)}</div>

                      {/* Title + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px', fontWeight: 500,
                          color: 'var(--text-primary)',
                          textDecoration: done ? 'line-through' : 'none',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {done && <span style={{ color: 'var(--green, #4ade80)', marginRight: '6px', textDecoration: 'none', display: 'inline-block' }}>✓</span>}
                          {mission.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {assigneeLabel ? (
                            <span>{assigneeLabel}</span>
                          ) : (
                            <span>
                              {mission.assignee}
                              <span style={{ color: 'var(--text-muted)', opacity: 0.5, marginLeft: '4px' }}>(removed)</span>
                            </span>
                          )}
                          <span>·</span>
                          <span>{timeAgo(mission.created_at)}</span>
                          {mission.complexity != null && (
                            <>
                              <span>·</span>
                              <span style={{
                                color: mission.complexity > 70 ? '#ef4444' : mission.complexity > 40 ? '#f59e0b' : '#4ade80',
                              }}>
                                {mission.complexity}%
                              </span>
                            </>
                          )}
                          {mission.task_type && mission.task_type !== 'non-code' && (
                            <span style={{
                              fontSize: '9px', padding: '1px 5px', borderRadius: '10px',
                              background: mission.task_type === 'code' ? 'rgba(59,130,246,0.12)' : 'rgba(155,132,236,0.12)',
                              border: `1px solid ${mission.task_type === 'code' ? 'rgba(59,130,246,0.3)' : 'rgba(155,132,236,0.3)'}`,
                              color: mission.task_type === 'code' ? '#60a5fa' : '#c4b5fd',
                            }}>
                              {mission.task_type}
                            </span>
                          )}
                          {mission.review_status === 'pending' && (
                            <span style={{
                              fontSize: '9px', padding: '1px 5px', borderRadius: '10px',
                              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                              color: '#fbbf24', fontWeight: 600,
                            }}>
                              needs review
                            </span>
                          )}
                          {mission.review_status === 'rejected' && (
                            <span style={{
                              fontSize: '9px', padding: '1px 5px', borderRadius: '10px',
                              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                              color: '#fca5a5', fontWeight: 600,
                            }}>
                              rejected
                            </span>
                          )}
                          {(mission.retry_count ?? 0) > 0 && (
                            <>
                              <span>·</span>
                              <span style={{ color: '#ef4444' }}>
                                {mission.retry_count} retries
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Mark done */}
                      {canMarkDone && (
                        <button
                          onClick={e => markDone(mission.id, e)}
                          disabled={isMarkingThis}
                          title="Mark done"
                          style={{
                            flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '3px 8px', borderRadius: '10px',
                            border: '1px solid rgba(74,222,128,0.25)',
                            background: 'rgba(74,222,128,0.06)',
                            color: 'var(--green, #4ade80)',
                            fontSize: '11px', cursor: isMarkingThis ? 'wait' : 'pointer',
                            opacity: isMarkingThis ? 0.5 : 1,
                            transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                          }}
                          onMouseEnter={e => { if (!isMarkingThis) { e.currentTarget.style.background = 'rgba(74,222,128,0.14)'; e.currentTarget.style.borderColor = 'rgba(74,222,128,0.45)' } }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(74,222,128,0.06)'; e.currentTarget.style.borderColor = 'rgba(74,222,128,0.25)' }}
                        >
                          <Check size={11} />
                          Done
                        </button>
                      )}

                      {/* Status badge */}
                      <div style={{
                        flexShrink: 0, fontSize: '10px', fontFamily: 'monospace',
                        padding: '2px 8px', borderRadius: '10px',
                        color: statusColor(mission.status),
                        background: done ? 'rgba(74,222,128,0.08)' : mission.status === 'active' ? 'rgba(155,132,236,0.1)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : mission.status === 'active' ? 'rgba(155,132,236,0.2)' : 'var(--border)'}`,
                      }}>
                        {mission.status}
                      </div>

                      {/* Chevron */}
                      <div style={{
                        flexShrink: 0, color: 'var(--text-muted)',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        display: 'flex', alignItems: 'center',
                      }}>
                        <ChevronDown size={14} />
                      </div>
                    </div>

                  </div>

                  {/* Progress bar — thin strip at bottom of card header */}
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: `${barPct}%`,
                      background: done ? 'var(--green, #4ade80)' : 'var(--accent)',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>

                  {/* Accordion body */}
                  <div style={{
                    display: 'grid',
                    gridTemplateRows: isExpanded ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.25s ease',
                  }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 16px 14px' }}>
                        <AccordionBody missionId={mission.id} mission={mission} agent={assigneeAgent} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
