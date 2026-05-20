import { useEffect, useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  Calendar,
  CheckCircle,
  DownloadSimple,
  FilmStrip,
  Gear,
  MagnifyingGlass,
  MusicNotes,
  Play,
  Plus,
  Pulse,
  Terminal,
  Trash,
  Television,
  WarningCircle,
} from '@phosphor-icons/react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import {
  FALLBACK_MEDIA_SERVICES,
  calendarTitle,
  clampPercent,
  compactCount,
  downloadId,
  downloadMeta,
  downloadProgress,
  downloadTitle,
  formatAirDate,
  formatBytes,
  historyTitle,
  indexerTitle,
  itemDetailRef,
  libraryKind,
  libraryNetwork,
  librarySearchText,
  libraryTitle,
  parseSeasonSelection,
  queueTitle,
  releaseMeta,
  requestIsPending,
  requestResultKey,
  requestSeasonNumbers,
  requestStatus,
  requestTitle,
  resultTitle,
  safeList,
  safeStringList,
  serviceAttentionRank,
  serviceGroupLabel,
  serviceGroupRank,
  serviceIssueText,
  serviceKindLabel,
  serviceNeedsAttention,
  serviceSettingsUrl,
  serviceStateColor,
  serviceStateLabel,
  streamDecision,
  streamPlayer,
  streamTitle,
  subtitleKind,
  subtitleLabel,
  subtitleLanguage,
  wantedTitle
} from '@/features/media-radar/domain'
import type {
  CalendarItem,
  DetailRef,
  DetailResponse,
  DiscoverCategoryFilter,
  DiscoverKindFilter,
  DownloadItem,
  HistoryItem,
  IndexerItem,
  LibraryItem,
  LibraryMonitorFilter,
  MediaData,
  MediaDetection,
  MediaService,
  MediaView,
  QueueItem,
  RequestDiscoveryProvider,
  RequestDiscoveryResponse,
  RequestItem,
  RequestStatusFilter,
  SearchResponse,
  ServiceSetupFilter,
  StreamItem,
  SubtitleItem,
  SubtitleKindFilter,
  WantedItem,
  WorkflowTarget,
  IndexerStateFilter
} from '@/features/media-radar/domain'

const MEDIA_VIEW_ICONS: Record<MediaView, React.ReactNode> = {
  overview: <Pulse size={14} />,
  browse: <FilmStrip size={14} />,
  add: <Plus size={14} />,
  downloads: <DownloadSimple size={14} />,
  requests: <Plus size={14} />,
  missing: <WarningCircle size={14} />,
  indexers: <MagnifyingGlass size={14} />,
  setup: <Gear size={14} />,
  library: <Television size={14} />,
}

function serviceIcon(service: string) {
  if (service === 'plex') return <Play size={15} />
  if (service === 'sonarr') return <Television size={15} />
  if (service === 'lidarr') return <MusicNotes size={15} />
  if (['ssh', 'sftp'].includes(service)) return <Terminal size={15} />
  if (service === 'portainer') return <Gear size={15} />
  if (['tautulli', 'jellystat', 'jellyfin', 'emby', 'grafana', 'prometheus', 'loki', 'alloy', 'crowdsec'].includes(service)) return <Pulse size={15} />
  if (['cloudflared', 'pelican', 'vaultwarden'].includes(service)) return <Gear size={15} />
  if (['qbittorrent', 'sabnzbd', 'nzbget', 'transmission', 'deluge'].includes(service)) return <ArrowsClockwise size={15} />
  if (['overseerr', 'jellyseerr', 'wizarr'].includes(service)) return <Plus size={15} />
  return <FilmStrip size={15} />
}

const card: React.CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
}

const shellPanel: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '8px',
  boxShadow: '0 18px 70px rgba(0,0,0,0.28)',
}

const glassButton: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.045)',
  color: 'var(--text-secondary)',
  borderRadius: '8px',
  cursor: 'pointer',
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
    portainer: { accent: '#38bdf8', bg: 'linear-gradient(135deg, #12364a, #07131a)' },
    grafana: { accent: '#f97316', bg: 'linear-gradient(135deg, #4a250b, #150b03)' },
    prometheus: { accent: '#ef4444', bg: 'linear-gradient(135deg, #4c1717, #160707)' },
    loki: { accent: '#a3e635', bg: 'linear-gradient(135deg, #304611, #0d1305)' },
    alloy: { accent: '#f59e0b', bg: 'linear-gradient(135deg, #4a2e0a, #160d03)' },
    cloudflared: { accent: '#f97316', bg: 'linear-gradient(135deg, #4a250b, #150b03)' },
    crowdsec: { accent: '#ef4444', bg: 'linear-gradient(135deg, #4c1717, #160707)' },
    pelican: { accent: '#38bdf8', bg: 'linear-gradient(135deg, #12364a, #07131a)' },
    vaultwarden: { accent: '#60a5fa', bg: 'linear-gradient(135deg, #17335c, #07111f)' },
    wizarr: { accent: '#a3e635', bg: 'linear-gradient(135deg, #304611, #0d1305)' },
    jellyfin: { accent: '#a855f7', bg: 'linear-gradient(135deg, #31175f, #10071f)' },
    emby: { accent: '#22c55e', bg: 'linear-gradient(135deg, #113d22, #07140b)' },
    readarr: { accent: '#f59e0b', bg: 'linear-gradient(135deg, #46310b, #130d03)' },
    whisparr: { accent: '#ec4899', bg: 'linear-gradient(135deg, #4a1231, #160610)' },
    mylar: { accent: '#06b6d4', bg: 'linear-gradient(135deg, #0e3e48, #041417)' },
    autobrr: { accent: '#84cc16', bg: 'linear-gradient(135deg, #30450b, #0c1303)' },
    recyclarr: { accent: '#14b8a6', bg: 'linear-gradient(135deg, #12423d, #061614)' },
    kometa: { accent: '#e879f9', bg: 'linear-gradient(135deg, #442052, #130817)' },
    flaresolverr: { accent: '#fb923c', bg: 'linear-gradient(135deg, #4a2a10, #160b04)' },
    ssh: { accent: '#94a3b8', bg: 'linear-gradient(135deg, #263241, #0b1016)' },
    sftp: { accent: '#93c5fd', bg: 'linear-gradient(135deg, #1b3659, #07111d)' },
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

