import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import MediaRadar from '../MediaRadar'
import { api } from '@/lib/api'

vi.setConfig({ testTimeout: 60_000 })

const refetch = vi.fn()

const clickButtonText = (text: string) => {
  const button = screen.getAllByText(text).map(element => element.closest('button')).find(Boolean)
  expect(button).not.toBeNull()
  fireEvent.click(button as HTMLButtonElement)
}

const services = Array.from({ length: 21 }, (_, index) => ({
  id: index === 0 ? 'plex' : index === 1 ? 'sonarr' : index === 2 ? 'radarr' : index === 3 ? 'qbittorrent' : index === 4 ? 'bazarr' : index === 5 ? 'prowlarr' : index === 6 ? 'overseerr' : index === 7 ? 'grafana' : index === 8 ? 'flaresolverr' : index === 9 ? 'kometa' : index === 10 ? 'sabnzbd' : `svc-${index}`,
  name: index === 0 ? 'Plex' : index === 1 ? 'Sonarr' : index === 2 ? 'Radarr' : index === 3 ? 'qBittorrent' : index === 4 ? 'Bazarr' : index === 5 ? 'Prowlarr' : index === 6 ? 'Overseerr' : index === 7 ? 'Grafana' : index === 8 ? 'FlareSolverr' : index === 9 ? 'Kometa' : index === 10 ? 'SABnzbd' : `Service ${index}`,
  configured: ![8, 9].includes(index),
  healthy: index < 3,
  detected: [8, 9].includes(index),
  state: index < 3 ? 'online' : index === 8 ? 'detected_unpublished_port' : index === 9 ? 'detected_missing_credentials' : 'configured',
  missing_credentials: index === 8 ? ['FLARESOLVERR_URL'] : index === 9 ? ['KOMETA_URL'] : [],
  credential_keys: index === 8 ? ['flaresolverr.url'] : index === 9 ? ['kometa.url', 'kometa.api-key'] : [],
  default_port: index === 8 ? 8191 : null,
  group: index < 3 ? 'arr' : [3, 10].includes(index) ? 'downloads' : index === 4 ? 'subtitles' : index === 5 ? 'indexers' : index === 6 ? 'requests' : index === 7 ? 'monitoring' : 'server',
}))

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => false,
}))

