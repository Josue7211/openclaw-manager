import React from 'react'
import { Television, ArrowRight, Pause } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useMediaWidget } from '@/lib/hooks/dashboard/useMediaWidget'
import type { WidgetProps } from '@/lib/widget-registry'

export const NowPlayingWidget = React.memo(function NowPlayingWidget(_props: WidgetProps) {
  const { nowPlaying, recentlyAdded, mounted } = useMediaWidget()
  const navigate = useNavigate()

  const displayRecent = recentlyAdded.slice(0, 3)

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Television size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Now Playing
        </span>
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
          {/* Now playing section */}
          {nowPlaying ? (
            <div style={{
              padding: '10px 12px', borderRadius: '8px',
              background: 'var(--accent-a12)', border: '1px solid var(--accent-a25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px',
                  background: 'var(--accent)', color: 'var(--text-on-accent)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {nowPlaying.type}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {nowPlaying.user}
                </span>
              </div>
              <div style={{
                fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {nowPlaying.title}
              </div>
              {nowPlaying.progress != null && (
                <div style={{
                  marginTop: '6px', height: '3px', borderRadius: '2px',
                  background: 'var(--bg-elevated)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(nowPlaying.progress, 100)}%`, height: '100%',
                    borderRadius: '2px', background: 'var(--accent)',
                    transition: 'width 0.3s var(--ease-spring)',
                  }} />
                </div>
              )}
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

          {/* Recently added */}
          {displayRecent.length > 0 && (
            <>
              <div style={{
                fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
                letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: '4px',
              }}>
                Recently Added
              </div>
              {displayRecent.map((item, i) => (
                <div
                  key={`${item.title}-${i}`}
                  className="hover-bg"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
                    borderRadius: '6px', transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    fontSize: '9px', fontWeight: 600, padding: '1px 4px', borderRadius: '3px',
                    background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', flexShrink: 0,
                  }}>
                    {item.type === 'Movie' ? 'MOV' : 'TV'}
                  </span>
                  <span style={{
                    fontSize: '12px', color: 'var(--text-primary)', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </span>
                  {item.year && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {item.year}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/media')}
            aria-label="View all media"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto',
              paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            }}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
})
