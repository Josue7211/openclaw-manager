import { useMemo } from 'react'

import { useTauriQuery } from '@/hooks/useTauriQuery'
import type {
  CalendarItem,
  DownloadItem,
  HistoryItem,
  IndexerItem,
  MediaData,
  MediaDetection,
  MediaService,
  MediaView,
  QueueItem,
  RequestItem,
  StreamItem,
  SubtitleItem,
  WantedItem,
} from './domain'

interface ServicesResponse {
  services?: MediaService[]
  detections?: MediaDetection[]
  capabilities?: MediaData['capabilities']
}

interface QueueResponse {
  queue?: QueueItem[]
}

interface CalendarResponse {
  calendar?: CalendarItem[]
}

interface LibraryResponse {
  library?: MediaData['library']
}

interface WantedResponse {
  wanted?: WantedItem[]
}

interface HistoryResponse {
  history?: HistoryItem[]
}

interface IndexersResponse {
  indexers?: IndexerItem[]
  health?: MediaData['indexer_health']
  indexer_health?: MediaData['indexer_health']
}

interface RequestsResponse {
  requests?: RequestItem[]
}

interface StreamsResponse {
  streams?: StreamItem[]
}

interface SubtitlesResponse {
  subtitles?: SubtitleItem[]
}

interface DownloadsResponse {
  downloads?: DownloadItem[]
}

const EMPTY_MEDIA_DATA: MediaData = {
  now_playing: null,
  recently_added: [],
  upcoming: [],
  services: [],
  detections: [],
  queue: [],
  streams: [],
  downloads: [],
  requests: [],
  library: [],
  browse: [],
  calendar: [],
  wanted: [],
  history: [],
  indexers: [],
  indexer_health: [],
  subtitles: [],
  mock: false,
}

function shouldLoadActivity(activeView: MediaView): boolean {
  return ['overview', 'downloads', 'requests'].includes(activeView)
}

function shouldLoadOverview(activeView: MediaView): boolean {
  return activeView === 'overview'
}

function shouldLoadLibrary(activeView: MediaView): boolean {
  return ['overview', 'browse', 'library'].includes(activeView)
}

function shouldLoadCalendar(activeView: MediaView): boolean {
  return ['overview', 'calendar'].includes(activeView)
}

function shouldLoadOperations(activeView: MediaView): boolean {
  return ['overview', 'missing', 'indexers', 'setup'].includes(activeView)
}

export function useMediaCommandData(activeView: MediaView, demo: boolean) {
  const overview = useTauriQuery<MediaData>(
    ['media', 'overview'],
    '/api/media/overview',
    { enabled: !demo && shouldLoadOverview(activeView), refetchInterval: !demo && shouldLoadOverview(activeView) ? 30_000 : false },
  )
  const services = useTauriQuery<ServicesResponse>(
    ['media', 'services'],
    '/api/media/services',
    { enabled: !demo, staleTime: 30_000 },
  )
  const queue = useTauriQuery<QueueResponse>(
    ['media', 'queue'],
    '/api/media/queue',
    { enabled: !demo && shouldLoadActivity(activeView), refetchInterval: activeView === 'downloads' ? 12_000 : false },
  )
  const streams = useTauriQuery<StreamsResponse>(
    ['media', 'streams'],
    '/api/media/streams',
    { enabled: !demo && shouldLoadActivity(activeView), refetchInterval: activeView === 'overview' || activeView === 'downloads' ? 15_000 : false },
  )
  const downloads = useTauriQuery<DownloadsResponse>(
    ['media', 'downloads'],
    '/api/media/downloads',
    { enabled: !demo && shouldLoadActivity(activeView), refetchInterval: activeView === 'downloads' ? 12_000 : false },
  )
  const requests = useTauriQuery<RequestsResponse>(
    ['media', 'requests'],
    '/api/media/requests',
    { enabled: !demo && shouldLoadActivity(activeView), refetchInterval: activeView === 'requests' ? 30_000 : false },
  )
  const library = useTauriQuery<LibraryResponse>(
    ['media', 'library'],
    '/api/media/library',
    { enabled: !demo && shouldLoadLibrary(activeView), staleTime: 60_000 },
  )
  const calendar = useTauriQuery<CalendarResponse>(
    ['media', 'calendar'],
    '/api/media/calendar',
    { enabled: !demo && shouldLoadCalendar(activeView), staleTime: 60_000 },
  )
  const wanted = useTauriQuery<WantedResponse>(
    ['media', 'wanted'],
    '/api/media/wanted',
    { enabled: !demo && shouldLoadOperations(activeView), staleTime: 45_000 },
  )
  const history = useTauriQuery<HistoryResponse>(
    ['media', 'history'],
    '/api/media/history',
    { enabled: !demo && shouldLoadOperations(activeView), staleTime: 45_000 },
  )
  const indexers = useTauriQuery<IndexersResponse>(
    ['media', 'indexers'],
    '/api/media/indexers',
    { enabled: !demo && shouldLoadOperations(activeView), staleTime: 45_000 },
  )
  const subtitles = useTauriQuery<SubtitlesResponse>(
    ['media', 'subtitles'],
    '/api/media/subtitles',
    { enabled: !demo && shouldLoadOperations(activeView), staleTime: 45_000 },
  )

  const data = useMemo<MediaData | undefined>(() => {
    const base = overview.data ?? EMPTY_MEDIA_DATA
    const merged: MediaData = {
      ...(base ?? {}),
      now_playing: base?.now_playing ?? null,
      recently_added: base?.recently_added ?? [],
      upcoming: base?.upcoming ?? [],
      services: services.data?.services ?? base?.services ?? [],
      detections: services.data?.detections ?? base?.detections ?? [],
      capabilities: services.data?.capabilities ?? base?.capabilities,
      queue: queue.data?.queue ?? base?.queue ?? [],
      streams: streams.data?.streams ?? base?.streams ?? [],
      downloads: downloads.data?.downloads ?? base?.downloads ?? [],
      requests: requests.data?.requests ?? base?.requests ?? [],
      library: library.data?.library ?? base?.library ?? [],
      browse: base?.browse?.length ? base.browse : library.data?.library ?? [],
      calendar: calendar.data?.calendar ?? base?.calendar ?? [],
      wanted: wanted.data?.wanted ?? base?.wanted ?? [],
      history: history.data?.history ?? base?.history ?? [],
      indexers: indexers.data?.indexers ?? base?.indexers ?? [],
      indexer_health: indexers.data?.health ?? indexers.data?.indexer_health ?? base?.indexer_health ?? [],
      subtitles: subtitles.data?.subtitles ?? base?.subtitles ?? [],
      mock: base?.mock ?? false,
    }
    return merged
  }, [
    calendar.data,
    downloads.data,
    history.data,
    indexers.data,
    library.data,
    overview.data,
    queue.data,
    requests.data,
    services.data,
    streams.data,
    subtitles.data,
    wanted.data,
  ])

  const queries = [overview, services, queue, streams, downloads, requests, library, calendar, wanted, history, indexers, subtitles]

  return {
    data,
    isLoading: false,
    isFetching: queries.some(query => query.isFetching),
    refetch: async () => {
      const uniqueRefetches = Array.from(new Set(queries.map(query => query.refetch)))
      await Promise.all(uniqueRefetches.map(refetch => refetch()))
    },
  }
}
