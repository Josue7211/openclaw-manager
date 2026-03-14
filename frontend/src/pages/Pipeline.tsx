

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, X, Tag, Trash2, Calendar, AlertTriangle, CheckSquare, Target, Lightbulb, Clock, BellOff, Rocket, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

import { api } from '@/lib/api'

type WorkflowNote = {
  id: string
  category: string
  note: string
  applied: boolean
  created_at: string
}

type Retrospective = {
  id: string
  week: string
  wins: string[]
  failures: string[]
  missions_completed: number
  ideas_generated: number
  ideas_approved: number
  created_at: string
}

type CronJob = {
  name: string
  schedule: string
  next_run?: string
  last_run?: string
  enabled?: boolean
}

type ChangelogEntry = {
  id: string
  title: string
  date: string
  description: string
  tags: string[]
  created_at: string
}

type ItemType = 'todo' | 'mission' | 'idea'

type StaleItem = {
  id: string
  title?: string
  text?: string
  type: ItemType
  staleSince: string
  status?: string
}

const CATEGORIES = ['routing', 'delegation', 'user-preferences', 'lessons']

const CATEGORY_COLORS: Record<string, string> = {
  routing: '#7c3aed',
  delegation: '#0891b2',
  'user-preferences': '#059669',
  lessons: '#d97706',
}

const STALE_TYPE_COLORS: Record<ItemType, { bg: string; color: string; border: string }> = {
  todo: { bg: 'rgba(59,165,92,0.12)', color: 'var(--green)', border: 'rgba(59,165,92,0.25)' },
  mission: { bg: 'rgba(155,132,236,0.12)', color: 'var(--accent-bright)', border: 'rgba(155,132,236,0.25)' },
  idea: { bg: 'rgba(230,168,23,0.12)', color: '#e6a817', border: 'rgba(230,168,23,0.25)' },
}

const STALE_TYPE_ICONS: Record<ItemType, React.ElementType> = {
  todo: CheckSquare,
  mission: Target,
  idea: Lightbulb,
}

type IdeaStatus = 'pending' | 'approved' | 'rejected' | 'deferred' | 'built'

interface Idea {
  id: string
  title: string
  description: string
  why: string
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
  category: string
  status: IdeaStatus
  mission_id?: string | null
  created_at: string
}

const IDEA_LEVEL_COLORS: Record<string, string> = {
  low: 'var(--green)',
  medium: '#e6a817',
  high: 'var(--red)',
}

const IDEA_STATUS_META: { status: IdeaStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'Pending', color: '#e6a817' },
  { status: 'approved', label: 'Approved', color: '#34d399' },
  { status: 'built', label: 'Built', color: 'var(--accent-bright)' },
  { status: 'rejected', label: 'Rejected', color: 'var(--red)' },
  { status: 'deferred', label: 'Deferred', color: 'var(--text-muted)' },
]

