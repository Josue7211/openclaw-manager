interface NowPlaying {
  title: string
  type: string
  user: string
  progress: number | null
}

export interface DetailRef {
  service: string
  kind: string
  id: number | string
}

interface RecentItem {
  title: string
  type: string
  service?: string
  kind?: string
  id?: number | string
  subtitle?: string
  year?: number
  detail_id?: number | string
  detail_ref?: DetailRef
}

interface UpcomingItem {
  title: string
  air_date: string
  service?: string
  kind?: string
  id?: number | string
  subtitle?: string
  detail_id?: number | string
  detail_ref?: DetailRef
}

export interface MediaService {
  id: string
  name: string
  label?: string
  host?: string
  url?: string
  detected_url?: string
  group?: string
  kind?: string
  default_port?: number | null
  configured: boolean
  detected?: boolean
  healthy: boolean
  state?: 'online' | 'degraded' | 'offline' | 'configured' | 'detected_missing_credentials' | 'detected_no_direct_ui' | 'detected_unpublished_port' | 'not_detected'
  status?: string
  version?: string
  diagnostic?: string
  missing_credentials?: string[]
  credential_keys?: string[]
  actions?: string[]
  detections?: MediaDetection[]
}

export interface MediaDetection {
  service: string
  name: string
  source: string
  container?: string
  image?: string
  state?: string
  status?: string
  ports?: string
  endpoint_name?: string
  host?: string
  detected_url?: string
  configured?: boolean
  missing_credentials?: string[]
  credential_keys?: string[]
  default_port?: number | null
  default_port_exposed?: boolean
  default_port_published?: boolean
}

