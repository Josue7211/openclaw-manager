import { useState, useCallback } from 'react'
import { SessionList } from './SessionList'
import { SessionOutputPanel } from './SessionOutputPanel'

export default function SessionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listWidth, setListWidth] = useState(320)

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = listWidth
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setListWidth(Math.max(240, Math.min(startWidth + delta, 480)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [listWidth])

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      margin: '-20px -28px',
      display: 'flex',
      overflow: 'hidden',
      userSelect: 'text',
      WebkitUserSelect: 'text',
    }}>
      {/* Left panel: session list */}
      <div style={{
        width: listWidth,
        minWidth: listWidth,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <SessionList selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResize}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: 'transparent',
          flexShrink: 0,
          marginLeft: -2,
          marginRight: -2,
          zIndex: 10,
          position: 'relative',
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize session list"
      />

      {/* Right panel: output viewer */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <SessionOutputPanel sessionId={selectedId} key={selectedId} />
      </div>
    </div>
  )
}
