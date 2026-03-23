import { useRef, useState, useCallback } from 'react'
import { useVnc } from '@/hooks/useVnc'
import { VncToolbar } from './VncToolbar'

interface VncViewerProps {
  quality?: number
  compression?: number
}

export function VncViewer({ quality: initialQuality, compression: initialCompression }: VncViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const [quality, setQuality] = useState(initialQuality ?? 6)
  const [compression] = useState(initialCompression ?? 2)
  const [scale, setScale] = useState<'fit' | 'native'>('fit')

  const { connected, error, disconnect, reconnect, sendClipboard } = useVnc(containerRef, {
    quality,
    compression,
  })

  const handlePasteClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) sendClipboard(text)
    } catch {
      // Clipboard read may fail without focus or permission
    }
  }, [sendClipboard])

  const handleToggleScale = useCallback(() => {
    setScale((prev) => (prev === 'fit' ? 'native' : 'fit'))
  }, [])

  const handleFullscreen = useCallback(() => {
    const el = outerRef.current
    if (!el) return
    if (el.requestFullscreen) {
      el.requestFullscreen()
    } else if ('webkitRequestFullscreen' in el) {
      (el as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen()
    }
  }, [])

  const [toolbarVisible, setToolbarVisible] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    if (relativeY < 60) {
      setToolbarVisible(true)
    }
  }, [])

  // Connecting state: no error and not yet connected
  const isConnecting = !connected && !error

  return (
    <div
      ref={outerRef}
      onMouseMove={handleMouseMove}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      {/* VNC canvas container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: scale === 'native' ? 'auto' : 'hidden',
        }}
      />

      {/* Floating toolbar */}
      <VncToolbar
        connected={connected}
        isConnecting={isConnecting}
        externalShow={toolbarVisible}
        onVisibilityChange={setToolbarVisible}
        onDisconnect={disconnect}
        onReconnect={reconnect}
        onPasteClipboard={handlePasteClipboard}
        onToggleScale={handleToggleScale}
        onFullscreen={handleFullscreen}
        scale={scale}
        quality={quality}
        onQualityChange={setQuality}
      />

      {/* Connecting overlay */}
      {isConnecting && (
        <div style={overlayStyle}>
          <div style={spinnerStyle} />
          <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 12 }}>
            Connecting to remote desktop...
          </span>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div style={overlayStyle}>
          <span style={{ color: 'var(--red-500)', fontSize: 14, marginBottom: 12 }}>
            {error}
          </span>
          <button
            onClick={reconnect}
            aria-label="Reconnect to VNC"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reconnect
          </button>
        </div>
      )}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 5,
}

const spinnerStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '3px solid var(--border)',
  borderTopColor: 'var(--amber, #f59e0b)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}
