import { useRef, useCallback, useState } from 'react'

interface ResizablePanelProps {
  title: string
  storageKey?: string
  initialX: number
  initialY: number
  initialW: number
  initialH: number
  minW?: number
  minH?: number
  children: React.ReactNode
  style?: React.CSSProperties
}

function loadSaved(key: string | undefined, defaults: { x: number; y: number; w: number; h: number }) {
  if (!key) return defaults
  try {
    const raw = localStorage.getItem(`panel-${key}`)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaults
}

function save(key: string | undefined, pos: { x: number; y: number }, size: { w: number; h: number }) {
  if (!key) return
  localStorage.setItem(`panel-${key}`, JSON.stringify({ x: pos.x, y: pos.y, w: size.w, h: size.h }))
}

export function ResizablePanel({
  title,
  storageKey,
  initialX,
  initialY,
  initialW,
  initialH,
  minW = 150,
  minH = 100,
  children,
  style,
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

  const bringToFront = useCallback(() => {
    setZIdx(Date.now() % 100000)
  }, [])

  // Clamp position so panel stays within parent
  const clamp = useCallback((x: number, y: number, w: number, h: number) => {
    const { pw, ph } = getParentSize()
    return {
      x: Math.max(0, Math.min(x, pw - w)),
      y: Math.max(0, Math.min(y, ph - h)),
    }
  }, [getParentSize])

  // Drag by title bar
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    bringToFront()
    const startX = e.clientX, startY = e.clientY, origX = pos.x, origY = pos.y
    const onMove = (ev: MouseEvent) => {
      setPos(clamp(origX + ev.clientX - startX, origY + ev.clientY - startY, size.w, size.h))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPos(p => { save(storageKey, p, size); return p })
    }
    document.body.style.cursor = 'grab'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [pos, size, bringToFront, storageKey, clamp])

  // Resize from edges/corners
  const handleResize = useCallback((edge: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    bringToFront()
    const startX = e.clientX, startY = e.clientY
    const origW = size.w, origH = size.h, origX = pos.x, origY = pos.y
    const { pw, ph } = getParentSize()

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      let newW = origW, newH = origH, newX = origX, newY = origY

      if (edge.includes('e')) newW = Math.max(minW, Math.min(origW + dx, pw - origX))
      if (edge.includes('s')) newH = Math.max(minH, Math.min(origH + dy, ph - origY))
      if (edge.includes('w')) {
        const maxDx = origW - minW
        const clampedDx = Math.max(-origX, Math.min(dx, maxDx))
        newW = origW - clampedDx
        newX = origX + clampedDx
      }
      if (edge.includes('n')) {
        const maxDy = origH - minH
        const clampedDy = Math.max(-origY, Math.min(dy, maxDy))
        newH = origH - clampedDy
        newY = origY + clampedDy
      }

      setSize({ w: newW, h: newH })
      setPos({ x: newX, y: newY })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPos(p => { setSize(s => { save(storageKey, p, s); return s }); return p })
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [size, pos, minW, minH, bringToFront, storageKey, getParentSize])

  const edge = (cursor: string, extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', ...extra, cursor, zIndex: 2,
  })

  return (
    <div
      ref={elRef}
      onMouseDown={bringToFront}
      style={{
        position: 'absolute',
        left: pos.x, top: pos.y, width: size.w, height: size.h,
        borderRadius: '10px',
        border: '1px solid var(--border)',
        background: 'var(--bg-panel)',
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
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {title}
        </span>
      </div>
      <div style={{ flex: '1 1 0', overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
      {/* Resize handles — inside panel */}
      <div onMouseDown={handleResize('e')} style={edge('ew-resize', { top: 0, right: 0, width: 5, bottom: 0 })} />
      <div onMouseDown={handleResize('w')} style={edge('ew-resize', { top: 0, left: 0, width: 5, bottom: 0 })} />
      <div onMouseDown={handleResize('s')} style={edge('ns-resize', { bottom: 0, left: 0, right: 0, height: 5 })} />
      <div onMouseDown={handleResize('n')} style={edge('ns-resize', { top: 0, left: 0, right: 0, height: 5 })} />
      <div onMouseDown={handleResize('se')} style={edge('nwse-resize', { bottom: 0, right: 0, width: 10, height: 10 })} />
      <div onMouseDown={handleResize('sw')} style={edge('nesw-resize', { bottom: 0, left: 0, width: 10, height: 10 })} />
      <div onMouseDown={handleResize('ne')} style={edge('nesw-resize', { top: 0, right: 0, width: 10, height: 10 })} />
      <div onMouseDown={handleResize('nw')} style={edge('nwse-resize', { top: 0, left: 0, width: 10, height: 10 })} />
    </div>
  )
}
