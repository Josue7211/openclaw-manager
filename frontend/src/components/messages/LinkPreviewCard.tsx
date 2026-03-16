import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { LRUCache } from '@/lib/lru-cache'

/* ─── Module-level link preview cache (LRU, 500 entries) ─────────────── */

const linkPreviewCache = new LRUCache<string, { title: string; description: string; image: string; siteName: string }>(500)

/* ─── URL safety check — blocks javascript:, data:, vbscript: etc. ──── */

/** Only allow http/https URLs — blocks javascript:, data:, vbscript: etc. */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/* ─── LinkPreviewCard — rich OG preview like iMessage ────────────────── */

function LinkPreviewCard({ url, fromMe }: { url: string; fromMe: boolean }) {
  // Block dangerous URL schemes
  if (!isSafeUrl(url)) return null
  const [meta, setMeta] = useState<{ title: string; description: string; image: string; siteName: string } | null>(
    linkPreviewCache.get(url) || null
  )
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (linkPreviewCache.has(url)) { setMeta(linkPreviewCache.get(url)!); return }
    let cancelled = false
    api.get<{ title: string; description: string; image: string; siteName: string; error?: string }>(`/api/messages/link-preview?url=${encodeURIComponent(url)}`)
      .then(data => {
        if (cancelled || data.error) return
        linkPreviewCache.set(url, data)
        setMeta(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [url])

  if (!meta) {
    // Fallback: just show domain
    let domain = ''
    try { domain = new URL(url).hostname.replace(/^www\./, '') } catch { return null }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 10px', marginTop: '4px',
          background: fromMe ? 'var(--bg-white-12)' : 'var(--bg-white-04)',
          borderRadius: '10px', textDecoration: 'none',
          border: fromMe ? '1px solid var(--bg-white-15)' : '1px solid var(--border)',
          maxWidth: '100%', overflow: 'hidden',
        }}
      >
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" loading="lazy"
          style={{ width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <span style={{ fontSize: '11px', fontWeight: 600, color: fromMe ? 'rgba(255,255,255,0.8)' : 'var(--text-primary)' }}>
          {domain}
        </span>
      </a>
    )
  }

  const hasImage = meta.image && !imgError

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'flex', flexDirection: 'column',
        marginTop: '4px', borderRadius: '12px', overflow: 'hidden',
        background: fromMe ? 'var(--border-hover)' : 'var(--bg-white-03)',
        border: fromMe ? '1px solid var(--bg-white-12)' : '1px solid var(--border)',
        textDecoration: 'none', maxWidth: '280px',
        transition: 'background 0.15s',
      }}
    >
      {/* OG Image */}
      {hasImage && (
        <img src={meta.image} alt="" loading="lazy" style={{
          width: '100%', height: '140px', objectFit: 'cover', display: 'block',
        }} onError={() => setImgError(true)} />
      )}

      {/* Text content */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em',
          color: fromMe ? 'rgba(255,255,255,0.45)' : 'var(--text-muted)',
          marginBottom: '2px',
        }}>
          {meta.siteName}
        </div>
        {meta.title && (
          <div style={{
            fontSize: '12px', fontWeight: 600, lineHeight: 1.3,
            color: fromMe ? 'rgba(255,255,255,0.9)' : 'var(--text-primary)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {meta.title}
          </div>
        )}
        {meta.description && (
          <div style={{
            fontSize: '11px', lineHeight: 1.3, marginTop: '2px',
            color: fromMe ? 'rgba(255,255,255,0.55)' : 'var(--text-secondary)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {meta.description}
          </div>
        )}
      </div>
    </a>
  )
}

export default LinkPreviewCard
