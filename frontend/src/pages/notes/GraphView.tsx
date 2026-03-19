import { useMemo, useCallback, useRef, memo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
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

export default memo(function GraphView({ notes, selectedId, onSelectNote }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)

  const graphData = useMemo(() => buildGraphData(notes, selectedId), [notes, selectedId])

  const handleNodeClick = useCallback(
    (node: any) => {
      if (node.id) onSelectNote(node.id)
    },
    [onSelectNote],
  )

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = node.id === selectedId
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

      // Glow for selected/connected nodes
      if (isSelected || isConnected) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * 4)
        if (isSelected) {
          gradient.addColorStop(0, 'var(--accent-a30)')
          gradient.addColorStop(1, 'transparent')
        } else {
          gradient.addColorStop(0, 'var(--accent-a15)')
          gradient.addColorStop(1, 'transparent')
        }
        ctx.beginPath()
        ctx.arc(x, y, baseRadius * 4, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      }

      // Node circle
      ctx.beginPath()
      ctx.arc(x, y, baseRadius, 0, Math.PI * 2)

      if (isSelected) {
        ctx.fillStyle = 'var(--accent-dim)'
        ctx.strokeStyle = 'var(--accent)'
        ctx.lineWidth = 1.5
      } else if (isConnected) {
        ctx.fillStyle = 'var(--accent-dim)'
        ctx.strokeStyle = 'var(--accent-solid)'
        ctx.lineWidth = 1
      } else if (node.links === 0) {
        ctx.fillStyle = 'var(--bg-white-12)'
        ctx.strokeStyle = 'var(--bg-white-15)'
        ctx.lineWidth = 0.5
      } else {
        ctx.fillStyle = 'var(--accent-a40)'
        ctx.strokeStyle = 'var(--accent-a40)'
        ctx.lineWidth = 0.8
      }

      ctx.fill()
      ctx.stroke()

      // Label — only show if zoomed in enough or node is selected/connected
      const showLabel = globalScale > 1.5 || isSelected || isConnected
      if (showLabel) {
        const fontSize = Math.max(10 / globalScale, 3)
        ctx.font = `${isSelected ? '600' : '400'} ${fontSize}px "Inter", -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        const label = node.title.length > 24 ? node.title.slice(0, 22) + '…' : node.title

        // Text shadow for readability
        ctx.fillStyle = 'var(--overlay-heavy)'
        ctx.fillText(label, x + 0.3, y + baseRadius + 3.3)

        ctx.fillStyle = isSelected
          ? 'var(--accent-bright)'
          : isConnected
            ? 'var(--accent-bright)'
            : 'var(--bg-white-60)'
        ctx.fillText(label, x, y + baseRadius + 3)
      }
    },
    [selectedId, graphData.links],
  )

  const linkColor = useCallback(
    (link: any) => {
      const sourceId = link.source?.id ?? link.source
      const targetId = link.target?.id ?? link.target
      if (sourceId === selectedId || targetId === selectedId) {
        return 'var(--accent-a40)'
      }
      return 'var(--active-bg)'
    },
    [selectedId],
  )

  const linkWidth = useCallback(
    (link: any) => {
      const sourceId = link.source?.id ?? link.source
      const targetId = link.target?.id ?? link.target
      if (sourceId === selectedId || targetId === selectedId) return 1.5
      return 0.4
    },
    [selectedId],
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
    </div>
  )
})