function ServiceStatusStrip({ services }: { services: MediaService[] }) {
  if (services.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '12px' }}>
      {services.map(service => {
        const tone = serviceTone(service.id)
        const stateColor = serviceStateColor(service, tone.accent)
        return (
          <div key={service.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px', alignItems: 'center', padding: '10px', border: `1px solid ${service.healthy ? 'rgba(94,234,212,0.24)' : service.detected ? 'rgba(255,182,87,0.3)' : 'var(--border)'}`, borderRadius: '8px', background: 'var(--bg-elevated)' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', display: 'grid', placeItems: 'center', color: tone.accent, background: 'rgba(255,255,255,0.06)' }}>
              {serviceIcon(service.id)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 850, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</div>
              <div style={{ marginTop: '3px', fontSize: '10px', color: stateColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {serviceStateLabel(service)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ServiceMiniCard({ service }: { service: MediaService }) {
  const tone = serviceTone(service.id)
  const stateColor = serviceStateColor(service, tone.accent)
  const border = serviceNeedsAttention(service) ? stateColor : 'rgba(255,255,255,0.08)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr) auto', gap: '8px', alignItems: 'center', padding: '8px', borderRadius: '8px', background: service.configured ? tone.bg : 'rgba(255,255,255,0.035)', border: `1px solid ${border}` }}>
      <span style={{ width: '26px', height: '26px', borderRadius: '7px', display: 'grid', placeItems: 'center', color: tone.accent, background: 'rgba(255,255,255,0.07)' }}>{serviceIcon(service.id)}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '12px', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</span>
        <span style={{ display: 'block', marginTop: '2px', fontSize: '10px', color: stateColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{serviceStateLabel(service)}</span>
      </span>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: stateColor }} />
    </div>
  )
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
  const [browseSource, setBrowseSource] = useState('all')
  const [browseKind, setBrowseKind] = useState('all')
  const [browseNetwork, setBrowseNetwork] = useState('all')
  const [browseQuery, setBrowseQuery] = useState('')
  const [serviceSetupFilter, setServiceSetupFilter] = useState<ServiceSetupFilter>('attention')
  const [activeView, setActiveView] = useState<MediaView>('overview')
  const [selectedDetail, setSelectedDetail] = useState<DetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [requestService, setRequestService] = useState('overseerr')
  const [requestQuery, setRequestQuery] = useState('')
  const [requestResults, setRequestResults] = useState<Record<string, unknown>[]>([])
  const [requestSeasonSelections, setRequestSeasonSelections] = useState<Record<string, string>>({})
  const [discoverKind, setDiscoverKind] = useState<DiscoverKindFilter>('tv')
  const [discoverCategory, setDiscoverCategory] = useState<DiscoverCategoryFilter>('popular')
  const [discoverProvider, setDiscoverProvider] = useState('350')
  const [discoverProviders, setDiscoverProviders] = useState<RequestDiscoveryProvider[]>([
    { id: '350', name: 'Apple TV+' },
    { id: '8', name: 'Netflix' },
    { id: '9', name: 'Prime Video' },
    { id: '337', name: 'Disney+' },
    { id: '15', name: 'Hulu' },
    { id: '1899', name: 'Max' },
    { id: '531', name: 'Paramount+' },
    { id: '386', name: 'Peacock' },
  ])
  const [discoverResults, setDiscoverResults] = useState<Record<string, unknown>[]>([])
  const [discoverTotal, setDiscoverTotal] = useState<number | null>(null)
  const [qbitEdits, setQbitEdits] = useState<Record<string, { category: string; tags: string }>>({})
  const [downloadServiceFilter, setDownloadServiceFilter] = useState('all')
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>('pending')
  const [wantedServiceFilter, setWantedServiceFilter] = useState('all')
  const [subtitleKindFilter, setSubtitleKindFilter] = useState<SubtitleKindFilter>('all')
  const [subtitleLanguageFilter, setSubtitleLanguageFilter] = useState('all')
  const [indexerStateFilter, setIndexerStateFilter] = useState<IndexerStateFilter>('all')
  const [indexerProtocolFilter, setIndexerProtocolFilter] = useState('all')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [librarySourceFilter, setLibrarySourceFilter] = useState('all')
  const [libraryMonitorFilter, setLibraryMonitorFilter] = useState<LibraryMonitorFilter>('all')
  const services = safeList(data?.services)
  const queue = safeList(data?.queue)
  const calendar = safeList(data?.calendar)
  const library = safeList(data?.library)
  const browseData = safeList(data?.browse)
  const browseCatalog = browseData.length ? browseData : library
  const wanted = safeList(data?.wanted)
  const history = safeList(data?.history)
  const indexers = safeList(data?.indexers)
  const indexerHealth = safeList(data?.indexer_health)
  const requests = safeList(data?.requests)
  const streams = safeList(data?.streams)
  const downloads = safeList(data?.downloads)
  const subtitles = safeList(data?.subtitles)
  const detections = safeList(data?.detections)
  const recentlyAdded = safeList(data?.recently_added)
  const upcoming = safeList(data?.upcoming)
  const allServices = services.length ? services : FALLBACK_MEDIA_SERVICES

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

  useEffect(() => {
    if (demo || activeView !== 'downloads') return undefined
    const timer = window.setInterval(() => {
      void refetch()
    }, 12_000)
    return () => window.clearInterval(timer)
  }, [activeView, demo, refetch])

  const openDetail = async (ref: DetailRef | null) => {
    if (!ref) return
    setDetailLoading(true)
    setMessage(null)
    try {
      const detail = await api.get<DetailResponse>(`/api/media/detail/${encodeURIComponent(ref.service)}/${encodeURIComponent(ref.kind)}/${encodeURIComponent(String(ref.id))}`)
      setSelectedDetail(detail)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Detail failed')
      setSelectedDetail({
        service: ref.service,
        kind: ref.kind,
        id: ref.id,
        item: { title: String(ref.id) },
        actions: [],
      })
    } finally {
      setDetailLoading(false)
    }
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

  const searchRequests = async () => {
    if (!requestQuery.trim()) return
    setBusy('request-search')
    setMessage(null)
    try {
      const res = await api.get<SearchResponse>(`/api/media/requests/search?service=${encodeURIComponent(requestService)}&query=${encodeURIComponent(requestQuery.trim())}`)
      const results = res.results ?? []
      setRequestResults(results)
      setRequestSeasonSelections(Object.fromEntries(
        results
          .filter(item => String(item.mediaType ?? item.media_type ?? '') === 'tv')
          .map(item => [requestResultKey(item), requestSeasonNumbers(item).join(', ')]),
      ))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request search failed')
    } finally {
      setBusy(null)
    }
  }

  const discoverRequests = async () => {
    setBusy('request-discover')
    setMessage(null)
    try {
      const params = new URLSearchParams({
        service: requestService,
        kind: discoverKind,
        category: discoverCategory,
      })
      if (discoverProvider !== 'all') params.set('provider', discoverProvider)
      const res = await api.get<RequestDiscoveryResponse>(`/api/media/requests/discover?${params.toString()}`)
      const results = res.results ?? []
      setDiscoverResults(results)
      setDiscoverProviders(res.providers?.length ? res.providers : discoverProviders)
      setDiscoverTotal(typeof res.totalResults === 'number' ? res.totalResults : results.length)
      setRequestSeasonSelections(prev => ({
        ...prev,
        ...Object.fromEntries(
          results
            .filter(item => String(item.mediaType ?? item.media_type ?? '') === 'tv')
            .map(item => [requestResultKey(item), requestSeasonNumbers(item).join(', ')]),
        ),
      }))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Discovery failed')
    } finally {
      setBusy(null)
    }
  }

  const toggleRequestSeason = (resultKey: string, seasonNumber: number) => {
    setRequestSeasonSelections(prev => {
      const current = parseSeasonSelection(prev[resultKey] ?? '')
      const next = current.includes(seasonNumber)
        ? current.filter(number => number !== seasonNumber)
        : [...current, seasonNumber]
      return {
        ...prev,
        [resultKey]: Array.from(new Set(next)).sort((a, b) => a - b).join(', '),
      }
    })
  }

  const createRequest = async (item: Record<string, unknown>) => {
    const mediaId = Number(item.id)
    const mediaType = String(item.mediaType ?? item.media_type ?? 'movie')
    if (!Number.isFinite(mediaId)) return
    const seasons = mediaType === 'tv' ? parseSeasonSelection(requestSeasonSelections[requestResultKey(item)] ?? '') : []
    if (mediaType === 'tv' && seasons.length === 0) {
      setMessage('Select at least one season to request')
      return
    }
    if (!window.confirm(`Request ${resultTitle(item)} through ${serviceMap.get(requestService)?.name ?? requestService}?`)) return
    setBusy(`request-create-${mediaId}`)
    setMessage(null)
    try {
      await api.post(`/api/media/requests/${encodeURIComponent(requestService)}`, {
        mediaId,
        mediaType,
        seasons,
      })
      setMessage(`Requested ${resultTitle(item)}`)
      setRequestResults([])
      setRequestSeasonSelections({})
      setRequestQuery('')
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request failed')
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

  const grabRelease = async (item: Record<string, unknown>) => {
    if (!window.confirm(`Grab ${resultTitle(item)} through Prowlarr?`)) return
    setBusy(`grab-${resultTitle(item)}`)
    setMessage(null)
    try {
      await api.post('/api/media/releases/grab', {
        service: searchService,
        release: item.grabPayload ?? item,
      })
      setMessage(`Grabbed ${resultTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Release grab failed')
    } finally {
      setBusy(null)
    }
  }

  const removeQueueItem = async (item: QueueItem) => {
    if (!item.id) return
    if (!window.confirm(`Remove ${queueTitle(item)} from the ${serviceMap.get(item.service)?.name ?? item.service} queue?`)) return
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
    if (!item.id) return false
    if (!window.confirm(`Remove ${libraryTitle(item)} from ${serviceMap.get(item.service)?.name ?? item.service}? Files will stay on disk.`)) return false
    setBusy(`delete-${item.service}-${item.id}`)
    setMessage(null)
    try {
      await api.del(`/api/media/library/${item.service}/${item.id}`)
      setMessage(`Removed ${libraryTitle(item)}`)
      await refetch()
      return true
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delete failed')
      return false
    } finally {
      setBusy(null)
    }
  }

  const detailLibraryItem = (detail: DetailResponse, title: string): LibraryItem => ({
    service: detail.service,
    id: typeof detail.id === 'number' ? detail.id : Number(detail.id),
    kind: detail.kind,
    title,
    monitored: detail.monitored ?? (typeof detail.item.monitored === 'boolean' ? detail.item.monitored : undefined),
  })

  const toggleIndexer = async (item: IndexerItem) => {
    if (!item.id) return
    setBusy(`indexer-${item.id}`)
    setMessage(null)
    try {
      await api.put(`/api/media/indexers/${item.service}/${item.id}`, { enabled: item.enable === false })
      setMessage(`${item.enable === false ? 'Enabled' : 'Disabled'} ${indexerTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Indexer update failed')
    } finally {
      setBusy(null)
    }
  }

  const testIndexer = async (item: IndexerItem) => {
    if (!item.id) return
    setBusy(`indexer-test-${item.id}`)
    setMessage(null)
    try {
      await api.post(`/api/media/indexers/${item.service}/${item.id}/test`, {})
      setMessage(`Tested ${indexerTitle(item)}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Indexer test failed')
    } finally {
      setBusy(null)
    }
  }

  const requestAction = async (item: RequestItem, action: 'approve' | 'decline') => {
    if (!item.id) return
    if (action === 'decline' && !window.confirm(`Decline ${requestTitle(item)}?`)) return
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

  const downloadAction = async (item: DownloadItem, action: 'pause' | 'resume' | 'remove' | 'recheck' | 'set-category' | 'add-tags', body: Record<string, unknown> = {}) => {
    const id = downloadId(item)
    if (!id) return
    if (action === 'remove' && !window.confirm(`Remove ${downloadTitle(item)} from ${serviceMap.get(item.service)?.name ?? item.service}? Files stay on disk.`)) return
    setBusy(`download-${item.service}-${id}-${action}`)
    setMessage(null)
    try {
      await api.post(`/api/media/downloads/${item.service}/${encodeURIComponent(id)}/${action}`, body)
      setMessage(`${action} sent for ${downloadTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Download action failed')
    } finally {
      setBusy(null)
    }
  }

  const qbitEditKey = (item: DownloadItem) => `${item.service}-${downloadId(item) ?? downloadTitle(item)}`

  const setQbitCategory = async (item: DownloadItem) => {
    const category = (qbitEdits[qbitEditKey(item)]?.category ?? item.category ?? '').trim()
    await downloadAction(item, 'set-category', { category })
  }

  const addQbitTags = async (item: DownloadItem) => {
    const tags = (qbitEdits[qbitEditKey(item)]?.tags ?? item.tags ?? '').trim()
    if (!tags) {
      setMessage('Enter qBittorrent tags first')
      return
    }
    await downloadAction(item, 'add-tags', { tags })
  }

  const searchSubtitle = async (item: SubtitleItem) => {
    const id = item.radarrId ?? item.sonarrEpisodeId ?? wantedTitle(item)
    setBusy(`subtitle-${item.service}-${id}`)
    setMessage(null)
    try {
      await api.post(`/api/media/subtitles/${item.service}/search`, item as unknown as Record<string, unknown>)
      setMessage(`Bazarr search queued for ${wantedTitle(item)}`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Subtitle search failed')
    } finally {
      setBusy(null)
    }
  }

  const isRefreshing = busy === 'refresh' || (isFetching && !loading)
  const selectedService = serviceMap.get(searchService)
  const canAddResults = !selectedService || ['radarr', 'sonarr', 'lidarr'].includes(selectedService.id)
  const canGrabResults = selectedService?.id === 'prowlarr'
  const primaryHost = allServices.find(service => service.host)?.host ?? 'homelab'
  const pendingRequests = requests.filter(item => (item.status ?? item.media?.status) === 1).length
  const requestStatusCounts = useMemo(() => {
    const counts: Record<RequestStatusFilter, number> = { pending: 0, all: requests.length, approved: 0, available: 0, partial: 0, declined: 0 }
    for (const item of requests) {
      const status = requestStatus(item)
      if (status === 'pending') counts.pending += 1
      if (status === 'approved') counts.approved += 1
      if (status === 'available') counts.available += 1
      if (status === 'partial') counts.partial += 1
      if (status === 'declined') counts.declined += 1
    }
    return counts
  }, [requests])
  const visibleRequests = useMemo(() => {
    if (requestStatusFilter === 'all') return requests
    return requests.filter(item => requestStatus(item) === requestStatusFilter)
  }, [requestStatusFilter, requests])
  const liveStreams = streams.length + (data?.now_playing ? 1 : 0)
  const downloadCount = downloads.length + queue.length
  const coreServices = ['plex', 'sonarr', 'radarr', 'lidarr', 'prowlarr']
  const ecosystemServices = allServices.filter(service => !coreServices.includes(service.id))
  const detectedMissingCredentials = allServices.filter(service => service.state === 'detected_missing_credentials')
  const degradedServices = allServices.filter(service => service.configured && (service.state === 'degraded' || service.state === 'offline'))
  const attentionServices = allServices
    .filter(serviceNeedsAttention)
    .sort((left, right) => serviceAttentionRank(left) - serviceAttentionRank(right) || left.name.localeCompare(right.name))
  const detectedCount = detections.length || allServices.filter(service => service.detected).length
  const featuredServices = allServices
    .filter(service => service.configured || service.detected)
    .sort((left, right) => serviceAttentionRank(left) - serviceAttentionRank(right) || left.name.localeCompare(right.name))
  const downloadServices = allServices.filter(service => ['qbittorrent', 'sabnzbd', 'nzbget', 'transmission', 'deluge'].includes(service.id))
  const downloadClientStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of downloads) counts.set(item.service, (counts.get(item.service) ?? 0) + 1)
    return downloadServices
      .map(service => ({ service, count: counts.get(service.id) ?? 0 }))
      .filter(({ service, count }) => count > 0 || service.configured || service.detected)
      .sort((left, right) => {
        const leftActive = left.count > 0 ? 0 : 1
        const rightActive = right.count > 0 ? 0 : 1
        return leftActive - rightActive || serviceAttentionRank(left.service) - serviceAttentionRank(right.service) || left.service.name.localeCompare(right.service.name)
      })
  }, [downloadServices, downloads])
  const visibleDownloads = useMemo(() => {
    if (downloadServiceFilter === 'all') return downloads
    return downloads.filter(item => item.service === downloadServiceFilter)
  }, [downloadServiceFilter, downloads])
  const requestServices = allServices.filter(service => ['overseerr', 'jellyseerr'].includes(service.id))
  const indexerServices = allServices.filter(service => ['prowlarr', 'flaresolverr', 'nzbhydra2', 'jackett'].includes(service.id))
  const indexerStateCounts = useMemo(() => ({
    all: indexers.length,
    enabled: indexers.filter(item => item.enable !== false).length,
    disabled: indexers.filter(item => item.enable === false).length,
  }), [indexers])
  const indexerProtocolStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of indexers) {
      const protocol = item.protocol ?? 'unknown'
      counts.set(protocol, (counts.get(protocol) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([protocol, count]) => ({ protocol, count }))
      .sort((left, right) => right.count - left.count || left.protocol.localeCompare(right.protocol))
  }, [indexers])
  const visibleIndexers = useMemo(() => {
    return indexers.filter(item => {
      if (indexerStateFilter === 'enabled' && item.enable === false) return false
      if (indexerStateFilter === 'disabled' && item.enable !== false) return false
      if (indexerProtocolFilter !== 'all' && (item.protocol ?? 'unknown') !== indexerProtocolFilter) return false
      return true
    })
  }, [indexerProtocolFilter, indexerStateFilter, indexers])
  const subtitleServices = allServices.filter(service => service.id === 'bazarr')
  const wantedServiceStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of wanted) counts.set(item.service, (counts.get(item.service) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([id, count]) => ({ service: serviceMap.get(id) ?? { id, name: id, configured: true, healthy: false }, count }))
      .sort((left, right) => right.count - left.count || left.service.name.localeCompare(right.service.name))
  }, [serviceMap, wanted])
  const visibleWanted = useMemo(() => {
    if (wantedServiceFilter === 'all') return wanted
    return wanted.filter(item => item.service === wantedServiceFilter)
  }, [wanted, wantedServiceFilter])
  const subtitleKindCounts = useMemo(() => ({
    all: subtitles.length,
    movies: subtitles.filter(item => subtitleKind(item) === 'movies').length,
    episodes: subtitles.filter(item => subtitleKind(item) === 'episodes').length,
  }), [subtitles])
  const subtitleLanguageStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of subtitles) {
      const language = subtitleLanguage(item)
      counts.set(language, (counts.get(language) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((left, right) => right.count - left.count || left.language.localeCompare(right.language))
      .slice(0, 12)
  }, [subtitles])
  const visibleSubtitles = useMemo(() => {
    return subtitles.filter(item => {
      if (subtitleKindFilter !== 'all' && subtitleKind(item) !== subtitleKindFilter) return false
      if (subtitleLanguageFilter !== 'all' && subtitleLanguage(item) !== subtitleLanguageFilter) return false
      return true
    })
  }, [subtitleKindFilter, subtitleLanguageFilter, subtitles])
  const serviceSetupFilters: Array<{ id: ServiceSetupFilter; label: string; count: number }> = [
    { id: 'attention', label: 'Needs setup', count: attentionServices.length },
    { id: 'online', label: 'Online', count: allServices.filter(service => service.healthy || service.state === 'online').length },
    { id: 'detected', label: 'Detected', count: allServices.filter(service => service.detected).length },
    { id: 'configured', label: 'Configured', count: configuredServices.length },
    { id: 'all', label: 'All', count: allServices.length },
  ]
  const setupServices = useMemo(() => {
    const filtered = allServices.filter(service => {
      if (serviceSetupFilter === 'attention') return serviceNeedsAttention(service)
      if (serviceSetupFilter === 'online') return service.healthy || service.state === 'online'
      if (serviceSetupFilter === 'detected') return service.detected
      if (serviceSetupFilter === 'configured') return service.configured
      return true
    })
    return filtered.sort((left, right) => {
      const leftGroup = serviceGroupLabel(left)
      const rightGroup = serviceGroupLabel(right)
      return serviceGroupRank(leftGroup) - serviceGroupRank(rightGroup)
        || serviceAttentionRank(left) - serviceAttentionRank(right)
        || left.name.localeCompare(right.name)
    })
  }, [allServices, serviceSetupFilter])
  const setupServiceGroups = useMemo(() => {
    const groups = new Map<string, MediaService[]>()
    for (const service of setupServices) {
      const group = serviceGroupLabel(service)
      groups.set(group, [...(groups.get(group) ?? []), service])
    }
    return Array.from(groups.entries()).sort((left, right) => serviceGroupRank(left[0]) - serviceGroupRank(right[0]) || left[0].localeCompare(right[0]))
  }, [setupServices])
  const browseSourceOptions = useMemo(() => {
    const ids = Array.from(new Set(browseCatalog.map(item => item.service))).filter(Boolean)
    return ids.map(id => serviceMap.get(id) ?? { id, name: id, configured: true, healthy: false })
  }, [browseCatalog, serviceMap])
  const browseKindOptions = useMemo(() => {
    const kinds = new Set(browseCatalog.map(libraryKind))
    return Array.from(kinds).sort((a, b) => a.localeCompare(b))
  }, [browseCatalog])
  const browseNetworkOptions = useMemo(() => {
    const networks = new Set(browseCatalog.map(libraryNetwork).filter(value => value && value !== 'No network'))
    return Array.from(networks).sort((a, b) => a.localeCompare(b)).slice(0, 60)
  }, [browseCatalog])
  const browseNetworkStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of browseCatalog) {
      const network = libraryNetwork(item)
      if (!network || network === 'No network') continue
      counts.set(network, (counts.get(network) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([network, count]) => ({ network, count }))
      .sort((a, b) => b.count - a.count || a.network.localeCompare(b.network))
      .slice(0, 18)
  }, [browseCatalog])
  const browseServiceStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of browseCatalog) counts.set(item.service, (counts.get(item.service) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([id, count]) => ({ service: serviceMap.get(id) ?? { id, name: id, configured: true, healthy: false }, count }))
      .sort((a, b) => b.count - a.count || a.service.name.localeCompare(b.service.name))
  }, [browseCatalog, serviceMap])
  const browseItems = useMemo(() => {
    const q = browseQuery.trim().toLowerCase()
    return browseCatalog.filter(item => {
      if (browseSource !== 'all' && item.service !== browseSource) return false
      if (browseKind !== 'all' && libraryKind(item) !== browseKind) return false
      if (browseNetwork !== 'all' && libraryNetwork(item) !== browseNetwork) return false
      if (q && !librarySearchText(item).includes(q)) return false
      return true
    })
  }, [browseKind, browseNetwork, browseQuery, browseSource, browseCatalog])
  const libraryServiceStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of library) counts.set(item.service, (counts.get(item.service) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([id, count]) => ({ service: serviceMap.get(id) ?? { id, name: id, configured: true, healthy: false }, count }))
      .sort((left, right) => right.count - left.count || left.service.name.localeCompare(right.service.name))
  }, [library, serviceMap])
  const libraryMonitorCounts = useMemo(() => ({
    all: library.length,
    monitored: library.filter(item => item.monitored !== false).length,
    unmonitored: library.filter(item => item.monitored === false).length,
  }), [library])
  const visibleLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase()
    return library.filter(item => {
      if (librarySourceFilter !== 'all' && item.service !== librarySourceFilter) return false
      if (libraryMonitorFilter === 'monitored' && item.monitored === false) return false
      if (libraryMonitorFilter === 'unmonitored' && item.monitored !== false) return false
      if (q && !librarySearchText(item).includes(q)) return false
      return true
    })
  }, [library, libraryMonitorFilter, libraryQuery, librarySourceFilter])
  const viewTabs: Array<[MediaView, string, number | null]> = [
    ['overview', 'Overview', null],
    ['browse', 'Browse', browseCatalog.length],
    ['add', 'Add', null],
    ['downloads', 'Downloads', downloadCount],
    ['requests', 'Requests', pendingRequests],
    ['missing', 'Missing', wanted.length],
    ['indexers', 'Indexers', indexers.length],
    ['setup', 'Setup', detectedMissingCredentials.length],
    ['library', 'Library', library.length],
  ] as const
  const activeViewTab = viewTabs.find(([id]) => id === activeView) ?? viewTabs[0]
  const workflowCards: Array<{
    id: WorkflowTarget
    label: string
    value: number
    detail: string
    tone: string
    icon: React.ReactNode
  }> = [
    {
      id: 'requests',
      label: 'Requests',
      value: pendingRequests,
      detail: `${requests.length} total from ${requestServices.filter(service => service.configured).length} request service(s)`,
      tone: '#9ee37d',
      icon: <Plus size={16} />,
    },
    {
      id: 'downloads',
      label: 'Downloads',
      value: downloadCount,
      detail: `${downloads.length} client jobs · ${queue.length} ARR queue`,
      tone: '#5eead4',
      icon: <ArrowsClockwise size={16} />,
    },
    {
      id: 'missing',
      label: 'Missing media',
      value: wanted.length,
      detail: `${subtitles.length} Bazarr subtitle gaps also visible here`,
      tone: '#ffb657',
      icon: <WarningCircle size={16} />,
    },
    {
      id: 'indexers',
      label: 'Indexers',
      value: indexers.length,
      detail: `${indexers.filter(item => item.enable !== false).length} enabled via Prowlarr`,
      tone: '#93c5fd',
      icon: <MagnifyingGlass size={16} />,
    },
    {
      id: 'browse',
      label: 'Browse',
      value: browseCatalog.length,
      detail: `${browseNetworkStats.length} streaming network filters`,
      tone: '#c084fc',
      icon: <FilmStrip size={16} />,
    },
    {
      id: 'setup',
      label: 'Setup needed',
      value: detectedMissingCredentials.length,
      detail: `${detectedCount} homelab detections from Docker and registry`,
      tone: '#facc15',
      icon: <Pulse size={16} />,
    },
  ]
  const topCommandItems: Array<{
    id: MediaView
    label: string
    value: number | null
    tone: string
    icon: React.ReactNode
  }> = [
    { id: 'add', label: 'Add media', value: null, tone: 'var(--accent)', icon: <Plus size={14} /> },
    { id: 'browse', label: 'Browse', value: library.length, tone: '#c084fc', icon: <FilmStrip size={14} /> },
    { id: 'downloads', label: 'Downloads', value: downloadCount, tone: '#5eead4', icon: <DownloadSimple size={14} /> },
    { id: 'missing', label: 'Missing', value: wanted.length, tone: '#ffb657', icon: <WarningCircle size={14} /> },
    { id: 'setup', label: 'Setup', value: detectedMissingCredentials.length, tone: '#facc15', icon: <Gear size={14} /> },
  ]
  const commandInboxItems = useMemo(() => {
    const items: Array<{
      id: string
      target: MediaView
      title: string
      detail: string
      tone: string
      value: number
      icon: React.ReactNode
    }> = []

    for (const service of attentionServices.slice(0, 5)) {
      items.push({
        id: `service-${service.id}`,
        target: 'setup',
        title: service.name,
        detail: serviceIssueText(service),
        tone: service.state === 'offline' ? 'var(--red)' : '#ffb657',
        value: 1,
        icon: serviceIcon(service.id),
      })
    }
    if (pendingRequests > 0) {
      items.push({
        id: 'requests',
        target: 'requests',
        title: 'Pending requests',
        detail: `${pendingRequests} request${pendingRequests === 1 ? '' : 's'} waiting for approval`,
        tone: '#9ee37d',
        value: pendingRequests,
        icon: <Plus size={15} />,
      })
    }
    if (downloads.length > 0 || queue.length > 0) {
      items.push({
        id: 'downloads',
        target: 'downloads',
        title: 'Active downloads',
        detail: `${downloads.length} client jobs and ${queue.length} ARR queue item${queue.length === 1 ? '' : 's'}`,
        tone: '#5eead4',
        value: downloads.length + queue.length,
        icon: <DownloadSimple size={15} />,
      })
    }
    if (wanted.length > 0) {
      items.push({
        id: 'wanted',
        target: 'missing',
        title: 'Missing media',
        detail: `${wanted.length} monitored item${wanted.length === 1 ? '' : 's'} missing from ARR`,
        tone: '#ffb657',
        value: wanted.length,
        icon: <WarningCircle size={15} />,
      })
    }
    if (subtitles.length > 0) {
      items.push({
        id: 'subtitles',
        target: 'missing',
        title: 'Subtitle gaps',
        detail: `${subtitles.length} Bazarr subtitle item${subtitles.length === 1 ? '' : 's'} need attention`,
        tone: '#7dd3fc',
        value: subtitles.length,
        icon: serviceIcon('bazarr'),
      })
    }
    if (indexers.length > 0 || indexerHealth.length > 0) {
      items.push({
        id: 'indexers',
        target: 'indexers',
        title: indexerHealth.length > 0 ? 'Indexer health' : 'Indexer control',
        detail: indexerHealth.length > 0 ? `${indexerHealth.length} Prowlarr warning${indexerHealth.length === 1 ? '' : 's'}` : `${indexers.filter(item => item.enable !== false).length}/${indexers.length} enabled in Prowlarr`,
        tone: '#93c5fd',
        value: indexerHealth.length || indexers.length,
        icon: <MagnifyingGlass size={15} />,
      })
    }
    return items.slice(0, 10)
  }, [attentionServices, downloads.length, indexerHealth.length, indexers, pendingRequests, queue.length, subtitles.length, wanted.length])

  if (loading && !demo) {
    return <div style={{ color: 'var(--text-muted)', padding: '40px 0' }}>Loading media...</div>
  }

  if (demo) {
    return (
      <div style={{ maxWidth: '1040px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <FilmStrip size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Media Command Center" defaultSubtitle="not configured" />
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
    <div style={{ width: '100%', maxWidth: 'none', height: 'calc(100vh - 24px)', paddingRight: '16px', display: 'grid', gridTemplateColumns: 'minmax(230px, 280px) minmax(0, 1fr)', gap: '14px', alignItems: 'stretch', overflow: 'hidden' }}>
      <aside style={{ ...shellPanel, height: '100%', overflow: 'hidden', padding: '14px', display: 'grid', gridTemplateRows: 'auto auto auto auto minmax(0, 1fr)', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
            <FilmStrip size={20} weight="fill" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 900, lineHeight: 1.15 }}>Media Command</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {healthyServices.length}/{configuredServices.length} online · {primaryHost}
            </div>
          </div>
        </div>

        <button onClick={handleRefresh} disabled={isRefreshing} style={{ ...miniButton('var(--accent)'), width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowsClockwise size={13} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          Sync stack
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
          {[
            ['Missing', wanted.length, '#ffb657'],
            ['Queue', downloadCount, '#5eead4'],
            ['Indexers', indexers.length, '#93c5fd'],
            ['Setup', detectedMissingCredentials.length, '#facc15'],
          ].map(([label, value, color]) => (
            <div key={String(label)} style={{ minHeight: '58px', padding: '8px', borderRadius: '8px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
              <div style={{ color: String(color), fontSize: '20px', fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '7px', alignContent: 'start' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900 }}>Workspaces</div>
          {viewTabs.map(([id, label, count]) => {
            const active = activeView === id
            const warn = id === 'setup' && detectedMissingCredentials.length > 0
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveView(id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '18px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${active ? 'var(--accent)' : warn ? 'rgba(255,182,87,0.45)' : 'var(--border)'}`,
                  background: active ? 'var(--accent)' : warn ? 'rgba(255,182,87,0.1)' : 'rgba(255,255,255,0.045)',
                  color: active ? 'var(--text-on-accent)' : warn ? '#ffb657' : 'var(--text-secondary)',
                  borderRadius: '8px',
                  padding: '8px 9px',
                  fontSize: '11px',
                  fontWeight: 850,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'grid', placeItems: 'center' }}>{MEDIA_VIEW_ICONS[id]}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {count !== null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'grid', gap: '6px', minHeight: 0, maxHeight: '100%', overflow: 'auto', paddingRight: '2px', alignContent: 'start' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900 }}>Services</div>
          {featuredServices.slice(0, 18).map(service => <ServiceMiniCard key={service.id} service={service} />)}
          {featuredServices.length > 18 && (
            <button onClick={() => setActiveView('setup')} style={{ ...glassButton, padding: '8px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 850 }}>
              +{featuredServices.length - 18} more services
            </button>
          )}
        </div>
      </aside>

      <main style={{ minWidth: 0, height: '100%', overflow: 'auto', paddingRight: '4px' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 20, ...shellPanel, padding: '10px', marginBottom: '12px', display: 'grid', gridTemplateColumns: 'minmax(210px, 0.8fr) minmax(360px, 1.6fr) auto', gap: '10px', alignItems: 'center', backdropFilter: 'blur(18px)' }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '9px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
              {MEDIA_VIEW_ICONS[activeView]}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '13px', fontWeight: 950, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeViewTab[1]}
              </span>
              <span style={{ display: 'block', marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {healthyServices.length}/{configuredServices.length} online · {detectedCount} detected
              </span>
            </span>
          </div>

          <div aria-label="Media quick commands" style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '7px', overflowX: 'auto', paddingBottom: '1px' }}>
            {topCommandItems.map(item => {
              const active = activeView === item.id
              const warn = item.id === 'setup' && detectedMissingCredentials.length > 0
              return (
                <button
                  key={`quick-${item.id}`}
                  title={item.label}
                  onClick={() => setActiveView(item.id)}
                  style={{
                    flex: '0 0 auto',
                    minHeight: '36px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    border: `1px solid ${active ? item.tone : warn ? 'rgba(255,182,87,0.45)' : 'rgba(255,255,255,0.1)'}`,
                    background: active ? `${item.tone}22` : warn ? 'rgba(255,182,87,0.11)' : 'rgba(255,255,255,0.045)',
                    color: active ? item.tone : warn ? '#ffb657' : 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '6px 9px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 850,
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.value !== null && <span style={{ fontSize: '10px', fontWeight: 950, fontVariantNumeric: 'tabular-nums' }}>{compactCount(item.value)}</span>}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '7px' }}>
            <button onClick={() => setActiveView('add')} style={{ ...miniButton('var(--accent)'), borderRadius: '8px', minHeight: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} />
              Add
            </button>
            <button onClick={handleRefresh} disabled={isRefreshing} style={{ ...miniButton('var(--text-primary)'), borderRadius: '8px', minHeight: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <ArrowsClockwise size={14} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
              Sync
            </button>
          </div>
        </div>

        <div id="media-command" style={{ ...shellPanel, padding: '12px', marginBottom: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
          {[
            ['Library', library.length],
            ['Detections', detectedCount],
            ['Requests', pendingRequests],
            ['Streams', liveStreams],
            ['Downloads', downloadCount],
            ['Ecosystem', `${ecosystemServices.filter(service => service.configured).length}/${ecosystemServices.length}`],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.18)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>

        {attentionServices.length > 0 && (
          <section style={{ ...card, padding: '12px', marginBottom: '12px', borderColor: 'rgba(255,182,87,0.32)', background: 'linear-gradient(135deg, rgba(255,182,87,0.09), rgba(255,255,255,0.025))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <WarningCircle size={15} style={{ color: '#ffb657' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: '#ffb657', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900 }}>Needs attention</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {attentionServices.length} detected service issue{attentionServices.length === 1 ? '' : 's'} before the stack is clean.
                  </div>
                </div>
              </div>
              <button onClick={() => setActiveView('setup')} style={{ ...glassButton, color: '#ffb657', padding: '7px 10px', fontWeight: 850 }}>
                Fix setup
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
              {attentionServices.slice(0, 8).map(service => <ServiceMiniCard key={service.id} service={service} />)}
            </div>
          </section>
        )}

        {activeView === 'overview' && !data?.mock && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div style={{ ...card, padding: '14px', borderColor: 'rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900 }}>Command inbox</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    One place for stack problems, approvals, downloads, missing media, and indexers.
                  </div>
                </div>
                <button onClick={() => setActiveView('add')} style={{ ...glassButton, color: 'var(--accent)', padding: '8px 11px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 850 }}>
                  <Plus size={14} />
                  Add media
                </button>
              </div>
              <div style={{ display: 'grid', gap: '8px', maxHeight: '430px', overflow: 'auto', paddingRight: '2px' }}>
                {commandInboxItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.target)}
                    style={{
                      ...glassButton,
                      display: 'grid',
                      gridTemplateColumns: '34px minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: '10px',
                      minHeight: '64px',
                      padding: '10px',
                      textAlign: 'left',
                      borderColor: `${item.tone}66`,
                      background: `linear-gradient(135deg, ${item.tone}18, rgba(255,255,255,0.032))`,
                    }}
                  >
                    <span style={{ width: '34px', height: '34px', borderRadius: '8px', display: 'grid', placeItems: 'center', color: item.tone, background: 'rgba(255,255,255,0.065)' }}>{item.icon}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                      <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.35, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</span>
                    </span>
                    <span style={{ color: item.tone, fontSize: '18px', fontWeight: 950, fontVariantNumeric: 'tabular-nums' }}>{compactCount(item.value)}</span>
                  </button>
                ))}
                {commandInboxItems.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                    Stack is quiet.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <section style={{ ...card, padding: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900, marginBottom: '10px' }}>Control surfaces</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {workflowCards.map(cardItem => (
                    <button
                      key={cardItem.id}
                      onClick={() => setActiveView(cardItem.id)}
                      style={{
                        ...glassButton,
                        minHeight: '86px',
                        padding: '10px',
                        textAlign: 'left',
                        display: 'grid',
                        gap: '6px',
                        borderColor: cardItem.value > 0 ? `${cardItem.tone}66` : 'rgba(255,255,255,0.1)',
                        background: cardItem.value > 0 ? `linear-gradient(135deg, ${cardItem.tone}18, rgba(255,255,255,0.03))` : 'rgba(255,255,255,0.035)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: cardItem.tone, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {cardItem.icon}
                        {cardItem.label}
                      </span>
                      <span style={{ fontSize: '22px', color: cardItem.tone, fontWeight: 950, fontVariantNumeric: 'tabular-nums' }}>{compactCount(cardItem.value)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section style={{ ...card, padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Play size={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Now Playing</span>
                </div>
                {data?.now_playing ? (
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 850, marginBottom: '4px', lineHeight: 1.3 }}>{data.now_playing.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Playing for {data.now_playing.user}</div>
                    {data.now_playing.progress !== null && (
                      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                        <div style={{ width: `${clampPercent(data.now_playing.progress)}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nothing playing right now</div>
                )}
              </section>

              <section style={{ ...card, padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <FilmStrip size={15} style={{ color: '#c084fc' }} />
                  <span style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Recently Added</span>
                </div>
                <div style={{ display: 'grid', gap: '7px' }}>
                  {recentlyAdded.slice(0, 5).map((item, index) => (
                    <button
                      key={`overview-recent-${item.service ?? 'media'}-${item.id ?? item.detail_id ?? index}`}
                      onClick={() => void openDetail(itemDetailRef(item))}
                      style={{ ...glassButton, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '8px', minHeight: '42px', padding: '8px 9px', textAlign: 'left' }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {serviceMap.get(item.service ?? '')?.name ?? item.service ?? item.kind ?? item.type}{item.year ? ` · ${item.year}` : ''}
                        </span>
                      </span>
                      <span style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 850 }}>{item.subtitle ?? item.kind ?? item.type}</span>
                    </button>
                  ))}
                  {recentlyAdded.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No recent items reported</div>}
                </div>
              </section>

              <section style={{ ...card, padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Calendar size={15} style={{ color: '#93c5fd' }} />
                  <span style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Upcoming</span>
                </div>
                <div style={{ display: 'grid', gap: '7px' }}>
                  {upcoming.slice(0, 5).map((item, index) => (
                    <button
                      key={`overview-upcoming-${item.service ?? 'media'}-${item.id ?? item.detail_id ?? index}`}
                      onClick={() => void openDetail(itemDetailRef(item))}
                      style={{ ...glassButton, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '8px', minHeight: '42px', padding: '8px 9px', textAlign: 'left' }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>{serviceMap.get(item.service ?? '')?.name ?? item.service ?? 'calendar'}</span>
                      </span>
                      <span style={{ color: '#93c5fd', fontSize: '11px', fontWeight: 850, whiteSpace: 'nowrap' }}>{formatAirDate(item.air_date)}</span>
                    </button>
                  ))}
                  {upcoming.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No upcoming episodes reported</div>}
                </div>
              </section>
            </div>
          </section>
        )}

      {activeView === 'setup' && degradedServices.length > 0 && (
        <section id="media-service-health" style={{ ...card, padding: '16px', marginBottom: '16px', borderColor: 'rgba(255,82,82,0.35)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--red)', marginBottom: '10px' }}>
            Configured, needs repair
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
            {degradedServices.map(service => {
              const detection = service.detections?.find(item => item.state?.toLowerCase() === 'running') ?? service.detections?.[0]
              const reachable = service.detected_url ?? detection?.detected_url ?? service.url ?? service.host
              return (
                <div key={service.id} style={{ display: 'grid', gap: '8px', padding: '10px', border: '1px solid rgba(255,82,82,0.28)', borderRadius: '8px', background: 'rgba(255,82,82,0.055)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '7px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 850 }}>
                      {serviceIcon(service.id)}
                      {service.name}
                    </div>
                    <span style={{ fontSize: '10px', color: serviceStateColor(service, 'var(--red)'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 900 }}>
                      {serviceStateLabel(service)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {serviceIssueText(service)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: 1.45 }}>
                    {(detection?.endpoint_name ?? 'homelab')} · {(reachable ?? 'no reachable URL').replace(/^https?:\/\//, '')}
                  </div>
                  {service.default_port && !detection?.default_port_published && (
                    <div style={{ fontSize: '11px', color: '#ffb657', lineHeight: 1.45 }}>
                      Publish port {service.default_port} or update this service URL in Settings.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <a href={serviceSettingsUrl(service)} style={{ ...miniButton('var(--red)'), borderRadius: '7px', textDecoration: 'none' }}>
                      Open settings
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {activeView === 'setup' && detectedMissingCredentials.length > 0 && (
        <section id="media-setup" style={{ ...card, padding: '16px', marginBottom: '16px', borderColor: 'rgba(255,182,87,0.35)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ffb657', marginBottom: '10px' }}>
            Detected, needs credentials
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
            {detectedMissingCredentials.map(service => {
              const detection = service.detections?.[0]
              const url = service.detected_url ?? service.url ?? detection?.detected_url
              return (
                <div key={service.id} style={{ display: 'grid', gap: '8px', padding: '10px', border: '1px solid rgba(255,182,87,0.28)', borderRadius: '8px', background: 'rgba(255,182,87,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 800 }}>
                    {serviceIcon(service.id)}
                    {service.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: 1.45 }}>
                    {(detection?.endpoint_name ?? 'homelab')} · {(url ?? service.host ?? 'detected').replace(/^https?:\/\//, '')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Missing {(service.missing_credentials ?? service.credential_keys ?? []).slice(0, 3).join(', ')}
                  </div>
                  {service.diagnostic && (
                    <div style={{ fontSize: '11px', color: '#ffb657', lineHeight: 1.45 }}>
                      {service.diagnostic}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <a href={serviceSettingsUrl(service)} style={{ ...miniButton('#ffb657'), borderRadius: '7px', textDecoration: 'none' }}>
                      Setup keys
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {activeView === 'setup' && data?.mock && (
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

      {activeView === 'browse' && (
      <section id="media-browse" style={{ ...card, padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FilmStrip size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Browse</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {browseItems.length}/{browseCatalog.length} library items
          </div>
        </div>
        <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(180px, 1fr) auto', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <select aria-label="Discovery request service" value={requestService} onChange={event => setRequestService(event.target.value)} style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
              {(requestServices.length ? requestServices : [{ id: 'overseerr', name: 'Overseerr', configured: true, healthy: false }]).map(service => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minWidth: 0 }}>
              {(['tv', 'movie'] as DiscoverKindFilter[]).map(kind => (
                <button key={kind} onClick={() => setDiscoverKind(kind)} style={{ ...miniButton(discoverKind === kind ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '7px', padding: '6px 8px', background: discoverKind === kind ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)' }}>
                  {kind === 'tv' ? 'Shows' : 'Movies'}
                </button>
              ))}
              {(['popular', 'trending', 'upcoming'] as DiscoverCategoryFilter[]).map(category => (
                <button key={category} onClick={() => setDiscoverCategory(category)} style={{ ...miniButton(discoverCategory === category ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '7px', padding: '6px 8px', background: discoverCategory === category ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)' }}>
                  {category}
                </button>
              ))}
            </div>
            <button onClick={() => void discoverRequests()} disabled={busy === 'request-discover'} style={{ ...miniButton('var(--accent)'), borderRadius: '8px', minHeight: '36px' }}>
              Load
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: discoverResults.length ? '10px' : 0 }}>
            <button onClick={() => setDiscoverProvider('all')} style={{ ...miniButton(discoverProvider === 'all' ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '7px', padding: '6px 8px', background: discoverProvider === 'all' ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)' }}>
              All networks
            </button>
            {discoverProviders.map(provider => (
              <button key={provider.id} onClick={() => setDiscoverProvider(provider.id)} style={{ ...miniButton(discoverProvider === provider.id ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '7px', padding: '6px 8px', background: discoverProvider === provider.id ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)' }}>
                {provider.name}
              </button>
            ))}
            {discoverTotal !== null && (
              <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 750 }}>{discoverTotal} found</span>
            )}
          </div>
          {discoverResults.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px', maxHeight: '350px', overflow: 'auto' }}>
              {discoverResults.slice(0, 12).map(item => {
                const mediaType = String(item.mediaType ?? item.media_type ?? discoverKind)
                const resultKey = requestResultKey(item)
                const seasonNumbers = requestSeasonNumbers(item)
                const selectedSeasons = parseSeasonSelection(requestSeasonSelections[resultKey] ?? '')
                return (
                  <div key={`discover-${item.id}-${resultTitle(item)}`} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.035)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 850, lineHeight: 1.35 }}>{resultTitle(item)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {mediaType} · {String(item.releaseDate ?? item.firstAirDate ?? '')}
                    </div>
                    {mediaType === 'tv' && seasonNumbers.length > 0 && (
                      <label style={{ display: 'grid', gap: '4px', marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 850 }}>
                        Seasons
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {seasonNumbers.map(seasonNumber => {
                            const selected = selectedSeasons.includes(seasonNumber)
                            return (
                              <button
                                key={seasonNumber}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleRequestSeason(resultKey, seasonNumber)}
                                style={{
                                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                                  background: selected ? 'rgba(94,234,212,0.13)' : 'rgba(255,255,255,0.035)',
                                  color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                                  borderRadius: '7px',
                                  minWidth: '32px',
                                  height: '28px',
                                  fontSize: '12px',
                                  fontWeight: 850,
                                  cursor: 'pointer',
                                }}
                              >
                                S{seasonNumber}
                              </button>
                            )
                          })}
                        </div>
                        <input
                          aria-label={`Season numbers for ${resultTitle(item)}`}
                          value={requestSeasonSelections[resultKey] ?? ''}
                          onChange={event => setRequestSeasonSelections(prev => ({ ...prev, [resultKey]: event.target.value }))}
                          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 7px', fontSize: '12px', fontWeight: 700 }}
                        />
                      </label>
                    )}
                    <button onClick={() => void createRequest(item)} disabled={busy === `request-create-${item.id}`} style={{ ...miniButton('var(--accent)'), borderRadius: '7px', marginTop: '8px' }}>
                      Request
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.3fr) repeat(3, minmax(150px, 1fr))', gap: '8px', marginBottom: '12px' }}>
          <input
            aria-label="Browse library search"
            value={browseQuery}
            onChange={event => setBrowseQuery(event.target.value)}
            placeholder="Filter titles, networks, studios"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }}
          />
          <select value={browseSource} onChange={event => setBrowseSource(event.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
            <option value="all">All services</option>
            {browseSourceOptions.map(service => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
          <select value={browseKind} onChange={event => setBrowseKind(event.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
            <option value="all">All types</option>
            {browseKindOptions.map(kind => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
          <select value={browseNetwork} onChange={event => setBrowseNetwork(event.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
            <option value="all">All networks</option>
            {browseNetworkOptions.map(network => (
              <option key={network} value={network}>{network}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px' }}>Sources</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button onClick={() => setBrowseSource('all')} style={{ ...miniButton(browseSource === 'all' ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '7px', padding: '6px 8px' }}>
                All {browseCatalog.length}
              </button>
              {browseServiceStats.map(({ service, count }) => (
                <button key={service.id} onClick={() => setBrowseSource(service.id)} style={{ ...miniButton(browseSource === service.id ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '7px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  {serviceIcon(service.id)}
                  {service.name} {count}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Streaming networks</div>
              {browseNetwork !== 'all' && (
                <button onClick={() => setBrowseNetwork('all')} style={{ ...miniButton('var(--text-secondary)'), borderRadius: '7px', padding: '5px 8px' }}>
                  Clear
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '6px' }}>
              {browseNetworkStats.map(({ network, count }) => (
                <button key={network} onClick={() => setBrowseNetwork(network)} style={{ border: `1px solid ${browseNetwork === network ? 'var(--accent)' : 'var(--border)'}`, background: browseNetwork === network ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', color: browseNetwork === network ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: '8px', padding: '8px', textAlign: 'left', cursor: 'pointer', minHeight: '48px' }}>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{network}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{count} titles</span>
                </button>
              ))}
              {browseNetworkStats.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No network metadata reported yet</div>}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px' }}>Recently added</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {recentlyAdded.slice(0, 5).map((item, index) => (
                <button key={`${item.title}-${index}`} onClick={() => void openDetail(itemDetailRef(item))} style={{ ...glassButton, display: 'block', width: '100%', padding: '7px 8px', textAlign: 'left', fontSize: '13px', fontWeight: 750, lineHeight: 1.35 }}>
                  {item.title} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{item.subtitle ?? item.year ?? item.type}</span>
                </button>
              ))}
              {recentlyAdded.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No recent items reported</div>}
            </div>
          </div>
          <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px' }}>Upcoming</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {upcoming.slice(0, 5).map((item, index) => (
                <button key={`${item.title}-${index}`} onClick={() => void openDetail(itemDetailRef(item))} style={{ ...glassButton, width: '100%', display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '7px 8px', textAlign: 'left', fontSize: '13px', fontWeight: 750, lineHeight: 1.35 }}>
                  <span>{item.title}</span>
                  <span style={{ color: 'var(--accent)', fontSize: '11px', whiteSpace: 'nowrap' }}>{formatAirDate(item.air_date)}</span>
                </button>
              ))}
              {upcoming.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No upcoming episodes reported</div>}
            </div>
          </div>
          <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px' }}>Top networks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {browseNetworkOptions.slice(0, 10).map(network => (
                <button key={network} onClick={() => setBrowseNetwork(network)} style={{ ...miniButton(browseNetwork === network ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '7px', padding: '5px 8px' }}>
                  {network}
                </button>
              ))}
              {browseNetworkOptions.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Network metadata not reported yet</div>}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px', maxHeight: '420px', overflow: 'auto' }}>
          {browseItems.slice(0, 72).map(item => (
            <button key={`${item.service}-${item.id}-${libraryTitle(item)}`} onClick={() => void openDetail(itemDetailRef(item))} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, lineHeight: 1.35 }}>
                {serviceIcon(item.service)}
                <span>{libraryTitle(item)}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.4 }}>
                {libraryKind(item)} · {libraryNetwork(item)}{item.year ? ` · ${item.year}` : ''}
              </div>
            </button>
          ))}
          {browseItems.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No media matches these filters</div>}
        </div>
      </section>
      )}

      {activeView === 'setup' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <section id="media-services" style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Pulse size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Service directory
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', maxWidth: '100%' }}>
              {serviceSetupFilters.map(filter => {
                const active = serviceSetupFilter === filter.id
                return (
                  <button
                    key={filter.id}
                    onClick={() => setServiceSetupFilter(filter.id)}
                    style={{
                      ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'),
                      flex: '0 0 auto',
                      borderRadius: '7px',
                      padding: '6px 8px',
                      background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {filter.label} {compactCount(filter.count)}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {setupServiceGroups.map(([group, services]) => (
              <div key={group} style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900 }}>{group}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{services.length}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px' }}>
                  {services.map(service => {
                    const tone = serviceTone(service.id)
                    const stateColor = serviceStateColor(service, tone.accent)
                    const attentionColor = stateColor.startsWith('var(') ? 'rgba(255,82,82,0.66)' : `${stateColor}66`
                    const attentionBg = stateColor.startsWith('var(') ? 'rgba(255,82,82,0.08)' : `${stateColor}10`
                    const detectionCount = service.detections?.length ?? 0
                    const actions = new Set(service.actions ?? [])
                    const canRss = actions.has('rss-sync')
                    const canMissingSearch = actions.has('missing-search')
                    const canApplicationSync = actions.has('application-sync')
                    return (
                      <div key={service.id} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${serviceNeedsAttention(service) ? attentionColor : 'var(--border)'}`, background: serviceNeedsAttention(service) ? attentionBg : 'var(--bg-elevated)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, fontSize: '13px', fontWeight: 850 }}>
                            <span style={{ color: tone.accent, display: 'grid', placeItems: 'center' }}>{serviceIcon(service.id)}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</span>
                          </span>
                          {service.healthy
                            ? <CheckCircle size={15} style={{ color: 'var(--secondary)' }} />
                            : <WarningCircle size={15} style={{ color: stateColor }} />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          <span style={{ border: `1px solid ${stateColor}55`, color: stateColor, borderRadius: '7px', padding: '3px 6px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {serviceStateLabel(service)}
                          </span>
                          <span style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: '7px', padding: '3px 6px', fontSize: '10px', fontWeight: 850 }}>
                            {serviceKindLabel(service)}
                          </span>
                          {detectionCount > 0 && (
                            <span style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '7px', padding: '3px 6px', fontSize: '10px', fontWeight: 850 }}>
                              {detectionCount} detected
                            </span>
                          )}
                        </div>
                        {(service.detected_url ?? service.url ?? service.host) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(service.detected_url ?? service.url ?? service.host ?? '').replace(/^https?:\/\//, '')}
                          </div>
                        )}
                        {service.diagnostic && (
                          <div style={{ fontSize: '11px', color: serviceNeedsAttention(service) ? '#ffb657' : 'var(--text-muted)', lineHeight: 1.4, marginTop: '6px' }}>
                            {service.diagnostic}
                          </div>
                        )}
                        {serviceNeedsAttention(service) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: '6px' }}>
                            {serviceIssueText(service)}
                          </div>
                        )}
                        {service.configured ? (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                            {canRss && (
                              <button onClick={() => runServiceCommand(service, 'rss-sync')} disabled={busy === `service-${service.id}-rss-sync`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: 'pointer' }}>
                                RSS
                              </button>
                            )}
                            {canApplicationSync && (
                              <button onClick={() => runServiceCommand(service, 'application-sync')} disabled={busy === `service-${service.id}-application-sync`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: 'pointer' }}>
                                Sync apps
                              </button>
                            )}
                            {canMissingSearch && (
                              <button onClick={() => runServiceCommand(service, 'missing-search')} disabled={busy === `service-${service.id}-missing-search`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: 'pointer' }}>
                                Search all
                              </button>
                            )}
                            {!canRss && !canApplicationSync && !canMissingSearch && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px', padding: '5px 0' }}>Status only</span>
                            )}
                          </div>
                        ) : serviceNeedsAttention(service) ? (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                            <a href={serviceSettingsUrl(service)} style={{ ...miniButton('#ffb657'), borderRadius: '7px', textDecoration: 'none' }}>
                              Setup
                            </a>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {setupServices.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                No services in this filter.
              </div>
            )}
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
                  <div style={{ width: `${clampPercent(data.now_playing.progress)}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nothing playing right now</div>
          )}
        </section>
      </div>
      )}

      {activeView === 'add' && (
      <section id="media-search" style={{ ...card, padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MagnifyingGlass size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              {canGrabResults ? 'Release browser' : 'Search and add'}
            </span>
          </div>
          {message && <span style={{ fontSize: '12px', color: message.includes('failed') || message.includes('returned') ? 'var(--red)' : 'var(--secondary)' }}>{message}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: '8px' }}>
          <select value={searchService} onChange={e => setSearchService(e.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
            {searchableServices.map(service => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
          <input aria-label="Media search query" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search() }} placeholder={canGrabResults ? 'Search releases across Prowlarr' : 'Search movie, series, or artist'} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }} />
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
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{canGrabResults ? releaseMeta(item) : String(item.year ?? item.status ?? searchService)}</div>
                {canGrabResults ? (
                  <button onClick={() => grabRelease(item)} disabled={busy === `grab-${resultTitle(item)}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--accent)', borderRadius: '7px', padding: '6px 8px', cursor: 'pointer' }}>
                    <DownloadSimple size={13} />
                    Grab
                  </button>
                ) : (
                  <button onClick={() => add(item)} disabled={!canAddResults || busy === `add-${resultTitle(item)}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid var(--border)', background: 'var(--bg-panel)', color: canAddResults ? 'var(--accent)' : 'var(--text-muted)', borderRadius: '7px', padding: '6px 8px', cursor: canAddResults ? 'pointer' : 'not-allowed' }}>
                    <Plus size={13} />
                    {canAddResults ? 'Add' : 'Search only'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {activeView === 'downloads' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <section id="media-queue" style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Queue
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflow: 'auto' }}>
            {queue.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Queue is empty</div>
            ) : queue.map(item => (
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

        <section id="media-calendar" style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            <Calendar size={14} />
            Calendar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflow: 'auto' }}>
            {calendar.slice(0, 16).map((item, index) => {
              const date = item.airDateUtc ?? item.releaseDate ?? item.inCinemas ?? ''
              return (
                <button key={`${calendarTitle(item)}-${index}`} onClick={() => void openDetail(itemDetailRef(item))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.35 }}>{calendarTitle(item)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatAirDate(date)}</span>
                </button>
              )
            })}
            {calendar.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No upcoming releases</div>}
          </div>
        </section>
      </div>
      )}

      {(activeView === 'requests' || activeView === 'downloads') && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {activeView === 'requests' && (
        <section id="media-requests" style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Requests
          </div>
          {activeView === 'requests' && <ServiceStatusStrip services={requestServices} />}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
            {([
              ['pending', 'Pending'],
              ['all', 'All'],
              ['available', 'Available'],
              ['partial', 'Partial'],
              ['approved', 'Approved'],
              ['declined', 'Declined'],
            ] as Array<[RequestStatusFilter, string]>).map(([id, label]) => {
              const active = requestStatusFilter === id
              return (
                <button key={id} onClick={() => setRequestStatusFilter(id)} style={{ ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
                  {label} {compactCount(requestStatusCounts[id])}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr) auto', gap: '8px', marginBottom: '12px' }}>
            <select value={requestService} onChange={event => setRequestService(event.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
              {(requestServices.length ? requestServices : [{ id: 'overseerr', name: 'Overseerr', configured: true, healthy: false }]).map(service => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <input aria-label="Request search query" value={requestQuery} onChange={event => setRequestQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchRequests() }} placeholder="Search movie or show to request" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }} />
            <button onClick={() => void searchRequests()} disabled={busy === 'request-search' || !requestQuery.trim()} style={{ ...miniButton('var(--accent)'), borderRadius: '8px', minHeight: '36px' }}>
              Search
            </button>
          </div>
          {requestResults.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '12px' }}>
              {requestResults.slice(0, 8).map(item => {
                const mediaType = String(item.mediaType ?? item.media_type ?? 'media')
                const resultKey = requestResultKey(item)
                const seasonNumbers = requestSeasonNumbers(item)
                const selectedSeasons = parseSeasonSelection(requestSeasonSelections[resultKey] ?? '')
                return (
                  <div key={`${item.id}-${resultTitle(item)}`} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 850, lineHeight: 1.35 }}>{resultTitle(item)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {mediaType} · {String(item.releaseDate ?? item.firstAirDate ?? '')}
                    </div>
                    {mediaType === 'tv' && (
                      <label style={{ display: 'grid', gap: '4px', marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 850 }}>
                        Seasons
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {seasonNumbers.map(seasonNumber => {
                            const selected = selectedSeasons.includes(seasonNumber)
                            return (
                              <button
                                key={seasonNumber}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleRequestSeason(resultKey, seasonNumber)}
                                style={{
                                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                                  background: selected ? 'rgba(94,234,212,0.13)' : 'rgba(255,255,255,0.035)',
                                  color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                                  borderRadius: '7px',
                                  minWidth: '32px',
                                  height: '28px',
                                  fontSize: '12px',
                                  fontWeight: 850,
                                  cursor: 'pointer',
                                }}
                              >
                                S{seasonNumber}
                              </button>
                            )
                          })}
                        </div>
                        <input
                          aria-label={`Season numbers for ${resultTitle(item)}`}
                          value={requestSeasonSelections[resultKey] ?? ''}
                          onChange={event => setRequestSeasonSelections(prev => ({ ...prev, [resultKey]: event.target.value }))}
                          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 7px', fontSize: '12px', fontWeight: 700 }}
                        />
                      </label>
                    )}
                    <button onClick={() => void createRequest(item)} disabled={busy === `request-create-${item.id}`} style={{ ...miniButton('var(--accent)'), borderRadius: '7px', marginTop: '8px' }}>
                      Request
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflow: 'auto' }}>
            {visibleRequests.slice(0, 24).map(item => {
              const pending = requestIsPending(item)
              return (
                <div key={`${item.service}-${item.id}-${requestTitle(item)}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{requestTitle(item)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {serviceMap.get(item.service)?.name ?? item.service} · {item.requestedBy?.displayName ?? item.requestedBy?.email ?? 'requested'}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ border: '1px solid var(--border)', color: pending ? '#ffb657' : 'var(--text-secondary)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {requestStatus(item)}
                    </span>
                    {pending && (
                      <>
                        <button onClick={() => requestAction(item, 'approve')} disabled={!item.id || busy === `request-${item.service}-${item.id}-approve`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                          Approve
                        </button>
                        <button onClick={() => requestAction(item, 'decline')} disabled={!item.id || busy === `request-${item.service}-${item.id}-decline`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--red)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {requests.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No request service items</div>}
            {requests.length > 0 && visibleRequests.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No requests in this status</div>}
          </div>
        </section>
        )}

        {activeView === 'downloads' && (
        <section id="media-downloads" style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Download Clients
          </div>
          {activeView === 'downloads' && <ServiceStatusStrip services={downloadServices} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '7px', marginBottom: '12px' }}>
            <button onClick={() => setDownloadServiceFilter('all')} style={{ border: `1px solid ${downloadServiceFilter === 'all' ? 'var(--accent)' : 'var(--border)'}`, background: downloadServiceFilter === 'all' ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', color: downloadServiceFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: '8px', padding: '8px', textAlign: 'left', cursor: 'pointer', minHeight: '50px' }}>
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 850 }}>All clients</span>
              <span style={{ display: 'block', marginTop: '3px', fontSize: '10px', color: 'var(--text-muted)' }}>{downloads.length} jobs</span>
            </button>
            {downloadClientStats.map(({ service, count }) => {
              const active = downloadServiceFilter === service.id
              const tone = serviceTone(service.id)
              return (
                <button key={service.id} onClick={() => setDownloadServiceFilter(service.id)} style={{ border: `1px solid ${active ? tone.accent : 'var(--border)'}`, background: active ? `${tone.accent}18` : 'rgba(255,255,255,0.035)', color: active ? tone.accent : 'var(--text-secondary)', borderRadius: '8px', padding: '8px', textAlign: 'left', cursor: 'pointer', minHeight: '50px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, fontSize: '12px', fontWeight: 850 }}>
                    {serviceIcon(service.id)}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</span>
                  </span>
                  <span style={{ display: 'block', marginTop: '3px', fontSize: '10px', color: count > 0 ? tone.accent : 'var(--text-muted)' }}>
                    {count} jobs · {serviceStateLabel(service)}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflow: 'auto' }}>
            {visibleDownloads.slice(0, 16).map((item, index) => (
              <div key={`${item.service}-${downloadTitle(item)}-${index}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{downloadTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {serviceMap.get(item.service)?.name ?? item.service} · {item.status ?? item.state ?? 'active'} · {downloadMeta(item)}
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
                  {item.service === 'qbittorrent' && (
                    <>
                      <input aria-label={`qBittorrent category for ${downloadTitle(item)}`} value={qbitEdits[qbitEditKey(item)]?.category ?? item.category ?? ''} onChange={event => setQbitEdits(prev => ({ ...prev, [qbitEditKey(item)]: { category: event.target.value, tags: prev[qbitEditKey(item)]?.tags ?? item.tags ?? '' } }))} style={{ minWidth: '110px', maxWidth: '150px', border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px' }} />
                      <button onClick={() => setQbitCategory(item)} disabled={!downloadId(item) || busy === `download-${item.service}-${downloadId(item)}-set-category`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: downloadId(item) ? 'pointer' : 'not-allowed' }}>
                        Category
                      </button>
                      <input aria-label={`qBittorrent tags for ${downloadTitle(item)}`} value={qbitEdits[qbitEditKey(item)]?.tags ?? item.tags ?? ''} onChange={event => setQbitEdits(prev => ({ ...prev, [qbitEditKey(item)]: { category: prev[qbitEditKey(item)]?.category ?? item.category ?? '', tags: event.target.value } }))} style={{ minWidth: '90px', maxWidth: '140px', border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px' }} />
                      <button onClick={() => addQbitTags(item)} disabled={!downloadId(item) || busy === `download-${item.service}-${downloadId(item)}-add-tags`} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: downloadId(item) ? 'pointer' : 'not-allowed' }}>
                        Tags
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {downloads.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No downloader queue connected</div>}
            {downloads.length > 0 && visibleDownloads.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No jobs for this client</div>}
          </div>
        </section>
        )}

        {activeView === 'downloads' && (
        <section id="media-streams" style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Streams / Playback
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflow: 'auto' }}>
            {streams.slice(0, 16).map((item, index) => (
              <div key={`${item.service}-${streamTitle(item)}-${index}`} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{streamTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {item.username ?? item.user ?? 'user'} · {streamPlayer(item)} · {streamDecision(item)}
                </div>
                {(item.progress ?? item.progress_percent) !== undefined && (
                  <div style={{ marginTop: '7px', height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${clampPercent(item.progress ?? item.progress_percent)}%`, height: '100%', background: streamDecision(item).toLowerCase().includes('transcode') ? '#ffb657' : 'var(--accent)' }} />
                  </div>
                )}
              </div>
            ))}
            {streams.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No analytics stream service connected</div>}
          </div>
        </section>
        )}
      </div>
      )}

      {activeView === 'missing' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <section id="media-missing" style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Wanted / Missing
            </div>
            <button onClick={() => configuredServices.filter(service => ['sonarr', 'radarr', 'lidarr'].includes(service.id)).forEach(service => void runServiceCommand(service, 'missing-search'))} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--accent)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
              Search all missing
            </button>
          </div>
          <ServiceStatusStrip services={subtitleServices} />
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
            <button onClick={() => setWantedServiceFilter('all')} style={{ ...miniButton(wantedServiceFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: wantedServiceFilter === 'all' ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: wantedServiceFilter === 'all' ? 'var(--accent)' : 'var(--border)' }}>
              All {compactCount(wanted.length)}
            </button>
            {wantedServiceStats.map(({ service, count }) => {
              const active = wantedServiceFilter === service.id
              return (
                <button key={service.id} onClick={() => setWantedServiceFilter(service.id)} style={{ ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
                  {service.name} {compactCount(count)}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflow: 'auto' }}>
            {visibleWanted.slice(0, 24).map((item, index) => (
              <button key={`${item.service}-${item.id}-${index}`} onClick={() => void openDetail(itemDetailRef(item))} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>
                  {serviceIcon(item.service)}
                  <span>{wantedTitle(item)}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {serviceMap.get(item.service)?.name ?? item.service} · {formatAirDate(item.airDateUtc ?? item.releaseDate ?? '') || 'missing'}
                </div>
              </button>
            ))}
            {wanted.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No missing media reported</div>}
            {wanted.length > 0 && visibleWanted.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No missing media for this source</div>}
          </div>
        </section>

        <section style={{ ...card, padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Activity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflow: 'auto' }}>
            {history.slice(0, 20).map((item, index) => (
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
            {history.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No recent ARR activity</div>}
          </div>
        </section>
      </div>
      )}

      {activeView === 'indexers' && (
      <section id="media-indexers" style={{ ...card, padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Prowlarr Indexers
        </div>
        <ServiceStatusStrip services={indexerServices} />
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
          {([
            ['all', 'All'],
            ['enabled', 'Enabled'],
            ['disabled', 'Disabled'],
          ] as Array<[IndexerStateFilter, string]>).map(([id, label]) => {
            const active = indexerStateFilter === id
            return (
              <button key={id} onClick={() => setIndexerStateFilter(id)} style={{ ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
                {label} {compactCount(indexerStateCounts[id])}
              </button>
            )
          })}
        </div>
        {indexerProtocolStats.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '10px' }}>
            <button onClick={() => setIndexerProtocolFilter('all')} style={{ ...miniButton(indexerProtocolFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: indexerProtocolFilter === 'all' ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: indexerProtocolFilter === 'all' ? 'var(--accent)' : 'var(--border)' }}>
              All protocols
            </button>
            {indexerProtocolStats.map(({ protocol, count }) => {
              const active = indexerProtocolFilter === protocol
              return (
                <button key={protocol} onClick={() => setIndexerProtocolFilter(protocol)} style={{ ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
                  {protocol} {compactCount(count)}
                </button>
              )
            })}
          </div>
        )}
        {indexerHealth.length > 0 && (
          <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
            {indexerHealth.slice(0, 6).map((item, index) => (
              <div key={`${item.service}-${item.source ?? index}`} style={{ border: '1px solid rgba(255,182,87,0.28)', background: 'rgba(255,182,87,0.06)', borderRadius: '8px', padding: '9px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: '#ffb657', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {item.type ?? 'warning'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 800 }}>
                    {item.source ?? 'Prowlarr'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>
                  {item.message ?? 'Prowlarr health warning'}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px' }}>
          {visibleIndexers.map(item => (
            <div key={`${item.service}-${item.id}-${indexerTitle(item)}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>{indexerTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {item.protocol ?? 'indexer'} · priority {item.priority ?? '--'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => toggleIndexer(item)} disabled={!item.id || busy === `indexer-${item.id}`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: item.enable === false ? 'var(--text-muted)' : 'var(--secondary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                  {item.enable === false ? 'Off' : 'On'}
                </button>
                <button onClick={() => testIndexer(item)} disabled={!item.id || busy === `indexer-test-${item.id}`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>
                  Test
                </button>
              </div>
            </div>
          ))}
          {indexers.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No indexers reported by Prowlarr</div>}
          {indexers.length > 0 && visibleIndexers.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No indexers in this filter</div>}
        </div>
      </section>
      )}

      {activeView === 'missing' && (
      <section id="media-subtitles" style={{ ...card, padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Bazarr Subtitles
        </div>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
          {([
            ['all', 'All'],
            ['movies', 'Movies'],
            ['episodes', 'Episodes'],
          ] as Array<[SubtitleKindFilter, string]>).map(([id, label]) => {
            const active = subtitleKindFilter === id
            return (
              <button key={id} onClick={() => setSubtitleKindFilter(id)} style={{ ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
                {label} {compactCount(subtitleKindCounts[id])}
              </button>
            )
          })}
        </div>
        {subtitleLanguageStats.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '10px' }}>
            <button onClick={() => setSubtitleLanguageFilter('all')} style={{ ...miniButton(subtitleLanguageFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: subtitleLanguageFilter === 'all' ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: subtitleLanguageFilter === 'all' ? 'var(--accent)' : 'var(--border)' }}>
              All languages
            </button>
            {subtitleLanguageStats.map(({ language, count }) => {
              const active = subtitleLanguageFilter === language
              return (
                <button key={language} onClick={() => setSubtitleLanguageFilter(language)} style={{ ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
                  {language} {compactCount(count)}
                </button>
              )
            })}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {visibleSubtitles.slice(0, 48).map((item, index) => (
            <div key={`${item.service}-${wantedTitle(item)}-${index}`} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', display: 'grid', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>{serviceIcon(item.service)}{wantedTitle(item)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {(serviceMap.get(item.service)?.name ?? item.service)} · {subtitleLabel(item)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {item.radarrId ? `Radarr movie ${item.radarrId}` : item.sonarrEpisodeId ? `Sonarr episode ${item.sonarrEpisodeId}` : 'Bazarr wanted item'}
                </div>
              </div>
              <button onClick={() => void searchSubtitle(item)} disabled={busy === `subtitle-${item.service}-${item.radarrId ?? item.sonarrEpisodeId ?? wantedTitle(item)}`} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--accent)', borderRadius: '7px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer', justifySelf: 'start' }}>
                Search
              </button>
            </div>
          ))}
          {subtitles.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No missing subtitles reported by Bazarr</div>}
          {subtitles.length > 0 && visibleSubtitles.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No subtitle gaps in this filter</div>}
        </div>
      </section>
      )}

      {activeView === 'library' && (
      <section id="media-library" style={{ ...card, padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Library
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {visibleLibrary.length}/{library.length} items
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(150px, 1fr)', gap: '8px', marginBottom: '10px' }}>
          <input
            aria-label="Library search"
            value={libraryQuery}
            onChange={event => setLibraryQuery(event.target.value)}
            placeholder="Find controlled media"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }}
          />
          <select value={librarySourceFilter} onChange={event => setLibrarySourceFilter(event.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
            <option value="all">All services</option>
            {libraryServiceStats.map(({ service, count }) => (
              <option key={service.id} value={service.id}>{service.name} ({count})</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '10px' }}>
          {([
            ['all', 'All'],
            ['monitored', 'Monitored'],
            ['unmonitored', 'Unmonitored'],
          ] as Array<[LibraryMonitorFilter, string]>).map(([id, label]) => {
            const active = libraryMonitorFilter === id
            return (
              <button key={id} onClick={() => setLibraryMonitorFilter(id)} style={{ ...miniButton(active ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.035)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
                {label} {compactCount(libraryMonitorCounts[id])}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {visibleLibrary.slice(0, 72).map(item => (
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
          {library.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No library items reported</div>}
          {library.length > 0 && visibleLibrary.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No library items match these filters</div>}
        </div>
      </section>
      )}
      {selectedDetail && (
        <div role="dialog" aria-label="Media detail" style={{ position: 'fixed', top: '18px', right: '18px', bottom: '18px', width: 'min(420px, calc(100vw - 36px))', zIndex: 60, ...shellPanel, padding: '14px', display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: '12px', boxShadow: '0 24px 90px rgba(0,0,0,0.42)' }}>
          {(() => {
            const detailTitle = String(selectedDetail.title ?? selectedDetail.item.title ?? selectedDetail.item.name ?? selectedDetail.item.artistName ?? selectedDetail.item.fullTitle ?? selectedDetail.id)
            const detailMeta = [
              selectedDetail.subtitle,
              selectedDetail.year ?? selectedDetail.item.year,
              selectedDetail.item.network,
              selectedDetail.item.studio,
              selectedDetail.status,
              selectedDetail.monitored === false || selectedDetail.item.monitored === false ? 'unmonitored' : selectedDetail.monitored === true || selectedDetail.item.monitored === true ? 'monitored' : null,
              selectedDetail.has_file === false || selectedDetail.item.hasFile === false ? 'missing file' : selectedDetail.has_file === true || selectedDetail.item.hasFile === true ? 'available' : null,
            ].map(value => (value == null ? '' : String(value))).filter(Boolean).join(' · ')
            return (
              <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--accent)', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                {serviceIcon(selectedDetail.service)}
                {serviceMap.get(selectedDetail.service)?.name ?? selectedDetail.service} · {selectedDetail.kind}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 950, lineHeight: 1.18 }}>
                {detailTitle}
              </div>
              <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.45 }}>
                {detailMeta || (detailLoading ? 'Loading detail...' : 'Detail')}
              </div>
            </div>
            <button onClick={() => setSelectedDetail(null)} style={{ ...glassButton, color: 'var(--text-primary)', width: '32px', height: '32px', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              x
            </button>
          </div>
          <div style={{ minHeight: 0, overflow: 'auto', display: 'grid', gap: '10px', alignContent: 'start' }}>
            {Boolean(selectedDetail.item.overview) && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
                {String(selectedDetail.item.overview)}
              </div>
            )}
            {[
              ['Queue', selectedDetail.queue ?? [], queueTitle],
              ['Missing', selectedDetail.wanted ?? [], wantedTitle],
              ['History', selectedDetail.history ?? [], historyTitle],
            ].map(([label, rows, titleFor]) => {
              const items = rows as Array<QueueItem | WantedItem | HistoryItem>
              const title = titleFor as (item: QueueItem | WantedItem | HistoryItem) => string
              if (items.length === 0) return null
              return (
                <div key={String(label)} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 9px', borderBottom: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>
                    {String(label)}
                  </div>
                  <div style={{ display: 'grid', gap: '1px' }}>
                    {items.slice(0, 4).map((item, index) => (
                      <div key={`${String(label)}-${item.service}-${item.id ?? index}`} style={{ padding: '8px 9px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{title(item)}</span>
                        {'status' in item && item.status ? <span> · {String(item.status)}</span> : null}
                        {'eventType' in item && item.eventType ? <span> · {String(item.eventType)}</span> : null}
                        {'date' in item && item.date ? <span> · {formatAirDate(String(item.date))}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {([
                ['ID', String(selectedDetail.id)],
                ['Service', serviceMap.get(selectedDetail.service)?.name ?? selectedDetail.service],
                ['Kind', selectedDetail.kind],
                ['Actions', selectedDetail.actions?.join(', ') || 'view'],
              ] satisfies Array<[string, string]>).map(([label, value]) => (
                <div key={String(label)} style={{ padding: '9px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', minWidth: 0 }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '12px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(value ?? '--')}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {['sonarr', 'radarr', 'lidarr'].includes(selectedDetail.service) && Number.isFinite(Number(selectedDetail.id)) && (
              <>
                <button onClick={() => void toggleLibraryItem(detailLibraryItem(selectedDetail, detailTitle))} style={{ ...miniButton(selectedDetail.monitored === false || selectedDetail.item.monitored === false ? 'var(--text-muted)' : 'var(--secondary)'), borderRadius: '7px' }}>
                  {selectedDetail.monitored === false || selectedDetail.item.monitored === false ? 'Monitor' : 'Unmonitor'}
                </button>
                <button onClick={() => void refreshLibraryItem(detailLibraryItem(selectedDetail, detailTitle))} style={{ ...miniButton('var(--text-secondary)'), borderRadius: '7px' }}>
                  Refresh
                </button>
                <button onClick={() => void runSearch(detailLibraryItem(selectedDetail, detailTitle))} style={{ ...miniButton('var(--accent)'), borderRadius: '7px' }}>
                  Search
                </button>
                <button onClick={() => { void (async () => { if (await deleteLibraryItem(detailLibraryItem(selectedDetail, detailTitle))) setSelectedDetail(null) })() }} style={{ ...miniButton('var(--red)'), borderRadius: '7px' }}>
                  Remove
                </button>
              </>
            )}
          </div>
              </>
            )
          })()}
        </div>
      )}
      </main>
    </div>
  )
}