export interface QueueItem {
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

export interface LibraryItem {
  id?: number
  service: string
  kind?: string
  detail_id?: number | string
  detail_ref?: DetailRef
  title?: string
  artistName?: string
  year?: number
  network?: string
  studio?: string
  genres?: string[]
  monitored?: boolean
  hasFile?: boolean
  statistics?: { episodeFileCount?: number; episodeCount?: number }
}

export interface WantedItem {
  id?: number
  service: string
  serviceName?: string
  kind?: string
  detail_id?: number | string
  detail_ref?: DetailRef
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

export interface HistoryItem extends WantedItem {
  date?: string
  sourceTitle?: string
  data?: { droppedPath?: string; importedPath?: string; releaseGroup?: string }
}

export interface IndexerItem {
  id?: number
  service: string
  serviceName?: string
  name?: string
  enable?: boolean
  protocol?: string
  priority?: number
  implementationName?: string
}

interface IndexerHealthItem {
  service: string
  serviceName?: string
  source?: string
  type?: string
  message?: string
  wikiUrl?: string
}

export interface RequestItem {
  id?: number
  service: string
  serviceName?: string
  status?: number
  createdAt?: string
  media?: { title?: string; mediaType?: string; status?: number; status4k?: number }
  requestedBy?: { displayName?: string; email?: string }
}

export interface StreamItem {
  service: string
  serviceName?: string
  title?: string
  full_title?: string
  user?: string
  username?: string
  friendly_name?: string
  player?: string
  product?: string
  state?: string
  transcode_decision?: string
  video_decision?: string
  audio_decision?: string
  progress?: number
  progress_percent?: number
  view_offset?: number
  duration?: number
}

export interface DownloadItem {
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
  category?: string
  tags?: string
  progress?: number
  percentage?: number
  percentDone?: number
  ratio?: number
  eta?: number
  dlspeed?: number
  upspeed?: number
  amount_left?: number
  mb?: string
  size?: number
  totalSize?: number
}

export interface SubtitleItem extends WantedItem {
  language?: string
  missing_subtitles?: string[]
  missing_subtitle_details?: Array<{
    name?: string
    code2?: string
    code3?: string
    forced?: boolean
    hi?: boolean
  }>
  radarrId?: number
  sonarrSeriesId?: number
  sonarrEpisodeId?: number
}

export interface CalendarItem {
  service: string
  serviceName?: string
  kind?: string
  detail_id?: number | string
  detail_ref?: DetailRef
  title?: string
  airDateUtc?: string
  releaseDate?: string
  inCinemas?: string
  series?: { title?: string }
  movie?: { title?: string }
  seasonNumber?: number
  episodeNumber?: number
}

export interface MediaData {
  now_playing: NowPlaying | null
  recently_added: RecentItem[]
  upcoming: UpcomingItem[]
  services?: MediaService[]
  queue?: QueueItem[]
  library?: LibraryItem[]
  browse?: LibraryItem[]
  calendar?: CalendarItem[]
  wanted?: WantedItem[]
  history?: HistoryItem[]
  indexers?: IndexerItem[]
  indexer_health?: IndexerHealthItem[]
  requests?: RequestItem[]
  streams?: StreamItem[]
  downloads?: DownloadItem[]
  subtitles?: SubtitleItem[]
  detections?: MediaDetection[]
  capabilities?: Record<string, { actions?: string[]; group?: string; kind?: string; credential_keys?: string[]; default_port?: number | null }>
  mock?: boolean
}

export interface SearchResponse {
  service: string
  results: Record<string, unknown>[]
}

export interface RequestDiscoveryProvider {
  id: string
  name: string
}

export interface RequestDiscoveryResponse extends SearchResponse {
  providers?: RequestDiscoveryProvider[]
  kind?: string
  category?: string
  provider?: string
  page?: number
  totalPages?: number
  totalResults?: number
}

export interface DetailResponse {
  service: string
  kind: string
  id: number | string
  title?: string
  subtitle?: string
  year?: number | string
  status?: string
  monitored?: boolean
  has_file?: boolean
  item: Record<string, unknown>
  queue?: QueueItem[]
  wanted?: WantedItem[]
  history?: HistoryItem[]
  actions?: string[]
}

export type MediaView = 'overview' | 'browse' | 'add' | 'downloads' | 'requests' | 'missing' | 'indexers' | 'setup' | 'library'
export type WorkflowTarget = Exclude<MediaView, 'overview'>
export type ServiceSetupFilter = 'attention' | 'online' | 'detected' | 'configured' | 'all'
export type RequestStatusFilter = 'pending' | 'all' | 'approved' | 'available' | 'partial' | 'declined'
export type SubtitleKindFilter = 'all' | 'movies' | 'episodes'
export type IndexerStateFilter = 'all' | 'enabled' | 'disabled'
export type LibraryMonitorFilter = 'all' | 'monitored' | 'unmonitored'
export type DiscoverKindFilter = 'tv' | 'movie'
export type DiscoverCategoryFilter = 'popular' | 'trending' | 'upcoming'


export function formatAirDate(dateStr: string): string {
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

export function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

export function queueTitle(item: QueueItem): string {
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

export function libraryTitle(item: LibraryItem): string {
  return item.title ?? item.artistName ?? 'Unknown'
}

export function libraryKind(item: LibraryItem): string {
  if (item.service === 'sonarr') return 'Series'
  if (item.service === 'radarr') return 'Movies'
  if (item.service === 'lidarr') return 'Music'
  if (item.service === 'readarr') return 'Books'
  if (item.service === 'mylar') return 'Comics'
  return serviceKindLabel({ id: item.service, name: item.service, configured: true, healthy: false })
}

export function libraryNetwork(item: LibraryItem): string {
  return item.network ?? item.studio ?? item.genres?.[0] ?? 'No network'
}

export function librarySearchText(item: LibraryItem): string {
  return [
    libraryTitle(item),
    libraryKind(item),
    libraryNetwork(item),
    item.year,
    item.service,
    item.genres?.join(' '),
  ].filter(Boolean).join(' ').toLowerCase()
}

export function itemDetailRef(item: { service?: string; kind?: string; id?: number | string; detail_id?: number | string; detail_ref?: DetailRef } | null | undefined): DetailRef | null {
  if (!item) return null
  if (item.detail_ref?.service && item.detail_ref.kind && item.detail_ref.id !== undefined) return item.detail_ref
  const id = item.detail_id ?? item.id
  if (!item.service || !id) return null
  return { service: item.service, kind: item.kind ?? 'item', id }
}

export function wantedTitle(item: WantedItem): string {
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

export function historyTitle(item: HistoryItem): string {
  return item.sourceTitle ?? wantedTitle(item)
}

export function indexerTitle(item: IndexerItem): string {
  return item.name ?? item.implementationName ?? 'Indexer'
}

export function requestTitle(item: RequestItem): string {
  return item.media?.title ?? `Request #${item.id ?? '--'}`
}

export function streamTitle(item: StreamItem): string {
  return item.full_title ?? item.title ?? 'Stream'
}

export function streamPlayer(item: StreamItem): string {
  return item.player ?? item.friendly_name ?? item.product ?? item.state ?? 'playing'
}

export function streamDecision(item: StreamItem): string {
  return item.transcode_decision ?? item.video_decision ?? item.audio_decision ?? 'direct/unknown'
}

export function downloadTitle(item: DownloadItem): string {
  return item.name ?? item.filename ?? 'Download'
}

export function requestStatus(item: RequestItem): string {
  const status = item.status ?? item.media?.status
  if (status === 1) return 'pending'
  if (status === 2) return 'approved'
  if (status === 3) return 'declined'
  if (status === 4) return 'available'
  if (status === 5) return 'partial'
  return `status ${status ?? '--'}`
}

export function requestIsPending(item: RequestItem): boolean {
  return (item.status ?? item.media?.status) === 1
}

export function downloadId(item: DownloadItem): string | null {
  const id = item.hash ?? item.nzo_id ?? item.id ?? item.NZBID ?? item.ID
  return id === undefined || id === null ? null : String(id)
}

export function downloadProgress(item: DownloadItem): string {
  const raw = item.progress ?? item.percentage ?? item.percentDone
  if (raw === undefined) return '--'
  const percent = raw <= 1 ? raw * 100 : raw
  return `${Math.round(percent)}%`
}

export function downloadMeta(item: DownloadItem): string {
  const speeds = [
    typeof item.dlspeed === 'number' && item.dlspeed > 0 ? `${formatBytes(item.dlspeed)}/s down` : null,
    typeof item.upspeed === 'number' && item.upspeed > 0 ? `${formatBytes(item.upspeed)}/s up` : null,
  ].filter(Boolean)
  const tags = [item.category, item.tags].filter(value => value && String(value).trim()).join(' · ')
  return [downloadProgress(item), tags, ...speeds].filter(Boolean).join(' · ')
}

export function compactCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function safeList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export function safeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

export function subtitleLabel(item: SubtitleItem): string {
  const missing = safeStringList((item as { missing_subtitles?: unknown }).missing_subtitles)
  return item.language ?? (missing.join(', ') || 'missing subtitles')
}

export function subtitleKind(item: SubtitleItem): 'movies' | 'episodes' {
  return item.radarrId ? 'movies' : 'episodes'
}

export function subtitleLanguage(item: SubtitleItem): string {
  const language = subtitleLabel(item)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .join(', ')
  return language || 'Unknown'
}

export function clampPercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function calendarTitle(item: CalendarItem): string {
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

export function resultTitle(item: Record<string, unknown>): string {
  return String(item.title ?? item.artistName ?? item.name ?? 'Unknown')
}

export function releaseMeta(item: Record<string, unknown>): string {
  const parts = [
    item.indexer,
    item.protocol,
    typeof item.size === 'number' ? formatBytes(item.size) : null,
    typeof item.seeders === 'number' ? `${item.seeders} seeders` : null,
    item.publishDate ? formatAirDate(String(item.publishDate)) : null,
  ].filter(Boolean)
  return parts.join(' · ') || 'release'
}

export function requestSeasonNumbers(item: Record<string, unknown>): number[] {
  const rawSeasons = item.seasons ?? (item.mediaInfo as { seasons?: unknown } | undefined)?.seasons
  if (!Array.isArray(rawSeasons)) return [1]
  const numbers = rawSeasons
    .map(season => {
      if (typeof season === 'number') return season
      if (season && typeof season === 'object' && 'seasonNumber' in season) {
        return Number((season as { seasonNumber?: unknown }).seasonNumber)
      }
      return Number.NaN
    })
    .filter(number => Number.isFinite(number) && number > 0)
  return Array.from(new Set(numbers)).sort((a, b) => a - b)
}

export function requestResultKey(item: Record<string, unknown>): string {
  return String(item.id ?? `${resultTitle(item)}-${item.mediaType ?? item.media_type ?? 'media'}`)
}

export function parseSeasonSelection(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map(part => Number(part.trim()))
        .filter(number => Number.isInteger(number) && number > 0),
    ),
  ).sort((a, b) => a - b)
}


export function serviceKindLabel(service: MediaService): string {
  if (service.id === 'plex') return 'Streaming'
  if (service.id === 'prowlarr') return 'Indexers'
  if (service.id === 'lidarr') return 'Music'
  if (service.id === 'sonarr') return 'Series'
  if (service.id === 'radarr') return 'Movies'
  if (['readarr', 'mylar'].includes(service.id)) return 'Books'
  if (service.id === 'whisparr') return 'ARR'
  if (['jellyfin', 'emby'].includes(service.id)) return 'Streaming'
  if (['overseerr', 'jellyseerr'].includes(service.id)) return 'Requests'
  if (['tautulli', 'jellystat'].includes(service.id)) return 'Analytics'
  if (service.id === 'bazarr') return 'Subtitles'
  if (['qbittorrent', 'sabnzbd', 'nzbget', 'transmission', 'deluge'].includes(service.id)) return 'Downloads'
  if (['unraid', 'portainer'].includes(service.id)) return 'Server'
  if (service.id === 'wizarr') return 'Invites'
  if (['grafana', 'prometheus', 'loki'].includes(service.id)) return 'Monitoring'
  if (service.id === 'alloy') return 'Monitoring'
  if (service.id === 'cloudflared') return 'Network'
  if (service.id === 'crowdsec') return 'Security'
  if (service.id === 'pelican') return 'Server'
  if (service.id === 'vaultwarden') return 'Secrets'
  if (['autobrr', 'recyclarr'].includes(service.id)) return 'Automation'
  if (service.id === 'kometa') return 'Metadata'
  if (service.id === 'flaresolverr') return 'Indexer Proxy'
  if (['ssh', 'sftp'].includes(service.id)) return 'Remote'
  return service.kind ?? 'Service'
}

export function serviceStateLabel(service: MediaService): string {
  if (service.healthy || service.state === 'online') return 'online'
  if (service.state === 'degraded') return 'degraded'
  if (service.state === 'offline') return 'offline'
  if (service.configured && service.detected && (service.detected_url ?? service.url)) return 'ready'
  if (service.state === 'configured' || service.configured) return 'configured'
  if (service.state === 'detected_no_direct_ui') return 'no direct UI'
  if (service.state === 'detected_unpublished_port') return 'unpublished port'
  if (service.state === 'detected_missing_credentials' || service.detected) return 'missing credentials'
  return 'setup'
}

export function serviceStateColor(service: MediaService, accent: string): string {
  if (service.healthy || service.state === 'online') return accent
  if (service.configured && service.detected && (service.detected_url ?? service.url)) return accent
  if (service.state === 'degraded') return '#ffb657'
  if (service.state === 'detected_no_direct_ui') return '#93c5fd'
  if (service.state === 'detected_unpublished_port') return '#ffb657'
  if (service.state === 'detected_missing_credentials' || service.detected) return '#ffb657'
  if (service.state === 'offline') return 'var(--red)'
  return 'var(--text-muted)'
}

export function serviceNeedsAttention(service: MediaService): boolean {
  if (service.state === 'detected_no_direct_ui') return false
  return service.state === 'degraded'
    || service.state === 'offline'
    || service.state === 'detected_missing_credentials'
    || service.state === 'detected_unpublished_port'
    || (service.detected === true && service.configured === false)
}

export function serviceAttentionRank(service: MediaService): number {
  if (service.state === 'offline') return 0
  if (service.state === 'degraded') return 1
  if (service.state === 'detected_unpublished_port') return 2
  if (service.state === 'detected_missing_credentials' || (service.detected && !service.configured)) return 2
  if (service.state === 'detected_no_direct_ui') return 5
  if (service.healthy || service.state === 'online') return 4
  return 3
}

export function serviceIssueText(service: MediaService): string {
  if (service.diagnostic) return service.diagnostic
  const detectedAt = service.detected_url ?? service.url ?? service.host
  if (service.state === 'offline') return `Configured but unreachable${detectedAt ? ` at ${detectedAt.replace(/^https?:\/\//, '')}` : ''}`
  if (service.state === 'degraded') return `Container detected, health check failed${detectedAt ? ` at ${detectedAt.replace(/^https?:\/\//, '')}` : ''}`
  if (service.state === 'detected_no_direct_ui') return 'Detected daemon; no direct control UI is published'
  if (service.state === 'detected_unpublished_port') return service.diagnostic ?? 'Detected, but the control port is not published'
  if (service.state === 'detected_missing_credentials' || (service.detected && !service.configured)) {
    const missing = (service.missing_credentials ?? service.credential_keys ?? []).slice(0, 2).join(', ')
    return missing ? `Detected, missing ${missing}` : 'Detected, needs setup'
  }
  return serviceStateLabel(service)
}

export function serviceSettingsUrl(service: MediaService): string {
  const params = new URLSearchParams({ section: 'connections', service: service.id })
  const setupKeys = service.credential_keys?.length
    ? service.credential_keys
    : service.missing_credentials ?? []
  if (setupKeys.length) {
    params.set('keys', setupKeys.join(','))
  }
  return `/settings?${params.toString()}`
}

export function serviceGroupLabel(service: MediaService): string {
  const group = service.group?.trim().toLowerCase()
  if (group) {
    if (['arr', 'music'].includes(group)) return 'Core ARR'
    if (group === 'downloads') return 'Downloads'
    if (['requests', 'invites'].includes(group)) return 'Requests'
    if (group === 'indexers') return 'Indexers'
    if (group === 'subtitles') return 'Subtitles'
    if (['streaming', 'analytics'].includes(group)) return 'Streaming'
    if (group === 'automation') return 'Automation'
    if (['monitoring', 'network', 'security', 'server', 'remote', 'secrets'].includes(group)) return 'Homelab'
    return group.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
  }
  const kind = serviceKindLabel(service)
  if (['Movies', 'Series', 'Music', 'Books', 'ARR'].includes(kind)) return 'Core ARR'
  if (['Downloads'].includes(kind)) return 'Downloads'
  if (['Requests', 'Invites'].includes(kind)) return 'Requests'
  if (['Indexers', 'Indexer Proxy'].includes(kind)) return 'Indexers'
  if (kind === 'Subtitles') return 'Subtitles'
  if (['Streaming', 'Analytics'].includes(kind)) return 'Streaming'
  if (['Network', 'Security', 'Server', 'Remote', 'Secrets'].includes(kind)) return 'Homelab'
  if (kind === 'Monitoring') return 'Homelab'
  if (['Automation', 'Metadata'].includes(kind)) return 'Automation'
  return 'Other'
}

export function serviceGroupRank(label: string): number {
  const order = ['Core ARR', 'Requests', 'Downloads', 'Indexers', 'Subtitles', 'Streaming', 'Automation', 'Homelab', 'Other']
  const index = order.indexOf(label)
  return index === -1 ? order.length : index
}

export const FALLBACK_MEDIA_SERVICES: MediaService[] = [
  { id: 'plex', name: 'Plex', kind: 'streaming', configured: false, healthy: false },
  { id: 'jellyfin', name: 'Jellyfin', kind: 'streaming', configured: false, healthy: false },
  { id: 'emby', name: 'Emby', kind: 'streaming', configured: false, healthy: false },
  { id: 'sonarr', name: 'Sonarr', kind: 'series', configured: false, healthy: false },
  { id: 'radarr', name: 'Radarr', kind: 'movie', configured: false, healthy: false },
  { id: 'lidarr', name: 'Lidarr', kind: 'music', configured: false, healthy: false },
  { id: 'readarr', name: 'Readarr', kind: 'books', configured: false, healthy: false },
  { id: 'whisparr', name: 'Whisparr', kind: 'adult', configured: false, healthy: false },
  { id: 'mylar', name: 'Mylar', kind: 'comics', configured: false, healthy: false },
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
  { id: 'autobrr', name: 'autobrr', kind: 'automation', configured: false, healthy: false },
  { id: 'recyclarr', name: 'Recyclarr', kind: 'automation', configured: false, healthy: false },
  { id: 'kometa', name: 'Kometa', kind: 'metadata', configured: false, healthy: false },
  { id: 'flaresolverr', name: 'FlareSolverr', kind: 'proxy', configured: false, healthy: false },
  { id: 'ssh', name: 'SSH', kind: 'remote', configured: false, healthy: false },
  { id: 'sftp', name: 'SFTP', kind: 'remote', configured: false, healthy: false },
  { id: 'portainer', name: 'Portainer', kind: 'control', configured: false, healthy: false },
  { id: 'grafana', name: 'Grafana', kind: 'dashboard', configured: false, healthy: false },
  { id: 'prometheus', name: 'Prometheus', kind: 'metrics', configured: false, healthy: false },
  { id: 'loki', name: 'Loki', kind: 'logs', configured: false, healthy: false },
  { id: 'alloy', name: 'Grafana Alloy', kind: 'agent', configured: false, healthy: false },
  { id: 'cloudflared', name: 'Cloudflared', kind: 'tunnel', configured: false, healthy: false },
  { id: 'crowdsec', name: 'CrowdSec', kind: 'security', configured: false, healthy: false },
  { id: 'pelican', name: 'Pelican', kind: 'panel', configured: false, healthy: false },
  { id: 'vaultwarden', name: 'Vaultwarden', kind: 'passwords', configured: false, healthy: false },
]

