import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'

export type LightboxData = { src: string; type: 'image' | 'video' } | null

interface LightboxProps {
  data: LightboxData
  onClose: () => void
}

const LOUPE_W = 720
const LOUPE_H = 480

export default function Lightbox({ data, onClose }: LightboxProps) {
  const [loupe, setLoupe] = useState<{ x: number; y: number; zoom: number } | null>(null)
  const loupeRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const minZoomRef = useRef(0.5)
  const imgRef = useRef<HTMLImageElement>(null)

  // Close on Escape
  const handleClose = useCallback(() => {
    setLoupe(null)
    onClose()
  }, [onClose])

  useEscapeKey(handleClose, !!data)

  // Keep ref in sync so wheel handler can read latest zoom
  useEffect(() => { loupeRef.current = loupe }, [loupe])

  // Non-passive wheel listener on lightbox image
  useEffect(() => {
    if (!data || data.type !== 'image') return
    const el = imgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!loupeRef.current) return
      e.preventDefault()
      setLoupe(l => l ? { ...l, zoom: Math.max(minZoomRef.current, Math.min(12, l.zoom - e.deltaY * 0.008)) } : null)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [data])

  // Reset loupe when lightbox closes
  useEffect(() => {
    if (!data) setLoupe(null)
  }, [data])

  if (!data) return null

  return createPortal(
    <div
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out', animation: 'lightboxIn 0.2s ease-out',
      }}
    >
      <style>{`
        @keyframes lightboxIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {data.type === 'image' ? (
        <div role="presentation" onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <img
            ref={imgRef}
            src={data.src}
            alt="expanded"
            style={{
              maxWidth: '85vw', maxHeight: '85vh', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.08)', objectFit: 'contain',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)', display: 'block',
              cursor: loupe ? 'none' : 'zoom-in', userSelect: 'none',
            }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              if (loupe) {
                setLoupe(null)
              } else {
                setLoupe({ x: e.clientX - rect.left, y: e.clientY - rect.top, zoom: 2.1 })
              }
            }}
            onMouseMove={e => {
              if (!loupeRef.current) return
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const y = e.clientY - rect.top
              loupeRef.current = { ...loupeRef.current, x, y }
              const el = document.getElementById('loupe-lens')
              if (!el) return
              const iw = rect.width
              const ih = rect.height
              const zoom = loupeRef.current.zoom
              const lx = Math.max(LOUPE_W / 2, Math.min(iw - LOUPE_W / 2, x))
              const ly = Math.max(LOUPE_H / 2, Math.min(ih - LOUPE_H / 2, y))
              el.style.left = `${lx - LOUPE_W / 2}px`
              el.style.top = `${ly - LOUPE_H / 2}px`
              el.style.backgroundSize = `${iw * zoom}px ${ih * zoom}px`
              el.style.backgroundPosition = `${LOUPE_W / 2 - x * zoom}px ${LOUPE_H / 2 - y * zoom}px`
            }}
          />

          {/* Loupe lens */}
          {loupe && imgRef.current && (() => {
            const iw = imgRef.current.clientWidth
            const ih = imgRef.current.clientHeight
            minZoomRef.current = Math.max(LOUPE_W / iw, LOUPE_H / ih) / 0.85
            const lx = Math.max(LOUPE_W / 2, Math.min(iw - LOUPE_W / 2, loupe.x))
            const ly = Math.max(LOUPE_H / 2, Math.min(ih - LOUPE_H / 2, loupe.y))
            return (
              <div id="loupe-lens" style={{
                position: 'absolute', left: lx - LOUPE_W / 2, top: ly - LOUPE_H / 2,
                width: LOUPE_W, height: LOUPE_H, borderRadius: '14px',
                border: '2px solid rgba(255,255,255,0.35)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
                backgroundImage: `url(${data.src})`,
                backgroundSize: `${iw * loupe.zoom}px ${ih * loupe.zoom}px`,
                backgroundPosition: `${LOUPE_W / 2 - loupe.x * loupe.zoom}px ${LOUPE_H / 2 - loupe.y * loupe.zoom}px`,
                backgroundRepeat: 'no-repeat', pointerEvents: 'none',
                willChange: 'left, top, background-position, background-size',
              }} />
            )
          })()}
        </div>
      ) : (
        <div role="presentation" onClick={e => e.stopPropagation()}>
          <video
            src={data.src}
            controls
            autoPlay
            playsInline
            style={{
              maxWidth: '85vw', maxHeight: '85vh', display: 'block',
              borderRadius: '10px', outline: 'none', background: '#000',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            }}
          />
        </div>
      )}

      {/* Close button */}
      <button
        onClick={handleClose}
        aria-label="Close lightbox"
        style={{
          position: 'fixed', top: '20px', right: '24px',
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '50%', width: '36px', height: '36px', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
      >
        <X size={18} />
      </button>
    </div>,
    document.body
  )
}
