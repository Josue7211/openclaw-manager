import { useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  Calendar,
  CheckCircle,
  FilmStrip,
  MagnifyingGlass,
  MusicNotes,
  Play,
  Plus,
  Pulse,
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
  host?: string
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

interface WantedItem {
  id?: number
  service: string
  serviceName?: string
  title?: string
  sourceTitle?: string
  eventType?: string
  airDateUtc?: string
  releaseDate?: string
  series?: { title?: string }
  movie?: { title?: string }
  artist?: { artistName?: string }
  episode?: { title?: string; seasonNumber?: number; episodeNumber?: number }
  album?: { title?: string }
}

interface HistoryItem extends WantedItem {
  date?: string
  sourceTitle?: string
  data?: { droppedPath?: string; importedPath?: string; releaseGroup?: string }
}

interface IndexerItem {
  id?: number
  service: string
  serviceName?: string
  name?: string
  enable?: boolean
  protocol?: string
  priority?: number
  implementationName?: string
}

interface RequestItem {
  id?: number
  service: string
  serviceName?: string
  status?: number
  createdAt?: string
  media?: { title?: string; mediaType?: string; status?: number; status4k?: number }
  requestedBy?: { displayName?: string; email?: string }
}

interface StreamItem {
  service: string
  serviceName?: string
  title?: string
  full_title?: string
  user?: string
  username?: string
  player?: string
  state?: string
  transcode_decision?: string
}

interface DownloadItem {
  id?: number | string
  service: string
  serviceName?: string
  hash?: string
  nzo_id?: string
  NZBID?: number
  ID?: number
  name?: string
  filename?: string
  status?: string
  state?: string
  progress?: number
  percentage?: number
  percentDone?: number
  mb?: string
  size?: number
  totalSize?: number
}

interface SubtitleItem extends WantedItem {
  language?: string
  missing_subtitles?: string[]
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
  wanted?: WantedItem[]
  history?: HistoryItem[]
  indexers?: IndexerItem[]
  requests?: RequestItem[]
  streams?: StreamItem[]
  downloads?: DownloadItem[]
  subtitles?: SubtitleItem[]
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

function wantedTitle(item: WantedItem): string {
  if (item.movie?.title) return item.movie.title
  if (item.series?.title) {
    const ep = item.episode
    if (ep?.seasonNumber && ep?.episodeNumber) {
      return `${item.series.title} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
    }
    return `${item.series.title}${item.title ? `: ${item.title}` : ''}`
  }
  if (item.artist?.artistName) return item.album?.title ? `${item.artist.artistName}: ${item.album.title}` : item.artist.artistName
  return item.title ?? item.sourceTitle ?? 'Unknown'
}

function historyTitle(item: HistoryItem): string {
  return item.sourceTitle ?? wantedTitle(item)
}

function indexerTitle(item: IndexerItem): string {
  return item.name ?? item.implementationName ?? 'Indexer'
}

function requestTitle(item: RequestItem): string {
  return item.media?.title ?? `Request #${item.id ?? '--'}`
}

function streamTitle(item: StreamItem): string {
  return item.full_title ?? item.title ?? 'Stream'
}

function downloadTitle(item: DownloadItem): string {
  return item.name ?? item.filename ?? 'Download'
}

function requestStatus(item: RequestItem): string {
  const status = item.status ?? item.media?.status
  if (status === 1) return 'pending'
  if (status === 2) return 'approved'
  if (status === 3) return 'declined'
  if (status === 4) return 'available'
  return `status ${status ?? '--'}`
}

function downloadId(item: DownloadItem): string | null {
  const id = item.hash ?? item.nzo_id ?? item.id ?? item.NZBID ?? item.ID
  return id === undefined || id === null ? null : String(id)
}

function downloadProgress(item: DownloadItem): string {
  const raw = item.progress ?? item.percentage ?? item.percentDone
  if (raw === undefined) return '--'
  const percent = raw <= 1 ? raw * 100 : raw
  return `${Math.round(percent)}%`
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
  if (service === 'plex') return <Play size={15} />
  if (service === 'sonarr') return <Television size={15} />
  if (service === 'lidarr') return <MusicNotes size={15} />
  if (['tautulli', 'jellystat'].includes(service)) return <Pulse size={15} />
  if (['qbittorrent', 'sabnzbd', 'nzbget', 'transmission', 'deluge'].includes(service)) return <ArrowsClockwise size={15} />
  if (['overseerr', 'jellyseerr', 'wizarr'].includes(service)) return <Plus size={15} />
  return <FilmStrip size={15} />
}

function serviceKindLabel(service: MediaService): string {
  if (service.id === 'plex') return 'Streaming'
  if (service.id === 'prowlarr') return 'Indexers'
  if (service.id === 'lidarr') return 'Music'
  if (service.id === 'sonarr') return 'Series'
  if (service.id === 'radarr') return 'Movies'
  if (['overseerr', 'jellyseerr'].includes(service.id)) return 'Requests'
  if (['tautulli', 'jellystat'].includes(service.id)) return 'Analytics'
  if (service.id === 'bazarr') return 'Subtitles'
  if (['qbittorrent', 'sabnzbd', 'nzbget', 'transmission', 'deluge'].includes(service.id)) return 'Downloads'
  if (service.id === 'unraid') return 'Server'
  if (service.id === 'wizarr') return 'Invites'
  return service.kind ?? 'Service'
}

const card: React.CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
}

const FALLBACK_MEDIA_SERVICES: MediaService[] = [
  { id: 'plex', name: 'Plex', kind: 'streaming', configured: false, healthy: false },
  { id: 'sonarr', name: 'Sonarr', kind: 'series', configured: false, healthy: false },
  { id: 'radarr', name: 'Radarr', kind: 'movie', configured: false, healthy: false },
  { id: 'lidarr', name: 'Lidarr', kind: 'music', configured: false, healthy: false },
  { id: 'prowlarr', name: 'Prowlarr', kind: 'indexers', configured: false, healthy: false },
  { id: 'overseerr', name: 'Overseerr', kind: 'requests', configured: false, healthy: false },
  { id: 'jellyseerr', name: 'Jellyseerr', kind: 'requests', configured: false, healthy: false },
  { id: 'tautulli', name: 'Tautulli', kind: 'analytics', configured: false, healthy: false },
  { id: 'bazarr', name: 'Bazarr', kind: 'subtitles', configured: false, healthy: false },
  { id: 'qbittorrent', name: 'qBittorrent', kind: 'downloads', configured: false, healthy: false },
  { id: 'sabnzbd', name: 'SABnzbd', kind: 'downloads', configured: false, healthy: false },
  { id: 'nzbget', name: 'NZBGet', kind: 'downloads', configured: false, healthy: false },
  { id: 'transmission', name: 'Transmission', kind: 'downloads', configured: false, healthy: false },
  { id: 'deluge', name: 'Deluge', kind: 'downloads', configured: false, healthy: false },
  { id: 'unraid', name: 'Unraid', kind: 'server', configured: false, healthy: false },
  { id: 'wizarr', name: 'Wizarr', kind: 'invites', configured: false, healthy: false },
]

const shellPanel: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '18px',
  boxShadow: '0 18px 70px rgba(0,0,0,0.28)',
}

function serviceTone(service: string): { accent: string; bg: string } {
  const tones: Record<string, { accent: string; bg: string }> = {
    plex: { accent: '#e5a93b', bg: 'linear-gradient(135deg, #3a2a11, #14100a)' },
    sonarr: { accent: '#4f9cff', bg: 'linear-gradient(135deg, #12355c, #0a1220)' },
    radarr: { accent: '#ffb657', bg: 'linear-gradient(135deg, #54311a, #120d08)' },
    lidarr: { accent: '#9c7cff', bg: 'linear-gradient(135deg, #30205f, #100b1f)' },
    prowlarr: { accent: '#68e0b4', bg: 'linear-gradient(135deg, #123d31, #071611)' },
    bazarr: { accent: '#7dd3fc', bg: 'linear-gradient(135deg, #123849, #07151b)' },
    overseerr: { accent: '#9ee37d', bg: 'linear-gradient(135deg, #243d16, #0a1307)' },
    jellyseerr: { accent: '#f472b6', bg: 'linear-gradient(135deg, #4a1d35, #160812)' },
    tautulli: { accent: '#facc15', bg: 'linear-gradient(135deg, #443911, #141205)' },
    jellystat: { accent: '#38bdf8', bg: 'linear-gradient(135deg, #12364a, #07131a)' },
    qbittorrent: { accent: '#5eead4', bg: 'linear-gradient(135deg, #134e4a, #061716)' },
    sabnzbd: { accent: '#fb7185', bg: 'linear-gradient(135deg, #4c1720, #16070a)' },
    nzbget: { accent: '#c084fc', bg: 'linear-gradient(135deg, #3a1b57, #11081a)' },
    transmission: { accent: '#f97316', bg: 'linear-gradient(135deg, #4a250b, #150b03)' },
    deluge: { accent: '#60a5fa', bg: 'linear-gradient(135deg, #17335c, #07111f)' },
    unraid: { accent: '#f43f5e', bg: 'linear-gradient(135deg, #4d1424, #15050a)' },
    wizarr: { accent: '#a3e635', bg: 'linear-gradient(135deg, #304611, #0d1305)' },
  }
  return tones[service] ?? { accent: 'var(--accent)', bg: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))' }
}

function miniButton(color = 'var(--text-secondary)'): React.CSSProperties {
  return {
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color,
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
  }
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
  const allServices = data?.services?.length ? data.services : FALLBACK_MEDIA_SERVICES

  const configuredServices = useMemo(
    () => allServices.filter(service => service.configured),
    [allServices],
  )
  const healthyServices = useMemo(
    () => configuredServices.filter(service => service.healthy),
    [configuredServices],
  )
  const searchableServices = useMemo(
    () => {
      const services = configuredServices.filter(service => service.id !== 'plex')
      return services.length ? services : [{ id: 'radarr', name: 'Radarr' }, { id: 'sonarr', name: 'Sonarr' }, { id: 'lidarr', name: 'Lidarr' }]
    },
    [configuredServices],
  )

  const serviceMap = useMemo(() => {
    const map = new Map<string, MediaService>()
    for (const service of allServices) map.set(service.id, service)
    return map
  }, [allServices])

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

  const runServiceCommand = async (service: MediaService, name: string) => {
    setBusy(`service-${service.id}-${name}`)
    setMessage(null)
    try {
      await api.post('/api/media/command', { service: service.id, name })
      setMessage(`${service.name} command queued`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Command failed')
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

  const refreshLibraryItem = async (item: LibraryItem) => {
    if (!item.id) return
    setBusy(`refresh-${item.service}-${item.id}`)
    setMessage(null)
    try {
      await api.post('/api/media/command', { service: item.service, name: 'refresh', id: item.id })
      setMessage(`Refresh queued for ${libraryTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setBusy(null)
    }
  }

  const toggleLibraryItem = async (item: LibraryItem) => {
    if (!item.id) return
    setBusy(`toggle-${item.service}-${item.id}`)
    setMessage(null)
    try {
      await api.put(`/api/media/library/${item.service}/${item.id}`, { monitored: item.monitored === false })
      setMessage(`${item.monitored === false ? 'Monitored' : 'Unmonitored'} ${libraryTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  const deleteLibraryItem = async (item: LibraryItem) => {
    if (!item.id) return
    if (!window.confirm(`Remove ${libraryTitle(item)} from ${serviceMap.get(item.service)?.name ?? item.service}? Files will stay on disk.`)) return
    setBusy(`delete-${item.service}-${item.id}`)
    setMessage(null)
    try {
      await api.del(`/api/media/library/${item.service}/${item.id}`)
      setMessage(`Removed ${libraryTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const toggleIndexer = async (item: IndexerItem) => {
    if (!item.id) return
    setBusy(`indexer-${item.id}`)
    setMessage(null)
    try {
      await api.put(`/api/media/library/${item.service}/${item.id}`, { enabled: item.enable === false })
      setMessage(`${item.enable === false ? 'Enabled' : 'Disabled'} ${indexerTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Indexer update failed')
    } finally {
      setBusy(null)
    }
  }

  const requestAction = async (item: RequestItem, action: 'approve' | 'decline') => {
    if (!item.id) return
    setBusy(`request-${item.service}-${item.id}-${action}`)
    setMessage(null)
    try {
      await api.post(`/api/media/requests/${item.service}/${item.id}/${action}`, {})
      setMessage(`${action === 'approve' ? 'Approved' : 'Declined'} ${requestTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request action failed')
    } finally {
      setBusy(null)
    }
  }

  const downloadAction = async (item: DownloadItem, action: 'pause' | 'resume' | 'remove' | 'recheck') => {
    const id = downloadId(item)
    if (!id) return
    if (action === 'remove' && !window.confirm(`Remove ${downloadTitle(item)} from ${serviceMap.get(item.service)?.name ?? item.service}? Files stay on disk.`)) return
    setBusy(`download-${item.service}-${id}-${action}`)
    setMessage(null)
    try {
      await api.post(`/api/media/downloads/${item.service}/${encodeURIComponent(id)}/${action}`, {})
      setMessage(`${action} sent for ${downloadTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Download action failed')
    } finally {
      setBusy(null)
    }
  }

  const isRefreshing = busy === 'refresh' || (isFetching && !loading)
  const selectedService = serviceMap.get(searchService)
  const canAddResults = !selectedService || ['radarr', 'sonarr', 'lidarr'].includes(selectedService.id)
  const primaryHost = configuredServices.find(service => service.host)?.host ?? 'homelab'
  const pendingRequests = (data?.requests ?? []).filter(item => (item.status ?? item.media?.status) === 1).length
  const liveStreams = (data?.streams?.length ?? 0) + (data?.now_playing ? 1 : 0)
  const downloadCount = (data?.downloads?.length ?? 0) + (data?.queue?.length ?? 0)
  const coreServices = ['plex', 'sonarr', 'radarr', 'lidarr', 'prowlarr']
  const ecosystemServices = allServices.filter(service => !coreServices.includes(service.id))

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
    <div style={{ width: '100%', maxWidth: 'none', paddingRight: '16px' }}>
      <div style={{ ...shellPanel, padding: '18px', marginBottom: '18px', background: 'radial-gradient(circle at 18% 0%, rgba(142, 118, 255, 0.22), transparent 34%), radial-gradient(circle at 92% 8%, rgba(94, 234, 212, 0.14), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.95fr) minmax(420px, 1.55fr)', gap: '18px', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '250px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '13px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--accent), rgba(255,255,255,0.18))', color: 'var(--text-on-accent)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
                  <FilmStrip size={22} weight="fill" />
                </div>
                <PageHeader defaultTitle="Media Radar" defaultSubtitle={data?.mock ? 'setup needed' : `${healthyServices.length}/${configuredServices.length} online · ${primaryHost}`} />
              </div>
              <div style={{ fontSize: '34px', lineHeight: 1.02, fontWeight: 850, letterSpacing: 0, marginBottom: '10px' }}>
                One cockpit for the whole stack.
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.55, maxWidth: '420px' }}>
                Search, approve, monitor, queue, refresh, and remove without opening separate ARR web UIs.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '18px' }}>
              {[
                ['Missing', data?.wanted?.length ?? 0, '#ffb657'],
                ['Requests', pendingRequests, '#9ee37d'],
                ['Downloads', downloadCount, '#5eead4'],
                ['Streams', liveStreams, '#facc15'],
              ].map(([label, value, color]) => (
                <div key={String(label)} style={{ padding: '10px', borderRadius: '14px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>{label}</div>
                  <div style={{ color: String(color), fontSize: '24px', fontWeight: 850 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['Library', 'Requests', 'Downloads', 'Indexers', 'Streams', `${ecosystemServices.filter(service => service.configured).length}/${ecosystemServices.length} Ecosystem`].map(label => (
                  <span key={label} style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(0,0,0,0.18)', borderRadius: '999px', padding: '7px 10px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    {label}
                  </span>
                ))}
              </div>
              <button onClick={handleRefresh} disabled={isRefreshing} style={{ ...miniButton('var(--accent)'), display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowsClockwise size={13} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
                Sync
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: '10px' }}>
              {allServices.slice(0, 17).map(service => {
                const tone = serviceTone(service.id)
                return (
                  <div key={service.id} style={{ minHeight: '108px', padding: '11px', borderRadius: '18px', background: service.configured ? tone.bg : 'rgba(255,255,255,0.035)', border: `1px solid ${service.configured ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.055)'}`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 'auto -22px -28px auto', width: '70px', height: '70px', borderRadius: '50%', background: tone.accent, opacity: service.configured ? 0.14 : 0.04 }} />
                    <div style={{ width: '34px', height: '34px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.12)', color: tone.accent, marginBottom: '10px' }}>
                      {serviceIcon(service.id)}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 850, lineHeight: 1.1 }}>{service.name}</div>
                    <div style={{ marginTop: '5px', fontSize: '10px', color: service.healthy ? tone.accent : 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {service.healthy ? 'online' : service.configured ? 'check' : 'setup'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
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
PROWLARR_API_KEY=...
OVERSEERR_URL=http://10.40.40.153:5055
OVERSEERR_API_KEY=...
TAUTULLI_URL=http://10.40.40.153:8181
TAUTULLI_API_KEY=...
BAZARR_URL=http://10.40.40.153:6767
BAZARR_API_KEY=...
QBITTORRENT_URL=http://10.40.40.153:8080
QBITTORRENT_USERNAME=...
QBITTORRENT_PASSWORD=...`}
          </pre>
        </div>
      )}

      {!data?.mock && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Online</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{healthyServices.length}/{configuredServices.length}</div>
          </div>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Queue</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{data?.queue?.length ?? 0}</div>
          </div>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Upcoming</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{data?.calendar?.length ?? 0}</div>
          </div>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Library</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{data?.library?.length ?? 0}</div>
          </div>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Missing</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{data?.wanted?.length ?? 0}</div>
          </div>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Requests</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{data?.requests?.length ?? 0}</div>
          </div>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Downloads</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{(data?.downloads?.length ?? 0) + (data?.queue?.length ?? 0)}</div>
          </div>
          <div style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Streams</div>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>{(data?.streams?.length ?? 0) + (data?.now_playing ? 1 : 0)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <section style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Pulse size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Services
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            {allServices.map(service => (
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
                  {service.configured ? `${serviceKindLabel(service)} · ${service.version ?? 'configured'}` : 'missing keys'}
                </div>
                {service.host && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '3px' }}>
                    {service.host}
                  </div>
                )}
                {service.configured && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {!['plex', 'prowlarr'].includes(service.id) && (
                      <button onClick={() => runServiceCommand(service, 'rss-sync')} disabled={busy === `service-${service.id}-rss-sync`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: 'pointer' }}>
                        RSS
                      </button>
                    )}
                    {service.id === 'prowlarr' && (
                      <button onClick={() => runServiceCommand(service, 'application-sync')} disabled={busy === `service-${service.id}-application-sync`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: 'pointer' }}>
                        Sync apps
                      </button>
                    )}
                    <button onClick={() => runServiceCommand(service, 'missing-search')} disabled={busy === `service-${service.id}-missing-search` || ['plex', 'prowlarr'].includes(service.id)} style={{ border: '1px solid var(--border)', background: 'transparent', color: ['plex', 'prowlarr'].includes(service.id) ? 'var(--text-muted)' : 'var(--accent)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: ['plex', 'prowlarr'].includes(service.id) ? 'not-allowed' : 'pointer' }}>
                      Search all
                    </button>
                  </div>
                )}
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
            {searchableServices.map(service => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
          <input aria-label="Media search query" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search() }} placeholder="Search movie, series, or artist" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }} />
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
                <button onClick={() => add(item)} disabled={!canAddResults || busy === `add-${resultTitle(item)}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid var(--border)', background: 'var(--bg-panel)', color: canAddResults ? 'var(--accent)' : 'var(--text-muted)', borderRadius: '7px', padding: '6px 8px', cursor: canAddResults ? 'pointer' : 'not-allowed' }}>
                  <Plus size={13} />
                  {canAddResults ? 'Add' : 'Search only'}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <section style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Requests
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflow: 'auto' }}>
            {(data?.requests ?? []).slice(0, 16).map(item => (
              <div key={`${item.service}-${item.id}-${requestTitle(item)}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{requestTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {serviceMap.get(item.service)?.name ?? item.service} · {item.requestedBy?.displayName ?? item.requestedBy?.email ?? 'requested'} · {requestStatus(item)}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => requestAction(item, 'approve')} disabled={!item.id || busy === `request-${item.service}-${item.id}-approve`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                    Approve
                  </button>
                  <button onClick={() => requestAction(item, 'decline')} disabled={!item.id || busy === `request-${item.service}-${item.id}-decline`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--red)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {(data?.requests ?? []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No request service items</div>}
          </div>
        </section>

        <section style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Download Clients
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflow: 'auto' }}>
            {(data?.downloads ?? []).slice(0, 16).map((item, index) => (
              <div key={`${item.service}-${downloadTitle(item)}-${index}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{downloadTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {serviceMap.get(item.service)?.name ?? item.service} · {item.status ?? item.state ?? 'active'} · {downloadProgress(item)}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => downloadAction(item, 'pause')} disabled={!downloadId(item) || busy === `download-${item.service}-${downloadId(item)}-pause`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: downloadId(item) ? 'pointer' : 'not-allowed' }}>
                    Pause
                  </button>
                  <button onClick={() => downloadAction(item, 'resume')} disabled={!downloadId(item) || busy === `download-${item.service}-${downloadId(item)}-resume`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: downloadId(item) ? 'pointer' : 'not-allowed' }}>
                    Resume
                  </button>
                  <button onClick={() => downloadAction(item, 'recheck')} disabled={!downloadId(item) || ['sabnzbd', 'nzbget'].includes(item.service) || busy === `download-${item.service}-${downloadId(item)}-recheck`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: ['sabnzbd', 'nzbget'].includes(item.service) ? 'var(--text-muted)' : 'var(--accent)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: downloadId(item) && !['sabnzbd', 'nzbget'].includes(item.service) ? 'pointer' : 'not-allowed' }}>
                    Recheck
                  </button>
                  <button onClick={() => downloadAction(item, 'remove')} disabled={!downloadId(item) || busy === `download-${item.service}-${downloadId(item)}-remove`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--red)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: downloadId(item) ? 'pointer' : 'not-allowed' }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {(data?.downloads ?? []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No downloader queue connected</div>}
          </div>
        </section>

        <section style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Streams / Playback
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflow: 'auto' }}>
            {(data?.streams ?? []).slice(0, 16).map((item, index) => (
              <div key={`${item.service}-${streamTitle(item)}-${index}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{streamTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {item.username ?? item.user ?? 'user'} · {item.player ?? item.state ?? 'playing'} · {item.transcode_decision ?? 'direct/unknown'}
                </div>
              </div>
            ))}
            {(data?.streams ?? []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No analytics stream service connected</div>}
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <section style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Wanted / Missing
            </div>
            <button onClick={() => configuredServices.filter(service => ['sonarr', 'radarr', 'lidarr'].includes(service.id)).forEach(service => void runServiceCommand(service, 'missing-search'))} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--accent)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
              Search all missing
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflow: 'auto' }}>
            {(data?.wanted ?? []).slice(0, 20).map((item, index) => (
              <div key={`${item.service}-${item.id}-${index}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>
                  {serviceIcon(item.service)}
                  <span>{wantedTitle(item)}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {serviceMap.get(item.service)?.name ?? item.service} · {formatAirDate(item.airDateUtc ?? item.releaseDate ?? '') || 'missing'}
                </div>
              </div>
            ))}
            {(data?.wanted ?? []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No missing media reported</div>}
          </div>
        </section>

        <section style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Activity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflow: 'auto' }}>
            {(data?.history ?? []).slice(0, 20).map((item, index) => (
              <div key={`${item.service}-${item.id}-${index}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>
                  {serviceIcon(item.service)}
                  <span>{historyTitle(item)}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {serviceMap.get(item.service)?.name ?? item.service} · {item.eventType ?? 'event'} · {formatAirDate(item.date ?? '') || ''}
                </div>
              </div>
            ))}
            {(data?.history ?? []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No recent ARR activity</div>}
          </div>
        </section>
      </div>

      {(data?.indexers ?? []).length > 0 && (
        <section style={{ ...card, padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Prowlarr Indexers
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px' }}>
            {(data?.indexers ?? []).map(item => (
              <div key={`${item.service}-${item.id}-${indexerTitle(item)}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>{indexerTitle(item)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {item.protocol ?? 'indexer'} · priority {item.priority ?? '--'}
                  </div>
                </div>
                <button onClick={() => toggleIndexer(item)} disabled={!item.id || busy === `indexer-${item.id}`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: item.enable === false ? 'var(--text-muted)' : 'var(--secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                  {item.enable === false ? 'Off' : 'On'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {(data?.subtitles ?? []).length > 0 && (
        <section style={{ ...card, padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Bazarr Subtitles
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
            {(data?.subtitles ?? []).slice(0, 24).map((item, index) => (
              <div key={`${item.service}-${wantedTitle(item)}-${index}`} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{wantedTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {item.language ?? item.missing_subtitles?.join(', ') ?? 'missing subtitles'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ ...card, padding: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Library
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {(data?.library ?? []).slice(0, 36).map(item => (
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
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => toggleLibraryItem(item)} disabled={!item.id || busy === `toggle-${item.service}-${item.id}`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: item.monitored === false ? 'var(--text-muted)' : 'var(--secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                  {item.monitored === false ? 'Off' : 'On'}
                </button>
                <button onClick={() => refreshLibraryItem(item)} disabled={!item.id || busy === `refresh-${item.service}-${item.id}`} aria-label="Refresh media item" style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-secondary)', borderRadius: '7px', width: '32px', height: '32px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <ArrowsClockwise size={14} />
                </button>
                <button onClick={() => runSearch(item)} disabled={!item.id || busy === `command-${item.service}-${item.id}`} aria-label="Search missing media" style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--accent)', borderRadius: '7px', width: '32px', height: '32px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <MagnifyingGlass size={14} />
                </button>
                <button onClick={() => deleteLibraryItem(item)} disabled={!item.id || busy === `delete-${item.service}-${item.id}`} aria-label="Remove media item" style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--red)', borderRadius: '7px', width: '32px', height: '32px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <Trash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
