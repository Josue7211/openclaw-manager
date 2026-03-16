import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Eye, Pause, Play, Cpu } from 'lucide-react'
import { api } from '@/lib/api'
import type { Mission, Agent, MissionEvent } from './types'
import { EVENT_META, formatElapsed, formatDuration } from './utils'
import { ReplayEventRow } from './ReplayEventRow'

export function AccordionBody({ missionId, mission, agent }: { missionId: string; mission: Mission; agent?: Agent }) {
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
        const j = await api.get<{ events?: MissionEvent[] }>(`/api/mission-events?mission_id=${missionId}`)
        let evts: MissionEvent[] = j.events || []
        if (evts.length === 0) console.warn(`[Missions] No events for mission ${missionId}, log_path=${mission.log_path || 'none'}`)

        if (evts.length === 0 && mission.log_path) {
          setLoading(false)
          setIngesting(true)
          try {
            const ij = await api.get<{ success?: boolean; events_inserted?: number }>(
              `/api/mission-events?action=ingest&mission_id=${missionId}&log_path=${encodeURIComponent(mission.log_path)}`
            )
            if (ij.success && (ij.events_inserted ?? 0) > 0) {
              const j2 = await api.get<{ events?: MissionEvent[] }>(`/api/mission-events?mission_id=${missionId}`)
              evts = j2.events || []
            }
          } catch (e) { console.error('[Missions] auto-ingest failed:', e) }
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

  const clientXToIdx = useCallback((clientX: number): number => {
    const el = scrubberRef.current
    if (!el || eventsRef.current.length === 0) return 0
    const rect = el.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(pct * (eventsRef.current.length - 1))
  }, [])

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
  }, [isDragging, clientXToIdx])

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

  // ── Loading skeleton
  if (loading) return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: '32px', borderRadius: '10px',
          background: 'linear-gradient(90deg, var(--hover-bg) 25%, var(--bg-card) 50%, var(--hover-bg) 75%)',
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
        border: '2px solid var(--purple-a30)',
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
            color: 'var(--cyan)', flexShrink: 0,
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
          background: 'var(--bg-white-04)',
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
          background: 'var(--text-primary)',
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
            background: 'var(--text-primary)',
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
            background: 'var(--bg-card)',
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
        <span style={{ position: 'absolute', bottom: '-14px', left: '0', fontSize: '9px', color: 'var(--bg-white-15)', fontFamily: 'monospace', pointerEvents: 'none' }}>
          +0:00
        </span>
        <span style={{ position: 'absolute', bottom: '-14px', right: '0', fontSize: '9px', color: 'var(--bg-white-15)', fontFamily: 'monospace', pointerEvents: 'none' }}>
          {formatElapsed(totalElapsed)}
        </span>
      </div>

      {/* Spacer for time labels */}
      <div style={{ height: '8px' }} />

      {/* ── Files touched (inline compact strip) ─────────────────── */}
      {(filesModified.length > 0 || filesRead.length > 0) && (() => {
        const modifiedPaths = new Set(filesModified.map(([p]) => p))
        const allFiles = [
          ...filesModified.map(([p]) => ({ path: p, color: 'var(--green-400)' })),
          ...filesRead.filter(([p]) => !modifiedPaths.has(p)).map(([p]) => ({ path: p, color: 'var(--text-muted)' })),
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
          aria-label={playing ? 'Pause timeline' : 'Play timeline'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '22px', height: '22px', borderRadius: '50%',
            border: '1px solid var(--border)',
            background: playing ? 'var(--purple-a15)' : 'var(--hover-bg)',
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
            background: 'var(--hover-bg)',
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
