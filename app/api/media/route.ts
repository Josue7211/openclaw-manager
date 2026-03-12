import { NextResponse } from 'next/server'

const PLEX_URL = process.env.PLEX_URL ?? 'http://10.0.0.SERVICES:32400'
const PLEX_TOKEN = process.env.PLEX_TOKEN ?? ''
const SONARR_URL = process.env.SONARR_URL ?? 'http://10.0.0.SERVICES:8989'
const SONARR_API_KEY = process.env.SONARR_API_KEY ?? ''
const RADARR_URL = process.env.RADARR_URL ?? 'http://10.0.0.SERVICES:7878'
const RADARR_API_KEY = process.env.RADARR_API_KEY ?? ''

const MOCK_DATA = {
  now_playing: null,
  recently_added: [
    { title: 'Breaking Bad', type: 'show', year: 2008 },
    { title: 'Inception', type: 'movie', year: 2010 },
  ],
  upcoming: [
    { title: 'House of Dragon S2E5', air_date: '2026-03-10' },
    { title: 'Severance S2E8', air_date: '2026-03-12' },
  ],
}

interface PlexSession {
  title?: string
  grandparentTitle?: string
  type?: string
  User?: { title?: string }
  Player?: { state?: string }
  ViewOffset?: number
  duration?: number
}

interface SonarrEpisode {
  series?: { title?: string }
  title?: string
  airDateUtc?: string
  seasonNumber?: number
  episodeNumber?: number
}

interface RadarrMovie {
  title?: string
  year?: number
  dateAdded?: string
  hasFile?: boolean
}

interface SonarrSeries {
  title?: string
  year?: number
  added?: string
}

async function plexFetch(path: string) {
  const url = new URL(`${PLEX_URL}${path}`)
  url.searchParams.set('X-Plex-Token', PLEX_TOKEN)
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Plex ${path} → ${res.status}`)
  return res.json()
}

async function sonarrFetch(path: string) {
  const res = await fetch(`${SONARR_URL}/api/v3${path}`, {
    headers: { 'X-Api-Key': SONARR_API_KEY },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Sonarr ${path} → ${res.status}`)
  return res.json()
}

async function radarrFetch(path: string) {
  const res = await fetch(`${RADARR_URL}/api/v3${path}`, {
    headers: { 'X-Api-Key': RADARR_API_KEY },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Radarr ${path} → ${res.status}`)
  return res.json()
}

export async function GET() {
  const configured = PLEX_TOKEN || SONARR_API_KEY || RADARR_API_KEY

  if (!configured) {
    return NextResponse.json({ ...MOCK_DATA, mock: true })
  }

  try {
    const results = await Promise.allSettled([
      PLEX_TOKEN ? plexFetch('/status/sessions') : Promise.resolve(null),
      PLEX_TOKEN ? plexFetch('/library/recentlyAdded?X-Plex-Container-Size=10') : Promise.resolve(null),
      SONARR_API_KEY
        ? sonarrFetch(`/calendar?start=${new Date().toISOString().split('T')[0]}&end=${new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]}`)
        : Promise.resolve(null),
      SONARR_API_KEY ? sonarrFetch('/series?sortKey=added&sortDirection=desc&pageSize=5') : Promise.resolve(null),
      RADARR_API_KEY ? radarrFetch('/movie?sortKey=added&sortDirection=desc&pageSize=5') : Promise.resolve(null),
    ])

    // Now playing
    let now_playing = null
    if (results[0].status === 'fulfilled' && results[0].value) {
      const sessions: PlexSession[] = results[0].value?.MediaContainer?.Metadata ?? []
      if (sessions.length > 0) {
        const s = sessions[0]
        const progress =
          s.ViewOffset && s.duration
            ? Math.round((s.ViewOffset / s.duration) * 100)
            : null
        now_playing = {
          title: s.grandparentTitle ? `${s.grandparentTitle}: ${s.title}` : s.title,
          type: s.type,
          user: s.User?.title ?? 'Unknown',
          progress,
        }
      }
    }

    // Recently added — merge Plex library + Sonarr series + Radarr movies
    const recently_added: { title: string; type: string; year?: number }[] = []

    if (results[1].status === 'fulfilled' && results[1].value) {
      const items = results[1].value?.MediaContainer?.Metadata ?? []
      for (const item of items.slice(0, 5)) {
        recently_added.push({ title: item.title, type: item.type === 'movie' ? 'movie' : 'show', year: item.year })
      }
    }

    if (results[3].status === 'fulfilled' && results[3].value && recently_added.length < 5) {
      const series: SonarrSeries[] = results[3].value ?? []
      for (const s of series.slice(0, 3)) {
        if (!recently_added.find(r => r.title === s.title)) {
          recently_added.push({ title: s.title ?? 'Unknown', type: 'show', year: s.year })
        }
      }
    }

    if (results[4].status === 'fulfilled' && results[4].value && recently_added.length < 8) {
      const movies: RadarrMovie[] = results[4].value ?? []
      for (const m of movies.filter(x => x.hasFile).slice(0, 3)) {
        if (!recently_added.find(r => r.title === m.title)) {
          recently_added.push({ title: m.title ?? 'Unknown', type: 'movie', year: m.year })
        }
      }
    }

    // Upcoming episodes from Sonarr calendar
    const upcoming: { title: string; air_date: string }[] = []
    if (results[2].status === 'fulfilled' && results[2].value) {
      const episodes: SonarrEpisode[] = results[2].value ?? []
      for (const ep of episodes.slice(0, 6)) {
        const showTitle = ep.series?.title ?? 'Unknown'
        const label = `${showTitle} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
        upcoming.push({ title: label, air_date: (ep.airDateUtc ?? '').split('T')[0] })
      }
    }

    return NextResponse.json({
      now_playing,
      recently_added: recently_added.length > 0 ? recently_added : MOCK_DATA.recently_added,
      upcoming: upcoming.length > 0 ? upcoming : MOCK_DATA.upcoming,
      mock: false,
    })
  } catch {
    return NextResponse.json({ ...MOCK_DATA, mock: true })
  }
}
