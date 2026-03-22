import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'

const MEDIA_KEY = ['media'] as const

interface NowPlaying {
  title: string
  type: string
  user: string
  progress: number | null
}

interface RecentlyAdded {
  title: string
  type: string
  year?: number
}

interface Upcoming {
  title: string
  air_date: string
}

interface MediaData {
  now_playing: NowPlaying | null
  recently_added: RecentlyAdded[]
  upcoming: Upcoming[]
}

const DEMO_MEDIA: MediaData = {
  now_playing: {
    title: 'Severance',
    type: 'Episode',
    user: 'Josue',
    progress: 42,
  },
  recently_added: [
    { title: 'Dune: Part Two', type: 'Movie', year: 2024 },
    { title: 'The Bear S3', type: 'Show', year: 2025 },
    { title: 'Oppenheimer', type: 'Movie', year: 2023 },
  ],
  upcoming: [
    { title: 'Severance S2E08', air_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
    { title: 'The Last of Us S2E04', air_date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10) },
    { title: 'Andor S2E01', air_date: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10) },
    { title: 'White Lotus S3E06', air_date: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10) },
    { title: 'Stranger Things S5E01', air_date: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10) },
  ],
}

export function useMediaWidget() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<MediaData>({
    queryKey: MEDIA_KEY,
    queryFn: () => api.get<MediaData>('/api/media'),
    refetchInterval: 30_000,
    enabled: !_demo,
  })

  const mediaData = _demo ? DEMO_MEDIA : data

  return {
    nowPlaying: mediaData?.now_playing ?? null,
    recentlyAdded: mediaData?.recently_added ?? [],
    upcoming: mediaData?.upcoming ?? [],
    mounted: _demo || isSuccess,
  }
}
