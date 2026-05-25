import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { BookOpen, Plus, MagnifyingGlass, Sparkle, ShareNetwork } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SkeletonList } from '@/components/Skeleton'
import { PageHeader } from '@/components/PageHeader'
import type { KnowledgeEntry } from './knowledge/shared'
import { TagChip } from './knowledge/TagChip'
import { SlidePanel } from './knowledge/SlidePanel'
import { AddEntryModal } from './knowledge/AddEntryModal'
import { EntryCard } from './knowledge/EntryCard'

interface SemanticResult {
  name?: string
  path?: string
  content?: string
  snippet?: string
  score?: number
  backend?: string
  references?: Array<Record<string, unknown>>
}

interface RagChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RagStatus {
  configured?: boolean
  reachable?: boolean
  backend?: string | null
  baseUrl?: string | null
  statusCounts?: {
    status_counts?: {
      processed?: number
      pending?: number
      processing?: number
      failed?: number
      all?: number
    }
  } | null
}

interface RagGraphNode {
  id: string
  labels?: string[]
  properties?: {
    description?: string
    entity_type?: string
    [key: string]: unknown
  }
}

interface RagGraphEdge {
  id?: string
  source: string
  target: string
  properties?: {
    description?: string
    weight?: number
    [key: string]: unknown
  }
}

interface RagGraph {
  nodes?: RagGraphNode[]
  edges?: RagGraphEdge[]
  is_truncated?: boolean
}

interface ForceGraphNode {
  id: string
  name: string
  description: string
  type: string
  degree: number
  val: number
  x?: number
  y?: number
  fx?: number
  fy?: number
}

type GraphLayoutMode = 'force' | 'radial' | 'compact'
type GraphLabelMode = 'auto' | 'all' | 'none'
const GRAPH_PANEL_HEIGHT = 'clamp(640px, calc(100dvh - 280px), 1120px)'
const GRAPH_LABEL_STOP_WORDS = new Set([
  'a',
  'an',
  'are',
  'can',
  'for',
  'how',
  'in',
  'inside',
  'is',
  'me',
  'on',
  'of',
  'show',
  'tell',
  'the',
  'to',
  'what',
  'where',
  'who',
])

export function normalizeGraphLabelSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .map(part => part.trim())
    .filter(part => part.length > 1 && !GRAPH_LABEL_STOP_WORDS.has(part))
    .join(' ')
}

