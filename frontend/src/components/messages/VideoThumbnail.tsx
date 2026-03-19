import { useEffect, useState, useRef } from 'react'

/* ─── VideoThumbnail ─────────────────────────────────────────────────────── */

function VideoThumbnail({ src, br, onClick }: {
  src: string
  br: { topLeft: string; topRight: string; bottomRight: string; bottomLeft: string }
  onClick: () => void
}) {
  const radius = `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`
  const vidRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    const onLoaded = () => {
      if (v.duration > 0.5) v.currentTime = 0.5
      else v.currentTime = 0.01
    }
    const onSeeked = () => setReady(true)
    v.addEventListener('loadeddata', onLoaded)
    v.addEventListener('seeked', onSeeked)
    return () => {
      v.removeEventListener('loadeddata', onLoaded)
      v.removeEventListener('seeked', onSeeked)
    }
  }, [src])

  return (
    <div style={{ position: 'relative', cursor: 'pointer' }}
      onClick={e => { e.stopPropagation(); onClick() }}>
      <video
        ref={vidRef}
        src={src}
        preload="auto"
        muted
        playsInline
        style={{
          maxWidth: '280px', maxHeight: '320px', borderRadius: radius,
          display: ready ? 'block' : 'none',
        }}
      />
      {!ready && (
        <div style={{
          width: '240px', height: '160px', borderRadius: radius,
          background: 'linear-gradient(135deg, var(--bg-card-solid), var(--border-strong))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ready ? 'var(--overlay-light)' : 'transparent',
        borderRadius: radius, pointerEvents: 'none',
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'var(--bg-white-90)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px var(--overlay-light)',
        }}>
          <div style={{
            width: 0, height: 0,
            borderTop: '10px solid transparent', borderBottom: '10px solid transparent',
            borderLeft: '16px solid var(--border-strong)', marginLeft: '3px',
          }} />
        </div>
      </div>
    </div>
  )
}

export default VideoThumbnail
