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

type GraphLayoutMode = 'force' | 'radial' | 'compact'
type GraphLabelMode = 'auto' | 'all' | 'none'
const GRAPH_PANEL_HEIGHT = 'clamp(640px, calc(100dvh - 280px), 1120px)'

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

export default function KnowledgePage() {
  const queryClient = useQueryClient()
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [graphSeed, setGraphSeed] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null)
  const [graphSize, setGraphSize] = useState({ width: 920, height: 640 })
  const [graphDepth, setGraphDepth] = useState(2)
  const [graphMaxNodes, setGraphMaxNodes] = useState(160)
  const [graphLayout, setGraphLayout] = useState<GraphLayoutMode>('force')
  const [graphLabelMode, setGraphLabelMode] = useState<GraphLabelMode>('auto')
  const [graphParticles, setGraphParticles] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: ragStatus } = useQuery<RagStatus>({
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
      })
      return resp.results || resp.data?.results || []
    },
    enabled: debouncedSearch.length >= 2 && !!ragStatus?.reachable,
    staleTime: 60_000,
  })

  const { data: graphLabels = [], isLoading: graphLabelsLoading } = useQuery<string[]>({
    queryKey: ['knowledge-rag-labels', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', '80')
      if (debouncedSearch.length >= 2) params.set('q', debouncedSearch)
      const resp = await api.get<{ labels?: string[] }>(`/api/rag/graph/labels?${params}`)
      return resp.labels || []
    },
    enabled: !!ragStatus?.reachable,
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
    enabled: !!activeGraphLabel && !!ragStatus?.reachable,
    staleTime: 60_000,
  })

  const entries = entriesData?.entries ?? []
  const allTags = Array.from(new Set(entries.flatMap(e => e.tags || [])))
  const ragCounts = ragStatus?.statusCounts?.status_counts
  const ragCount = ragCounts?.all || ragCounts?.processed
  const hasQuery = debouncedSearch.length >= 2
  const hasResults = entries.length > 0 || ragResults.length > 0
  const ragStatusText = !ragStatus?.configured
    ? 'LightRAG not configured'
    : ragStatus.reachable
      ? `${ragStatus.backend || 'LightRAG'} online${ragCount ? ` · ${ragCount} docs` : ''}`
      : `${ragStatus.backend || 'LightRAG'} offline`

  const forceGraphData = useMemo(() => {
    const edgeCounts = new Map<string, number>()
    for (const edge of ragGraph?.edges || []) {
      edgeCounts.set(edge.source, (edgeCounts.get(edge.source) || 0) + 1)
      edgeCounts.set(edge.target, (edgeCounts.get(edge.target) || 0) + 1)
    }
    const nodes = (ragGraph?.nodes || []).map((node, index) => {
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
    const radius = Math.max(4, Math.sqrt(node.val || 4) * (graphLayout === 'compact' ? 2 : 2.35))
    const isSeed = node.id === activeGraphLabel
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
    ctx.arc(x, y, radius + (isSeed ? 8 : 4), 0, Math.PI * 2)
    ctx.fillStyle = isSeed ? 'rgba(250, 204, 21, 0.16)' : 'rgba(125, 211, 252, 0.08)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = isSeed ? 2 : 1
    ctx.fill()
    ctx.stroke()

    const showLabel = graphLabelMode === 'all' || (graphLabelMode === 'auto' && (isSeed || globalScale > 0.95 || radius > 8))
    if (!showLabel) return
    const label = String(node.name || node.id)
    const shortLabel = label.length > 28 ? `${label.slice(0, 26)}...` : label
    const fontSize = Math.max(10 / globalScale, 3.8)
    ctx.font = `${isSeed ? 700 : 600} ${fontSize}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const textY = y + radius + 4
    const metrics = ctx.measureText(shortLabel)
    const padX = 4 / globalScale
    const boxH = fontSize + 5 / globalScale
    ctx.fillStyle = 'rgba(6, 8, 18, 0.78)'
    ctx.fillRect(x - metrics.width / 2 - padX, textY - 1 / globalScale, metrics.width + padX * 2, boxH)
    ctx.fillStyle = isSeed ? '#fef08a' : '#e5e7eb'
    ctx.fillText(shortLabel, x, textY)
  }, [activeGraphLabel, graphLabelMode, graphLayout])

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
    setSelected(entry)
  }, [])

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

      {(hasQuery || hasResults || isLoading || ragLoading || ragError) && (
      <div aria-live="polite" aria-busy={isLoading || ragLoading} style={{ marginBottom: '18px' }}>
        {(isLoading || ragLoading) && hasQuery ? (
          <SkeletonList count={3} lines={3} layout="grid" />
        ) : !hasResults && hasQuery ? (
          <EmptyState icon={BookOpen} title="No knowledge matches" />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}>
            {entries.map(entry => (
              <EntryCard key={entry.id} entry={entry} onSelect={handleSelectEntry} />
            ))}
            {ragResults.map((result, index) => {
              const title = result.name || result.path || `LightRAG result ${index + 1}`
              const content = result.snippet || result.content || ''
              return (
                <button
                  key={`${title}-${index}`}
                  type="button"
                  onClick={() => setSelected({
                    id: `rag-${index}`,
                    title,
                    content: result.content || result.snippet || '',
                    tags: ['lightrag'],
                    source_url: result.path || undefined,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  } as KnowledgeEntry)}
                  style={{
                    textAlign: 'left',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-panel)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '13px', lineHeight: 1.3 }}>{title}</strong>
                    {typeof result.score === 'number' && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{result.score.toFixed(2)}</span>
                    )}
                  </div>
                  <p style={{
                    margin: 0,
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {content}
                  </p>
                </button>
              )
            })}
          </div>
        )}
        {ragError && (
          <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>
            LightRAG search unavailable.
          </div>
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
          {!ragStatus?.reachable ? (
            <EmptyState icon={ShareNetwork} title="LightRAG graph unavailable" description="Check the LightRAG host or backend route." />
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
                const radius = Math.max(8, Math.sqrt(node.val || 4) * 3.5)
                ctx.beginPath()
                ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2)
                ctx.fillStyle = color
                ctx.fill()
              }}
              linkColor={() => 'rgba(148, 163, 184, 0.22)'}
              linkWidth={(link: any) => Math.max(0.7, Math.min((link.value || 1) * 0.8, 2.5))}
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
              onNodeClick={(node: any) => setGraphSeed(node.id)}
            />
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
