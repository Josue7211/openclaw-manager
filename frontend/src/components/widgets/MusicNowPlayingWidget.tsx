import React from 'react'
import { MusicNote, ArrowRight, Pause } from '@phosphor-icons/react'
import { SkeletonRows } from '@/components/Skeleton'
import { useMusicWidget } from '@/lib/hooks/dashboard/useMusicWidget'
import type { WidgetProps } from '@/lib/widget-registry'

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (diffMs < 0) return 'just now'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export const MusicNowPlayingWidget = React.memo(function MusicNowPlayingWidget({ config }: WidgetProps) {
  const { nowPlaying, isLoading, isConfigured, isOnline, health } = useMusicWidget()

  const showAlbumArt = config.showAlbumArt !== undefined ? Boolean(config.showAlbumArt) : true

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <MusicNote size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Music
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonRows count={2} />
      ) : !isConfigured ? (
        <div style={{
          padding: '12px', borderRadius: '8px', background: 'var(--bg-white-03)',
          border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
          gap: '8px', flex: 1,
        }}>
          <MusicNote size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Set up Koel in Settings &rarr; Connections
          </span>
        </div>
      ) : !isOnline ? (
        <div style={{
          padding: '12px', borderRadius: '8px', background: 'var(--bg-white-03)',
          border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
          gap: '8px', flex: 1,
        }}>
          <MusicNote size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Music unavailable
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
          {nowPlaying ? (
            <div style={{
              padding: '10px 12px', borderRadius: '8px',
              background: 'var(--accent-a12)', border: '1px solid var(--accent-a25)',
            }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                {/* Album art */}
                {showAlbumArt && (
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '6px',
                    background: 'var(--bg-elevated)', overflow: 'hidden', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {nowPlaying.album_art_proxy ? (
                      <img
                        src={nowPlaying.album_art_proxy}
                        alt="Album art"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <MusicNote size={20} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                )}

                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px',
                      background: 'var(--accent)', color: 'var(--text-on-accent)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      MUSIC
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {timeAgo(nowPlaying.started_at)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                    lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {nowPlaying.song_title}
                  </div>
                  <div style={{
                    fontSize: '12px', color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {nowPlaying.artist_name}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '12px', borderRadius: '8px', background: 'var(--bg-white-03)',
              border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
              gap: '8px',
            }}>
              <Pause size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Nothing playing
              </span>
            </div>
          )}

          {/* Open in Koel link */}
          {health?.host && (
            <a
              href={health.host}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto',
                paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
                background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Open Koel <ArrowRight size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  )
})