function controlStyle(): React.CSSProperties {
  return {
    height: '28px',
    borderRadius: '7px',
    border: '1px solid var(--border)',
    background: 'var(--bg-panel)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    padding: '0 8px',
  }
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function normalizeEntryLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function KnowledgePage() {
  const queryClient = useQueryClient()
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [graphSeed, setGraphSeed] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null)
  const [selectedGraphNode, setSelectedGraphNode] = useState<ForceGraphNode | null>(null)
  const [graphSize, setGraphSize] = useState({ width: 920, height: 640 })
  const [graphZoom, setGraphZoom] = useState(1)
  const [graphDepth, setGraphDepth] = useState(2)
  const [graphMaxNodes, setGraphMaxNodes] = useState(160)
  const [graphLayout, setGraphLayout] = useState<GraphLayoutMode>('force')
  const [graphLabelMode, setGraphLabelMode] = useState<GraphLabelMode>('auto')
  const [graphParticles, setGraphParticles] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [chatHistory, setChatHistory] = useState<RagChatMessage[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRecordedAnswerRef = useRef('')

  const { data: ragStatus, isLoading: ragStatusLoading, error: ragStatusError } = useQuery<RagStatus>({
    queryKey: ['rag-status'],
    queryFn: () => api.get<RagStatus>('/api/rag/status'),
    staleTime: 30_000,
  })

  const { data: entriesData, isLoading } = useQuery<{ entries: KnowledgeEntry[] }>({
    queryKey: ['knowledge', debouncedSearch, tagFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('q', debouncedSearch)
      if (tagFilter) params.set('tag', tagFilter)
      return api.get<{ entries: KnowledgeEntry[] }>(`/api/knowledge?${params}`)
    },
  })

  const { data: ragResults = [], isLoading: ragLoading, error: ragError } = useQuery<SemanticResult[]>({
    queryKey: ['knowledge-rag', debouncedSearch],
    queryFn: async () => {
      const resp = await api.post<{ results?: SemanticResult[]; data?: { results?: SemanticResult[] } }>('/api/rag/search', {
        query: debouncedSearch,
        limit: 12,
        conversation_history: chatHistory.slice(-6),
        history_turns: 3,
      })
      return resp.results || resp.data?.results || []
    },
    enabled: debouncedSearch.length >= 2,
    staleTime: 60_000,
  })

  const { data: graphLabels = [], isLoading: graphLabelsLoading } = useQuery<string[]>({
    queryKey: ['knowledge-rag-labels', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', '80')
      if (debouncedSearch.length >= 2) {
        params.set('q', normalizeGraphLabelSearchQuery(debouncedSearch) || debouncedSearch)
      }
      const resp = await api.get<{ labels?: string[] }>(`/api/rag/graph/labels?${params}`)
      return resp.labels || []
    },
    enabled: ragStatus?.reachable === true,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!graphSeed && graphLabels.length > 0) {
      setGraphSeed(graphLabels[0])
    }
  }, [graphLabels, graphSeed])

  const activeGraphLabel = graphSeed || graphLabels[0] || ''
  const { data: ragGraph, isLoading: graphLoading, error: graphError } = useQuery<RagGraph>({
    queryKey: ['knowledge-rag-graph', activeGraphLabel, graphDepth, graphMaxNodes],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('label', activeGraphLabel)
      params.set('max_depth', String(graphDepth))
      params.set('max_nodes', String(graphMaxNodes))
      const resp = await api.get<{ graph?: RagGraph }>(`/api/rag/graph?${params}`)
      return resp.graph || { nodes: [], edges: [] }
    },
    enabled: !!activeGraphLabel && ragStatus?.reachable === true,
    staleTime: 60_000,
  })

  const entries = entriesData?.entries ?? []
  const entryLookup = useMemo(() => {
    const lookup = new Map<string, KnowledgeEntry>()
    for (const entry of entries) {
      lookup.set(normalizeEntryLookup(entry.id), entry)
      lookup.set(normalizeEntryLookup(entry.title), entry)
    }
    return lookup
  }, [entries])
  const allTags = Array.from(new Set(entries.flatMap(e => e.tags || [])))
  const ragCounts = ragStatus?.statusCounts?.status_counts
  const ragCount = ragCounts?.all || ragCounts?.processed
  const hasQuery = debouncedSearch.length >= 2
  const searchResults = ragResults
  const answerResult = searchResults.find(result => result.backend === 'lightrag' || result.name === 'LightRAG answer')
  const answerText = answerResult?.content || answerResult?.snippet || ''
  const showChatAnswer = hasQuery || ragLoading || !!answerResult || !!ragError

  useEffect(() => {
    if (!debouncedSearch || ragLoading || !answerText) return
    const answerKey = `${debouncedSearch}\n${answerText}`
    if (lastRecordedAnswerRef.current === answerKey) return
    lastRecordedAnswerRef.current = answerKey
    setChatHistory(prev => ([
      ...prev,
      { role: 'user' as const, content: debouncedSearch },
      { role: 'assistant' as const, content: answerText },
    ] satisfies RagChatMessage[]).slice(-6))
  }, [answerText, debouncedSearch, ragLoading])
  const ragStatusText = ragStatusLoading
    ? 'Checking memd...'
    : ragStatusError
      ? 'memd unavailable'
      : !ragStatus?.configured
        ? 'Built-in memd ready'
        : ragStatus.reachable
          ? `${ragStatus.backend || 'memd-local'} online${ragCount ? ` · ${ragCount} docs` : ''}`
          : `${ragStatus.backend || 'memd-local'} offline`
  const ragUnavailable = Boolean(ragStatusError) || ragStatus?.reachable === false
  const ragUnavailableDescription = ragStatusError
    ? 'Auth or desktop API setup is blocking the graph status request.'
    : 'The backend reported the graph service offline.'

  const forceGraphData = useMemo(() => {
    const edgeCounts = new Map<string, number>()
    for (const edge of ragGraph?.edges || []) {
      edgeCounts.set(edge.source, (edgeCounts.get(edge.source) || 0) + 1)
      edgeCounts.set(edge.target, (edgeCounts.get(edge.target) || 0) + 1)
    }
    const nodes: ForceGraphNode[] = (ragGraph?.nodes || []).map((node, index) => {
      const degree = edgeCounts.get(node.id) || 1
      const angle = (index / Math.max((ragGraph?.nodes || []).length, 1)) * Math.PI * 2
      const ring = 90 + Math.min(230, Math.sqrt(index + 1) * 34)
      const fixedPosition = graphLayout === 'radial'
        ? {
            fx: node.id === activeGraphLabel ? 0 : Math.cos(angle) * ring,
            fy: node.id === activeGraphLabel ? 0 : Math.sin(angle) * ring,
          }
        : graphLayout === 'compact'
          ? {
              x: Math.cos(angle) * ring * 0.45,
              y: Math.sin(angle) * ring * 0.45,
            }
          : {}
      return {
        id: node.id,
        name: node.labels?.[0] || node.id,
        description: node.properties?.description || '',
        type: String(node.properties?.entity_type || 'entity').toLowerCase(),
        degree,
        val: Math.max(3.5, Math.min(degree * (graphLayout === 'compact' ? 1.7 : 2.3), 18)),
        ...fixedPosition,
      }
    })
    return {
      nodes,
      links: (ragGraph?.edges || []).map(edge => ({
        source: edge.source,
        target: edge.target,
        label: edge.properties?.description || edge.id || '',
        value: edge.properties?.weight || 1,
      })),
    }
  }, [activeGraphLabel, graphLayout, ragGraph])

  useEffect(() => {
    if (!graphPanelRef.current) return
    const element = graphPanelRef.current
    const update = () => {
      const rect = element.getBoundingClientRect()
      setGraphSize({
        width: Math.max(520, Math.floor(rect.width)),
        height: Math.max(560, Math.floor(rect.height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0
    const y = node.y ?? 0
    const scale = Math.max(globalScale, 0.001)
    const isLinkedEntry = entryLookup.has(normalizeEntryLookup(node.id)) || entryLookup.has(normalizeEntryLookup(node.name || ''))
    const isSeed = node.id === activeGraphLabel
    const screenRadius = Math.min(18, Math.max(7, Math.sqrt(node.val || 4) * (graphLayout === 'compact' ? 4.3 : 4.8)))
    const radius = (screenRadius + (isSeed || isLinkedEntry ? 2 : 0)) / scale
    const glowRadius = (isSeed ? 36 : isLinkedEntry ? 30 : 22) / scale
    const colorByType: Record<string, string> = {
      organization: '#38bdf8',
      equipment: '#f59e0b',
      person: '#f472b6',
      location: '#34d399',
      software: '#a78bfa',
      other: '#a78bfa',
      unknown: '#94a3b8',
      entity: '#a78bfa',
    }
    const fill = isSeed ? '#facc15' : colorByType[node.type] || '#7dd3fc'
    const stroke = isSeed ? '#fef08a' : 'rgba(226, 232, 240, 0.78)'

    ctx.beginPath()
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2)
    ctx.fillStyle = isSeed ? 'rgba(250, 204, 21, 0.16)' : isLinkedEntry ? 'rgba(52, 211, 153, 0.14)' : 'rgba(125, 211, 252, 0.08)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = (isSeed || isLinkedEntry ? 2 : 1.2) / scale
    ctx.fill()
    ctx.stroke()

    const showLabel = graphLabelMode === 'all' || (graphLabelMode === 'auto' && (isSeed || isLinkedEntry || globalScale > 0.85))
    if (!showLabel) return
    const label = String(node.name || node.id)
    const maxLabelLength = globalScale > 2 || isSeed || isLinkedEntry ? 34 : 22
    const shortLabel = label.length > maxLabelLength ? `${label.slice(0, maxLabelLength - 1)}...` : label
    const screenFontSize = isSeed || isLinkedEntry ? 13 : 11
    const fontSize = screenFontSize / scale
    ctx.font = `${isSeed ? 700 : 600} ${fontSize}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const textY = y + radius + (screenFontSize + 8) / scale
    const metrics = ctx.measureText(shortLabel)
    const padX = 6 / scale
    const boxH = (screenFontSize + 7) / scale
    ctx.fillStyle = 'rgba(6, 8, 18, 0.78)'
    drawRoundRect(ctx, x - metrics.width / 2 - padX, textY - boxH / 2, metrics.width + padX * 2, boxH, 5 / scale)
    ctx.fill()
    ctx.fillStyle = isSeed ? '#fef08a' : isLinkedEntry ? '#bbf7d0' : '#e5e7eb'
    ctx.fillText(shortLabel, x, textY)
  }, [activeGraphLabel, entryLookup, graphLabelMode, graphLayout])

  useEffect(() => {
    if (graphLoading || forceGraphData.nodes.length === 0) return
    const timeout = window.setTimeout(() => {
      graphRef.current?.zoomToFit?.(450, 48)
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [activeGraphLabel, forceGraphData.nodes.length, graphDepth, graphLayout, graphLoading, graphMaxNodes])

  const fitGraph = useCallback(() => {
    graphRef.current?.zoomToFit?.(350, 48)
  }, [])

  const resetGraphView = useCallback(() => {
    setGraphDepth(2)
    setGraphMaxNodes(160)
    setGraphLayout('force')
    setGraphLabelMode('auto')
    setGraphParticles(false)
    window.setTimeout(() => graphRef.current?.zoomToFit?.(350, 48), 50)
  }, [])

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val.trim())
    }, 300)
  }

  const handleTagFilter = (tag: string) => {
    setTagFilter(tagFilter === tag ? null : tag)
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/api/knowledge?id=${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })

  const handleDelete = async (id: string) => {
    setSelected(null)
    await deleteMutation.mutateAsync(id)
  }

  const handleSelectEntry = useCallback((entry: KnowledgeEntry) => {
    setSelectedGraphNode(null)
    setSelected(entry)
  }, [])

  const handleGraphNodeClick = useCallback((node: ForceGraphNode) => {
    const matchingEntry = entryLookup.get(normalizeEntryLookup(node.id)) || entryLookup.get(normalizeEntryLookup(node.name || ''))
    if (matchingEntry) {
      setSelectedGraphNode(null)
      setSelected(matchingEntry)
      return
    }
    setSelected(null)
    setSelectedGraphNode(node)
  }, [entryLookup])

  return (
    <div style={{ width: '100%', paddingBottom: '28px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Knowledge" defaultSubtitle="Notes · Articles · Links · Learnings" />
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            background: 'var(--purple-a20)',
            color: 'var(--accent-bright)',
            fontWeight: 600,
            fontSize: '13px',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={14} />
          Add Entry
        </button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
        color: ragStatus?.reachable ? 'var(--text-secondary)' : 'var(--text-muted)',
        fontSize: '12px',
      }}>
        <Sparkle size={13} style={{ color: ragStatus?.reachable ? 'var(--accent)' : 'var(--text-muted)' }} />
        <span>{ragStatusText}</span>
      </div>

      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <MagnifyingGlass size={14} style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }} />
        <input
          type="search"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search knowledge..."
          aria-label="Search knowledge base"
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          {tagFilter && (
            <TagChip tag={`\u2715 ${tagFilter}`} active onClick={() => setTagFilter(null)} />
          )}
          {allTags.filter(t => t !== tagFilter).map(tag => (
            <TagChip key={tag} tag={tag} onClick={() => handleTagFilter(tag)} />
          ))}
        </div>
      )}

      {showChatAnswer && (
        <div
          aria-live="polite"
          aria-busy={ragLoading}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '18px',
          }}
        >
          <div style={{
            alignSelf: 'stretch',
            padding: '14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sparkle size={13} style={{ color: 'var(--accent)' }} />
              <strong style={{ fontSize: '12px' }}>LightRAG answer</strong>
            </div>
            <div style={{
              color: answerText ? 'var(--text-secondary)' : 'var(--text-muted)',
              fontSize: '13px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {answerText || (ragLoading ? 'Searching LightRAG...' : 'No LightRAG answer returned.')}
            </div>
            {Array.isArray(answerResult?.references) && answerResult.references.length > 0 && (
              <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>
                {answerResult.references.length} reference{answerResult.references.length === 1 ? '' : 's'}
              </div>
            )}
          </div>

          {ragError && (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Knowledge search unavailable.
            </div>
          )}
        </div>
      )}

      {(entries.length > 0 || (isLoading && !hasQuery)) && (
        <div style={{ marginBottom: '18px' }}>
          {entries.length > 0 && hasQuery && (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>
              Local knowledge
            </div>
          )}
          {entries.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px',
            }}>
              {entries.map(entry => (
                <EntryCard key={entry.id} entry={entry} onSelect={handleSelectEntry} />
              ))}
            </div>
          ) : (
            <SkeletonList count={3} lines={3} layout="grid" />
          )}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(240px, 22vw, 360px) minmax(0, 1fr)',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: '14px',
        alignItems: 'stretch',
      }}>
        <div style={{
          gridColumn: '1 / -1',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'var(--bg-panel)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Depth
            <input type="range" min={1} max={5} value={graphDepth} onChange={e => setGraphDepth(Number(e.target.value))} style={{ width: '92px' }} />
            <span style={{ minWidth: '12px', color: 'var(--text-primary)', fontWeight: 700 }}>{graphDepth}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Nodes
            <select value={graphMaxNodes} onChange={e => setGraphMaxNodes(Number(e.target.value))} style={controlStyle()}>
              {[80, 160, 300, 500].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Layout
            <select value={graphLayout} onChange={e => setGraphLayout(e.target.value as GraphLayoutMode)} style={controlStyle()}>
              <option value="force">Force</option>
              <option value="radial">Radial</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Labels
            <select value={graphLabelMode} onChange={e => setGraphLabelMode(e.target.value as GraphLabelMode)} style={controlStyle()}>
              <option value="auto">Auto</option>
              <option value="all">All</option>
              <option value="none">None</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            <input type="checkbox" checked={graphParticles} onChange={e => setGraphParticles(e.target.checked)} />
            Flow
          </label>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={fitGraph} style={{ height: '28px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
            Fit
          </button>
          <button type="button" onClick={resetGraphView} style={{ height: '28px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
            Reset
          </button>
        </div>

        <aside style={{ height: GRAPH_PANEL_HEIGHT, border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-panel)', padding: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700 }}>
            <ShareNetwork size={14} style={{ color: 'var(--accent)' }} />
            Labels
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: 'calc(100% - 28px)', overflowY: 'auto', paddingRight: '2px' }}>
            {graphLabelsLoading ? (
              <SkeletonList count={6} lines={1} />
            ) : graphLabels.length === 0 ? (
              <EmptyState icon={ShareNetwork} title="No graph labels" />
            ) : graphLabels.map(label => (
              <button
                key={label}
                type="button"
                onClick={() => setGraphSeed(label)}
                title={label}
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '32px',
                  padding: '7px 10px',
                  borderRadius: '7px',
                  border: label === activeGraphLabel ? '1px solid var(--accent-a40)' : '1px solid transparent',
                  background: label === activeGraphLabel ? 'var(--accent-a20)' : 'rgba(255,255,255,0.02)',
                  color: label === activeGraphLabel ? 'var(--accent-bright)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  lineHeight: 1.35,
                  fontWeight: label === activeGraphLabel ? 700 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>

        <section ref={graphPanelRef} style={{ height: GRAPH_PANEL_HEIGHT, border: '1px solid var(--border)', borderRadius: '8px', background: 'linear-gradient(180deg, rgba(12, 14, 24, 0.96), rgba(7, 9, 16, 0.98))', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, padding: '6px 9px', borderRadius: '7px', background: 'rgba(7, 9, 16, 0.76)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '12px', backdropFilter: 'blur(8px)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{activeGraphLabel || 'Graph'}</strong>
            {ragGraph?.nodes && ` · ${ragGraph.nodes.length} nodes · ${(ragGraph.edges || []).length} edges`}
            {ragGraph?.is_truncated && ' · truncated'}
          </div>
          {ragStatusLoading ? (
            <div style={{ padding: '70px 18px 18px' }}>
              <SkeletonList count={3} lines={2} layout="grid" />
            </div>
          ) : ragUnavailable ? (
            <EmptyState icon={ShareNetwork} title="Knowledge graph not connected" description={ragUnavailableDescription} />
          ) : graphLoading ? (
            <div style={{ padding: '70px 18px 18px' }}>
              <SkeletonList count={3} lines={2} layout="grid" />
            </div>
          ) : graphError ? (
            <EmptyState icon={ShareNetwork} title="Graph failed to load" description="Try another label." />
          ) : forceGraphData.nodes.length === 0 ? (
            <EmptyState icon={ShareNetwork} title="No graph nodes" description="Try another label." />
          ) : (
            <ForceGraph2D
              ref={graphRef}
              graphData={forceGraphData}
              width={graphSize.width}
              height={graphSize.height}
              nodeId="id"
              nodeVal="val"
              nodeLabel={(node: any) => `${node.name}${node.type ? ` · ${node.type}` : ''}${node.description ? `\n${node.description}` : ''}`}
              linkLabel={(link: any) => link.label}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                const radius = Math.min(24, Math.max(12, Math.sqrt(node.val || 4) * 5)) / Math.max(graphZoom, 0.001)
                ctx.beginPath()
                ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2)
                ctx.fillStyle = color
                ctx.fill()
              }}
              linkColor={() => 'rgba(148, 163, 184, 0.22)'}
              linkWidth={(link: any) => Math.max(0.1, Math.min((link.value || 1) * 0.8, 2.5) / Math.max(graphZoom, 0.75))}
              linkDirectionalParticles={graphParticles ? 1 : 0}
              linkDirectionalParticleWidth={1.1}
              linkDirectionalParticleSpeed={0.003}
              cooldownTicks={120}
              backgroundColor="transparent"
              d3AlphaDecay={0.025}
              d3VelocityDecay={0.32}
              enableNodeDrag
              enablePanInteraction
              enableZoomInteraction
              onZoom={(transform: { k?: number }) => setGraphZoom(transform.k ?? 1)}
              onNodeClick={handleGraphNodeClick}
            />
          )}

          {selectedGraphNode && (
            <div style={{ position: 'absolute', right: 12, top: 50, width: 'min(340px, calc(100% - 24px))', zIndex: 3, border: '1px solid var(--border)', borderRadius: '8px', background: 'rgba(7, 9, 16, 0.92)', boxShadow: '0 18px 44px rgba(0,0,0,0.32)', backdropFilter: 'blur(10px)', padding: '14px', color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1.35 }}>{selectedGraphNode.name || selectedGraphNode.id}</div>
                  <div style={{ marginTop: '5px', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>{selectedGraphNode.type} · {selectedGraphNode.degree} link{selectedGraphNode.degree === 1 ? '' : 's'}</div>
                </div>
                <button type="button" aria-label="Close graph node details" onClick={() => setSelectedGraphNode(null)} style={{ width: 26, height: 26, borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ color: selectedGraphNode.description ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '12px', lineHeight: 1.55, wordBreak: 'break-word' }}>
                {selectedGraphNode.description || 'No description stored for this graph node.'}
              </div>
              <button type="button" onClick={() => { setGraphSeed(selectedGraphNode.id); setSelectedGraphNode(null) }} style={{ marginTop: '12px', height: '30px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--accent-a40)', background: 'var(--accent-a20)', color: 'var(--accent-bright)', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>
                Explore from here
              </button>
            </div>
          )}
        </section>
      </div>

      {selected && (
        <SlidePanel
          entry={selected}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected.id)}
        />
      )}

      {showModal && (
        <AddEntryModal
          onClose={() => setShowModal(false)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['knowledge'] })}
        />
      )}
    </div>
  )
}
