import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, MagnifyingGlass, NotePencil, Plus } from '@phosphor-icons/react'
import type { CanvasData, CanvasNode } from './canvasData'
import { addCanvasNode, buildCanvasLinks, buildInitialCanvasData, hydrateCanvasData, parseCanvasData } from './canvasData'
import type { VaultNote } from './types'

interface CanvasViewProps {
  notes: VaultNote[]
  boardNote: VaultNote | null
  selectedId: string | null
  onSelectNote: (id: string) => void
  onSaveBoard: (data: CanvasData) => Promise<void>
  onCreateBoard: () => Promise<VaultNote>
}

interface DragState {
  id: string
  startX: number
  startY: number
  nodeX: number
  nodeY: number
  moved: boolean
}

export default memo(function CanvasView({
  notes,
  boardNote,
  selectedId,
  onSelectNote,
  onSaveBoard,
  onCreateBoard,
}: CanvasViewProps) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<CanvasData>(() => hydrateCanvasData(boardNote ? parseCanvasData(boardNote.content) : buildInitialCanvasData(notes), notes))
  const [saving, setSaving] = useState<'saved' | 'saving' | 'error'>('saved')
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const selectedNote = selectedId ? notes.find((note) => note._id === selectedId && note.type === 'note') ?? null : null

  useEffect(() => {
    setData(hydrateCanvasData(boardNote ? parseCanvasData(boardNote.content) : buildInitialCanvasData(notes), notes))
  }, [boardNote?._id, boardNote?.content, notes])

  const noteById = useMemo(() => new Map(notes.map((note) => [note._id, note])), [notes])
  const visibleNodes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return data.nodes
    return data.nodes.filter((node) => {
      const note = noteById.get(node.id)
      return note && [note.title, note.folder, note.tags.join(' '), note.content.slice(0, 600)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle)
    })
  }, [data.nodes, noteById, query])
  const links = useMemo(
    () => buildCanvasLinks({ version: 1, nodes: visibleNodes }, notes),
    [notes, visibleNodes],
  )

  const saveBoard = useCallback(async (next: CanvasData) => {
    try {
      setSaving('saving')
      await onSaveBoard(next)
      setSaving('saved')
    } catch {
      setSaving('error')
    }
  }, [onSaveBoard])

  const updateNode = useCallback((id: string, patch: Partial<CanvasNode>) => {
    setData((current) => ({
      version: 1,
      nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node),
    }))
  }, [])

  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const nextDrag = {
        ...current,
        moved: current.moved || Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY) > 4,
      }
      dragRef.current = nextDrag
      setDrag(nextDrag)
      updateNode(current.id, {
        x: current.nodeX + event.clientX - current.startX,
        y: current.nodeY + event.clientY - current.startY,
      })
    }
    const onUp = () => {
      const moved = dragRef.current?.moved
      dragRef.current = null
      setDrag(null)
      if (moved) {
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
      if (moved) {
        setData((current) => {
          void saveBoard(current)
          return current
        })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, saveBoard, updateNode])

  const handleAddSelected = useCallback(async () => {
    if (!selectedNote) return
    setData((current) => {
      const next = addCanvasNode(current, selectedNote._id)
      void saveBoard(next)
      return next
    })
  }, [saveBoard, selectedNote])

  const handleResetLayout = useCallback(() => {
    const next = buildInitialCanvasData(notes)
    setData(next)
    void saveBoard(next)
  }, [notes, saveBoard])

  if (!boardNote) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--bg-base)' }}>
        <button
          type="button"
          onClick={() => { void onCreateBoard() }}
          style={primaryButtonStyle}
        >
          Create local canvas board
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg-base)' }}>
      <div style={{
        height: 42,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <label style={{ position: 'relative', flex: '0 1 280px', minWidth: 180 }}>
          <MagnifyingGlass size={13} style={{ position: 'absolute', left: 9, top: 8, color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find cards"
            aria-label="Find canvas cards"
            style={{
              width: '100%',
              height: 30,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              font: 'inherit',
              fontSize: 12,
              outline: 'none',
              padding: '0 8px 0 28px',
            }}
          />
        </label>
        <button type="button" onClick={handleAddSelected} disabled={!selectedNote || data.nodes.some((node) => node.id === selectedNote._id)} style={smallButtonStyle}>
          <Plus size={13} />
          Add selected
        </button>
        <button type="button" onClick={handleResetLayout} style={smallButtonStyle}>
          <ArrowCounterClockwise size={13} />
          Reset layout
        </button>
        <div style={{ marginLeft: 'auto', color: saving === 'error' ? 'var(--red)' : 'var(--text-muted)', fontSize: 11 }}>
          {saving === 'saving' ? 'Saving canvas...' : saving === 'error' ? 'Canvas save failed' : `${data.nodes.length} cards saved locally`}
        </div>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'auto' }}>
        <div style={{
          position: 'relative',
          width: Math.max(1280, ...data.nodes.map((node) => node.x + node.width + 80)),
          height: Math.max(820, ...data.nodes.map((node) => node.y + node.height + 80)),
          backgroundImage: 'radial-gradient(circle, var(--bg-white-04) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {links.map((link) => {
              const source = data.nodes.find((node) => node.id === link.source)
              const target = data.nodes.find((node) => node.id === link.target)
              if (!source || !target) return null
              return (
                <line
                  key={`${link.source}->${link.target}`}
                  x1={source.x + source.width / 2}
                  y1={source.y + source.height / 2}
                  x2={target.x + target.width / 2}
                  y2={target.y + target.height / 2}
                  stroke="var(--accent-a30)"
                  strokeWidth={1}
                />
              )
            })}
          </svg>
          {visibleNodes.map((node) => {
            const note = noteById.get(node.id)
            if (!note) return null
            const active = selectedId === node.id
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  if (!suppressClickRef.current) onSelectNote(node.id)
                }}
                onPointerDown={(event) => {
                  const nextDrag = {
                    id: node.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    nodeX: node.x,
                    nodeY: node.y,
                    moved: false,
                  }
                  dragRef.current = nextDrag
                  setDrag(nextDrag)
                  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
                }}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--accent-a12)' : 'var(--bg-panel)',
                  boxShadow: active ? '0 0 0 2px var(--accent-a15)' : '0 12px 32px var(--overlay-medium)',
                  color: 'var(--text-primary)',
                  cursor: drag?.id === node.id ? 'grabbing' : 'grab',
                  padding: 12,
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', minWidth: 0 }}>
                  <NotePencil size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 650 }}>
                    {note.title || 'Untitled'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {note.folder || 'Vault root'}
                </div>
                <div style={{
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  lineHeight: 1.45,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 3,
                }}>
                  {note.content.replace(/^---[\s\S]*?---\s*/, '').replace(/^#+\s*/gm, '').trim() || 'Empty note'}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
})

const smallButtonStyle = {
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-white-02)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
  padding: '0 9px',
} as const

const primaryButtonStyle = {
  ...smallButtonStyle,
  height: 34,
  background: 'var(--accent-dim)',
  borderColor: 'transparent',
  color: 'var(--text-on-color)',
} as const
