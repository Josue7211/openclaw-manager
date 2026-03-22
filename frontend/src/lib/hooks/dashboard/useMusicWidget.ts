import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface KoelNowPlaying {
  song_id: string
  song_title: string
  artist_name: string
  album_art: string | null
  album_art_proxy: string | null
  started_at: string
}

interface KoelHealth {
  status: 'ok' | 'not_configured' | 'unreachable' | 'error'
  host?: string
}

export function useMusicWidget() {
  const { data: nowPlaying, isLoading } = useQuery({
    queryKey: ['koel', 'now-playing'],
    queryFn: () => api.get<{ data: KoelNowPlaying | null }>('/api/koel/now-playing').then(r => r.data),
    refetchInterval: 10_000,
    retry: false,
  })

  const { data: health } = useQuery({
    queryKey: ['koel', 'health'],
    queryFn: () => api.get<KoelHealth>('/api/koel/health'),
    refetchInterval: 60_000,
    retry: false,
  })

  const playSong = useMutation({
    mutationFn: (songId: string) => api.post<{ url: string }>(`/api/koel/play/${songId}`),
    onSuccess: (data) => { window.open(data.url, '_blank') },
  })

  return {
    nowPlaying: nowPlaying ?? null,
    isLoading,
    isConfigured: health?.status !== 'not_configured',
    isOnline: health?.status === 'ok',
    health,
    playSong,
  }
}
