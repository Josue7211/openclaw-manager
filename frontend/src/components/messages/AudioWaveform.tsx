import { useEffect, useState, useRef, useMemo } from 'react'
import { Play, Pause } from 'lucide-react'

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function generateWaveformBars(seed: string, count = 32): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Array.from({ length: count }, (_, i) => {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff
    const random = (hash % 100) / 100
    const envelope = Math.sin((i / count) * Math.PI) * 0.5 + 0.5
    return 0.12 + random * 0.88 * envelope
  })
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/* ─── AudioWaveform ──────────────────────────────────────────────────────── */

function AudioWaveform({ src, fromMe, guid }: { src: string; fromMe: boolean; guid: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const animRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const bars = useMemo(() => generateWaveformBars(guid), [guid])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onMeta = () => setDuration(audio.duration)
    const onEnded = () => { setPlaying(false); setProgress(0) }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(animRef.current); return }
    function tick() {
      const a = audioRef.current
      if (a && a.duration) setProgress(a.currentTime / a.duration)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [playing])

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = x * a.duration
    setProgress(x)
  }

  const active = fromMe ? 'rgba(255,255,255,0.9)' : 'var(--apple-blue)'
  const dim = fromMe ? 'rgba(255,255,255,0.25)' : 'rgba(120,120,140,0.3)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', minWidth: '200px' }}>
      <button onClick={toggle} aria-label={playing ? 'Pause audio' : 'Play audio'} style={{
        width: '30px', height: '30px', borderRadius: '50%',
        background: fromMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,122,255,0.12)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active, flexShrink: 0,
        transition: 'transform 0.15s var(--ease-spring)',
      }}>
        {playing ? <Pause size={13} /> : <Play size={13} style={{ marginLeft: '2px' }} />}
      </button>
      <div onClick={seek} style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: '1.5px',
        height: '32px', cursor: 'pointer',
      }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: '3px', flexShrink: 0,
            height: `${h * 100}%`,
            borderRadius: '1.5px',
            background: i / bars.length <= progress ? active : dim,
            transition: 'background 0.1s',
          }} />
        ))}
      </div>
      <span style={{
        fontSize: '10px', minWidth: '30px', textAlign: 'right',
        color: fromMe ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {formatDuration(playing ? (audioRef.current?.currentTime || 0) : duration)}
      </span>
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  )
}

export default AudioWaveform