function formatNextRun(dateStr?: string) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  if (diff < 0) return 'overdue'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `in ${h}h ${m}m`
  return `in ${m}m`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMonth(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function MarkdownText({ text }: { text: string }) {
  const codeStyle: React.CSSProperties = {
    background: 'rgba(155,132,236,0.15)',
    padding: '1px 5px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '12px',
  }
  const ulStyle: React.CSSProperties = { margin: '6px 0 6px 16px', padding: 0 }

  // Parse inline markdown tokens from a single line into React elements
  function parseInline(line: string, keyPrefix: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = []
    // Match bold (**), italic (*/_), and code (`) in a single pass
    const pattern = /\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|_(.+?)_/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let i = 0

    while ((match = pattern.exec(line)) !== null) {
      // Push any plain text before this match
      if (match.index > lastIndex) {
        nodes.push(line.slice(lastIndex, match.index))
      }

      if (match[1] != null) {
        nodes.push(<strong key={`${keyPrefix}-${i}`}>{match[1]}</strong>)
      } else if (match[2] != null) {
        nodes.push(<code key={`${keyPrefix}-${i}`} style={codeStyle}>{match[2]}</code>)
      } else if (match[3] != null) {
        nodes.push(<em key={`${keyPrefix}-${i}`}>{match[3]}</em>)
      } else if (match[4] != null) {
        nodes.push(<em key={`${keyPrefix}-${i}`}>{match[4]}</em>)
      }

      lastIndex = pattern.lastIndex
      i++
    }

    // Trailing plain text
    if (lastIndex < line.length) {
      nodes.push(line.slice(lastIndex))
    }

    return nodes
  }

  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listKey = 0

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${listKey}`} style={ulStyle}>{listItems}</ul>)
      listItems = []
      listKey++
    }
  }

  lines.forEach((line, idx) => {
    const bulletMatch = line.match(/^- (.+)$/)
    if (bulletMatch) {
      listItems.push(<li key={`li-${idx}`}>{parseInline(bulletMatch[1], `li-${idx}`)}</li>)
    } else {
      flushList()
      if (idx > 0) elements.push(<br key={`br-${idx}`} />)
      elements.push(<React.Fragment key={`ln-${idx}`}>{parseInline(line, `ln-${idx}`)}</React.Fragment>)
    }
  })

  flushList()

  return <>{elements}</>
}

function groupByMonth(entries: ChangelogEntry[]) {
  const groups: Record<string, ChangelogEntry[]> = {}
  for (const entry of entries) {
    const month = formatMonth(entry.date)
    if (!groups[month]) groups[month] = []
    groups[month].push(entry)
  }
  return groups
}

function FilterDropdown({ label, value, options, onChange, colorMap }: {
  label: string
  value: string | null
  options: string[]
  onChange: (v: string | null) => void
  colorMap?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeColor = value && colorMap?.[value]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '4px 10px',
          borderRadius: '8px',
          border: '1px solid',
          borderColor: value ? (activeColor ? `${activeColor}66` : 'rgba(155,132,236,0.3)') : 'rgba(255,255,255,0.08)',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 500,
          background: value ? (activeColor ? `${activeColor}15` : 'rgba(155,132,236,0.08)') : 'transparent',
          color: value ? (activeColor || 'var(--accent-bright)') : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          transition: 'all 0.15s var(--ease-spring)',
        }}
      >
        {label}{value ? `: ${value}` : ''}
        <ChevronDown size={11} style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
        }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          minWidth: '140px',
          background: 'rgba(18, 18, 24, 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px',
          padding: '4px',
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          animation: 'fadeInUp 0.12s var(--ease-spring) both',
        }}>
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false) }}
              className="hover-bg"
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px',
                border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 500,
                background: 'transparent', color: 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              Clear
            </button>
          )}
          {options.map(opt => {
            const active = value === opt
            const optColor = colorMap?.[opt]
            return (
              <button
                key={opt}
                onClick={() => { onChange(active ? null : opt); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px',
                  border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: active ? 600 : 450,
                  background: active ? 'rgba(155,132,236,0.12)' : 'transparent',
                  color: active ? (optColor || 'var(--accent-bright)') : (optColor || 'var(--text-secondary)'),
                  transition: 'background 0.1s',
                  textTransform: 'capitalize',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PipelinePage() {
  const [tab, setTab] = useState<'ideas' | 'notes' | 'retros' | 'status' | 'shiplog' | 'stale'>('ideas')
  const [notes, setNotes] = useState<WorkflowNote[]>([])
  const [retros, setRetros] = useState<Retrospective[]>([])
  const [crons, setCrons] = useState<CronJob[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [ideasFilter, setIdeasFilter] = useState<IdeaStatus | null>(null)
  const [effortFilter, setEffortFilter] = useState<string | null>(null)
  const [impactFilter, setImpactFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Ship Log
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [shipLoading, setShipLoading] = useState(true)
  const [showShipForm, setShowShipForm] = useState(false)
  const [shipSubmitting, setShipSubmitting] = useState(false)
  const [shipForm, setShipForm] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    tags: '',
  })

  // Stale Items
  const [staleItems, setStaleItems] = useState<StaleItem[]>([])
  const [staleLoading, setStaleLoading] = useState(true)
  const [staleActing, setStaleActing] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'notes') fetchNotes()
    if (tab === 'retros') fetchRetros()
    if (tab === 'status') fetchCrons()
    if (tab === 'shiplog') fetchShipLog()
    if (tab === 'stale') fetchStale()
  }, [tab])

  async function fetchNotes() {
    setLoading(true)
    const json = await api.get<{ notes?: WorkflowNote[] }>('/api/workflow-notes')
    setNotes(json.notes || [])
    setLoading(false)
  }

  async function fetchRetros() {
    setLoading(true)
    const json = await api.get<{ retrospectives?: Retrospective[] }>('/api/retrospectives')
    setRetros(json.retrospectives || [])
    setLoading(false)
  }

  async function fetchCrons() {
    setLoading(true)
    const json = await api.get<{ jobs?: CronJob[] }>('/api/crons')
    const all: CronJob[] = json.jobs || []
    const filtered = all.filter((j) =>
      j.name?.includes('bjorn-ideas') ||
      j.name?.includes('bjorn-daily') ||
      j.name?.includes('bjorn-weekly')
    )
    setCrons(filtered)
    setLoading(false)
  }

  const fetchIdeas = useCallback(async () => {
    const json = await api.get<{ ideas?: Idea[] }>('/api/ideas')
    setIdeas(json.ideas || [])
  }, [])

  const fetchShipLog = useCallback(() => {
    setShipLoading(true)
    api.get<{ entries?: ChangelogEntry[] }>('/api/changelog')
      .then(d => setEntries(d.entries || []))
      .catch(() => {})
      .finally(() => setShipLoading(false))
  }, [])

  const fetchStale = useCallback(() => {
    setStaleLoading(true)
    api.get<{ items?: StaleItem[] }>('/api/stale')
      .then(d => setStaleItems(d.items || []))
      .catch(() => {})
      .finally(() => setStaleLoading(false))
  }, [])

  const updateIdeaStatus = async (id: string, newStatus: IdeaStatus) => {
    setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status: newStatus } : idea))
    try {
      const json = await api.patch<{ idea?: Idea }>('/api/ideas', { id, status: newStatus })
      if (json.idea) setIdeas(prev => prev.map(idea => idea.id === id ? json.idea! : idea))
    } catch {
      fetchIdeas()
    }
  }

  const bulkUpdateStatus = async (newStatus: IdeaStatus) => {
    if (selectedIds.size === 0) return
    setBulkActing(true)
    const ids = [...selectedIds]
    setIdeas(prev => prev.map(i => ids.includes(i.id) ? { ...i, status: newStatus } : i))
    try {
      await Promise.all(ids.map(id =>
        api.patch('/api/ideas', { id, status: newStatus })
      ))
    } catch { /* silent */ }
    setSelectedIds(new Set())
    setBulkActing(false)
    fetchIdeas()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    fetchIdeas()
    if (!supabase) return
    const channel = supabase
      .channel('pipeline-ideas-rt')
      .on<Record<string, unknown>>('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, fetchIdeas)
      .subscribe()
    return () => { supabase?.removeChannel(channel) }
  }, [fetchIdeas])

  async function markApplied(id: string, current: boolean) {
    const json = await api.patch<{ note?: WorkflowNote }>('/api/workflow-notes', { id, applied: !current })
    if (json.note) {
      setNotes((prev) => prev.map((n) => (n.id === id ? json.note! : n)))
    }
  }

  const handleShipSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shipForm.title.trim()) return
    setShipSubmitting(true)
    try {
      const tags = shipForm.tags.split(',').map(t => t.trim()).filter(Boolean)
      const json = await api.post<{ entry?: ChangelogEntry }>('/api/changelog', { ...shipForm, tags })
      if (json.entry) {
        setEntries(prev => [json.entry, ...prev])
        setShipForm({ title: '', date: new Date().toISOString().slice(0, 10), description: '', tags: '' })
        setShowShipForm(false)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setShipSubmitting(false)
    }
  }

  const deleteShipEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    await api.del('/api/changelog', { id })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const actStale = async (id: string, type: ItemType, action: 'done' | 'snooze' | 'delete') => {
    setStaleActing(`${id}-${action}`)
    try {
      if (action === 'delete') {
        await api.del('/api/stale', { id, type })
      } else {
        await api.patch('/api/stale', { id, type, action })
      }
      setStaleItems(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      console.error(err)
    } finally {
      setStaleActing(null)
    }
  }

  const grouped = CATEGORIES.reduce<Record<string, WorkflowNote[]>>((acc, cat) => {
    acc[cat] = notes.filter((n) => n.category === cat)
    return acc
  }, {})

  const tabs = [
    { key: 'ideas', label: 'Ideas' },
    { key: 'notes', label: 'Workflow Notes' },
    { key: 'retros', label: 'Retrospectives' },
    { key: 'status', label: 'Pipeline Status' },
    { key: 'shiplog', label: 'Ship Log' },
    { key: 'stale', label: 'Stale Items' },
  ] as const

  const shipGroups = groupByMonth(entries)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Pipeline
        </h1>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Ideas, lessons, retrospectives & scheduled runs
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '3px' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 14px',
              background: tab === t.key ? 'rgba(155,132,236,0.15)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: tab === t.key ? 'var(--accent-bright)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: tab === t.key ? 600 : 450,
              transition: 'all 0.15s var(--ease-spring)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
      )}

      {/* Ideas tab */}
      {tab === 'ideas' && (() => {
        const categories = [...new Set(ideas.map(i => i.category).filter(Boolean))].sort()
        const hasActiveFilters = ideasFilter !== null || effortFilter !== null || impactFilter !== null || categoryFilter !== null
        const filtered = ideas.filter(i => {
          if (ideasFilter && i.status !== ideasFilter) return false
          if (effortFilter && i.effort !== effortFilter) return false
          if (impactFilter && i.impact !== impactFilter) return false
          if (categoryFilter && i.category !== categoryFilter) return false
          return true
        })

        const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))

        return (
        <div style={{ marginBottom: '32px' }}>
          {/* Status pills row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setIdeasFilter(null)}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: ideasFilter === null ? 'rgba(255,255,255,0.2)' : 'transparent',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                background: ideasFilter === null ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: ideasFilter === null ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.15s var(--ease-spring)',
              }}
            >
              All <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: '2px' }}>{ideas.length}</span>
            </button>
            {IDEA_STATUS_META.map(({ status, label, color }) => {
              const active = ideasFilter === status
              const count = ideas.filter(i => i.status === status).length
              return (
                <button
                  key={status}
                  onClick={() => setIdeasFilter(active ? null : status)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: active ? `${color}66` : 'transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: active ? `${color}18` : 'transparent',
                    color: active ? color : 'var(--text-muted)',
                    transition: 'all 0.15s var(--ease-spring)',
                  }}
                >
                  {label} <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: '2px' }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Secondary filters row: effort, impact, category + select all */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {/* Effort */}
            <FilterDropdown
              label="Effort"
              value={effortFilter}
              options={['low', 'medium', 'high']}
              onChange={setEffortFilter}
              colorMap={IDEA_LEVEL_COLORS}
            />
            {/* Impact */}
            <FilterDropdown
              label="Impact"
              value={impactFilter}
              options={['low', 'medium', 'high']}
              onChange={setImpactFilter}
              colorMap={IDEA_LEVEL_COLORS}
            />
            {/* Category */}
            <FilterDropdown
              label="Category"
              value={categoryFilter}
              options={categories}
              onChange={setCategoryFilter}
            />

            {hasActiveFilters && (
              <button
                onClick={() => { setIdeasFilter(null); setEffortFilter(null); setImpactFilter(null); setCategoryFilter(null) }}
                style={{
                  padding: '4px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 500, background: 'rgba(248,113,113,0.1)', color: 'var(--red)',
                  transition: 'all 0.12s',
                }}
              >
                Clear filters
              </button>
            )}

            <span style={{ flex: 1 }} />

            {/* Result count */}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>

            {/* Select all */}
            {filtered.length > 0 && (
              <button
                onClick={() => {
                  if (allSelected) setSelectedIds(new Set())
                  else setSelectedIds(new Set(filtered.map(i => i.id)))
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: allSelected ? 'rgba(155,132,236,0.3)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: allSelected ? 'rgba(155,132,236,0.1)' : 'transparent',
                  color: allSelected ? 'var(--accent-bright)' : 'var(--text-muted)',
                  transition: 'all 0.15s var(--ease-spring)',
                }}
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {/* Idea cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {(() => {
              if (filtered.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {hasActiveFilters ? 'No ideas match filters' : 'No ideas yet'}
                  </div>
                )
              }
              return filtered.map((idea, idx) => {
                const statusMeta = IDEA_STATUS_META.find(s => s.status === idea.status)
                const isSelected = selectedIds.has(idea.id)
                const isExpanded = expandedIdeaId === idea.id
                return (
                  <div
                    key={idea.id}
                    style={{
                      borderRadius: idx === 0 ? '10px 10px 2px 2px' : idx === filtered.length - 1 ? '2px 2px 10px 10px' : '2px',
                      background: isExpanded ? 'rgba(255,255,255,0.04)' : isSelected ? 'rgba(155,132,236,0.06)' : 'rgba(255,255,255,0.02)',
                      border: '1px solid',
                      borderColor: isExpanded ? 'rgba(155,132,236,0.3)' : isSelected ? 'rgba(155,132,236,0.2)' : 'var(--border)',
                      transition: 'all 0.15s var(--ease-spring)',
                      marginBottom: '-1px',
                      position: 'relative',
                      zIndex: isExpanded ? 2 : isSelected ? 1 : 0,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Row header — clickable to expand */}
                    <div
                      onClick={() => setExpandedIdeaId(isExpanded ? null : idea.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        cursor: 'pointer',
                      }}
                    >
                      {/* Circular select checkbox — click stops propagation */}
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleSelect(idea.id) }}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: `1.5px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
                          background: isSelected ? 'var(--accent)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          cursor: 'pointer',
                          transition: 'all 0.15s var(--ease-spring)',
                        }}
                      >
                        {isSelected && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      {/* Title + inline badges */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4,
                          }}>
                            {idea.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {statusMeta && (
                            <span style={{
                              padding: '1px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                              background: `${statusMeta.color}15`, color: statusMeta.color,
                            }}>{statusMeta.label}</span>
                          )}
                          {idea.category && (
                            <span style={{
                              padding: '1px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 500,
                              background: 'rgba(155,132,236,0.1)', color: 'var(--accent)',
                            }}>
                              {idea.category}
                            </span>
                          )}
                          {idea.effort && (
                            <span style={{ fontSize: '10px', color: IDEA_LEVEL_COLORS[idea.effort], fontWeight: 500 }}>
                              {idea.effort} effort
                            </span>
                          )}
                          {idea.impact && (
                            <span style={{ fontSize: '10px', color: IDEA_LEVEL_COLORS[idea.impact], fontWeight: 500 }}>
                              {idea.impact} impact
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Inline actions */}
                      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                        {(idea.status === 'pending' || idea.status === 'deferred') && (
                          <>
                            <button onClick={() => updateIdeaStatus(idea.id, 'approved')} title="Approve" style={{
                              padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                              fontSize: '11px', fontWeight: 600, background: 'rgba(52,211,153,0.12)', color: 'var(--green)',
                              transition: 'all 0.12s',
                            }}>Approve</button>
                            <button onClick={() => updateIdeaStatus(idea.id, 'rejected')} title="Reject" style={{
                              padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                              fontSize: '11px', fontWeight: 600, background: 'rgba(248,113,113,0.12)', color: 'var(--red)',
                              transition: 'all 0.12s',
                            }}>Reject</button>
                            {idea.status === 'pending' && (
                              <button onClick={() => updateIdeaStatus(idea.id, 'deferred')} title="Defer" style={{
                                padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                fontSize: '11px', fontWeight: 600, background: 'rgba(230,168,23,0.12)', color: '#e6a817',
                                transition: 'all 0.12s',
                              }}>Defer</button>
                            )}
                          </>
                        )}
                        {idea.status === 'approved' && idea.mission_id && (
                          <span style={{ fontSize: '11px', fontWeight: 500, color: '#34d399', opacity: 0.8 }}>Queued</span>
                        )}
                        {idea.status === 'approved' && !idea.mission_id && (
                          <button onClick={() => updateIdeaStatus(idea.id, 'built')} style={{
                            padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 600, background: 'rgba(155,132,236,0.12)', color: 'var(--accent-bright)',
                            transition: 'all 0.12s',
                          }}>Built</button>
                        )}
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

                    {/* Expandable detail body */}
                    <div style={{
                      display: 'grid',
                      gridTemplateRows: isExpanded ? '1fr' : '0fr',
                      transition: 'grid-template-rows 0.25s var(--ease-spring)',
                    }}>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '0 14px 14px', paddingLeft: '46px' }}>
                          {idea.description && (
                            <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                              {idea.description}
                            </p>
                          )}
                          {idea.why && (
                            <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                              {idea.why}
                            </p>
                          )}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {idea.effort && (
                              <span style={{
                                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                background: `${IDEA_LEVEL_COLORS[idea.effort]}18`, color: IDEA_LEVEL_COLORS[idea.effort],
                              }}>Effort: {idea.effort}</span>
                            )}
                            {idea.impact && (
                              <span style={{
                                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                background: `${IDEA_LEVEL_COLORS[idea.impact]}18`, color: IDEA_LEVEL_COLORS[idea.impact],
                              }}>Impact: {idea.impact}</span>
                            )}
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {new Date(idea.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          {/* Discord-style floating bulk action bar */}
          {selectedIds.size > 0 && (
            <div style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 16px',
              borderRadius: '12px',
              background: 'rgba(18, 18, 24, 0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(155,132,236,0.25)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
              zIndex: 1000,
              animation: 'fadeInUp 0.2s var(--ease-spring) both',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-bright)' }}>
                {selectedIds.size} selected
              </span>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }} />
              <button onClick={() => bulkUpdateStatus('approved')} disabled={bulkActing} style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: bulkActing ? 'wait' : 'pointer',
                fontSize: '12px', fontWeight: 600, background: 'rgba(52,211,153,0.15)', color: 'var(--green)',
                opacity: bulkActing ? 0.5 : 1, transition: 'all 0.12s',
              }}>Approve</button>
              <button onClick={() => bulkUpdateStatus('rejected')} disabled={bulkActing} style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: bulkActing ? 'wait' : 'pointer',
                fontSize: '12px', fontWeight: 600, background: 'rgba(248,113,113,0.15)', color: 'var(--red)',
                opacity: bulkActing ? 0.5 : 1, transition: 'all 0.12s',
              }}>Reject</button>
              <button onClick={() => bulkUpdateStatus('deferred')} disabled={bulkActing} style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: bulkActing ? 'wait' : 'pointer',
                fontSize: '12px', fontWeight: 600, background: 'rgba(230,168,23,0.15)', color: '#e6a817',
                opacity: bulkActing ? 0.5 : 1, transition: 'all 0.12s',
              }}>Defer</button>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }} />
              <button onClick={() => setSelectedIds(new Set())} style={{
                padding: '6px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 500, background: 'transparent', color: 'var(--text-muted)',
                transition: 'all 0.12s',
              }}>
                <X size={14} />
              </button>
            </div>
          )}

        </div>
      )})()}

      {/* Workflow Notes tab */}
      {tab === 'notes' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px',
              }}>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: CATEGORY_COLORS[cat] + '22',
                  border: `1px solid ${CATEGORY_COLORS[cat]}44`,
                  color: CATEGORY_COLORS[cat],
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {cat}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {grouped[cat].length} note{grouped[cat].length !== 1 ? 's' : ''}
                </span>
              </div>
              {grouped[cat].length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: '8px' }}>No notes yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {grouped[cat].map((n) => (
                    <div
                      key={n.id}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '12px',
                        opacity: n.applied ? 0.5 : 1,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                          {n.note}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {formatDate(n.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => markApplied(n.id, n.applied)}
                        style={{
                          flexShrink: 0,
                          padding: '4px 10px',
                          background: n.applied ? 'rgba(5, 150, 105, 0.15)' : 'transparent',
                          border: n.applied ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '6px',
                          color: n.applied ? '#34d399' : 'var(--text-muted)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.applied ? '✓ Applied' : 'Mark applied'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {notes.filter((n) => !CATEGORIES.includes(n.category)).length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other</div>
              {notes.filter((n) => !CATEGORIES.includes(n.category)).map((n) => (
                <div key={n.id} style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  [{n.category}] {n.note}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Retrospectives tab */}
      {tab === 'retros' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {retros.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No retrospectives yet.</div>
          ) : (
            retros.map((r) => (
              <div
                key={r.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {r.week || formatDate(r.created_at)}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>✅ {r.missions_completed ?? 0} missions</span>
                    <span>💡 {r.ideas_generated ?? 0} ideas</span>
                    <span>✓ {r.ideas_approved ?? 0} approved</span>
                  </div>
                </div>
                {r.wins?.length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wins</div>
                    {r.wins.map((w, i) => (
                      <div key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '8px' }}>• {w}</div>
                    ))}
                  </div>
                )}
                {r.failures?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Failures</div>
                    {r.failures.map((f, i) => (
                      <div key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '8px' }}>• {f}</div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Pipeline Status tab */}
      {tab === 'status' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Scheduled pipeline runs (filtered to Bjorn agents):
          </div>
          {crons.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              No matching cron jobs found. Expected: bjorn-ideas, bjorn-daily, bjorn-weekly.
            </div>
          ) : (
            crons.map((job, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{job.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>{job.schedule}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: 'var(--accent-bright)', fontWeight: 600 }}>
                    {formatNextRun(job.next_run)}
                  </div>
                  {job.last_run && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      last: {formatDate(job.last_run)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(155, 132, 236, 0.06)', border: '1px solid rgba(155, 132, 236, 0.15)', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expected schedule</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              🤖 Ideas agent — every 3 hours<br />
              📊 Daily analysis — 11:00 PM<br />
              📅 Weekly retro — Sunday 9:00 PM
            </div>
          </div>
        </div>
      )}

      {/* ── Ship Log Tab ── */}
      {tab === 'shiplog' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Rocket size={16} style={{ color: 'var(--accent-bright)' }} />
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Ship Log</span>
              {!shipLoading && (
                <span style={{
                  padding: '1px 7px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'rgba(155,132,236,0.12)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(155,132,236,0.2)',
                }}>
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowShipForm(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(155,132,236,0.3)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                background: showShipForm ? 'rgba(155,132,236,0.15)' : 'transparent',
                color: 'var(--accent-bright)',
                transition: 'all 0.15s',
              }}
            >
              {showShipForm ? <X size={13} /> : <Plus size={13} />}
              {showShipForm ? 'Cancel' : 'Add Entry'}
            </button>
          </div>

          <div>
            {/* Add Entry Form */}
            {showShipForm && (
              <form onSubmit={handleShipSubmit} style={{
                background: 'var(--bg-panel)',
                borderRadius: '12px',
                border: '1px solid rgba(155,132,236,0.25)',
                padding: '20px',
                marginBottom: '24px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>
                  New Ship Log Entry
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginBottom: '10px' }}>
                  <input
                    value={shipForm.title}
                    onChange={e => setShipForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Title — what did you ship?"
                    required
                    style={{
                      background: 'var(--bg-dark)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      outline: 'none',
                      width: '100%',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                      type="date"
                      value={shipForm.date}
                      onChange={e => setShipForm(f => ({ ...f, date: e.target.value }))}
                      required
                      style={{
                        background: 'var(--bg-dark)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '9px 10px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none',
                        colorScheme: 'dark',
                      }}
                    />
                  </div>
                </div>
                <textarea
                  value={shipForm.description}
                  onChange={e => setShipForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description (supports **bold**, *italic*, `code`, - lists)"
                  rows={4}
                  style={{
                    width: '100%',
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    lineHeight: 1.6,
                    marginBottom: '10px',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Tag size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    value={shipForm.tags}
                    onChange={e => setShipForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="Tags: feature, bugfix, infra (comma separated)"
                    style={{
                      flex: 1,
                      background: 'var(--bg-dark)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowShipForm(false)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '7px',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={shipSubmitting || !shipForm.title.trim()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: 'rgba(155,132,236,0.2)',
                      color: 'var(--accent-bright)',
                      opacity: shipSubmitting ? 0.6 : 1,
                    }}
                  >
                    {shipSubmitting ? 'Saving...' : 'Save Entry'}
                  </button>
                </div>
              </form>
            )}

            {shipLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading entries...</div>
            ) : entries.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No entries yet. Start logging what you ship.</div>
            ) : (
              <div>
                {Object.entries(shipGroups).map(([month, monthEntries]) => (
                  <div key={month} style={{ marginBottom: '28px' }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginBottom: '10px',
                      paddingBottom: '6px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {month}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {monthEntries.map(entry => (
                        <div
                          key={entry.id}
                          style={{
                            background: 'var(--bg-panel)',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            padding: '14px 16px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: entry.description ? '8px' : '0' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {entry.title}
                                </span>
                                {entry.tags && entry.tags.length > 0 && entry.tags.map(tag => (
                                  <span key={tag} style={{
                                    padding: '1px 6px',
                                    borderRadius: '20px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    background: 'rgba(155,132,236,0.12)',
                                    color: 'var(--accent)',
                                    border: '1px solid rgba(155,132,236,0.2)',
                                  }}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={10} />
                                {formatDay(entry.date)}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteShipEntry(entry.id)}
                              title="Delete entry"
                              aria-label="Delete entry"
                              style={{
                                padding: '4px',
                                borderRadius: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                opacity: 0.5,
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {entry.description && (
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                              <MarkdownText text={entry.description} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Ideas stats cards — overview */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {IDEA_STATUS_META.map(({ status, label, color }) => {
              const count = ideas.filter(i => i.status === status).length
              const active = ideasFilter === status
              return (
                <button
                  key={status}
                  onClick={() => setIdeasFilter(active ? null : status)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '14px 22px',
                    borderRadius: '10px',
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    background: active ? `${color}18` : 'var(--bg-dark)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    minWidth: '80px',
                  }}
                >
                  <span style={{ fontSize: '26px', fontWeight: 700, color: active ? color : 'var(--text-primary)', lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: active ? color : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Stale Items Tab ── */}
      {tab === 'stale' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <AlertTriangle size={16} style={{ color: '#e6a817' }} />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Stale Items</span>
            {!staleLoading && staleItems.length > 0 && (
              <span style={{
                padding: '1px 7px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'rgba(230,168,23,0.12)',
                color: '#e6a817',
                border: '1px solid rgba(230,168,23,0.25)',
              }}>
                {staleItems.length}
              </span>
            )}
          </div>
          {staleLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading stale items...</div>
          ) : staleItems.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'var(--text-muted)',
              fontSize: '13px',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>All clear</div>
              <div>No stale items. Everything is up to date.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {staleItems.map(item => {
                const days = daysAgo(item.staleSince)
                const title = item.title || item.text || 'Untitled'
                const TypeIcon = STALE_TYPE_ICONS[item.type]
                const colors = STALE_TYPE_COLORS[item.type]
                const staleColor = days > 14 ? 'var(--red)' : days > 7 ? '#e6a817' : 'var(--text-muted)'

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    style={{
                      background: 'var(--bg-panel)',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: colors.bg,
                      border: `1px solid ${colors.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <TypeIcon size={14} style={{ color: colors.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {title}
                        </span>
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: '20px',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: colors.bg,
                          color: colors.color,
                          border: `1px solid ${colors.border}`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}>
                          {item.type}
                        </span>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600, color: staleColor }}>
                        <Clock size={10} />
                        {days}d stale
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                      <button
                        onClick={() => actStale(item.id, item.type, 'done')}
                        disabled={staleActing === `${item.id}-done`}
                        title="Mark done"
                        style={{
                          padding: '4px 9px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'rgba(59,165,92,0.15)',
                          color: 'var(--green)',
                          opacity: staleActing === `${item.id}-done` ? 0.5 : 1,
                        }}
                      >
                        Done
                      </button>
                      <button
                        onClick={() => actStale(item.id, item.type, 'snooze')}
                        disabled={staleActing === `${item.id}-snooze`}
                        title="Snooze 3 days"
                        style={{
                          padding: '4px 9px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'rgba(230,168,23,0.15)',
                          color: '#e6a817',
                          opacity: staleActing === `${item.id}-snooze` ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <BellOff size={10} />
                        3d
                      </button>
                      <button
                        onClick={() => actStale(item.id, item.type, 'delete')}
                        disabled={staleActing === `${item.id}-delete`}
                        title="Delete"
                        aria-label="Delete"
                        style={{
                          padding: '4px 7px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          background: 'rgba(240,71,71,0.12)',
                          color: 'var(--red)',
                          opacity: staleActing === `${item.id}-delete` ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
