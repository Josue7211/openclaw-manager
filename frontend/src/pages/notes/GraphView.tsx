import { useMemo, useCallback, useRef, useState, memo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { MagnifyingGlass, Plus, Minus, Crosshair } from '@phosphor-icons/react'
import type { VaultNote, GraphData } from './types'
import { noteIdFromTitle } from '@/lib/vault'

interface GraphViewProps {
  notes: VaultNote[]
  selectedId: string | null
  onSelectNote: (id: string) => void
}

function buildGraphData(notes: VaultNote[], selectedId: string | null): GraphData {
  const noteMap = new Map(notes.map((n) => [n._id, n]))
  const titleToId = new Map<string, string>()

  for (const n of notes) {
    titleToId.set(n.title.toLowerCase(), n._id)
    const stem = n._id.replace(/\.md$/, '').split('/').pop()
    if (stem) titleToId.set(stem.toLowerCase(), n._id)
  }

  const nodes = notes.map((n) => {
    const connectionCount = n.links.length +
      notes.filter((other) => other.links.some((l) => {
        const targetId = titleToId.get(l.toLowerCase())
        return targetId === n._id
      })).length

    return {
      id: n._id,
      title: n.title || 'Untitled',
      links: connectionCount,
      val: Math.max(2, Math.min(connectionCount * 2 + 2, 20)),
    }
  })

  const links: GraphData['links'] = []
  const seen = new Set<string>()

  for (const n of notes) {
    for (const linkText of n.links) {
      const targetId = titleToId.get(linkText.toLowerCase())
      if (targetId && noteMap.has(targetId)) {
        const key = [n._id, targetId].sort().join('::')
        if (!seen.has(key)) {
          seen.add(key)
          links.push({ source: n._id, target: targetId })
        }
      }
    }
  }

  return { nodes, links }
}

/** Resolve a CSS variable to its computed value for Canvas API use. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Cache resolved CSS vars per paint cycle to avoid repeated getComputedStyle calls. */
function resolveCanvasColors() {
  return {
    accentA30: cssVar('--accent-a30') || 'rgba(167, 139, 250, 0.3)',
    accentA15: cssVar('--accent-a15') || 'rgba(167, 139, 250, 0.15)',
    accentA40: cssVar('--accent-a40') || 'rgba(167, 139, 250, 0.4)',
    accentDim: cssVar('--accent-dim') || 'rgba(167, 139, 250, 0.15)',
    accent: cssVar('--accent') || '#a78bfa',
    accentSolid: cssVar('--accent-solid') || '#7c3aed',
    accentBright: cssVar('--accent-bright') || '#c4b5fd',
    bgWhite12: cssVar('--bg-white-12') || 'rgba(255,255,255,0.12)',
    bgWhite15: cssVar('--bg-white-15') || 'rgba(255,255,255,0.15)',
    bgWhite60: cssVar('--bg-white-60') || 'rgba(255,255,255,0.6)',
    overlayHeavy: cssVar('--overlay-heavy') || 'rgba(0,0,0,0.6)',
    activeBg: cssVar('--active-bg') || 'rgba(255,255,255,0.06)',
  }
}

export default memo(function GraphView({ notes, selectedId, onSelectNote }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [graphSearch, setGraphSearch] = useState('')

  const graphData = useMemo(() => buildGraphData(notes, selectedId), [notes, selectedId])

  // Set of node IDs matching the graph search query
  const highlightedIds = useMemo(() => {
    if (!graphSearch.trim()) return new Set<string>()
    const q = graphSearch.toLowerCase()
    return new Set(
      graphData.nodes
        .filter((n) => n.title.toLowerCase().includes(q))
        .map((n) => n.id),
    )
  }, [graphSearch, graphData.nodes])

  const handleNodeClick = useCallback(
    (node: any) => {
      if (node.id) onSelectNote(node.id)
    },
    [onSelectNote],
  )

  const handleZoomIn = useCallback(() => {
    const fg = graphRef.current
    if (!fg) return
    const currentZoom = fg.zoom()
    fg.zoom(Math.min(currentZoom * 1.5, 12), 300)
  }, [])

  const handleZoomOut = useCallback(() => {
    const fg = graphRef.current
    if (!fg) return
    const currentZoom = fg.zoom()
    fg.zoom(Math.max(currentZoom / 1.5, 0.3), 300)
  }, [])

  const handleZoomToFit = useCallback(() => {
    const fg = graphRef.current
    if (fg) fg.zoomToFit(400, 40)
  }, [])

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const c = resolveCanvasColors()
      const isSelected = node.id === selectedId
      const isSearchMatch = highlightedIds.has(node.id)
      const isConnected = selectedId
        ? graphData.links.some(
            (l: any) =>
              (l.source?.id === selectedId && l.target?.id === node.id) ||
              (l.target?.id === selectedId && l.source?.id === node.id) ||
              (l.source === selectedId && l.target === node.id) ||
              (l.target === selectedId && l.source === node.id),
          )
        : false

      const x = node.x ?? 0
      const y = node.y ?? 0
      const baseRadius = Math.sqrt(node.val) * 2.5

      // Glow for selected/connected/search-matched nodes
      if (isSelected || isConnected || isSearchMatch) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * 4)
        if (isSelected) {
          gradient.addColorStop(0, c.accentA30)
          gradient.addColorStop(1, 'transparent')
        } else if (isSearchMatch) {
          gradient.addColorStop(0, c.accentA30)
          gradient.addColorStop(1, 'transparent')
        } else {
          gradient.addColorStop(0, c.accentA15)
          gradient.addColorStop(1, 'transparent')
        }
        ctx.beginPath()
        ctx.arc(x, y, baseRadius * 4, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      }

      // Dim non-matching nodes when search is active
      const isDimmed = highlightedIds.size > 0 && !isSearchMatch && !isSelected && !isConnected

      // Node circle
      ctx.beginPath()
      ctx.arc(x, y, baseRadius, 0, Math.PI * 2)

      if (isSelected) {
        ctx.fillStyle = c.accentDim
        ctx.strokeStyle = c.accent
        ctx.lineWidth = 1.5
      } else if (isSearchMatch) {
        ctx.fillStyle = c.accentDim
        ctx.strokeStyle = c.accent
        ctx.lineWidth = 1.5
      } else if (isConnected) {
        ctx.fillStyle = c.accentDim
        ctx.strokeStyle = c.accentSolid
        ctx.lineWidth = 1
      } else if (node.links === 0) {
        ctx.fillStyle = c.bgWhite12
        ctx.strokeStyle = c.bgWhite15
        ctx.lineWidth = 0.5
      } else {
        ctx.fillStyle = c.accentA40
        ctx.strokeStyle = c.accentA40
        ctx.lineWidth = 0.8
      }

      if (isDimmed) {
        ctx.globalAlpha = 0.15
      }

      ctx.fill()
      ctx.stroke()

      // Label — show for zoomed-in, selected, connected, or search-matched nodes
      const showLabel = globalScale > 1.5 || isSelected || isConnected || isSearchMatch
      if (showLabel) {
        const fontSize = Math.max(10 / globalScale, 3)
        ctx.font = `${isSelected || isSearchMatch ? '600' : '400'} ${fontSize}px "Inter", -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        const label = node.title.length > 30 ? node.title.slice(0, 28) + '...' : node.title

        // Text shadow for readability
        ctx.fillStyle = c.overlayHeavy
        ctx.fillText(label, x + 0.3, y + baseRadius + 3.3)

        ctx.fillStyle = isSelected || isSearchMatch
          ? c.accentBright
          : isConnected
            ? c.accentBright
            : c.bgWhite60
        ctx.fillText(label, x, y + baseRadius + 3)
      }

      if (isDimmed) {
        ctx.globalAlpha = 1
      }
    },
    [selectedId, graphData.links, highlightedIds],
  )

  const linkColor = useCallback(
    (link: any) => {
      const c = resolveCanvasColors()
      const sourceId = link.source?.id ?? link.source
      const targetId = link.target?.id ?? link.target
      if (sourceId === selectedId || targetId === selectedId) {
        return c.accentA40
      }
      // Dim links when search is active and neither endpoint matches
      if (highlightedIds.size > 0) {
        if (!highlightedIds.has(sourceId) && !highlightedIds.has(targetId)) {
          return 'rgba(255,255,255,0.02)'
        }
        if (highlightedIds.has(sourceId) || highlightedIds.has(targetId)) {
          return c.accentA40
        }
      }
      return c.activeBg
    },
    [selectedId, highlightedIds],
  )

  const linkWidth = useCallback(
    (link: any) => {
      const sourceId = link.source?.id ?? link.source
      const targetId = link.target?.id ?? link.target
      if (sourceId === selectedId || targetId === selectedId) return 1.5
      if (highlightedIds.size > 0 && (highlightedIds.has(sourceId) || highlightedIds.has(targetId))) return 1.2
      return 0.4
    },
    [selectedId, highlightedIds],
  )

  if (notes.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        Create notes with [[wikilinks]] to see the graph
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at center, rgba(15, 10, 30, 1) 0%, rgba(5, 2, 15, 1) 100%)' /* intentionally hardcoded — deep purple graph background */,
        position: 'relative',
      }}
    >
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeId="id"
        nodeVal="val"
        nodeLabel="title"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const r = Math.sqrt(node.val) * 3
          ctx.beginPath()
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkCurvature={0.15}
        linkDirectionalParticles={0}
        onNodeClick={handleNodeClick}
        backgroundColor="transparent"
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        minZoom={0.3}
        maxZoom={12}
      />

      {/* Subtle vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 50%, var(--overlay-light) 100%)',
        }}
      />

      {/* Graph search input */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 10,
        }}
      >
        <MagnifyingGlass size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.6 }} />
        <input
          value={graphSearch}
          onChange={(e) => setGraphSearch(e.target.value)}
          placeholder="Filter nodes..."
          aria-label="Filter graph nodes"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: 12,
            width: 120,
            padding: 0,
            fontFamily: 'inherit',
          }}
        />
        {graphSearch && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.6, flexShrink: 0 }}>
            {highlightedIds.size} found
          </span>
        )}
      </div>

      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 10,
        }}
      >
        <button
          onClick={handleZoomIn}
          className="hover-bg"
          aria-label="Zoom in"
          title="Zoom in"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
        </button>
        <button
          onClick={handleZoomOut}
          className="hover-bg"
          aria-label="Zoom out"
          title="Zoom out"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleZoomToFit}
          className="hover-bg"
          aria-label="Zoom to fit"
          title="Zoom to fit all nodes"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <Crosshair size={14} />
        </button>
      </div>
    </div>
  )
})
