import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowsClockwise,
  Calendar,
  CheckCircle,
  FilmStrip,
  MagnifyingGlass,
  MusicNotes,
  Play,
  Plus,
  Trash,
  Television,
  WarningCircle,
} from '@phosphor-icons/react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'

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

interface MediaService {
  id: string
  name: string
  kind?: string
  configured: boolean
  healthy: boolean
  version?: string
}

interface QueueItem {
  id?: number
  service: string
  serviceName?: string
  title?: string
  status?: string
  trackedDownloadStatus?: string
  timeleft?: string
  sizeleft?: number
  size?: number
  movie?: { title?: string }
  series?: { title?: string }
  episode?: { title?: string; seasonNumber?: number; episodeNumber?: number }
  artist?: { artistName?: string }
}

interface LibraryItem {
  id?: number
  service: string
  title?: string
  artistName?: string
  year?: number
  monitored?: boolean
  hasFile?: boolean
  statistics?: { episodeFileCount?: number; episodeCount?: number }
}

interface CalendarItem {
  service: string
  serviceName?: string
  title?: string
  airDateUtc?: string
  releaseDate?: string
  inCinemas?: string
  series?: { title?: string }
  movie?: { title?: string }
  seasonNumber?: number
  episodeNumber?: number
}

interface MediaData {
  now_playing: NowPlaying | null
  recently_added: RecentItem[]
  upcoming: UpcomingItem[]
  services?: MediaService[]
  queue?: QueueItem[]
  library?: LibraryItem[]
  calendar?: CalendarItem[]
  mock?: boolean
}

interface SearchResponse {
  service: string
  results: Record<string, unknown>[]
}

function formatAirDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00Z`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 0 && diff < 7) return `in ${diff} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

