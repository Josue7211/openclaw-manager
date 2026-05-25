import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  Calendar,
  CheckCircle,
  DownloadSimple,
  FilmStrip,
  Gear,
  House,
  MagnifyingGlass,
  MusicNotes,
  Play,
  Plus,
  Pulse,
  Terminal,
  Trash,
  Television,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { PageHeader } from '@/components/PageHeader'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { useMediaCommandData } from '@/features/media-radar/hooks'
import {
  FALLBACK_MEDIA_SERVICES,
  calendarDateParts,
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
  mediaImageUrl,
  mediaMeta,
  mediaOverview,
  mediaPresentation,
  mediaRating,
  mediaYear,
  parseSeasonSelection,
  queueTitle,
  releaseMeta,
  requestIsPending,
  requestMediaType,
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
  calendar: <Calendar size={14} />,
}

const MEDIA_VIEWS = new Set<MediaView>([
  'overview',
  'browse',
  'add',
  'downloads',
  'requests',
  'missing',
  'indexers',
  'setup',
  'library',
  'calendar',
])

const mediaSolidPanelBackground = 'linear-gradient(var(--bg-card-solid, #18181f), var(--bg-card-solid, #18181f)), var(--bg-base, #0a0a0c)'
const mediaSolidElevatedBackground = 'linear-gradient(color-mix(in srgb, var(--bg-card-solid, #18181f) 88%, var(--text-primary, #ffffff) 12%), color-mix(in srgb, var(--bg-card-solid, #18181f) 88%, var(--text-primary, #ffffff) 12%)), var(--bg-base, #0a0a0c)'
const mediaActiveBackground = 'linear-gradient(var(--accent, #a78bfa), var(--accent, #a78bfa)), var(--bg-base, #0a0a0c)'
const mediaWarningBackground = 'linear-gradient(color-mix(in srgb, var(--warning, #ffb657) 16%, var(--bg-card-solid, #18181f)), color-mix(in srgb, var(--warning, #ffb657) 16%, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)'

function initialMediaView(): MediaView {
  if (typeof window === 'undefined') return 'overview'
  const view = new URLSearchParams(window.location.search).get('view') as MediaView | null
  return view && MEDIA_VIEWS.has(view) ? view : 'overview'
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
  background: mediaSolidPanelBackground,
  border: '1px solid var(--border)',
  borderRadius: '8px',
}

const shellPanel: React.CSSProperties = {
  background: mediaSolidPanelBackground,
  border: '1px solid var(--border)',
  borderRadius: '8px',
  boxShadow: 'none',
}

const glassButton: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: mediaSolidElevatedBackground,
  color: 'var(--text-secondary)',
  borderRadius: '8px',
  cursor: 'pointer',
}

const solidMediaPanel: React.CSSProperties = {
  background: mediaSolidElevatedBackground,
  border: '1px solid var(--border)',
}

type MediaImageStatus = 'loaded' | 'failed'
type MediaImageStatusRecord = { status: MediaImageStatus; at: number }

const MEDIA_IMAGE_FAILURE_RETRY_MS = 60_000
const mediaImageStatusCache = new Map<string, MediaImageStatusRecord>()

function getMediaImageStatus(url: string | null | undefined): MediaImageStatus | undefined {
  if (!url) return undefined
  const record = mediaImageStatusCache.get(url)
  if (!record) return undefined
  if (record.status === 'failed' && Date.now() - record.at > MEDIA_IMAGE_FAILURE_RETRY_MS) {
    mediaImageStatusCache.delete(url)
    return undefined
  }
  return record.status
}

function setMediaImageStatus(url: string, status: MediaImageStatus) {
  mediaImageStatusCache.set(url, { status, at: Date.now() })
}

const mediaCardRenderHint: React.CSSProperties = {
  contain: 'layout paint style',
  contentVisibility: 'auto',
  containIntrinsicSize: '260px',
  backfaceVisibility: 'hidden',
}

function serviceTone(service: string): { accent: string; bg: string } {
  const panelBackground = 'var(--bg-panel)'
  const tones: Record<string, { accent: string; bg: string }> = {
    plex: { accent: '#e5a93b', bg: panelBackground },
    sonarr: { accent: '#4f9cff', bg: panelBackground },
    radarr: { accent: '#ffb657', bg: panelBackground },
    lidarr: { accent: '#9c7cff', bg: panelBackground },
    prowlarr: { accent: '#68e0b4', bg: panelBackground },
    bazarr: { accent: '#7dd3fc', bg: panelBackground },
    overseerr: { accent: '#9ee37d', bg: panelBackground },
    jellyseerr: { accent: '#f472b6', bg: panelBackground },
    tautulli: { accent: '#facc15', bg: panelBackground },
    jellystat: { accent: '#38bdf8', bg: panelBackground },
    qbittorrent: { accent: '#5eead4', bg: panelBackground },
    sabnzbd: { accent: '#fb7185', bg: panelBackground },
    nzbget: { accent: '#c084fc', bg: panelBackground },
    transmission: { accent: '#f97316', bg: panelBackground },
    deluge: { accent: '#60a5fa', bg: panelBackground },
    unraid: { accent: '#f43f5e', bg: panelBackground },
    portainer: { accent: '#38bdf8', bg: panelBackground },
    grafana: { accent: '#f97316', bg: panelBackground },
    prometheus: { accent: '#ef4444', bg: panelBackground },
    loki: { accent: '#a3e635', bg: panelBackground },
    alloy: { accent: '#f59e0b', bg: panelBackground },
    cloudflared: { accent: '#f97316', bg: panelBackground },
    crowdsec: { accent: '#ef4444', bg: panelBackground },
    pelican: { accent: '#38bdf8', bg: panelBackground },
    vaultwarden: { accent: '#60a5fa', bg: panelBackground },
    wizarr: { accent: '#a3e635', bg: panelBackground },
    jellyfin: { accent: '#a855f7', bg: panelBackground },
    emby: { accent: '#22c55e', bg: panelBackground },
    readarr: { accent: '#f59e0b', bg: panelBackground },
    whisparr: { accent: '#ec4899', bg: panelBackground },
    mylar: { accent: '#06b6d4', bg: panelBackground },
    autobrr: { accent: '#84cc16', bg: panelBackground },
    recyclarr: { accent: '#14b8a6', bg: panelBackground },
    kometa: { accent: '#e879f9', bg: panelBackground },
    flaresolverr: { accent: '#fb923c', bg: panelBackground },
    ssh: { accent: '#94a3b8', bg: panelBackground },
    sftp: { accent: '#93c5fd', bg: panelBackground },
  }
  return tones[service] ?? { accent: 'var(--accent)', bg: panelBackground }
}

function miniButton(color = 'var(--text-secondary)'): React.CSSProperties {
  return {
    border: '1px solid var(--border)',
    background: mediaSolidElevatedBackground,
    color,
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
  }
}

const MEDIA_WARNING_IGNORE_STORAGE_KEY = 'media-command-ignored-warnings:v1'

function serviceWarningKey(service: MediaService): string {
  return [
    service.id,
    service.state ?? serviceStateLabel(service),
    service.default_port ?? '',
    service.detected_url ?? service.url ?? service.host ?? '',
    service.diagnostic ?? '',
    (service.missing_credentials ?? service.credential_keys ?? []).join(','),
  ].join('|')
}

function loadIgnoredWarnings(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const value = window.localStorage.getItem(MEDIA_WARNING_IGNORE_STORAGE_KEY)
    const parsed = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function storeIgnoredWarnings(keys: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MEDIA_WARNING_IGNORE_STORAGE_KEY, JSON.stringify(Array.from(new Set(keys))))
}

function MediaPoster({
  item,
  mode = 'poster',
  icon,
  service = 'media',
  priority = false,
}: {
  item: Record<string, unknown>
  mode?: 'poster' | 'backdrop'
  icon?: React.ReactNode
  service?: string
  priority?: boolean
}) {
  const presentation = mediaPresentation(item, service)
  const image = mode === 'backdrop' ? (presentation.backdropUrl || presentation.bannerUrl || presentation.posterUrl) : (presentation.posterUrl || presentation.backdropUrl)
  const logo = presentation.logoUrl
  const [failedImage, setFailedImage] = useState<string | null>(() => getMediaImageStatus(image) === 'failed' ? image : null)
  const [failedLogo, setFailedLogo] = useState<string | null>(() => getMediaImageStatus(logo) === 'failed' ? logo : null)
  const [loadedImage, setLoadedImage] = useState<string | null>(() => getMediaImageStatus(image) === 'loaded' ? image : null)
  const ratio = mode === 'backdrop' ? '16 / 9' : '2 / 3'
  const tone = serviceTone(String(item.service ?? service)).accent
  const fallbackMeta = [presentation.kind, presentation.year].filter(Boolean).join(' · ') || service
  const showImage = Boolean(image && failedImage !== image)
  const imageLoaded = Boolean(image && loadedImage === image)
  const showLogo = Boolean(logo && failedLogo !== logo)

  useEffect(() => {
    setFailedImage(getMediaImageStatus(image) === 'failed' ? image : null)
    setLoadedImage(getMediaImageStatus(image) === 'loaded' ? image : null)
  }, [image])

  useEffect(() => {
    setFailedLogo(getMediaImageStatus(logo) === 'failed' ? logo : null)
  }, [logo])

  const fallbackContent = (
    <div style={{ width: '100%', height: '100%', display: 'grid', alignContent: 'space-between', justifyItems: 'stretch', gap: '10px', padding: '13px', color: 'var(--text-muted)', background: mediaSolidElevatedBackground }}>
      <div style={{ width: mode === 'backdrop' ? '42px' : '46px', height: mode === 'backdrop' ? '42px' : '46px', borderRadius: '8px', display: 'grid', placeItems: 'center', color: tone, background: 'var(--bg-base)', border: `1px solid ${tone}55` }}>
        {icon ?? <FilmStrip size={24} />}
      </div>
      <div style={{ display: 'grid', gap: '5px', minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: mode === 'backdrop' ? '11px' : '12px', lineHeight: 1.2, fontWeight: 900, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: mode === 'backdrop' ? 1 : 2, WebkitBoxOrient: 'vertical' }}>
          {presentation.displayTitle}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '10px', lineHeight: 1.25, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fallbackMeta}
        </div>
        <div style={{ color: tone, fontSize: '9px', lineHeight: 1.2, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {presentation.fallbackLabel}
        </div>
      </div>
    </div>
  )
  const pendingContent = (
    <div aria-hidden="true" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: mediaSolidElevatedBackground, color: tone }}>
      <div style={{ width: mode === 'backdrop' ? '42px' : '46px', height: mode === 'backdrop' ? '42px' : '46px', borderRadius: '8px', display: 'grid', placeItems: 'center', background: 'var(--bg-base)', border: `1px solid ${tone}55`, opacity: 0.9 }}>
        {icon ?? <FilmStrip size={24} />}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative', aspectRatio: ratio, minHeight: mode === 'backdrop' ? '86px' : '132px', borderRadius: '8px', overflow: 'hidden', background: mediaSolidPanelBackground, border: '1px solid var(--border)', contain: 'layout paint', containIntrinsicSize: mode === 'backdrop' ? '190px 108px' : '150px 225px' }}>
      {showImage ? (
        <>
          {!imageLoaded && <div style={{ position: 'absolute', inset: 0 }}>{pendingContent}</div>}
          <img
            src={image}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => {
              setMediaImageStatus(image, 'loaded')
              setLoadedImage(image)
              setFailedImage(null)
            }}
            onError={() => {
              if (loadedImage !== image && getMediaImageStatus(image) !== 'loaded') {
                setMediaImageStatus(image, 'failed')
                setFailedImage(image)
              }
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: imageLoaded ? 1 : 0, transition: priority ? 'opacity 120ms ease' : 'none' }}
          />
        </>
      ) : (
        fallbackContent
      )}
      {showImage && showLogo && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: mode === 'backdrop' ? '34%' : '26%', background: 'color-mix(in srgb, var(--bg-base) 68%, transparent)', pointerEvents: 'none' }} />}
      {showLogo && (
        <img
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => {
            setMediaImageStatus(logo, 'loaded')
            setFailedLogo(null)
          }}
          onError={() => {
            if (getMediaImageStatus(logo) !== 'loaded') {
              setMediaImageStatus(logo, 'failed')
              setFailedLogo(logo)
            }
          }}
          style={{ position: 'absolute', left: '9px', right: '9px', bottom: '9px', maxWidth: '58%', maxHeight: mode === 'backdrop' ? '30px' : '36px', objectFit: 'contain', filter: 'drop-shadow(0 4px 10px color-mix(in srgb, var(--bg-base) 70%, transparent))' }}
        />
      )}
    </div>
  )
}

