import { useRef, useCallback, useState, useEffect } from 'react'

export interface PanelRect { x: number; y: number; w: number; h: number }

interface ResizablePanelProps {
  title: string
  onTitleChange?: (newTitle: string) => void
  storageKey?: string
  initialX: number
  initialY: number
  initialW: number
  initialH: number
  minW?: number
  minH?: number
  children: React.ReactNode
  style?: React.CSSProperties
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  siblings?: (PanelRect & { id: string })[]
  onRectChange?: (rect: PanelRect) => void
  onSwap?: (targetId: string) => void
  panelId?: string
  forceRect?: PanelRect & { _rev?: number }
  swapTarget?: boolean
  onSwapHover?: (targetId: string | null) => void
}

function loadSaved(key: string | undefined, defaults: PanelRect): PanelRect {
  if (!key) return defaults
  try {
    const raw = localStorage.getItem(`panel-${key}`)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaults
}

function save(key: string | undefined, r: PanelRect) {
  if (!key) return
  localStorage.setItem(`panel-${key}`, JSON.stringify(r))
}

function rectsOverlap(a: PanelRect, b: PanelRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const GAP = 16
const RESIZE_GAP = GAP
const SNAP = 20

function wouldCollideDrag(rect: PanelRect, siblings: (PanelRect & { id?: string })[]): boolean {
  return siblings.some(s => rectsOverlap(
    rect,
    { x: s.x - GAP, y: s.y - GAP, w: s.w + GAP * 2, h: s.h + GAP * 2 },
  ))
}

function wouldCollideResize(rect: PanelRect, siblings: (PanelRect & { id?: string })[]): boolean {
  return siblings.some(s => rectsOverlap(
    rect,
    { x: s.x - RESIZE_GAP, y: s.y - RESIZE_GAP, w: s.w + RESIZE_GAP * 2, h: s.h + RESIZE_GAP * 2 },
  ))
}

function findSwapTarget(rect: PanelRect, siblings: (PanelRect & { id: string })[]): string | null {
  let best: string | null = null
  let bestOverlap = 0
  for (const s of siblings) {
    const ox = Math.max(0, Math.min(rect.x + rect.w, s.x + s.w) - Math.max(rect.x, s.x))
    const oy = Math.max(0, Math.min(rect.y + rect.h, s.y + s.h) - Math.max(rect.y, s.y))
    const overlapArea = ox * oy
    const siblingArea = s.w * s.h
    const pct = siblingArea > 0 ? overlapArea / siblingArea : 0
    if (pct > 0.3 && overlapArea > bestOverlap) {
      bestOverlap = overlapArea
      best = s.id
    }
  }
  return best
}

export function ResizablePanel({
  title, onTitleChange, storageKey, initialX, initialY, initialW, initialH,
  minW = 150, minH = 100, children, style, siblings = [], onRectChange, onSwap, panelId, forceRect, swapTarget, onSwapHover,
  onDragOver: panelDragOver, onDrop: panelDrop,
}: ResizablePanelProps) {
  const saved = loadSaved(storageKey, { x: initialX, y: initialY, w: initialW, h: initialH })
  const [pos, setPos] = useState({ x: saved.x, y: saved.y })
  const [size, setSize] = useState({ w: saved.w, h: saved.h })
  const [zIdx, setZIdx] = useState(1)
  const elRef = useRef<HTMLDivElement>(null)

  const getParentSize = useCallback(() => {
    const p = elRef.current?.parentElement
    return p ? { pw: p.offsetWidth, ph: p.offsetHeight } : { pw: 2000, ph: 1000 }
  }, [])

  // Report rect to parent
  useEffect(() => {
    onRectChange?.({ x: pos.x, y: pos.y, w: size.w, h: size.h })
  }, [pos.x, pos.y, size.w, size.h])

  // Apply forced rect (e.g. after swap or shared resize) — clamp to parent
  useEffect(() => {
    if (forceRect && forceRect._rev) {
      const { pw, ph } = getParentSize()
      const w = Math.min(forceRect.w, pw)
      const h = Math.min(forceRect.h, ph)
      const x = Math.max(0, Math.min(forceRect.x, pw - w))
      const y = Math.max(0, Math.min(forceRect.y, ph - h))
      setPos({ x, y })
      setSize({ w, h })
      save(storageKey, { x, y, w, h })
    }
  }, [forceRect?._rev])

  // Clamp to parent on mount
  useEffect(() => {
    const t = setTimeout(() => {
      const { pw, ph } = getParentSize()
      if (pw < 100 || ph < 100) return
      setPos(p => {
        const cx = Math.max(0, Math.min(p.x, pw - 100))
        const cy = Math.max(0, Math.min(p.y, ph - 50))
        return (cx !== p.x || cy !== p.y) ? { x: cx, y: cy } : p
      })
      setSize(s => {
        const cw = Math.min(s.w, pw)
        const ch = Math.min(s.h, ph)
        return (cw !== s.w || ch !== s.h) ? { w: cw, h: ch } : s
      })
    }, 100)
    return () => clearTimeout(t)
  }, [])

  const bringToFront = useCallback(() => setZIdx(Date.now() % 100000), [])

  // Drag by title bar — allows dragging over siblings for swap
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    bringToFront()
    const startX = e.clientX, startY = e.clientY, origX = pos.x, origY = pos.y

    const onMove = (ev: MouseEvent) => {
      const { pw, ph } = getParentSize()
      const nx = Math.max(0, Math.min(origX + ev.clientX - startX, pw - size.w))
      const ny = Math.max(0, Math.min(origY + ev.clientY - startY, ph - size.h))
      setPos({ x: nx, y: ny })
      const target = findSwapTarget({ x: nx, y: ny, w: size.w, h: size.h }, siblings as (PanelRect & { id: string })[])
      onSwapHover?.(target)
    }
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onSwapHover?.(null)

      const { pw, ph } = getParentSize()
      const finalX = Math.max(0, Math.min(origX + ev.clientX - startX, pw - size.w))
      const finalY = Math.max(0, Math.min(origY + ev.clientY - startY, ph - size.h))
      const finalRect: PanelRect = { x: finalX, y: finalY, w: size.w, h: size.h }
      const swapTarget = findSwapTarget(finalRect, siblings as (PanelRect & { id: string })[])

      if (swapTarget && onSwap) {
        setPos({ x: origX, y: origY })
        onSwap(swapTarget)
      } else if (wouldCollideDrag(finalRect, siblings)) {
        // Clamp to nearest valid position
        let bestX = finalX, bestY = finalY
        for (const s of siblings) {
          if (finalX < s.x + s.w + GAP && finalX + size.w > s.x - GAP &&
              finalY < s.y + s.h + GAP && finalY + size.h > s.y - GAP) {
            const pushRight = s.x + s.w + GAP, pushLeft = s.x - size.w - GAP
            const pushDown = s.y + s.h + GAP, pushUp = s.y - size.h - GAP
            const dists = [
              { x: pushRight, y: bestY, d: Math.abs(finalX - pushRight) },
              { x: pushLeft, y: bestY, d: Math.abs(finalX - pushLeft) },
              { x: bestX, y: pushDown, d: Math.abs(finalY - pushDown) },
              { x: bestX, y: pushUp, d: Math.abs(finalY - pushUp) },
            ].filter(p => p.x >= 0 && p.y >= 0)
            const nearest = dists.sort((a, b) => a.d - b.d)[0]
            if (nearest) { bestX = nearest.x; bestY = nearest.y }
          }
        }
        const clamped = {
          x: Math.max(0, Math.min(bestX, pw - size.w)),
          y: Math.max(0, Math.min(bestY, ph - size.h)),
        }
        setPos(clamped)
        save(storageKey, { ...clamped, w: size.w, h: size.h })
      } else {
        setPos({ x: finalX, y: finalY })
        save(storageKey, { x: finalX, y: finalY, w: size.w, h: size.h })
      }
    }
    document.body.style.cursor = 'grab'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [pos, size, bringToFront, storageKey, siblings, getParentSize, onSwap, onSwapHover])

  // Resize from edges/corners with collision + snap
  const handleResize = useCallback((edge: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    bringToFront()
    const startX = e.clientX, startY = e.clientY
    const origW = size.w, origH = size.h, origX = pos.x, origY = pos.y
    let lastGood = { x: origX, y: origY, w: origW, h: origH }

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      const { pw, ph } = getParentSize()
      let newW = origW, newH = origH, newX = origX, newY = origY

      if (edge.includes('e')) newW = Math.max(minW, Math.min(origW + dx, pw - origX))
      if (edge.includes('s')) newH = Math.max(minH, Math.min(origH + dy, ph - origY))
      if (edge.includes('w')) {
        const clampedDx = Math.max(-origX, Math.min(dx, origW - minW))
        newW = origW - clampedDx
        newX = origX + clampedDx
      }
      if (edge.includes('n')) {
        const clampedDy = Math.max(-origY, Math.min(dy, origH - minH))
        newH = origH - clampedDy
        newY = origY + clampedDy
      }

      // Snap edges to sibling edges
      for (const s of siblings) {
        const sRight = s.x + s.w, sBottom = s.y + s.h
        if (edge.includes('e') && Math.abs((newX + newW) - sRight) < SNAP) newW = sRight - newX
        if (edge.includes('s') && Math.abs((newY + newH) - sBottom) < SNAP) newH = sBottom - newY
        if (edge.includes('w') && Math.abs(newX - s.x) < SNAP) { newW += newX - s.x; newX = s.x }
        if (edge.includes('n') && Math.abs(newY - s.y) < SNAP) { newH += newY - s.y; newY = s.y }
        if (edge.includes('e') && Math.abs((newX + newW) - (s.x - GAP)) < SNAP) newW = s.x - GAP - newX
        if (edge.includes('s') && Math.abs((newY + newH) - (s.y - GAP)) < SNAP) newH = s.y - GAP - newY
        if (edge.includes('w') && Math.abs(newX - (sRight + GAP)) < SNAP) { newW += newX - (sRight + GAP); newX = sRight + GAP }
        if (edge.includes('n') && Math.abs(newY - (sBottom + GAP)) < SNAP) { newH += newY - (sBottom + GAP); newY = sBottom + GAP }
      }
      newW = Math.max(minW, newW)
      newH = Math.max(minH, newH)

      const candidate: PanelRect = { x: newX, y: newY, w: newW, h: newH }
      if (!wouldCollideResize(candidate, siblings)) {
        lastGood = candidate
        setSize({ w: newW, h: newH })
        setPos({ x: newX, y: newY })
      }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      save(storageKey, lastGood)
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [size, pos, minW, minH, bringToFront, storageKey, siblings, getParentSize])

  const edgeHandle = (cursor: string, extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', ...extra, cursor, zIndex: 2,
  })

  return (
    <div
      ref={elRef}
      onMouseDown={bringToFront}
      onDragOver={panelDragOver}
      onDrop={panelDrop}
      style={{
        position: 'absolute',
        left: pos.x, top: pos.y, width: size.w, height: size.h,
        borderRadius: '10px',
        border: swapTarget ? '1px dashed var(--accent)' : '1px solid var(--border)',
        background: swapTarget ? 'var(--purple-a08)' : 'var(--bg-panel)',
        boxShadow: swapTarget ? '0 0 20px var(--purple-a15)' : 'none',
        transition: 'border 0.2s, background 0.2s, box-shadow 0.2s',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        zIndex: zIdx,
        ...style,
      }}
    >
      <div onMouseDown={handleDragStart} style={{
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid var(--border)',
        cursor: 'grab', userSelect: 'none', flexShrink: 0,
      }}>
        <span
          onDoubleClick={onTitleChange ? (e) => {
            e.stopPropagation()
            const span = e.currentTarget
            const input = document.createElement('input')
            input.value = title
            Object.assign(input.style, {
              background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent)',
              color: 'var(--text-primary)', fontSize: '11px', fontWeight: '700',
              letterSpacing: '0.08em', textTransform: 'uppercase', outline: 'none',
              padding: '0', width: '100%', fontFamily: 'inherit',
            })
            span.textContent = ''
            span.appendChild(input)
            input.focus()
            input.select()
            const commit = () => {
              const v = input.value.trim()
              if (v && v !== title) onTitleChange(v)
              span.textContent = v || title
            }
            input.addEventListener('blur', commit)
            input.addEventListener('keydown', ev => {
              if (ev.key === 'Enter') input.blur()
              if (ev.key === 'Escape') { span.textContent = title }
            })
          } : undefined}
          style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)', cursor: onTitleChange ? 'text' : 'inherit',
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ flex: '1 1 0', overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
      <div onMouseDown={handleResize('e')} style={edgeHandle('ew-resize', { top: 0, right: 0, width: 5, bottom: 0 })} />
      <div onMouseDown={handleResize('w')} style={edgeHandle('ew-resize', { top: 0, left: 0, width: 5, bottom: 0 })} />
      <div onMouseDown={handleResize('s')} style={edgeHandle('ns-resize', { bottom: 0, left: 0, right: 0, height: 5 })} />
      <div onMouseDown={handleResize('n')} style={edgeHandle('ns-resize', { top: 0, left: 0, right: 0, height: 5 })} />
      <div onMouseDown={handleResize('se')} style={edgeHandle('nwse-resize', { bottom: 0, right: 0, width: 10, height: 10 })} />
      <div onMouseDown={handleResize('sw')} style={edgeHandle('nesw-resize', { bottom: 0, left: 0, width: 10, height: 10 })} />
      <div onMouseDown={handleResize('ne')} style={edgeHandle('nesw-resize', { top: 0, right: 0, width: 10, height: 10 })} />
      <div onMouseDown={handleResize('nw')} style={edgeHandle('nwse-resize', { top: 0, left: 0, width: 10, height: 10 })} />
    </div>
  )
}