function queueTitle(item: QueueItem): string {
  if (item.title) return item.title
  if (item.movie?.title) return item.movie.title
  if (item.series?.title) {
    const ep = item.episode
    if (ep?.seasonNumber && ep?.episodeNumber) {
      return `${item.series.title} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
    }
    return item.series.title
  }
  return item.artist?.artistName ?? 'Unknown'
}

function libraryTitle(item: LibraryItem): string {
  return item.title ?? item.artistName ?? 'Unknown'
}

function calendarTitle(item: CalendarItem): string {
  if (item.movie?.title) return item.movie.title
  if (item.series?.title) {
    const episode = item.title ? `: ${item.title}` : ''
    const season = item.seasonNumber && item.episodeNumber
      ? ` S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}`
      : ''
    return `${item.series.title}${season}${episode}`
  }
  return item.title ?? 'Unknown'
}

function resultTitle(item: Record<string, unknown>): string {
  return String(item.title ?? item.artistName ?? item.name ?? 'Unknown')
}

function serviceIcon(service: string) {
  if (service === 'sonarr') return <Television size={15} />
  if (service === 'lidarr') return <MusicNotes size={15} />
  return <FilmStrip size={15} />
}

const card: React.CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
}

export default function MediaPage() {
  const demo = isDemoMode()
  const { data, isLoading: loading, refetch, isFetching } = useTauriQuery<MediaData>(
    ['media'],
    '/api/media',
    { refetchInterval: demo ? false : 30_000, enabled: !demo },
  )
  const [searchService, setSearchService] = useState('radarr')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Record<string, unknown>[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const configuredServices = useMemo(
    () => (data?.services ?? []).filter(service => service.configured),
    [data?.services],
  )

  const serviceMap = useMemo(() => {
    const map = new Map<string, MediaService>()
    for (const service of data?.services ?? []) map.set(service.id, service)
    return map
  }, [data?.services])

  const handleRefresh = async () => {
    setBusy('refresh')
    await refetch()
    setBusy(null)
  }

  const search = async () => {
    if (!query.trim()) return
    setBusy('search')
    setMessage(null)
    try {
      const res = await api.get<SearchResponse>(`/api/media/search?service=${encodeURIComponent(searchService)}&query=${encodeURIComponent(query.trim())}`)
      setResults(res.results ?? [])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setBusy(null)
    }
  }

  const add = async (item: Record<string, unknown>) => {
    setBusy(`add-${resultTitle(item)}`)
    setMessage(null)
    try {
      await api.post('/api/media/add', { service: searchService, item })
      setMessage(`Added ${resultTitle(item)}`)
      setResults([])
      setQuery('')
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setBusy(null)
    }
  }

  const removeQueueItem = async (item: QueueItem) => {
    if (!item.id) return
    setBusy(`queue-${item.service}-${item.id}`)
    setMessage(null)
    try {
      await api.del(`/api/media/queue/${item.service}/${item.id}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Queue remove failed')
    } finally {
      setBusy(null)
    }
  }

  const runSearch = async (item: LibraryItem) => {
    if (!item.id) return
    setBusy(`command-${item.service}-${item.id}`)
    setMessage(null)
    try {
      await api.post('/api/media/command', { service: item.service, name: 'search', id: item.id })
      setMessage(`Search queued for ${libraryTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Command failed')
    } finally {
      setBusy(null)
    }
  }

  const isRefreshing = busy === 'refresh' || (isFetching && !loading)

  if (loading && !demo) {
    return <div style={{ color: 'var(--text-muted)', padding: '40px 0' }}>Loading media...</div>
  }

  if (demo) {
    return (
      <div style={{ maxWidth: '1040px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <FilmStrip size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Media Radar" defaultSubtitle="not configured" />
        </div>
        <div style={{ ...card, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <FilmStrip size={16} style={{ color: 'var(--blue-solid)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-solid)' }}>Media services not configured</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Connect Plex, Sonarr, Radarr, Lidarr, and Prowlarr in Settings to control the media stack.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1180px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FilmStrip size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Media Radar" defaultSubtitle={data?.mock ? 'demo data' : 'ARR controller'} />
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--bg-panel)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px',
          }}
        >
          <ArrowsClockwise size={13} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {data?.mock && (
        <div style={{ ...card, marginBottom: '18px', padding: '18px 20px', borderColor: 'var(--blue-a25)' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-solid)', marginBottom: '8px' }}>
            Media services not configured
          </div>
          <pre style={{ margin: 0, padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', overflowX: 'auto' }}>
{`PLEX_URL=http://10.40.40.153:32400
PLEX_TOKEN=...
SONARR_URL=http://10.40.40.153:8989
SONARR_API_KEY=...
RADARR_URL=http://10.40.40.153:7878
RADARR_API_KEY=...
LIDARR_URL=http://10.40.40.153:8686
LIDARR_API_KEY=...
PROWLARR_URL=http://10.40.40.153:9696
PROWLARR_API_KEY=...`}
          </pre>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <section style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Activity size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Services
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            {(data?.services ?? []).map(service => (
              <div key={service.id} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                    {serviceIcon(service.id)}
                    {service.name}
                  </span>
                  {service.healthy
                    ? <CheckCircle size={15} style={{ color: 'var(--secondary)' }} />
                    : <WarningCircle size={15} style={{ color: service.configured ? 'var(--gold)' : 'var(--text-muted)' }} />}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {service.configured ? service.version ?? 'configured' : 'missing keys'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Play size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Now Playing
            </span>
          </div>
          {data?.now_playing ? (
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{data.now_playing.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Playing for {data.now_playing.user}</div>
              {data.now_playing.progress !== null && (
                <div style={{ height: '5px', borderRadius: '3px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ width: `${data.now_playing.progress}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nothing playing right now</div>
          )}
        </section>
      </div>

      <section style={{ ...card, padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MagnifyingGlass size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Search and add</span>
          </div>
          {message && <span style={{ fontSize: '12px', color: message.includes('failed') || message.includes('returned') ? 'var(--red)' : 'var(--secondary)' }}>{message}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: '8px' }}>
          <select value={searchService} onChange={e => setSearchService(e.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
            {(configuredServices.length ? configuredServices : [{ id: 'radarr', name: 'Radarr' }, { id: 'sonarr', name: 'Sonarr' }]).map(service => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search() }} placeholder="Search movie, series, or artist" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }} />
          <button onClick={search} disabled={busy === 'search'} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '8px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>
            <MagnifyingGlass size={14} />
            Search
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', marginTop: '12px' }}>
            {results.slice(0, 12).map((item, index) => (
              <div key={`${resultTitle(item)}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px', lineHeight: 1.35 }}>{resultTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{String(item.year ?? item.status ?? searchService)}</div>
                <button onClick={() => add(item)} disabled={busy === `add-${resultTitle(item)}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--accent)', borderRadius: '7px', padding: '6px 8px', cursor: 'pointer' }}>
                  <Plus size={13} />
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <section style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Queue
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflow: 'auto' }}>
            {(data?.queue ?? []).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Queue is empty</div>
            ) : (data?.queue ?? []).map(item => (
              <div key={`${item.service}-${item.id}-${queueTitle(item)}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>{queueTitle(item)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {serviceMap.get(item.service)?.name ?? item.service} · {item.status ?? item.trackedDownloadStatus ?? 'queued'} · {item.timeleft ?? formatBytes(item.sizeleft)}
                  </div>
                </div>
                <button onClick={() => removeQueueItem(item)} disabled={!item.id || busy === `queue-${item.service}-${item.id}`} aria-label="Remove queue item" style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--red)', borderRadius: '7px', width: '32px', height: '32px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            <Calendar size={14} />
            Calendar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflow: 'auto' }}>
            {(data?.calendar ?? []).slice(0, 16).map((item, index) => {
              const date = item.airDateUtc ?? item.releaseDate ?? item.inCinemas ?? ''
              return (
                <div key={`${calendarTitle(item)}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.35 }}>{calendarTitle(item)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatAirDate(date)}</span>
                </div>
              )
            })}
            {(data?.calendar ?? []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No upcoming releases</div>}
          </div>
        </section>
      </div>

      <section style={{ ...card, padding: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Library
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {(data?.library ?? []).slice(0, 24).map(item => (
            <div key={`${item.service}-${item.id}-${libraryTitle(item)}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>
                  {serviceIcon(item.service)}
                  <span>{libraryTitle(item)}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {serviceMap.get(item.service)?.name ?? item.service} · {item.monitored === false ? 'unmonitored' : 'monitored'}
                </div>
              </div>
              <button onClick={() => runSearch(item)} disabled={!item.id || busy === `command-${item.service}-${item.id}`} aria-label="Search missing media" style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--accent)', borderRadius: '7px', width: '32px', height: '32px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <MagnifyingGlass size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