function MediaShelfCard({
  item,
  title,
  meta,
  status,
  tone = '#9ee37d',
  service = 'media',
  onOpen,
  action,
}: {
  item: Record<string, unknown>
  title: string
  meta: string
  status?: string
  tone?: string
  service?: string
  onOpen?: () => void
  action?: React.ReactNode
}) {
  const presentation = mediaPresentation(item, service)
  const overview = presentation.overview
  const rating = mediaRating(item)
  const displayedTitle = title || presentation.displayTitle
  const displayedMeta = meta || presentation.meta || service
  const content = (
    <>
      <div style={{ position: 'relative' }}>
        <MediaPoster item={item} icon={serviceIcon(service)} service={service} />
        <div style={{ position: 'absolute', left: '8px', top: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {status && (
            <span style={{ color: tone, background: 'var(--bg-panel)', border: `1px solid ${tone}66`, borderRadius: '999px', padding: '4px 7px', fontSize: '10px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {status}
            </span>
          )}
          {rating && (
            <span style={{ color: '#ffd166', background: 'var(--bg-panel)', border: '1px solid rgba(255,209,102,0.44)', borderRadius: '999px', padding: '4px 7px', fontSize: '10px', fontWeight: 950 }}>
              {rating}
            </span>
          )}
        </div>
      </div>
      <div style={{ ...solidMediaPanel, borderTop: '1px solid rgba(255,255,255,0.12)', borderLeft: 0, borderRight: 0, borderBottom: 0, padding: '10px', minHeight: '118px', display: 'grid', gap: '7px', alignContent: 'start' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 950, lineHeight: 1.22, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{displayedTitle}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayedMeta}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.35, minHeight: '30px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{overview || (presentation.metadataStatus === 'missing' ? 'Metadata missing from payload.' : 'Metadata still partial.')}</div>
        {action}
      </div>
    </>
  )
  const style: React.CSSProperties = {
    padding: 0,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    overflow: 'hidden',
    background: 'var(--bg-panel)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    minWidth: 0,
    boxShadow: 'var(--shadow-sm, 0 8px 20px rgba(0,0,0,0.16))',
    ...mediaCardRenderHint,
  }
  if (onOpen) {
    return <button onClick={onOpen} style={{ ...style, cursor: 'pointer' }}>{content}</button>
  }
  return <div style={style}>{content}</div>
}

function MediaShelf({
  title,
  subtitle,
  badge,
  items,
  empty,
}: {
  title: string
  subtitle: string
  badge?: string
  items: React.ReactNode[]
  empty?: React.ReactNode
}) {
  return (
    <section style={{ display: 'grid', gap: '10px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '18px', lineHeight: 1.15, fontWeight: 950 }}>{title}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>{subtitle}</div>
        </div>
        {badge && (
          <span style={{ flex: '0 0 auto', color: '#9ee37d', background: 'rgba(158,227,125,0.12)', border: '1px solid rgba(158,227,125,0.34)', borderRadius: '999px', padding: '5px 8px', fontSize: '11px', fontWeight: 900 }}>
            {badge}
          </span>
        )}
      </div>
      {items.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
          {items}
        </div>
      ) : empty ?? (
        <div style={{ ...solidMediaPanel, borderRadius: '8px', padding: '14px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Nothing in this shelf.
        </div>
      )}
    </section>
  )
}

function MediaResultCard({
  item,
  action,
  service,
  children,
}: {
  item: Record<string, unknown>
  action?: React.ReactNode
  service?: string
  children?: React.ReactNode
}) {
  const presentation = mediaPresentation(item, service ?? 'media')
  const title = presentation.displayTitle
  const overview = presentation.overview
  const rating = mediaRating(item)
  const meta = presentation.meta
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr)', gap: '10px', minHeight: '146px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-panel)' }}>
      <MediaPoster item={item} icon={service ? serviceIcon(service) : undefined} service={service ?? 'media'} />
      <div style={{ minWidth: 0, display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr) auto', gap: '6px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 900, lineHeight: 1.25, color: 'var(--text-primary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta || service}
          </div>
        </div>
        {rating && (
          <div style={{ justifySelf: 'start', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--accent)', borderRadius: '999px', padding: '3px 7px', fontSize: '10px', fontWeight: 900 }}>
            {rating}
          </div>
        )}
        <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.42, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {overview || (presentation.metadataStatus === 'missing' ? 'Metadata missing from payload.' : 'Metadata still partial.')}
        </div>
        {children}
        {action && <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>{action}</div>}
      </div>
    </div>
  )
}

function nestedStatus(item: Record<string, unknown>): number | null {
  for (const key of ['mediaInfo', 'media']) {
    const nested = item[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const status = (nested as Record<string, unknown>).status
      if (typeof status === 'number') return status
    }
  }
  const status = item.status
  return typeof status === 'number' ? status : null
}

function requestAvailability(item: Record<string, unknown>) {
  const status = nestedStatus(item)
  if (status === 4 || status === 5) return { label: 'In library', tone: '#71e087' }
  if (status === 2) return { label: 'Requested', tone: '#93c5fd' }
  if (status === 1) return { label: 'Pending', tone: '#ffb657' }
  if (status === 3) return { label: 'Declined', tone: 'var(--red)' }
  return { label: 'Requestable', tone: '#9ee37d' }
}

function RequestPosterTile({
  item,
  service,
  fallbackType,
  selectedSeasons,
  onToggleSeason,
  onSeasonInputChange,
  onRequest,
  busy,
  compact = false,
}: {
  item: Record<string, unknown>
  service: string
  fallbackType: string
  selectedSeasons: number[]
  onToggleSeason: (season: number) => void
  onSeasonInputChange: (value: string) => void
  onRequest: () => void
  busy: boolean
  compact?: boolean
}) {
  const mediaType = requestMediaType(item, fallbackType)
  const presentation = mediaPresentation(item, mediaType)
  const title = presentation.displayTitle
  const overview = presentation.overview
  const rating = mediaRating(item)
  const seasons = requestSeasonNumbers(item, mediaType)
  const availability = requestAvailability(item)
  const meta = presentation.meta
  const effectiveSelectedSeasons = selectedSeasons.length > 0 ? selectedSeasons : seasons

  return (
    <article style={{ border: `1px solid ${availability.tone}44`, borderRadius: compact ? '18px' : '8px', background: 'var(--bg-panel)', overflow: 'hidden', minWidth: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', boxShadow: 'var(--shadow-sm, 0 8px 20px rgba(0,0,0,0.16))' }}>
      <div style={{ position: 'relative' }}>
        <MediaPoster item={item} icon={serviceIcon(service)} service={service} />
        <div style={{ position: 'absolute', left: '8px', top: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ color: availability.tone, background: 'var(--bg-panel)', border: `1px solid ${availability.tone}66`, borderRadius: '999px', padding: '4px 7px', fontSize: '10px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {availability.label}
          </span>
          {rating && (
            <span style={{ color: '#ffd166', background: 'var(--bg-panel)', border: '1px solid rgba(255,209,102,0.42)', borderRadius: '999px', padding: '4px 7px', fontSize: '10px', fontWeight: 950 }}>
              {rating}
            </span>
          )}
        </div>
      </div>
      <div style={{ ...solidMediaPanel, borderLeft: 0, borderRight: 0, borderBottom: 0, padding: compact ? '12px' : '10px', display: 'grid', gap: '8px', minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: compact ? '15px' : '14px', lineHeight: 1.2, fontWeight: 950, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {title}
          </div>
          <div style={{ marginTop: '5px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta || mediaType}
          </div>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.42, minHeight: '46px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {overview || (presentation.metadataStatus === 'missing' ? 'Metadata missing from request payload.' : 'Synopsis still partial.')}
        </div>
        {mediaType === 'tv' && seasons.length > 0 && (
          <div style={{ display: 'grid', gap: '6px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Seasons
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {seasons.map(season => {
                const selected = effectiveSelectedSeasons.includes(season)
                return (
                  <button
                    key={season}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onToggleSeason(season)}
                    style={{
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'rgba(158,227,125,0.14)' : 'rgba(255,255,255,0.035)',
                      color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                      borderRadius: '7px',
                      minWidth: '34px',
                      height: '28px',
                      fontSize: '12px',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    S{season}
                  </button>
                )
              })}
            </div>
            <input
              aria-label={`Season numbers for ${title}`}
              value={effectiveSelectedSeasons.join(', ')}
              onChange={event => onSeasonInputChange(event.target.value)}
              style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 8px', fontSize: '12px', fontWeight: 750 }}
            />
          </div>
        )}
        <button onClick={onRequest} disabled={busy} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', minHeight: '36px', border: `1px solid ${availability.tone}77`, background: `${availability.tone}1f`, color: availability.tone, borderRadius: '8px', fontSize: '12px', fontWeight: 950, cursor: busy ? 'wait' : 'pointer' }}>
          <Plus size={14} />
          Request
        </button>
      </div>
    </article>
  )
}

function LibraryPosterCard({
  item,
  onOpen,
  selected = false,
}: {
  item: LibraryItem
  onOpen: () => void
  selected?: boolean
}) {
  const record = item as unknown as Record<string, unknown>
  const presentation = mediaPresentation(record, item.kind ?? item.service)
  const title = presentation.displayTitle || libraryTitle(item)
  const meta = presentation.meta || [libraryKind(item), libraryNetwork(item), mediaYear(record) || item.year].filter(Boolean).join(' · ')
  return (
    <button
      key={`${item.service}-${item.id}-${title}`}
      onClick={onOpen}
      aria-pressed={selected}
      style={{
        padding: 0,
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '8px',
        background: selected
          ? 'linear-gradient(color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f)), color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)'
          : mediaSolidElevatedBackground,
        color: 'var(--text-primary)',
        textAlign: 'left',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent)' : 'none',
        ...mediaCardRenderHint,
      }}
    >
      <MediaPoster item={record} mode="backdrop" icon={serviceIcon(item.service)} service={item.service} />
      <div style={{ padding: '9px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 900, lineHeight: 1.3, minWidth: 0 }}>
          {serviceIcon(item.service)}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta}
        </div>
      </div>
    </button>
  )
}

function MobileEmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '250px', border: '1px solid var(--border)', borderRadius: '18px', background: 'var(--bg-panel)', display: 'grid', placeItems: 'center', padding: '28px', textAlign: 'center', boxShadow: 'var(--shadow-sm, 0 8px 20px rgba(0,0,0,0.16))' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: '12px', maxWidth: '320px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '22px', display: 'grid', placeItems: 'center', color: '#a78bfa', background: 'rgba(167,139,250,0.14)', border: '1px solid rgba(167,139,250,0.22)' }}>
          {icon}
        </div>
        <div style={{ fontSize: '22px', fontWeight: 950, lineHeight: 1.15 }}>{title}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '16px', lineHeight: 1.35 }}>{body}</div>
        {action && <div style={{ marginTop: '6px' }}>{action}</div>}
      </div>
    </div>
  )
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
  const border = serviceNeedsAttention(service) ? stateColor : 'var(--border)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr) auto', gap: '8px', alignItems: 'center', padding: '8px', borderRadius: '8px', background: service.configured ? 'var(--bg-elevated)' : 'var(--bg-panel)', border: `1px solid ${border}` }}>
      <span style={{ width: '26px', height: '26px', borderRadius: '7px', display: 'grid', placeItems: 'center', color: tone.accent, background: 'var(--bg-base)' }}>{serviceIcon(service.id)}</span>
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
  const [activeView, setActiveView] = useState<MediaView>(initialMediaView)
  const { data, isLoading: loading, refetch, isFetching } = useMediaCommandData(activeView, demo)
  const [searchService, setSearchService] = useState('radarr')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Record<string, unknown>[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [browseSource, setBrowseSource] = useState('all')
  const [browseKind, setBrowseKind] = useState('all')
  const [browseNetwork, setBrowseNetwork] = useState('all')
  const [browseQuery, setBrowseQuery] = useState('')
  const deferredBrowseQuery = useDeferredValue(browseQuery)
  const [browseVisibleCount, setBrowseVisibleCount] = useState(24)
  const [serviceSetupFilter, setServiceSetupFilter] = useState<ServiceSetupFilter>('attention')
  const [selectedDetail, setSelectedDetail] = useState<DetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [compactLayout, setCompactLayout] = useState(false)
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
  const [ignoredWarnings, setIgnoredWarnings] = useState<string[]>(loadIgnoredWarnings)
  const [showIgnoredWarnings, setShowIgnoredWarnings] = useState(false)
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

  const serviceMetricRows = (service: MediaService): Array<[React.ReactNode, string, string]> => {
    if (service.id === 'sonarr') {
      const rows = library.filter(item => item.service === 'sonarr')
      const episodes = rows.reduce((sum, item) => sum + (item.statistics?.episodeFileCount ?? 0), 0)
      return [[<Television size={20} />, 'TV Shows', compactCount(rows.length)], [<Play size={20} />, 'Episodes', compactCount(episodes)]]
    }
    if (service.id === 'radarr') {
      const rows = library.filter(item => item.service === 'radarr')
      return [[<FilmStrip size={20} />, 'Movies', compactCount(rows.length)], [<CheckCircle size={20} />, 'Files', compactCount(rows.filter(item => item.hasFile !== false).length)]]
    }
    if (service.id === 'lidarr') {
      const rows = library.filter(item => item.service === 'lidarr')
      return [[<MusicNotes size={20} />, 'Artists', compactCount(rows.length)], [<CheckCircle size={20} />, 'Files', compactCount(rows.filter(item => item.hasFile !== false).length)]]
    }
    if (['overseerr', 'jellyseerr'].includes(service.id)) {
      return [[<Plus size={20} />, 'Total Requests', compactCount(requests.length)], [<WarningCircle size={20} />, 'Pending', compactCount(pendingRequests)]]
    }
    if (['qbittorrent', 'sabnzbd', 'nzbget', 'transmission', 'deluge'].includes(service.id)) {
      return [[<DownloadSimple size={20} />, 'Jobs', compactCount(downloads.filter(item => item.service === service.id).length)], [<ArrowsClockwise size={20} />, 'Queue', compactCount(queue.length)]]
    }
    if (['plex', 'tautulli', 'jellystat', 'jellyfin', 'emby'].includes(service.id)) {
      return [[<Play size={20} />, 'Streams', compactCount(streams.filter(item => item.service === service.id).length + (data?.now_playing ? 1 : 0))], [<Pulse size={20} />, 'State', serviceStateLabel(service)]]
    }
    return [[serviceIcon(service.id), serviceKindLabel(service), serviceStateLabel(service)]]
  }

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

  useEffect(() => {
    storeIgnoredWarnings(ignoredWarnings)
  }, [ignoredWarnings])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mediaQuery = window.matchMedia('(max-width: 920px)')
    const update = () => setCompactLayout(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  const openDetail = async (ref: DetailRef | null, seed?: Record<string, unknown>) => {
    if (!ref) return
    setDetailLoading(true)
    setMessage(null)
    setSelectedDetail({
      service: ref.service,
      kind: ref.kind,
      id: ref.id,
      item: seed ?? { title: String(ref.id) },
      actions: [],
    })
    try {
      const detail = await api.get<DetailResponse>(`/api/media/detail/${encodeURIComponent(ref.service)}/${encodeURIComponent(ref.kind)}/${encodeURIComponent(String(ref.id))}`)
      setSelectedDetail(detail)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Detail failed')
      setSelectedDetail({
        service: ref.service,
        kind: ref.kind,
        id: ref.id,
        item: seed ?? { title: String(ref.id) },
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
      setDiscoverResults([])
      setRequestSeasonSelections(Object.fromEntries(
        results
          .filter(item => requestMediaType(item) === 'tv')
          .map(item => [requestResultKey(item), requestSeasonNumbers(item, 'tv').join(', ')]),
      ))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request search failed')
    } finally {
      setBusy(null)
    }
  }

  const discoverRequests = async (overrides: Partial<{ provider: string; kind: DiscoverKindFilter; category: DiscoverCategoryFilter }> = {}) => {
    setBusy('request-discover')
    setMessage(null)
    try {
      setRequestResults([])
      const provider = overrides.provider ?? discoverProvider
      const params = new URLSearchParams({
        service: requestService,
        kind: overrides.kind ?? discoverKind,
        category: overrides.category ?? discoverCategory,
      })
      if (provider !== 'all') params.set('provider', provider)
      const res = await api.get<RequestDiscoveryResponse>(`/api/media/requests/discover?${params.toString()}`)
      const results = res.results ?? []
      setDiscoverResults(results)
      setDiscoverProviders(res.providers?.length ? res.providers : discoverProviders)
      setDiscoverTotal(typeof res.totalResults === 'number' ? res.totalResults : results.length)
      setRequestSeasonSelections(prev => ({
        ...prev,
        ...Object.fromEntries(
          results
            .filter(item => requestMediaType(item, discoverKind) === 'tv')
            .map(item => [requestResultKey(item), requestSeasonNumbers(item, discoverKind).join(', ')]),
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
    const mediaType = requestMediaType(item, discoverKind)
    if (!Number.isFinite(mediaId)) return
    const selectedSeasons = parseSeasonSelection(requestSeasonSelections[requestResultKey(item)] ?? '')
    const seasons = mediaType === 'tv' ? (selectedSeasons.length ? selectedSeasons : requestSeasonNumbers(item, mediaType)) : []
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

  const restoreWarnings = () => {
    setIgnoredWarnings([])
    setShowIgnoredWarnings(false)
    setMessage('Ignored media warnings restored')
  }

  const ignoreWarning = (service: MediaService) => {
    setIgnoredWarnings(prev => Array.from(new Set([...prev, serviceWarningKey(service)])))
    setMessage(`${service.name} warning ignored on this device`)
  }

  const restoreWarning = (service: MediaService) => {
    const key = serviceWarningKey(service)
    setIgnoredWarnings(prev => prev.filter(item => item !== key))
  }

  const detectedServiceUrl = (service: MediaService): string => {
    const detection = service.detections?.find(item => item.detected_url)?.detected_url ?? service.detections?.[0]?.detected_url
    return service.detected_url ?? detection ?? service.url ?? ''
  }

  const urlCredentialKey = (service: MediaService): string => {
    const key = [...(service.credential_keys ?? []), ...(service.missing_credentials ?? [])]
      .find(value => /(^|[._-])(url|host)$/i.test(value))
    if (!key) return 'url'
    const parts = key.split('.')
    return (parts.length > 1 ? parts.slice(1).join('_') : key.replace(`${service.id.toUpperCase()}_`, '')).replace(/-/g, '_').toLowerCase()
  }

  const extractSecretCredentials = (response: unknown): Record<string, string> => {
    const record = response && typeof response === 'object' ? response as Record<string, unknown> : {}
    const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : record
    const credentials = data.credentials && typeof data.credentials === 'object' ? data.credentials as Record<string, unknown> : {}
    return Object.fromEntries(Object.entries(credentials).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }

  const saveDetectedUrl = async (service: MediaService) => {
    const detectedUrl = detectedServiceUrl(service)
    if (!detectedUrl) return
    setBusy(`setup-url-${service.id}`)
    setMessage(null)
    try {
      const existing = extractSecretCredentials(await api.get(`/api/secrets/${service.id}`).catch(() => null))
      await api.put(`/api/secrets/${service.id}`, {
        credentials: { ...existing, [urlCredentialKey(service)]: detectedUrl },
      })
      setMessage(`Saved detected URL for ${service.name}. Restart may be needed for this process to use it.`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Could not save detected URL for ${service.name}`)
    } finally {
      setBusy(null)
    }
  }

  const importHomelabCredentials = async () => {
    setBusy('homelab-import')
    setMessage(null)
    try {
      const result = await api.post('/api/media/setup/import-homelab-credentials', {}) as { saved?: unknown[]; failed?: unknown[]; errors?: unknown[] }
      const saved = Array.isArray(result.saved) ? result.saved.length : 0
      const failed = Array.isArray(result.failed) ? result.failed.length : 0
      const errors = Array.isArray(result.errors) ? result.errors.length : 0
      setMessage(saved > 0
        ? `Imported ${saved} media credential${saved === 1 ? '' : 's'} from homelab${failed || errors ? `; ${failed + errors} item${failed + errors === 1 ? '' : 's'} need review` : ''}.`
        : `No new media credentials imported${failed || errors ? `; ${failed + errors} homelab check${failed + errors === 1 ? '' : 's'} need review` : ''}.`)
      await refetch()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Homelab credential import failed')
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
  const warningIgnored = (service: MediaService) => ignoredWarnings.includes(serviceWarningKey(service))
  const rawAttentionServices = allServices
    .filter(serviceNeedsAttention)
    .sort((left, right) => serviceAttentionRank(left) - serviceAttentionRank(right) || left.name.localeCompare(right.name))
  const ignoredAttentionServices = rawAttentionServices.filter(warningIgnored)
  const attentionServices = (showIgnoredWarnings ? rawAttentionServices : rawAttentionServices.filter(service => !warningIgnored(service)))
  const detectedMissingCredentials = allServices.filter(service => service.state === 'detected_missing_credentials' && (showIgnoredWarnings || !warningIgnored(service)))
  const degradedServices = allServices.filter(service => service.configured && (service.state === 'degraded' || service.state === 'offline') && (showIgnoredWarnings || !warningIgnored(service)))
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
      if (serviceSetupFilter === 'attention') return serviceNeedsAttention(service) && (showIgnoredWarnings || !warningIgnored(service))
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
  }, [allServices, serviceSetupFilter, showIgnoredWarnings, ignoredWarnings])
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
    const q = deferredBrowseQuery.trim().toLowerCase()
    return browseCatalog.filter(item => {
      if (browseSource !== 'all' && item.service !== browseSource) return false
      if (browseKind !== 'all' && libraryKind(item) !== browseKind) return false
      if (browseNetwork !== 'all' && libraryNetwork(item) !== browseNetwork) return false
      if (q && !librarySearchText(item).includes(q)) return false
      return true
    })
  }, [browseKind, browseNetwork, deferredBrowseQuery, browseSource, browseCatalog])
  const browsePageSize = compactLayout ? 18 : 24
  const visibleBrowseItems = useMemo(() => browseItems.slice(0, browseVisibleCount), [browseItems, browseVisibleCount])
  useEffect(() => {
    setBrowseVisibleCount(browsePageSize)
  }, [activeView, browseKind, browseNetwork, deferredBrowseQuery, browsePageSize, browseSource])
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
    ['overview', 'Home', null],
    ['browse', 'Browse & Search', browseCatalog.length],
    ['downloads', 'Downloads', downloadCount],
    ['calendar', 'Calendar', calendar.length],
    ['requests', 'Requests', pendingRequests],
    ['missing', 'Missing', wanted.length],
    ['indexers', 'Indexers', indexers.length],
    ['setup', 'Setup', detectedMissingCredentials.length + attentionServices.length],
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
    { id: 'overview', label: 'Home', value: null, tone: '#9ee37d', icon: <House size={14} /> },
    { id: 'browse', label: 'Browse & Search', value: browseCatalog.length, tone: 'var(--accent)', icon: <MagnifyingGlass size={14} /> },
    { id: 'library', label: 'Library', value: library.length, tone: '#93c5fd', icon: <Television size={14} /> },
    { id: 'downloads', label: 'Activity', value: downloadCount, tone: '#5eead4', icon: <DownloadSimple size={14} /> },
    { id: 'setup', label: 'Ops', value: detectedMissingCredentials.length + attentionServices.length, tone: '#facc15', icon: <Gear size={14} /> },
  ]
  const summaryCommandItems: Array<{
    id: MediaView
    label: string
    value: string | number
    tone: string
  }> = [
    { id: 'library', label: 'Library', value: library.length, tone: '#93c5fd' },
    { id: 'setup', label: 'Detections', value: detectedCount, tone: '#ffb657' },
    { id: 'requests', label: 'Requests', value: pendingRequests, tone: '#9ee37d' },
    { id: 'downloads', label: 'Streams', value: liveStreams, tone: '#e5a93b' },
    { id: 'downloads', label: 'Downloads', value: downloadCount, tone: '#5eead4' },
    { id: 'setup', label: 'Ecosystem', value: `${ecosystemServices.filter(service => service.configured).length}/${ecosystemServices.length}`, tone: '#c084fc' },
  ]
  const mobileNavItems: Array<{ id: MediaView; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Home', icon: <House size={22} weight={activeView === 'overview' ? 'fill' : 'regular'} /> },
    { id: 'library', label: 'Library', icon: <Television size={22} weight={activeView === 'library' ? 'fill' : 'regular'} /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar size={22} weight={activeView === 'calendar' ? 'fill' : 'regular'} /> },
    { id: 'downloads', label: 'Activities', icon: <DownloadSimple size={22} weight={activeView === 'downloads' ? 'fill' : 'regular'} /> },
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
  const mobileActivityItems = useMemo(() => {
    const items: Array<{ id: string; title: string; meta: string; progress: number | null; icon: React.ReactNode; tone: string }> = []
    for (const item of downloads.slice(0, 8)) {
      items.push({
        id: `download-${item.service}-${downloadId(item) ?? downloadTitle(item)}`,
        title: downloadTitle(item),
        meta: `${serviceMap.get(item.service)?.name ?? item.service} · ${item.status ?? item.state ?? 'active'} · ${downloadMeta(item)}`,
        progress: clampPercent(item.progress ?? item.percentage ?? item.percentDone),
        icon: serviceIcon(item.service),
        tone: '#5eead4',
      })
    }
    for (const item of queue.slice(0, 8)) {
      items.push({
        id: `queue-${item.service}-${item.id ?? queueTitle(item)}`,
        title: queueTitle(item),
        meta: `${serviceMap.get(item.service)?.name ?? item.service} · ${item.status ?? item.trackedDownloadStatus ?? 'queued'} · ${item.timeleft ?? formatBytes(item.sizeleft)}`,
        progress: null,
        icon: serviceIcon(item.service),
        tone: '#c084fc',
      })
    }
    for (const item of streams.slice(0, 8)) {
      items.push({
        id: `stream-${item.service}-${streamTitle(item)}`,
        title: streamTitle(item),
        meta: `${item.username ?? item.user ?? 'user'} · ${streamPlayer(item)} · ${streamDecision(item)}`,
        progress: clampPercent(item.progress ?? item.progress_percent),
        icon: serviceIcon(item.service),
        tone: streamDecision(item).toLowerCase().includes('transcode') ? '#ffb657' : '#71e087',
      })
    }
    return items.slice(0, 16)
  }, [downloads, queue, serviceMap, streams])

  const currentActivityItems = useMemo(() => {
    const items: Array<{
      id: string
      title: string
      meta: string
      tone: string
      icon: React.ReactNode
      target: MediaView
      progress?: number | null
      action?: string
    }> = []

    if (data?.now_playing) {
      items.push({
        id: 'now-playing',
        title: data.now_playing.title,
        meta: `${data.now_playing.user} · ${data.now_playing.type}`,
        tone: '#e5a93b',
        icon: <Play size={18} weight="fill" />,
        target: 'downloads',
        progress: data.now_playing.progress,
        action: 'Watching',
      })
    }
    for (const item of streams.slice(0, 4)) {
      items.push({
        id: `stream-${item.service}-${streamTitle(item)}`,
        title: streamTitle(item),
        meta: `${item.username ?? item.user ?? 'user'} · ${streamPlayer(item)} · ${streamDecision(item)}`,
        tone: streamDecision(item).toLowerCase().includes('transcode') ? '#ffb657' : '#71e087',
        icon: serviceIcon(item.service),
        target: 'downloads',
        progress: clampPercent(item.progress ?? item.progress_percent),
        action: 'Stream',
      })
    }
    for (const item of downloads.slice(0, 4)) {
      items.push({
        id: `download-${item.service}-${downloadId(item) ?? downloadTitle(item)}`,
        title: downloadTitle(item),
        meta: `${serviceMap.get(item.service)?.name ?? item.service} · ${item.status ?? item.state ?? 'active'} · ${downloadMeta(item)}`,
        tone: '#5eead4',
        icon: serviceIcon(item.service),
        target: 'downloads',
        progress: clampPercent(item.progress ?? item.percentage ?? item.percentDone),
        action: 'Downloading',
      })
    }
    for (const item of queue.slice(0, 4)) {
      items.push({
        id: `queue-${item.service}-${item.id ?? queueTitle(item)}`,
        title: queueTitle(item),
        meta: `${serviceMap.get(item.service)?.name ?? item.service} · ${item.status ?? item.trackedDownloadStatus ?? 'queued'} · ${item.timeleft ?? formatBytes(item.sizeleft)}`,
        tone: '#c084fc',
        icon: serviceIcon(item.service),
        target: 'downloads',
        progress: null,
        action: 'Queue',
      })
    }
    for (const item of requests.filter(requestIsPending).slice(0, 4)) {
      items.push({
        id: `request-${item.service}-${item.id ?? requestTitle(item)}`,
        title: requestTitle(item),
        meta: `${serviceMap.get(item.service)?.name ?? item.service} · ${item.requestedBy?.displayName ?? item.requestedBy?.email ?? 'requested'} · ${requestStatus(item)}`,
        tone: '#9ee37d',
        icon: serviceIcon(item.service),
        target: 'requests',
        progress: null,
        action: 'Request',
      })
    }
    for (const service of attentionServices.slice(0, 4)) {
      items.push({
        id: `service-${service.id}`,
        title: service.name,
        meta: serviceIssueText(service),
        tone: service.state === 'offline' ? '#ff5252' : '#ffb657',
        icon: serviceIcon(service.id),
        target: 'setup',
        progress: null,
        action: 'Problem',
      })
    }
    if (indexerHealth.length > 0) {
      items.push({
        id: 'indexer-health',
        title: 'Indexer warnings',
        meta: `${indexerHealth.length} Prowlarr warning${indexerHealth.length === 1 ? '' : 's'} need attention`,
        tone: '#93c5fd',
        icon: <MagnifyingGlass size={18} />,
        target: 'indexers',
        progress: null,
        action: 'Indexers',
      })
    }
    return items.slice(0, 12)
  }, [attentionServices, data?.now_playing, downloads, indexerHealth.length, queue, requests, serviceMap, streams])

  const mediaShelfItems = (
    rows: Array<Record<string, unknown>>,
    options: { service?: string; status?: string; tone?: string; limit?: number } = {},
  ) => rows.slice(0, options.limit ?? 8).map((item, index) => {
    const ref = itemDetailRef(item as Parameters<typeof itemDetailRef>[0])
    const service = String(item.service ?? options.service ?? 'media')
    return (
      <MediaShelfCard
        key={`${service}-${String(item.id ?? item.detail_id ?? resultTitle(item))}-${index}`}
        item={item}
        title={resultTitle(item)}
        meta={mediaMeta(item, String(item.kind ?? item.type ?? options.service ?? 'media')) || service}
        status={options.status}
        tone={options.tone}
        service={service}
        onOpen={ref ? () => void openDetail(ref, item) : undefined}
      />
    )
  })

  const homeBrowseShelves = useMemo(() => {
    const recentRows = recentlyAdded.map(item => item as unknown as Record<string, unknown>)
    const upcomingRows = upcoming.map(item => ({ ...(item as unknown as Record<string, unknown>), releaseDate: item.air_date }))
    const movieRows = browseCatalog
      .filter(item => item.service === 'radarr' || libraryKind(item).toLowerCase().includes('movie'))
      .map(item => item as unknown as Record<string, unknown>)
    const showRows = browseCatalog
      .filter(item => item.service === 'sonarr' || libraryKind(item).toLowerCase().includes('series'))
      .map(item => item as unknown as Record<string, unknown>)
    const appleRows = browseCatalog
      .filter(item => libraryNetwork(item).toLowerCase().includes('apple'))
      .map(item => item as unknown as Record<string, unknown>)
    return [
      { id: 'recent', title: 'Recently Added', subtitle: 'Fresh from Plex and ARR libraries', badge: compactCount(recentRows.length), rows: recentRows, status: 'Available', tone: '#71e087' },
      { id: 'upcoming', title: 'Upcoming', subtitle: 'Calendar releases and next episodes', badge: compactCount(upcomingRows.length), rows: upcomingRows, status: 'Upcoming', tone: '#93c5fd' },
      { id: 'shows', title: 'Browse Shows', subtitle: 'Series in your stack', badge: compactCount(showRows.length), rows: showRows, status: 'Show', tone: '#c084fc' },
      { id: 'movies', title: 'Browse Movies', subtitle: 'Movies in your stack', badge: compactCount(movieRows.length), rows: movieRows, status: 'Movie', tone: '#ffb657' },
      { id: 'apple', title: 'Apple TV+ Shelf', subtitle: 'Provider/category rail from current metadata', badge: compactCount(appleRows.length), rows: appleRows, status: 'Provider', tone: '#9ee37d' },
    ].filter(shelf => shelf.rows.length > 0)
  }, [browseCatalog, recentlyAdded, upcoming])
  const requestResultSource = requestResults.length ? requestResults : discoverResults
  const requestResultGroups = useMemo(() => {
    const source = requestResults.length ? requestResults : discoverResults
    const hasMetadata = (item: Record<string, unknown>) => Boolean(mediaImageUrl(item) || mediaImageUrl(item, 'backdrop')) && Boolean(mediaOverview(item) || mediaMeta(item, requestMediaType(item, discoverKind)))
    return [
      {
        id: 'requestable',
        title: 'Requestable',
        subtitle: 'Ready to send into Overseerr or Jellyseerr',
        tone: '#9ee37d',
        rows: source.filter(item => requestAvailability(item).label === 'Requestable' && hasMetadata(item)),
      },
      {
        id: 'available',
        title: 'Already Available',
        subtitle: 'Found in the existing library',
        tone: '#71e087',
        rows: source.filter(item => requestAvailability(item).label === 'In library'),
      },
      {
        id: 'pending',
        title: 'Pending Or Requested',
        subtitle: 'Already moving through the request pipeline',
        tone: '#93c5fd',
        rows: source.filter(item => ['Pending', 'Requested'].includes(requestAvailability(item).label)),
      },
      {
        id: 'metadata',
        title: 'Missing Metadata',
        subtitle: 'Still shown, but clearly marked instead of disappearing',
        tone: '#ffb657',
        rows: source.filter(item => !hasMetadata(item)),
      },
      {
        id: 'declined',
        title: 'Declined',
        subtitle: 'Returned by the request service as blocked',
        tone: '#ff5252',
        rows: source.filter(item => requestAvailability(item).label === 'Declined'),
      },
    ].filter(group => group.rows.length > 0)
  }, [discoverKind, discoverResults, requestResults])
  const calendarGroups = useMemo(() => {
    const groups = new Map<string, CalendarItem[]>()
    for (const item of calendar.slice(0, 72)) {
      const date = item.airDateUtc ?? item.releaseDate ?? item.inCinemas ?? ''
      const parts = calendarDateParts(date)
      groups.set(parts.group, [...(groups.get(parts.group) ?? []), item])
    }
    const order = ['Today', 'Tomorrow', 'This Week', 'Later', 'Recently Aired', 'Unscheduled']
    return Array.from(groups.entries()).sort((left, right) => order.indexOf(left[0]) - order.indexOf(right[0]))
  }, [calendar])

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
    <div style={{ width: compactLayout ? '100vw' : '100%', maxWidth: compactLayout ? '100vw' : 'none', minWidth: 0, boxSizing: 'border-box', minHeight: compactLayout ? '100vh' : '100%', height: compactLayout ? 'auto' : '100%', padding: compactLayout ? '18px 14px 104px' : '14px 16px 18px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px', alignItems: 'stretch', overflowX: 'hidden', overflowY: compactLayout ? 'visible' : 'hidden', background: 'var(--bg-base)' }}>
      {compactLayout && (
        <header style={{ display: 'grid', gap: '14px', padding: '6px 0 2px', width: '100%', maxWidth: '365px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <button onClick={() => setActiveView('overview')} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '999px', padding: '12px 18px', fontSize: '20px', lineHeight: 1, fontWeight: 950, cursor: 'pointer', boxShadow: 'var(--shadow-sm, 0 8px 20px rgba(0,0,0,0.16))' }}>
              Default Network
            </button>
            <button onClick={() => setActiveView('setup')} aria-label="Open media settings" style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '999px', width: '54px', height: '54px', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: 'var(--shadow-sm, 0 8px 20px rgba(0,0,0,0.16))' }}>
              <Gear size={28} weight="fill" />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <button onClick={() => setActiveView('browse')} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '999px', padding: '10px 16px', minHeight: '48px', display: 'inline-flex', alignItems: 'center', gap: '9px', fontSize: '18px', fontWeight: 850, cursor: 'pointer' }}>
              <Plus size={24} />
              Add
            </button>
            <button onClick={() => setActiveView('downloads')} style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '999px', padding: '10px 16px', minHeight: '48px', display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '18px', fontWeight: 850, cursor: 'pointer' }}>
              <DownloadSimple size={24} />
              Activity
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <MagnifyingGlass size={24} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input
              aria-label="Mobile media command search"
              value={activeView === 'library' ? libraryQuery : ['requests', 'browse'].includes(activeView) ? requestQuery : query}
              onChange={event => {
                if (activeView === 'library') setLibraryQuery(event.target.value)
                else if (['requests', 'browse'].includes(activeView)) setRequestQuery(event.target.value)
                else setQuery(event.target.value)
              }}
              onFocus={() => {
                if (!['library', 'requests', 'browse'].includes(activeView)) setActiveView('browse')
              }}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                if (['requests', 'browse'].includes(activeView)) void searchRequests()
                else if (activeView === 'library') setActiveView('library')
                else void search()
              }}
              placeholder={activeView === 'library' ? 'Search library...' : ['requests', 'browse'].includes(activeView) ? 'Search movies or shows...' : 'Search movies, shows, artists...'}
              style={{ width: '100%', minHeight: '56px', border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '999px', padding: '0 18px 0 54px', fontSize: '18px', outline: 'none', boxShadow: 'var(--shadow-sm, 0 8px 20px rgba(0,0,0,0.16))' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '26px', lineHeight: 1.1, fontWeight: 950 }}>
              {activeView === 'overview' ? 'Home' : activeViewTab[1]}
            </h1>
            <button onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh media stack" style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', width: '48px', height: '36px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <ArrowsClockwise size={24} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          </div>
        </header>
      )}
      <main style={{ width: '100%', maxWidth: compactLayout ? '365px' : 'none', minWidth: 0, boxSizing: 'border-box', height: compactLayout ? 'auto' : '100%', overflow: compactLayout ? 'visible' : 'auto', paddingRight: compactLayout ? '0' : selectedDetail ? '438px' : '4px', background: 'var(--bg-base)' }}>
        {!compactLayout && (
        <div style={{ position: 'sticky', top: 0, zIndex: 20, ...shellPanel, padding: '10px', marginBottom: '12px', display: 'grid', gridTemplateColumns: 'minmax(210px, 0.8fr) minmax(360px, 1.6fr) auto', gap: '10px', alignItems: 'center' }}>
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
                    border: `1px solid ${active ? 'var(--accent)' : warn ? 'var(--warning, #ffb657)' : 'var(--border)'}`,
                    background: active ? mediaActiveBackground : warn ? mediaWarningBackground : mediaSolidElevatedBackground,
                    color: active ? 'var(--text-on-accent)' : warn ? 'var(--warning, #ffb657)' : 'var(--text-primary)',
                    boxShadow: 'none',
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
            <button onClick={() => setActiveView('browse')} style={{ ...miniButton('var(--text-on-accent)'), background: mediaActiveBackground, borderColor: 'var(--accent)', borderRadius: '8px', minHeight: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: 'none' }}>
              <Plus size={14} />
              Add
            </button>
            <button onClick={handleRefresh} disabled={isRefreshing} style={{ ...miniButton('var(--text-primary)'), background: mediaSolidElevatedBackground, borderColor: 'var(--border)', borderRadius: '8px', minHeight: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: 'none' }}>
              <ArrowsClockwise size={14} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
              Sync
            </button>
          </div>
        </div>
        )}

        {!compactLayout && (
          <div id="media-command" style={{ ...shellPanel, padding: '12px', marginBottom: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
            {summaryCommandItems.map(item => (
              <button
                key={`summary-${item.label}`}
                type="button"
                aria-label={`Open ${item.label}`}
                onClick={() => setActiveView(item.id)}
                style={{
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: activeView === item.id ? `1px solid ${item.tone}` : '1px solid var(--border)',
                  background: mediaSolidElevatedBackground,
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: activeView === item.id ? `inset 0 0 0 1px ${item.tone}44` : 'none',
                }}
              >
                <div style={{ fontSize: '10px', color: activeView === item.id ? item.tone : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', fontWeight: 850 }}>{item.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 900 }}>{item.value}</div>
              </button>
            ))}
          </div>
        )}

        {!compactLayout && (
          <div role="tablist" aria-label="Media sections" style={{ display: 'flex', alignItems: 'center', gap: '7px', overflowX: 'auto', padding: '0 0 12px', marginBottom: '2px' }}>
            {viewTabs.map(([id, label, value]) => {
              const active = activeView === id
              const warn = id === 'setup' && detectedMissingCredentials.length + attentionServices.length > 0
              return (
                <button
                  key={`media-tab-${id}`}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveView(id)}
                  style={{
                    flex: '0 0 auto',
                    minHeight: '34px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: `1px solid ${active ? 'var(--accent)' : warn ? 'var(--warning, #ffb657)' : 'var(--border)'}`,
                    background: active ? mediaActiveBackground : warn ? mediaWarningBackground : mediaSolidPanelBackground,
                    color: active ? 'var(--text-on-accent)' : warn ? 'var(--warning, #ffb657)' : 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 850,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {MEDIA_VIEW_ICONS[id]}
                  <span>{label}</span>
                  {value !== null && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 950 }}>{compactCount(value)}</span>}
                </button>
              )
            })}
          </div>
        )}

        {activeView === 'overview' && attentionServices.length > 0 && (
          <section style={{ ...card, padding: '12px', marginBottom: '12px', borderColor: 'var(--warning-a30, rgba(255,182,87,0.32))', background: 'var(--bg-panel)' }}>
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

        {false && compactLayout && activeView === 'overview' && (
          <section style={{ display: 'grid', gap: '14px', marginBottom: '16px' }}>
            {(featuredServices.length ? featuredServices : allServices).slice(0, 8).map(service => {
              const tone = serviceTone(service.id)
              const stateColor = serviceStateColor(service, tone.accent)
              const rows = serviceMetricRows(service)
              return (
                <button
                  key={`mobile-service-${service.id}`}
                  onClick={() => setActiveView(serviceNeedsAttention(service) ? 'setup' : service.id === 'overseerr' || service.id === 'jellyseerr' ? 'requests' : ['qbittorrent', 'sabnzbd', 'nzbget', 'transmission', 'deluge'].includes(service.id) ? 'downloads' : 'library')}
                  style={{
                    border: `1px solid ${serviceNeedsAttention(service) ? 'rgba(255,182,87,0.35)' : 'rgba(196,132,252,0.18)'}`,
                    background: 'var(--bg-panel)',
                    color: 'var(--text-primary)',
                    borderRadius: '28px',
                    padding: '18px',
                    minHeight: '150px',
                    textAlign: 'left',
                    display: 'grid',
                    gap: '18px',
                    boxShadow: 'var(--shadow-sm, 0 8px 20px rgba(0,0,0,0.16))',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <span style={{ width: '9px', height: '30px', borderRadius: '999px', background: tone.accent, boxShadow: `0 0 22px ${tone.accent}55` }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '23px', fontWeight: 950, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</span>
                        <span style={{ display: 'block', color: stateColor, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '5px' }}>{serviceStateLabel(service)}</span>
                      </span>
                    </span>
                    <span style={{ width: '42px', height: '42px', borderRadius: '999px', display: 'grid', placeItems: 'center', color: service.healthy ? '#71e087' : 'var(--text-muted)', border: `2px solid ${service.healthy ? '#71e087' : 'rgba(255,255,255,0.34)'}` }}>
                      {serviceIcon(service.id)}
                    </span>
                  </span>
                  <span style={{ display: 'grid', gridTemplateColumns: rows.length > 1 ? '1fr 1fr' : '1fr', gap: '12px' }}>
                    {rows.map(([icon, label, value]) => (
                      <span key={`${service.id}-${label}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, color: 'var(--text-primary)' }}>
                        <span style={{ color: 'var(--text-primary)', opacity: 0.92 }}>{icon}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '15px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label} <span style={{ color: 'var(--text-muted)', fontWeight: 650 }}>· {value}</span></span>
                        </span>
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </section>
        )}

        {activeView === 'overview' && !data?.mock && (
          <section style={{ display: 'grid', gap: compactLayout ? '14px' : '16px', marginBottom: '16px' }}>
            <section style={{ ...card, padding: compactLayout ? '14px' : '16px', borderColor: 'color-mix(in srgb, var(--secondary) 24%, var(--border))', background: 'var(--bg-panel)' }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ee37d', fontSize: '12px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    <Pulse size={15} />
                    Current Activity
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '5px' }}>
                    {currentActivityItems.length > 0 ? `${currentActivityItems.length} live stack signal${currentActivityItems.length === 1 ? '' : 's'}` : 'No current activity. Stack quiet.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => setActiveView('downloads')} style={{ ...miniButton('#5eead4'), borderRadius: '8px' }}>
                    Queue {compactCount(downloadCount)}
                  </button>
                  <button onClick={() => setActiveView('requests')} style={{ ...miniButton('#9ee37d'), borderRadius: '8px' }}>
                    Requests {compactCount(pendingRequests)}
                  </button>
                  <button onClick={() => setActiveView('setup')} style={{ ...miniButton('#ffb657'), borderRadius: '8px' }}>
                    Health {compactCount(attentionServices.length)}
                  </button>
                </div>
              </div>
              {currentActivityItems.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {currentActivityItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveView(item.target)}
                      style={{
                        border: `1px solid ${item.tone}55`,
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        borderRadius: compactLayout ? '18px' : '8px',
                        padding: '12px',
                        minHeight: '86px',
                        display: 'grid',
                        gridTemplateColumns: '42px minmax(0, 1fr)',
                        gap: '11px',
                        alignItems: 'center',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'grid', placeItems: 'center', color: item.tone, background: 'var(--bg-elevated)', border: `1px solid ${item.tone}44` }}>
                        {item.icon}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ color: item.tone, fontSize: '10px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{item.action}</span>
                        <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.25, fontWeight: 950, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                        <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.35, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.meta}</span>
                        {item.progress !== null && item.progress !== undefined && item.progress > 0 && (
                          <span style={{ display: 'block', height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: '9px' }}>
                            <span style={{ display: 'block', width: `${item.progress}%`, height: '100%', background: item.tone }} />
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ ...solidMediaPanel, borderRadius: compactLayout ? '18px' : '8px', padding: '18px', display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : '48px minmax(0, 1fr) auto', gap: '12px', alignItems: 'center' }}>
                  <span style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'grid', placeItems: 'center', color: '#9ee37d', background: 'rgba(158,227,125,0.12)', border: '1px solid rgba(158,227,125,0.34)' }}>
                    <CheckCircle size={22} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '16px', fontWeight: 950 }}>No current activity</span>
                    <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Stack quiet. No streams, downloads, queue items, pending requests, or health events.</span>
                  </span>
                  {!compactLayout && (
                    <button onClick={() => setActiveView('browse')} style={{ ...miniButton('var(--accent)'), borderRadius: '8px', minHeight: '36px' }}>
                      Find media
                    </button>
                  )}
                </div>
              )}
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
              {workflowCards.map(cardItem => (
                <button
                  key={`home-workflow-${cardItem.id}`}
                  onClick={() => setActiveView(cardItem.id)}
                  style={{
                    border: `1px solid ${cardItem.value > 0 ? `${cardItem.tone}66` : 'rgba(255,255,255,0.1)'}`,
                    background: cardItem.value > 0 ? 'var(--bg-elevated)' : 'var(--bg-panel)',
                    color: 'var(--text-primary)',
                    borderRadius: compactLayout ? '16px' : '8px',
                    padding: '11px',
                    minHeight: '84px',
                    display: 'grid',
                    gap: '7px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: cardItem.tone, fontSize: '11px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {cardItem.icon}
                    {cardItem.label}
                  </span>
                  <span style={{ color: cardItem.tone, fontSize: '23px', fontWeight: 950, fontVariantNumeric: 'tabular-nums' }}>{compactCount(cardItem.value)}</span>
                </button>
              ))}
            </section>

            <section style={{ display: 'grid', gap: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: compactLayout ? '22px' : '24px', fontWeight: 950, lineHeight: 1.1 }}>Browse</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '5px' }}>Shelves from your connected stack, calendar, and request discovery.</div>
                </div>
                <button onClick={() => setActiveView('browse')} style={{ ...miniButton('var(--accent)'), borderRadius: '8px', minHeight: '38px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <MagnifyingGlass size={14} />
                  Search
                </button>
              </div>
              {homeBrowseShelves.length > 0 ? (
                homeBrowseShelves.map(shelf => (
                  <MediaShelf
                    key={`home-shelf-${shelf.id}`}
                    title={shelf.title}
                    subtitle={shelf.subtitle}
                    badge={shelf.badge}
                    items={mediaShelfItems(shelf.rows, { status: shelf.status, tone: shelf.tone, limit: compactLayout ? 4 : 8 })}
                  />
                ))
              ) : (
                <div style={{ ...solidMediaPanel, borderRadius: compactLayout ? '18px' : '8px', padding: '18px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Browse shelves will appear after Plex, Radarr, Sonarr, or Overseerr returns media metadata.
                </div>
              )}
            </section>
          </section>
        )}

        {false && activeView === 'overview' && !data?.mock && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div style={{ ...card, padding: '14px', borderColor: 'rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900 }}>Command inbox</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    One place for stack problems, approvals, downloads, missing media, and indexers.
                  </div>
                </div>
                <button onClick={() => setActiveView('browse')} style={{ ...glassButton, color: 'var(--accent)', padding: '8px 11px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 850 }}>
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
                    <div style={{ fontSize: '15px', fontWeight: 850, marginBottom: '4px', lineHeight: 1.3 }}>{data?.now_playing?.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Playing for {data?.now_playing?.user}</div>
                    {data?.now_playing?.progress !== null && data?.now_playing?.progress !== undefined && (
                      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                        <div style={{ width: `${clampPercent(data?.now_playing?.progress)}%`, height: '100%', background: 'var(--accent)' }} />
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
                      onClick={() => void openDetail(itemDetailRef(item), item as unknown as Record<string, unknown>)}
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
                      onClick={() => void openDetail(itemDetailRef(item), item as unknown as Record<string, unknown>)}
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
                    {reachable && (
                      <button onClick={() => void saveDetectedUrl(service)} disabled={busy === `setup-url-${service.id}`} style={{ ...miniButton('#ffb657'), borderRadius: '7px' }}>
                        Use detected URL
                      </button>
                    )}
                    <button onClick={() => warningIgnored(service) ? restoreWarning(service) : ignoreWarning(service)} style={{ ...miniButton('var(--text-secondary)'), borderRadius: '7px' }} aria-label={`${warningIgnored(service) ? 'Restore' : 'Ignore'} ${service.name} warning`}>
                      {warningIgnored(service) ? 'Restore warning' : 'Ignore'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {activeView === 'setup' && detectedMissingCredentials.length > 0 && (
        <section id="media-setup" style={{ ...card, padding: '16px', marginBottom: '16px', borderColor: 'rgba(255,182,87,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ffb657' }}>
              Detected, needs credentials
            </div>
            <button onClick={() => void importHomelabCredentials()} disabled={busy === 'homelab-import'} style={{ ...miniButton('#ffb657'), borderRadius: '7px', background: 'rgba(255,182,87,0.12)' }}>
              {busy === 'homelab-import' ? 'Importing...' : 'Import from homelab'}
            </button>
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
                    {url && (
                      <button onClick={() => void saveDetectedUrl(service)} disabled={busy === `setup-url-${service.id}`} style={{ ...miniButton('#ffb657'), borderRadius: '7px' }}>
                        Use detected URL
                      </button>
                    )}
                    <button onClick={() => warningIgnored(service) ? restoreWarning(service) : ignoreWarning(service)} style={{ ...miniButton('var(--text-secondary)'), borderRadius: '7px' }} aria-label={`${warningIgnored(service) ? 'Restore' : 'Ignore'} ${service.name} warning`}>
                      {warningIgnored(service) ? 'Restore warning' : 'Ignore'}
                    </button>
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
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Browse & Search</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {browseItems.length}/{browseCatalog.length} library items
          </div>
        </div>
        <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: mediaSolidElevatedBackground, marginBottom: '12px', display: 'grid', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : '160px minmax(280px, 1.4fr) auto auto', gap: '8px', alignItems: 'center' }}>
            <select aria-label="Browse request service" value={requestService} onChange={event => setRequestService(event.target.value)} style={{ background: mediaSolidPanelBackground, color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px' }}>
              {(requestServices.length ? requestServices : [{ id: 'overseerr', name: 'Overseerr', configured: true, healthy: false }]).map(service => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <input aria-label="Add media request search query" value={requestQuery} onChange={event => setRequestQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchRequests() }} placeholder="Search movies or shows to request" style={{ background: mediaSolidPanelBackground, color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 10px' }} />
            <button onClick={() => void searchRequests()} disabled={busy === 'request-search' || !requestQuery.trim()} style={{ ...miniButton('var(--text-on-accent)'), background: mediaActiveBackground, borderColor: 'var(--accent)', borderRadius: '8px', minHeight: '38px', justifyContent: 'center' }}>
              Search
            </button>
            <button onClick={() => void discoverRequests()} disabled={busy === 'request-discover'} style={{ ...miniButton('var(--accent)'), borderRadius: '8px', minHeight: '38px', justifyContent: 'center' }}>
              Load suggestions
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(['tv', 'movie'] as DiscoverKindFilter[]).map(kind => (
              <button key={`browse-kind-${kind}`} type="button" onClick={() => { setDiscoverKind(kind); void discoverRequests({ kind }) }} style={{ ...miniButton(discoverKind === kind ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '999px', padding: '6px 9px', background: discoverKind === kind ? 'linear-gradient(color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f)), color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)' : mediaSolidPanelBackground }}>
                {kind === 'tv' ? 'Shows' : 'Movies'}
              </button>
            ))}
            {(['popular', 'trending', 'upcoming'] as DiscoverCategoryFilter[]).map(category => (
              <button key={`browse-category-${category}`} type="button" onClick={() => { setDiscoverCategory(category); void discoverRequests({ category }) }} style={{ ...miniButton(discoverCategory === category ? 'var(--secondary)' : 'var(--text-secondary)'), borderRadius: '999px', padding: '6px 9px', background: discoverCategory === category ? 'linear-gradient(color-mix(in srgb, var(--secondary, #34d399) 12%, var(--bg-card-solid, #18181f)), color-mix(in srgb, var(--secondary, #34d399) 12%, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)' : mediaSolidPanelBackground }}>
                {category[0].toUpperCase()}{category.slice(1)}
              </button>
            ))}
            {discoverProviders.slice(0, 6).map(provider => (
              <button key={`browse-provider-${provider.id}`} type="button" onClick={() => { setDiscoverProvider(provider.id); void discoverRequests({ provider: provider.id }) }} style={{ ...miniButton(discoverProvider === provider.id ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: '999px', padding: '6px 9px', background: discoverProvider === provider.id ? 'linear-gradient(color-mix(in srgb, var(--accent, #a78bfa) 12%, var(--bg-card-solid, #18181f)), color-mix(in srgb, var(--accent, #a78bfa) 12%, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)' : mediaSolidPanelBackground }}>
                {provider.name}
              </button>
            ))}
            {discoverTotal !== null && (
              <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 850 }}>
                {discoverTotal} found
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'minmax(260px, 1.2fr) repeat(2, minmax(140px, 0.7fr))', gap: '8px', alignItems: 'center' }}>
            <input
              aria-label="Browse library search"
              value={browseQuery}
              onChange={event => setBrowseQuery(event.target.value)}
              placeholder="Search library"
              style={{ background: mediaSolidPanelBackground, color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 10px' }}
            />
            <select value={browseSource} onChange={event => setBrowseSource(event.target.value)} style={{ background: mediaSolidPanelBackground, color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px' }}>
              <option value="all">All services</option>
              {browseSourceOptions.map(service => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <select value={browseKind} onChange={event => setBrowseKind(event.target.value)} style={{ background: mediaSolidPanelBackground, color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px' }}>
              <option value="all">All types</option>
              {browseKindOptions.map(kind => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>
          </div>
        </div>
        {(requestResults.length > 0 || discoverResults.length > 0) && (
          <div style={{ display: 'grid', gap: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 950 }}>
                  {requestResults.length ? 'Search Results' : `${discoverCategory[0].toUpperCase()}${discoverCategory.slice(1)} ${discoverKind === 'tv' ? 'Shows' : 'Movies'}`}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                  {requestResults.length ? `${requestResults.length} matches from ${serviceMap.get(requestService)?.name ?? requestService}` : `${discoverProviders.find(provider => provider.id === discoverProvider)?.name ?? 'Network'} discovery shelf`}
                </div>
              </div>
              <span style={{ color: 'var(--accent)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', borderRadius: '999px', padding: '5px 8px', fontSize: '11px', fontWeight: 950 }}>
                {compactCount(requestResultSource.length)}
              </span>
            </div>
            {requestResultGroups.slice(0, 3).map(group => (
              <section key={`browse-request-group-${group.id}`} style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: group.tone, fontSize: '12px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{group.title}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 850 }}>{compactCount(group.rows.length)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px' }}>
                  {group.rows.slice(0, group.id === 'requestable' ? 12 : 6).map(item => {
                    const mediaType = requestMediaType(item, discoverKind)
                    const resultKey = requestResultKey(item)
                    const seasonNumbers = requestSeasonNumbers(item, mediaType)
                    const selectedSeasons = parseSeasonSelection(requestSeasonSelections[resultKey] ?? '')
                    return (
                      <RequestPosterTile
                        key={`browse-request-${group.id}-${item.id}-${resultTitle(item)}`}
                        item={item}
                        service={requestService}
                        fallbackType={mediaType}
                        selectedSeasons={selectedSeasons.length ? selectedSeasons : seasonNumbers}
                        onToggleSeason={seasonNumber => toggleRequestSeason(resultKey, seasonNumber)}
                        onSeasonInputChange={value => setRequestSeasonSelections(prev => ({ ...prev, [resultKey]: value }))}
                        onRequest={() => void createRequest(item)}
                        busy={busy === `request-create-${item.id}`}
                        compact={compactLayout}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '10px' }}>
          <button onClick={() => setBrowseNetwork('all')} style={{ ...miniButton(browseNetwork === 'all' ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '999px', padding: '6px 10px', background: browseNetwork === 'all' ? 'linear-gradient(color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f)), color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)' : mediaSolidPanelBackground }}>
            All networks
          </button>
          {browseNetworkStats.slice(0, 14).map(({ network, count }) => (
            <button key={network} onClick={() => setBrowseNetwork(network)} style={{ ...miniButton(browseNetwork === network ? 'var(--accent)' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '999px', padding: '6px 10px', background: browseNetwork === network ? 'linear-gradient(color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f)), color-mix(in srgb, var(--accent, #a78bfa) 14%, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)' : mediaSolidPanelBackground }}>
              {network} {count}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px', maxHeight: selectedDetail && !compactLayout ? 'calc(100vh - 260px)' : 'none', overflow: selectedDetail && !compactLayout ? 'auto' : 'visible', paddingRight: selectedDetail && !compactLayout ? '4px' : 0 }}>
          {visibleBrowseItems.map(item => {
            const ref = itemDetailRef(item)
            const selected = Boolean(ref && selectedDetail && selectedDetail.service === ref.service && selectedDetail.kind === ref.kind && String(selectedDetail.id) === String(ref.id))
            return (
              <LibraryPosterCard key={`${item.service}-${item.id}-${libraryTitle(item)}`} item={item} selected={selected} onOpen={() => void openDetail(ref, item as unknown as Record<string, unknown>)} />
            )
          })}
          {browseItems.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No media matches these filters</div>}
        </div>
        {browseItems.length > visibleBrowseItems.length && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => setBrowseVisibleCount(count => Math.min(count + browsePageSize, browseItems.length))}
              style={{ ...miniButton('var(--accent)'), minHeight: '38px', borderRadius: '8px', padding: '9px 13px', background: 'var(--bg-panel)' }}
            >
              Show {Math.min(browsePageSize, browseItems.length - visibleBrowseItems.length)} more
            </button>
          </div>
        )}
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
              {ignoredAttentionServices.length > 0 && (
                <>
                  <button onClick={() => setShowIgnoredWarnings(value => !value)} style={{ ...miniButton(showIgnoredWarnings ? '#ffb657' : 'var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px', background: showIgnoredWarnings ? 'rgba(255,182,87,0.12)' : 'rgba(255,255,255,0.035)' }}>
                    {showIgnoredWarnings ? 'Hide ignored' : `Show ignored ${ignoredAttentionServices.length}`}
                  </button>
                  <button onClick={restoreWarnings} style={{ ...miniButton('var(--text-secondary)'), flex: '0 0 auto', borderRadius: '7px', padding: '6px 8px' }}>
                    Restore all
                  </button>
                </>
              )}
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
                            {serviceNeedsAttention(service) && (
                              <>
                                {detectedServiceUrl(service) && (
                                  <button onClick={() => void saveDetectedUrl(service)} disabled={busy === `setup-url-${service.id}`} style={{ border: '1px solid var(--border)', background: 'transparent', color: '#ffb657', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: 'pointer' }}>
                                    Use detected URL
                                  </button>
                                )}
                                <button onClick={() => warningIgnored(service) ? restoreWarning(service) : ignoreWarning(service)} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '7px', padding: '5px 7px', fontSize: '11px', cursor: 'pointer' }} aria-label={`${warningIgnored(service) ? 'Restore' : 'Ignore'} ${service.name} warning`}>
                                  {warningIgnored(service) ? 'Restore warning' : 'Ignore'}
                                </button>
                              </>
                            )}
                          </div>
                        ) : serviceNeedsAttention(service) ? (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                            <a href={serviceSettingsUrl(service)} style={{ ...miniButton('#ffb657'), borderRadius: '7px', textDecoration: 'none' }}>
                              Setup
                            </a>
                            {detectedServiceUrl(service) && (
                              <button onClick={() => void saveDetectedUrl(service)} disabled={busy === `setup-url-${service.id}`} style={{ ...miniButton('#ffb657'), borderRadius: '7px' }}>
                                Use detected URL
                              </button>
                            )}
                            <button onClick={() => warningIgnored(service) ? restoreWarning(service) : ignoreWarning(service)} style={{ ...miniButton('var(--text-secondary)'), borderRadius: '7px' }} aria-label={`${warningIgnored(service) ? 'Restore' : 'Ignore'} ${service.name} warning`}>
                              {warningIgnored(service) ? 'Restore warning' : 'Ignore'}
                            </button>
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
      <section id="media-search" style={{ ...card, padding: compactLayout ? '14px' : '16px', marginBottom: '16px', borderRadius: compactLayout ? '24px' : '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MagnifyingGlass size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Search and request
            </span>
          </div>
          {message && <span style={{ fontSize: '12px', color: message.includes('failed') || message.includes('returned') ? 'var(--red)' : 'var(--secondary)' }}>{message}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : '160px minmax(0, 1fr) auto', gap: '8px', marginBottom: '12px' }}>
          <select aria-label="Add request service" value={requestService} onChange={event => setRequestService(event.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: compactLayout ? '14px' : '8px', padding: '10px' }}>
            {(requestServices.length ? requestServices : [{ id: 'overseerr', name: 'Overseerr', configured: true, healthy: false }]).map(service => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
          <input aria-label="Add media request search query" value={requestQuery} onChange={event => setRequestQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchRequests() }} placeholder="Search movie or show" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: compactLayout ? '14px' : '8px', padding: '10px 12px' }} />
          <button onClick={() => void searchRequests()} disabled={busy === 'request-search' || !requestQuery.trim()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: compactLayout ? '14px' : '8px', padding: '10px 14px', fontWeight: 800, cursor: requestQuery.trim() ? 'pointer' : 'not-allowed' }}>
            <MagnifyingGlass size={14} />
            Search
          </button>
        </div>
        <div style={{ display: 'grid', gap: '9px', marginBottom: requestResults.length || discoverResults.length ? '12px' : '10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(['tv', 'movie'] as DiscoverKindFilter[]).map(kind => (
            <button key={`add-kind-${kind}`} type="button" onClick={() => { setDiscoverKind(kind); void discoverRequests({ kind }) }} style={{ ...miniButton(discoverKind === kind ? 'var(--accent)' : 'var(--text-secondary)'), borderRadius: compactLayout ? '999px' : '7px', padding: '7px 10px', background: discoverKind === kind ? 'rgba(196,132,252,0.16)' : 'rgba(255,255,255,0.035)' }}>
              {kind === 'tv' ? 'Shows' : 'Movies'}
            </button>
          ))}
          {(['popular', 'trending', 'upcoming'] as DiscoverCategoryFilter[]).map(category => (
            <button key={`add-category-${category}`} type="button" onClick={() => { setDiscoverCategory(category); void discoverRequests({ category }) }} style={{ ...miniButton(discoverCategory === category ? '#9ee37d' : 'var(--text-secondary)'), borderRadius: compactLayout ? '999px' : '7px', padding: '7px 10px', background: discoverCategory === category ? 'rgba(158,227,125,0.14)' : 'rgba(255,255,255,0.035)' }}>
              {category[0].toUpperCase()}{category.slice(1)}
            </button>
          ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button type="button" onClick={() => { setDiscoverProvider('all'); void discoverRequests({ provider: 'all' }) }} style={{ ...miniButton(discoverProvider === 'all' ? '#93c5fd' : 'var(--text-secondary)'), borderRadius: compactLayout ? '999px' : '7px', padding: '7px 10px', background: discoverProvider === 'all' ? 'rgba(147,197,253,0.14)' : 'rgba(255,255,255,0.035)' }}>
              All networks
            </button>
            {discoverProviders.slice(0, 8).map(provider => (
              <button key={`add-provider-${provider.id}`} type="button" onClick={() => { setDiscoverProvider(provider.id); void discoverRequests({ provider: provider.id }) }} style={{ ...miniButton(discoverProvider === provider.id ? '#93c5fd' : 'var(--text-secondary)'), borderRadius: compactLayout ? '999px' : '7px', padding: '7px 10px', background: discoverProvider === provider.id ? 'rgba(147,197,253,0.14)' : 'rgba(255,255,255,0.035)' }}>
                {provider.name}
              </button>
            ))}
          {!compactLayout && (
            <button type="button" onClick={() => void discoverRequests()} disabled={busy === 'request-discover'} style={{ ...miniButton('var(--accent)'), borderRadius: '7px', padding: '7px 10px', background: 'rgba(196,132,252,0.16)' }}>
              Load suggestions
            </button>
          )}
          {discoverTotal !== null && (
            <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 800 }}>
              {discoverTotal} found
            </span>
          )}
          </div>
        </div>
        {requestResults.length === 0 && discoverResults.length === 0 && (
          compactLayout ? (
            <MobileEmptyState
              icon={<Plus size={34} />}
              title="Find something to add"
              body="Search like Overseerr, or load a streaming network to browse posters and request seasons."
              action={(
                <button onClick={() => void discoverRequests()} disabled={busy === 'request-discover'} style={{ ...miniButton('var(--accent)'), borderRadius: '999px', padding: '10px 14px', fontSize: '13px' }}>
                  Load suggestions
                </button>
              )}
            />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
              Search or load a provider to see requestable media.
            </div>
          )
        )}
        {(requestResults.length > 0 || discoverResults.length > 0) && (
          <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 950 }}>
                  {requestResults.length ? 'Search results' : `${discoverCategory[0].toUpperCase()}${discoverCategory.slice(1)} ${discoverKind === 'tv' ? 'shows' : 'movies'}`}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                  {requestResults.length ? `${requestResults.length} matches from ${serviceMap.get(requestService)?.name ?? requestService}` : `${discoverProvider === 'all' ? 'All networks' : discoverProviders.find(provider => provider.id === discoverProvider)?.name ?? 'Network'} discovery shelf`}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '18px' }}>
              {requestResultGroups.map(group => (
                <section key={`request-group-${group.id}`} style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: group.tone, fontSize: '13px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{group.title}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '3px' }}>{group.subtitle}</div>
                    </div>
                    <span style={{ color: group.tone, background: `${group.tone}14`, border: `1px solid ${group.tone}44`, borderRadius: '999px', padding: '5px 8px', fontSize: '11px', fontWeight: 950 }}>
                      {compactCount(group.rows.length)}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'repeat(auto-fill, minmax(178px, 1fr))', gap: '12px' }}>
                    {group.rows.slice(0, group.id === 'requestable' ? 18 : 8).map(item => {
                      const mediaType = requestMediaType(item, discoverKind)
                      const resultKey = requestResultKey(item)
                      const seasonNumbers = requestSeasonNumbers(item, mediaType)
                      const selectedSeasons = parseSeasonSelection(requestSeasonSelections[resultKey] ?? '')
                      return (
                        <RequestPosterTile
                          key={`add-request-${group.id}-${item.id}-${resultTitle(item)}`}
                          item={item}
                          service={requestService}
                          fallbackType={mediaType}
                          selectedSeasons={selectedSeasons.length ? selectedSeasons : seasonNumbers}
                          onToggleSeason={seasonNumber => toggleRequestSeason(resultKey, seasonNumber)}
                          onSeasonInputChange={value => setRequestSeasonSelections(prev => ({ ...prev, [resultKey]: value }))}
                          onRequest={() => void createRequest(item)}
                          busy={busy === `request-create-${item.id}`}
                          compact={compactLayout}
                        />
                      )
                    })}
                  </div>
                </section>
              ))}
              {requestResultGroups.length === 0 && requestResultSource.length > 0 && (
                <div style={{ ...solidMediaPanel, borderRadius: compactLayout ? '18px' : '8px', padding: '14px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Results returned, but no request status group matched.
                </div>
              )}
            </div>
          </div>
        )}
        <details style={{ marginTop: '14px' }}>
          <summary style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}>Advanced ARR search</summary>
          <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : '150px 1fr auto', gap: '8px', marginTop: '10px' }}>
            <select value={searchService} onChange={e => setSearchService(e.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
              {searchableServices.map(service => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <input aria-label="Media search query" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search() }} placeholder={canGrabResults ? 'Search releases across Prowlarr' : 'Search movie, series, or artist'} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }} />
            <button onClick={search} disabled={busy === 'search'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--bg-panel)', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>
              <MagnifyingGlass size={14} />
              Search
            </button>
          </div>
          {results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px', marginTop: '12px' }}>
              {results.slice(0, 12).map((item, index) => (
                <MediaResultCard
                  key={`${resultTitle(item)}-${index}`}
                  item={item}
                  service={searchService}
                  action={canGrabResults ? (
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
                >
                  {canGrabResults && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.4 }}>
                      {releaseMeta(item)}
                    </div>
                  )}
                </MediaResultCard>
              ))}
            </div>
          )}
        </details>
      </section>
      )}

      {activeView === 'calendar' && (
      <section id="media-calendar-view" style={{ ...card, padding: compactLayout ? '14px' : '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            <Calendar size={15} style={{ color: '#93c5fd' }} />
            Calendar
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 800 }}>{calendar.length} releases</div>
        </div>
        <div style={{ display: 'grid', gap: '18px' }}>
          {calendarGroups.map(([group, rows]) => (
            <section key={`calendar-group-${group}`} style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ color: group === 'Today' ? '#9ee37d' : '#93c5fd', fontSize: '13px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{group}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 850 }}>{rows.length} items</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {rows.map((item, index) => {
                  const date = item.airDateUtc ?? item.releaseDate ?? item.inCinemas ?? ''
                  const parts = calendarDateParts(date)
                  const record = item as unknown as Record<string, unknown>
                  const presentation = mediaPresentation(record, item.kind ?? item.service)
                  return (
                    <button key={`${calendarTitle(item)}-${index}`} onClick={() => void openDetail(itemDetailRef(item), item as unknown as Record<string, unknown>)} style={{ border: '1px solid var(--border)', borderRadius: compactLayout ? '22px' : '8px', background: 'var(--bg-panel)', color: 'var(--text-primary)', overflow: 'hidden', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                      <MediaPoster item={record} mode="backdrop" icon={serviceIcon(item.service)} service={item.service} />
                      <span style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: '10px', alignItems: 'stretch', padding: '10px 12px', ...solidMediaPanel, borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
                        <span aria-label={`Calendar date ${parts.exact}`} style={{ display: 'grid', alignContent: 'center', justifyItems: 'center', border: '1px solid rgba(147,197,253,0.34)', borderRadius: '8px', minHeight: '62px', background: 'rgba(147,197,253,0.1)' }}>
                          <span style={{ color: '#93c5fd', fontSize: '11px', fontWeight: 950, textTransform: 'uppercase' }}>{parts.month}</span>
                          <span style={{ color: 'var(--text-primary)', fontSize: '22px', lineHeight: 1, fontWeight: 950 }}>{parts.day}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 850 }}>{parts.weekday}</span>
                        </span>
                        <span style={{ minWidth: 0, display: 'grid', gap: '5px', alignContent: 'center' }}>
                          <span style={{ fontSize: '14px', lineHeight: 1.3, fontWeight: 950, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{presentation.displayTitle}</span>
                          <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {parts.label} · {parts.exact}{parts.time ? ` · ${parts.time}` : ''}
                          </span>
                          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px' }}>{serviceMap.get(item.service)?.name ?? item.service} · {presentation.meta || (item.kind ?? 'release')}</span>
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {calendar.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '22px', border: '1px solid var(--border)', borderRadius: compactLayout ? '18px' : '8px', background: 'var(--bg-elevated)', textAlign: 'center' }}>
              No upcoming releases
            </div>
          )}
        </div>
      </section>
      )}

      {activeView === 'downloads' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {compactLayout && (
          <section id="media-mobile-activity" style={{ display: 'grid', gap: '10px', gridColumn: '1 / -1' }}>
            {mobileActivityItems.length === 0 ? (
              <MobileEmptyState
                icon={<DownloadSimple size={34} />}
                title="No Activity"
                body="Your download queue is empty."
              />
            ) : (
              mobileActivityItems.map(item => (
                <div key={item.id} style={{ border: `1px solid ${item.tone}44`, borderRadius: '12px', background: 'var(--bg-elevated)', padding: '14px', display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr)', gap: '12px', alignItems: 'center', boxShadow: 'none' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '16px', display: 'grid', placeItems: 'center', color: item.tone, background: `${item.tone}18`, border: `1px solid ${item.tone}33` }}>
                    {item.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 950, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.meta}</div>
                    {item.progress !== null && item.progress > 0 && (
                      <div style={{ marginTop: '9px', height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${item.progress}%`, height: '100%', background: item.tone }} />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        )}
        {!compactLayout && (
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
        )}

        {!compactLayout && (
        <section id="media-calendar" style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            <Calendar size={14} />
            Calendar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflow: 'auto' }}>
            {calendar.slice(0, 16).map((item, index) => {
              const date = item.airDateUtc ?? item.releaseDate ?? item.inCinemas ?? ''
              return (
                <button key={`${calendarTitle(item)}-${index}`} onClick={() => void openDetail(itemDetailRef(item), item as unknown as Record<string, unknown>)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.35 }}>{calendarTitle(item)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatAirDate(date)}</span>
                </button>
              )
            })}
            {calendar.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No upcoming releases</div>}
          </div>
        </section>
        )}
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
          <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : '150px minmax(0, 1fr) auto', gap: '8px', marginBottom: '12px' }}>
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
            <div style={{ display: 'grid', gap: '9px', marginBottom: '12px' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 950 }}>
                Search results
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'repeat(auto-fill, minmax(178px, 1fr))', gap: '12px' }}>
              {requestResults.slice(0, 8).map(item => {
                const mediaType = requestMediaType(item)
                const resultKey = requestResultKey(item)
                const seasonNumbers = requestSeasonNumbers(item, mediaType)
                const selectedSeasons = parseSeasonSelection(requestSeasonSelections[resultKey] ?? '')
                return (
                  <RequestPosterTile
                    key={`${item.id}-${resultTitle(item)}`}
                    item={item}
                    service={requestService}
                    fallbackType={mediaType}
                    selectedSeasons={selectedSeasons.length ? selectedSeasons : seasonNumbers}
                    onToggleSeason={seasonNumber => toggleRequestSeason(resultKey, seasonNumber)}
                    onSeasonInputChange={value => setRequestSeasonSelections(prev => ({ ...prev, [resultKey]: value }))}
                    onRequest={() => void createRequest(item)}
                    busy={busy === `request-create-${item.id}`}
                    compact={compactLayout}
                  />
                )
              })}
              </div>
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
              <button key={`${item.service}-${item.id}-${index}`} onClick={() => void openDetail(itemDetailRef(item), item as unknown as Record<string, unknown>)} style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : 'minmax(220px, 1.4fr) minmax(150px, 1fr)', gap: '8px', marginBottom: '10px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>
          {visibleLibrary.slice(0, 72).map(item => {
            const ref = itemDetailRef(item)
            const selected = Boolean(ref && selectedDetail && selectedDetail.service === ref.service && selectedDetail.kind === ref.kind && String(selectedDetail.id) === String(ref.id))
            return (
              <LibraryPosterCard key={`${item.service}-${item.id}-${libraryTitle(item)}`} item={item} selected={selected} onOpen={() => void openDetail(ref, item as unknown as Record<string, unknown>)} />
            )
          })}
          {library.length === 0 && (compactLayout ? (
            <MobileEmptyState
              icon={<Television size={34} />}
              title="No media in library"
              body="Add some movies, shows, or artists to get started."
              action={(
                <button onClick={() => setActiveView('browse')} style={{ ...miniButton('var(--accent)'), borderRadius: '999px', padding: '10px 14px', fontSize: '13px' }}>
                  Add media
                </button>
              )}
            />
          ) : <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No library items reported</div>)}
          {library.length > 0 && visibleLibrary.length === 0 && (compactLayout ? (
            <MobileEmptyState
              icon={<MagnifyingGlass size={34} />}
              title="No matches"
              body="Nothing in your library matches this search or filter."
              action={(
                <button onClick={() => { setLibraryQuery(''); setLibrarySourceFilter('all'); setLibraryMonitorFilter('all') }} style={{ ...miniButton('var(--accent)'), borderRadius: '999px', padding: '10px 14px', fontSize: '13px' }}>
                  Clear filters
                </button>
              )}
            />
          ) : <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No library items match these filters</div>)}
        </div>
      </section>
      )}
      {selectedDetail && (
        <div role="dialog" aria-label="Media detail" style={{ position: 'fixed', top: compactLayout ? '18px' : '82px', right: compactLayout ? '18px' : '28px', bottom: compactLayout ? '18px' : '24px', width: compactLayout ? 'min(420px, calc(100vw - 36px))' : '400px', zIndex: 60, ...solidMediaPanel, borderRadius: '8px', padding: '14px', display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: '12px', boxShadow: '0 24px 90px rgba(0,0,0,0.52)', borderColor: 'rgba(167,139,250,0.32)' }}>
          {(() => {
            const detailRecord = selectedDetail.item
            const detailPresentation = mediaPresentation(detailRecord, selectedDetail.kind)
            const detailTitle = String(selectedDetail.title ?? detailPresentation.displayTitle ?? selectedDetail.item.title ?? selectedDetail.item.name ?? selectedDetail.item.artistName ?? selectedDetail.item.fullTitle ?? selectedDetail.id)
            const detailMeta = [
              selectedDetail.subtitle,
              selectedDetail.year ?? selectedDetail.item.year ?? detailPresentation.year,
              selectedDetail.item.network,
              selectedDetail.item.studio,
              detailPresentation.exactDate,
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
              <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
                {detailMeta || (detailLoading ? 'Loading detail...' : 'Detail')}
              </div>
            </div>
            <button aria-label="Close media detail" onClick={() => setSelectedDetail(null)} style={{ ...glassButton, color: 'var(--text-primary)', width: '32px', height: '32px', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              <X size={16} weight="bold" />
            </button>
          </div>
          <div style={{ minHeight: 0, overflow: 'auto', display: 'grid', gap: '10px', alignContent: 'start' }}>
      <MediaPoster item={detailRecord} mode="backdrop" icon={serviceIcon(selectedDetail.service)} service={selectedDetail.service} priority />
            <div style={{ ...solidMediaPanel, borderRadius: '8px', padding: '10px 12px', display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                ['Poster', detailPresentation.posterUrl],
                ['Backdrop', detailPresentation.backdropUrl || detailPresentation.bannerUrl],
                ['Logo', detailPresentation.logoUrl],
                ['Overview', detailPresentation.overview],
              ].map(([label, value]) => {
                const present = Boolean(value)
                return (
                  <span key={label} style={{ color: present ? 'var(--accent)' : 'var(--text-muted)', background: present ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-panel))' : 'var(--bg-panel)', border: `1px solid ${present ? 'color-mix(in srgb, var(--accent) 35%, var(--border))' : 'var(--border)'}`, borderRadius: '999px', padding: '5px 8px', fontSize: '10px', fontWeight: 900 }}>
                    {label} {present ? 'ready' : 'missing'}
                  </span>
                )
              })}
            </div>
            {Boolean(detailPresentation.overview) && (
              <div style={{ ...solidMediaPanel, borderRadius: '8px', padding: '11px 12px', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.5 }}>
                {detailPresentation.overview}
              </div>
            )}
            {(detailPresentation.sourceTitle || detailPresentation.fileName || detailPresentation.path) && (
              <div style={{ ...solidMediaPanel, borderRadius: '8px', padding: '11px 12px', display: 'grid', gap: '8px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 900 }}>Source and file</div>
                {[
                  ['Source', detailPresentation.sourceTitle],
                  ['File', detailPresentation.fileName],
                  ['Path', detailPresentation.path],
                ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                  <div key={label} style={{ display: 'grid', gap: '3px', minWidth: 0 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 850 }}>{label}</span>
                    <span style={{ color: 'var(--text-primary)', fontSize: '12px', lineHeight: 1.35, wordBreak: 'break-word', fontFamily: label === 'Path' ? 'monospace' : undefined }}>{value}</span>
                  </div>
                ))}
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
      {compactLayout && (
        <nav aria-label="Media mobile tabs" style={{ position: 'fixed', left: 'max(14px, env(safe-area-inset-left))', width: 'calc(100vw - 28px)', maxWidth: '365px', boxSizing: 'border-box', bottom: 'max(14px, env(safe-area-inset-bottom))', zIndex: 70, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px', padding: '7px', border: '1px solid var(--border)', borderRadius: '999px', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-md, 0 12px 32px rgba(0,0,0,0.22))' }}>
          {mobileNavItems.map(item => {
            const active = activeView === item.id || (item.id === 'overview' && activeView === 'browse')
            return (
              <button
                key={`mobile-nav-${item.id}`}
                onClick={() => setActiveView(item.id)}
                aria-label={item.id === 'downloads' ? 'Activities' : item.label}
                aria-current={active ? 'page' : undefined}
                style={{
                  minWidth: 0,
                  minHeight: '58px',
                  border: active ? '1px solid rgba(196,132,252,0.2)' : '1px solid transparent',
                  background: active ? 'rgba(196,132,252,0.18)' : 'transparent',
                  color: active ? '#c9a4ff' : 'var(--text-primary)',
                  borderRadius: '999px',
                  display: 'grid',
                  justifyItems: 'center',
                  alignContent: 'center',
                  gap: '3px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 850,
                }}
              >
                {item.icon}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