vi.mock('@/hooks/useTauriQuery', () => ({
  useTauriQuery: () => ({
    data: {
      now_playing: null,
      services,
      recently_added: [
        {
          title: 'Forgetting Sarah Marshall',
          type: 'movie',
          service: 'plex',
          kind: 'movie',
          id: '18349',
          detail_ref: { service: 'plex', kind: 'movie', id: '18349' },
          year: 2008,
        },
      ],
      upcoming: [
        {
          title: "FROM S04E05: What a Long Strange Trip It's Been",
          air_date: '2026-05-18',
          service: 'sonarr',
          kind: 'episode',
          id: '2327',
          detail_ref: { service: 'sonarr', kind: 'episode', id: '2327' },
        },
      ],
      browse: [
        {
          service: 'sonarr',
          kind: 'series',
          id: 42,
          title: 'Severance',
          network: 'Apple TV+',
          monitored: true,
          detail_ref: { service: 'sonarr', kind: 'series', id: 42 },
        },
        {
          service: 'radarr',
          kind: 'movie',
          id: 77,
          title: 'Anomalisa',
          studio: 'Paramount Pictures',
          year: 2015,
          monitored: false,
          detail_ref: { service: 'radarr', kind: 'movie', id: 77 },
        },
      ],
      library: [
        {
          service: 'sonarr',
          kind: 'series',
          id: 42,
          title: 'Severance',
          network: 'Apple TV+',
          monitored: true,
          detail_ref: { service: 'sonarr', kind: 'series', id: 42 },
        },
        {
          service: 'radarr',
          kind: 'movie',
          id: 77,
          title: 'Anomalisa',
          studio: 'Paramount Pictures',
          year: 2015,
          monitored: false,
          detail_ref: { service: 'radarr', kind: 'movie', id: 77 },
        },
      ],
      queue: [
        {
          service: 'sonarr',
          serviceName: 'Sonarr',
          id: 1350935086,
          title: 'Georgie.and.Mandys.First.Marriage.S02E20.1080p.WEB-DL.H264-iND',
          status: 'completed',
          trackedDownloadStatus: 'warning',
          timeleft: '00:00:00',
        },
      ],
      calendar: [],
      wanted: [],
      history: [],
      indexers: [
        {
          service: 'prowlarr',
          serviceName: 'Prowlarr',
          id: 9,
          name: '1337x',
          enable: false,
          protocol: 'torrent',
          priority: 25,
        },
        {
          service: 'prowlarr',
          serviceName: 'Prowlarr',
          id: 10,
          name: 'NZBGeek',
          enable: true,
          protocol: 'usenet',
          priority: 10,
        },
      ],
      indexer_health: [
        {
          service: 'prowlarr',
          serviceName: 'Prowlarr',
          source: 'IndexerNoDefinitionCheck',
          type: 'error',
          message: 'Indexers have no definition and will not work: BitSearch.',
        },
      ],
      requests: [
        {
          service: 'overseerr',
          serviceName: 'Overseerr',
          id: 501,
          status: 1,
          media: { title: 'Pending Movie', mediaType: 'movie', status: 1 },
          requestedBy: { displayName: 'alejandro' },
        },
        {
          service: 'overseerr',
          serviceName: 'Overseerr',
          id: 502,
          status: 4,
          media: { title: 'Available Movie', mediaType: 'movie', status: 5 },
          requestedBy: { displayName: 'alejandro' },
        },
        {
          service: 'overseerr',
          serviceName: 'Overseerr',
          id: 503,
          status: 5,
          media: { title: 'Partial Show', mediaType: 'tv', status: 4 },
          requestedBy: { displayName: 'alejandro' },
        },
      ],
      streams: [
        {
          service: 'tautulli',
          serviceName: 'Tautulli',
          full_title: 'Severance - Cold Harbor',
          username: 'alejandro',
          friendly_name: 'Apple TV',
          transcode_decision: 'direct play',
          progress: 42,
        },
      ],
      downloads: [
        {
          service: 'qbittorrent',
          name: 'Succession S03E03 The Disruption',
          hash: 'abc123',
          state: 'stalledUP',
          progress: 1,
          category: 'tv-sonarr',
          tags: '',
        },
        {
          service: 'sabnzbd',
          nzo_id: 'SAB-1',
          filename: 'Foundation S02E04',
          status: 'Downloading',
          percentage: 44,
          mb: '1200',
        },
      ],
      subtitles: [
        {
          service: 'bazarr',
          title: 'Anomalisa',
          radarrId: 9,
          missing_subtitles: ['Spanish (Latino)'],
          missing_subtitle_details: [{ code2: 'ea', forced: false, hi: false, name: 'Spanish (Latino)' }],
        },
        {
          service: 'bazarr',
          title: 'Severance S02E09 Cold Harbor',
          sonarrSeriesId: 42,
          sonarrEpisodeId: 100,
          missing_subtitles: ['English'],
          missing_subtitle_details: [{ code2: 'en', forced: false, hi: false, name: 'English' }],
        },
      ],
      detections: [],
      capabilities: {},
    },
    isLoading: false,
    isFetching: false,
    refetch,
  }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}))

describe('Media Command Center', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockImplementation(path => {
      if (String(path).includes('/api/media/requests/discover')) {
        return Promise.resolve({
          service: 'overseerr',
          kind: 'tv',
          category: 'popular',
          provider: '350',
          providers: [
            { id: '350', name: 'Apple TV+' },
            { id: '8', name: 'Netflix' },
          ],
          totalResults: 215,
          results: [
            {
              id: 202411,
              name: 'Monarch: Legacy of Monsters',
              mediaType: 'tv',
              firstAirDate: '2023-11-17',
              mediaInfo: {
                seasons: [
                  { seasonNumber: 1 },
                  { seasonNumber: 2 },
                ],
              },
            },
          ],
        })
      }
      if (String(path).includes('/api/media/requests/search')) {
        return Promise.resolve({
          service: 'overseerr',
          results: [
            {
              id: 95396,
              name: 'Severance',
              mediaType: 'tv',
              firstAirDate: '2022-02-17',
              mediaInfo: {
                seasons: [
                  { seasonNumber: 0 },
                  { seasonNumber: 1 },
                  { seasonNumber: 2 },
                  { seasonNumber: 3 },
                ],
              },
            },
          ],
        })
      }
      if (String(path).includes('/api/media/detail/sonarr/')) {
        return Promise.resolve({
          service: 'sonarr',
          kind: 'series',
          id: 42,
          title: 'Severance',
          year: 2022,
          monitored: true,
          item: { title: 'Severance', year: 2022, network: 'Apple TV+', monitored: true },
          queue: [{ service: 'sonarr', id: 99, title: 'Severance S02E01', status: 'downloading' }],
          wanted: [{ service: 'sonarr', id: 100, series: { title: 'Severance' }, episode: { title: 'Cold Harbor', seasonNumber: 2, episodeNumber: 9 } }],
          history: [{ service: 'sonarr', id: 101, sourceTitle: 'Severance.S02E01.1080p', eventType: 'grabbed' }],
          actions: ['refresh', 'search', 'monitor', 'delete'],
        })
      }
      return Promise.resolve({
        service: 'plex',
        kind: 'movie',
        id: '18349',
        title: 'Forgetting Sarah Marshall',
        year: 2008,
        item: { title: 'Forgetting Sarah Marshall', year: 2008 },
        actions: ['view'],
      })
    })
  })

  it('keeps the sidebar service list scrollable and opens setup from more services', () => {
    render(<MediaRadar />)

    const servicesHeader = screen.getByText('Services')
    expect(servicesHeader.parentElement).toHaveStyle({ overflow: 'auto' })

    fireEvent.click(screen.getByRole('button', { name: /\+3 more services/i }))

    expect(screen.getByText('Service directory')).toBeInTheDocument()
  })

  it('groups setup services into Helmarr-style sections', () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('button', { name: /\+3 more services/i }))
    fireEvent.click(screen.getByRole('button', { name: /All 21/i }))

    for (const group of ['Core ARR', 'Requests', 'Downloads', 'Indexers', 'Subtitles', 'Homelab']) {
      expect(screen.getAllByText(group).length).toBeGreaterThan(0)
    }
  })

  it('does not label unpublished detected services as missing credentials', () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('button', { name: /\+3 more services/i }))

    const credentialsSection = screen.getByText('Detected, needs credentials').closest('section')
    expect(credentialsSection).not.toBeNull()
    expect(within(credentialsSection as HTMLElement).getByText('Kometa')).toBeInTheDocument()
    expect(within(credentialsSection as HTMLElement).queryByText('FlareSolverr')).not.toBeInTheDocument()
    expect(screen.getAllByText(/unpublished port/i).length).toBeGreaterThan(0)
  })

  it('links setup-needed services to exact Settings credentials', () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('button', { name: /\+3 more services/i }))

    const credentialsSection = screen.getByText('Detected, needs credentials').closest('section')
    expect(credentialsSection).not.toBeNull()
    const setupLink = within(credentialsSection as HTMLElement).getByRole('link', { name: 'Setup keys' })
    expect(setupLink).toHaveAttribute('href', '/settings?section=connections&service=kometa&keys=kometa.url%2Ckometa.api-key')
  })

  it('shows inline qBittorrent category and tag controls in downloads', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Downloads/i }))

    expect(screen.getByText('Succession S03E03 The Disruption')).toBeInTheDocument()
    expect(screen.getByText('Foundation S02E04')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /SABnzbd/i }))
    expect(screen.queryByText('Succession S03E03 The Disruption')).not.toBeInTheDocument()
    expect(screen.getByText('Foundation S02E04')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /qBittorrent/i }))
    expect(screen.getByText('Succession S03E03 The Disruption')).toBeInTheDocument()
    expect(screen.queryByText('Foundation S02E04')).not.toBeInTheDocument()
    expect(screen.getByText(/tv-sonarr/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('qBittorrent category for Succession S03E03 The Disruption'), { target: { value: 'tv-archive' } })
    fireEvent.change(screen.getByLabelText('qBittorrent tags for Succession S03E03 The Disruption'), { target: { value: 'sonarr,priority' } })
    fireEvent.click(screen.getByRole('button', { name: 'Category' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/media/downloads/qbittorrent/abc123/set-category', { category: 'tv-archive' })
      expect(api.post).toHaveBeenCalledWith('/api/media/downloads/qbittorrent/abc123/add-tags', { tags: 'sonarr,priority' })
    })
    expect(screen.getByRole('button', { name: 'Category' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tags' })).toBeInTheDocument()
  })

  it('confirms before removing ARR queue and downloader items', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Downloads/i }))
    fireEvent.click(screen.getByLabelText('Remove queue item'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remove Georgie.and.Mandys.First.Marriage.S02E20'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remove Succession S03E03 The Disruption'))
    expect(api.del).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalledWith(expect.stringContaining('/api/media/downloads/qbittorrent/abc123/remove'), expect.anything())
    confirm.mockRestore()
  })

  it('shows stream player, decision, and progress in downloads view', () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Downloads/i }))

    expect(screen.getByText('Severance - Cold Harbor')).toBeInTheDocument()
    expect(screen.getByText(/alejandro · Apple TV · direct play/i)).toBeInTheDocument()
  })

  it('auto-refreshes while Downloads view is active', () => {
    vi.useFakeTimers()
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Downloads/i }))
    refetch.mockClear()
    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(refetch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('tab', { name: /Browse/i }))
    refetch.mockClear()
    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(refetch).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('can toggle and test Prowlarr indexers', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    vi.mocked(api.put).mockResolvedValue({})
    render(<MediaRadar />)

    clickButtonText('Indexers')

    expect(screen.getByText('1337x')).toBeInTheDocument()
    expect(screen.getByText('NZBGeek')).toBeInTheDocument()
    clickButtonText('Disabled 1')
    expect(screen.getByText('1337x')).toBeInTheDocument()
    expect(screen.queryByText('NZBGeek')).not.toBeInTheDocument()
    clickButtonText('usenet 1')
    expect(screen.getByText(/No indexers in this filter/i)).toBeInTheDocument()
    clickButtonText('Enabled 1')
    expect(screen.getByText('NZBGeek')).toBeInTheDocument()
    expect(screen.getByText('IndexerNoDefinitionCheck')).toBeInTheDocument()
    expect(screen.getByText(/BitSearch/i)).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Test')[0].closest('button') as HTMLButtonElement)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/media/indexers/prowlarr/10/test', {})
    })

    clickButtonText('All protocols')
    clickButtonText('Disabled 1')
    clickButtonText('Off')

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/media/indexers/prowlarr/9', { enabled: true })
    })
  })

  it('shows Bazarr missing subtitle context and queues search', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Missing/i }))

    expect(screen.getByRole('button', { name: /Movies 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Episodes 1/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Episodes 1/i }))
    expect(screen.getByText('Severance S02E09 Cold Harbor')).toBeInTheDocument()
    expect(screen.queryByText('Anomalisa')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Spanish \(Latino\) 1/i }))
    expect(screen.getByText(/No subtitle gaps in this filter/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Movies 1/i }))
    expect(screen.getByText('Anomalisa')).toBeInTheDocument()
    expect(screen.getByText(/Bazarr · Spanish \(Latino\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Radarr movie 9/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/media/subtitles/bazarr/search', expect.objectContaining({ radarrId: 9 }))
    })
  })

  it('requests TV shows with selected seasons from Overseerr metadata', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.post).mockResolvedValue({})
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Requests/i }))
    fireEvent.change(screen.getByLabelText('Request search query'), { target: { value: 'severance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Severance')).toBeInTheDocument()
    const seasons = screen.getByLabelText('Season numbers for Severance')
    expect(seasons).toHaveValue('1, 2, 3')
    fireEvent.change(seasons, { target: { value: '1, 3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/media/requests/overseerr', {
        mediaId: 95396,
        mediaType: 'tv',
        seasons: [1, 3],
      })
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Request Severance through Overseerr'))
    confirm.mockRestore()
  })

  it('discovers shows by streaming network and requests from Browse', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.post).mockResolvedValue({})
    render(<MediaRadar />)

    clickButtonText('Browse')
    clickButtonText('Load')

    expect(await screen.findByText('Monarch: Legacy of Monsters')).toBeInTheDocument()
    expect(screen.getByText('215 found')).toBeInTheDocument()
    const seasons = screen.getByLabelText('Season numbers for Monarch: Legacy of Monsters')
    expect(seasons).toHaveValue('1, 2')
    fireEvent.change(seasons, { target: { value: '2' } })
    fireEvent.click(screen.getByText('Request').closest('button') as HTMLButtonElement)

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/media/requests/discover?service=overseerr&kind=tv&category=popular&provider=350')
      expect(api.post).toHaveBeenCalledWith('/api/media/requests/overseerr', {
        mediaId: 202411,
        mediaType: 'tv',
        seasons: [2],
      })
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Request Monarch: Legacy of Monsters through Overseerr'))
    confirm.mockRestore()
  })

  it('only shows approve and decline actions for pending requests', () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Requests/i }))

    expect(screen.getByRole('button', { name: /Pending 1/i })).toBeInTheDocument()
    expect(screen.queryByText('Available Movie')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /All 3/i }))

    const pendingRow = screen.getByText('Pending Movie').closest('div')?.parentElement
    const availableRow = screen.getByText('Available Movie').closest('div')?.parentElement
    expect(pendingRow).not.toBeNull()
    expect(availableRow).not.toBeNull()
    expect(within(pendingRow as HTMLElement).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(within(pendingRow as HTMLElement).getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    expect(within(availableRow as HTMLElement).getByText('available')).toBeInTheDocument()
    expect(within(availableRow as HTMLElement).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(within(availableRow as HTMLElement).queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument()
    expect(screen.getByText('Partial Show')).toBeInTheDocument()
    expect(screen.getByText('partial')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Partial 1/i }))
    expect(screen.getByText('Partial Show')).toBeInTheDocument()
    expect(screen.queryByText('Pending Movie')).not.toBeInTheDocument()
  })

  it('shows full ARR actions in the detail drawer and confirms removal', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Browse/i }))
    fireEvent.click(screen.getByRole('button', { name: /Severance/i }))

    const dialog = await screen.findByRole('dialog', { name: /media detail/i })
    expect(within(dialog).getByRole('button', { name: 'Unmonitor' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(within(dialog).getByText('Queue')).toBeInTheDocument()
    expect(within(dialog).getByText('Severance S02E01')).toBeInTheDocument()
    expect(within(dialog).getByText('Missing')).toBeInTheDocument()
    expect(within(dialog).getByText(/Severance S02E09/i)).toBeInTheDocument()
    expect(within(dialog).getByText('History')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remove Severance from Sonarr'))
    expect(api.del).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('opens media detail from overview recently added and upcoming cards', async () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('button', { name: /Forgetting Sarah Marshall/i }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/media/detail/plex/movie/18349')
    })
    expect(await screen.findByRole('dialog', { name: /media detail/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'x' }))
    fireEvent.click(screen.getByRole('button', { name: /FROM S04E05/i }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/media/detail/sonarr/episode/2327')
    })
  })

  it('filters browse library by title, network, and studio text', () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Browse/i }))
    expect(screen.getAllByText('Severance').length).toBeGreaterThan(0)
    expect(screen.getByText('Anomalisa')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Browse library search'), { target: { value: 'paramount' } })

    expect(screen.queryByText('Severance')).not.toBeInTheDocument()
    expect(screen.getByText('Anomalisa')).toBeInTheDocument()
  })

  it('filters controllable library items by search, service, and monitored state', () => {
    render(<MediaRadar />)

    fireEvent.click(screen.getByRole('tab', { name: /Library/i }))
    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.getByText('Anomalisa')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Library search'), { target: { value: 'paramount' } })
    expect(screen.queryByText('Severance')).not.toBeInTheDocument()
    expect(screen.getByText('Anomalisa')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Monitored 1$/i }))
    expect(screen.getByText(/No library items match these filters/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Library search'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^Unmonitored 1$/i }))
    expect(screen.getByText('Anomalisa')).toBeInTheDocument()
    expect(screen.queryByText('Severance')).not.toBeInTheDocument()
  })
})
