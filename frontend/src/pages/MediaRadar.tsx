


import { useState } from 'react'
import { FilmStrip, Television, Play, ArrowsClockwise, Calendar } from '@phosphor-icons/react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'

interface NowPlaying {
  title: string
  type: string
  user: string
  progress: number | null
}

interface RecentItem {
  title: string
  type: string
  year?: number
}

interface UpcomingItem {
  title: string
  air_date: string
}

interface MediaData {
  now_playing: NowPlaying | null
  recently_added: RecentItem[]
  upcoming: UpcomingItem[]
  mock?: boolean
}

function formatAirDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00Z')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 0 && diff < 7) return `in ${diff} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function MediaPage() {
  const { data, isLoading: loading, refetch, isFetching } = useTauriQuery<MediaData>(
    ['media'],
    '/api/media',
    { refetchInterval: 30_000 },
  )
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const isRefreshing = refreshing || (isFetching && !loading)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', padding: '40px 0' }}>
        <div style={{ width: '16px', height: '16px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading media...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <FilmStrip size={20} style={{ color: 'var(--accent)' }} />
            <PageHeader defaultTitle="Media Radar" defaultSubtitle={data?.mock ? 'demo data' : 'live · Plex · Sonarr · Radarr'} />
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px',
          }}
        >
          <ArrowsClockwise size={13} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Not configured banner */}
      {data?.mock && (
        <div style={{
          marginBottom: '20px', padding: '20px 24px',
          background: 'var(--blue-a08)',
          border: '1px solid var(--blue-a25)',
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <FilmStrip size={16} style={{ color: 'var(--blue-solid)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-solid)' }}>Media services not configured</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Showing demo data. Add the following to <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>.env.local</code> and restart:
          </p>
          <pre style={{ margin: '0', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)', overflowX: 'auto', lineHeight: 1.8 }}>
{`PLEX_URL=http://your-plex-ip:32400
PLEX_TOKEN=your-plex-token
SONARR_URL=http://your-sonarr-ip:8989
SONARR_API_KEY=your-sonarr-api-key
RADARR_URL=http://your-radarr-ip:7878
RADARR_API_KEY=your-radarr-api-key`}
          </pre>
        </div>
      )}

      {/* Now Playing */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Now Playing
        </div>
        {data?.now_playing ? (
          <div style={{
            background: 'linear-gradient(135deg, var(--blue-a08) 0%, var(--blue-a04) 100%)',
            border: '1px solid var(--blue-a25)',
            borderRadius: '14px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px',
                background: 'var(--blue-a25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Play size={16} style={{ color: 'var(--tertiary-bright)', marginLeft: '2px' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {data.now_playing.title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Playing for {data.now_playing.user}
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                  background: 'var(--blue-a25)', color: 'var(--tertiary-bright)',
                  border: '1px solid var(--blue-a25)',
                }}>
                  {data.now_playing.type === 'movie' ? 'Movie' : 'Episode'}
                </span>
              </div>
            </div>
            {data.now_playing.progress !== null && (
              <div>
                <div style={{ height: '4px', borderRadius: '2px', background: 'var(--blue-a08)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    background: 'linear-gradient(90deg, var(--tertiary), var(--tertiary-bright))',
                    width: `${data.now_playing.progress}%`, transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', textAlign: 'right' }}>
                  {data.now_playing.progress}% watched
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🎬</div>
            Nothing playing right now
          </div>
        )}
      </div>

      {/* Recently Added */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Recently Added
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
          {(data?.recently_added ?? []).map((item, i) => (
            <div key={`${item.title}-${i}`} style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              transition: 'border-color 0.15s',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '7px', marginBottom: '10px',
                background: item.type === 'movie' ? 'var(--purple-a15)' : 'var(--secondary-a15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.type === 'movie'
                  ? <FilmStrip size={15} style={{ color: 'var(--accent)' }} />
                  : <Television size={15} style={{ color: 'var(--secondary)' }} />}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.3 }}>
                {item.title}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {item.year && <span style={{ marginRight: '6px' }}>{item.year}</span>}
                <span style={{
                  padding: '1px 6px', borderRadius: '10px', fontSize: '10px',
                  background: item.type === 'movie' ? 'var(--purple-a10)' : 'var(--secondary-a12)',
                  color: item.type === 'movie' ? 'var(--accent)' : 'var(--secondary)',
                }}>
                  {item.type === 'movie' ? 'Movie' : 'Show'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Coming Up
        </div>
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          {(data?.upcoming ?? []).length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No upcoming episodes
            </div>
          ) : (
            (data?.upcoming ?? []).map((ep, i) => (
              <div
                key={`${ep.title}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px',
                  borderBottom: i < (data?.upcoming ?? []).length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calendar size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {ep.title}
                  </span>
                </div>
                <span style={{
                  fontSize: '11px', fontFamily: 'monospace', fontWeight: 600,
                  padding: '3px 10px', borderRadius: '20px',
                  background: 'var(--purple-a10)', color: 'var(--accent-bright)',
                  border: '1px solid var(--purple-a20)',
                }}>
                  {formatAirDate(ep.air_date)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
