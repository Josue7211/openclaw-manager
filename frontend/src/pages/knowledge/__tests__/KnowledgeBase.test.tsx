import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import KnowledgeBase from '../../KnowledgeBase'
import { api } from '@/lib/api'

vi.mock('react-force-graph-2d', () => ({
  default: () => <div data-testid="force-graph" />,
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    del: vi.fn(),
  },
}))

function renderKnowledgeBase() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/knowledge']}>
        <KnowledgeBase />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('KnowledgeBase', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.del).mockReset()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        disconnect = vi.fn()
      },
    )

    vi.mocked(api.get).mockImplementation(path => {
      if (path === '/api/rag/status') {
        return Promise.resolve({ configured: true, reachable: true, backend: 'lightrag' })
      }
      if (path.startsWith('/api/knowledge?')) {
        return new Promise(() => {})
      }
      if (path.startsWith('/api/rag/graph/labels?')) {
        return Promise.resolve({ labels: [] })
      }
      return Promise.resolve({})
    })
    vi.mocked(api.post).mockResolvedValue({
      results: [
        {
          name: 'LightRAG answer',
          content: 'The media VM runs Plex, Sonarr, Radarr, and related services.',
          score: 1,
          backend: 'lightrag',
        },
      ],
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a LightRAG chat answer even while local knowledge search is still loading', async () => {
    renderKnowledgeBase()

    fireEvent.change(screen.getByLabelText('Search knowledge base'), {
      target: { value: 'what is in the media vm' },
    })
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 350))
    })

    await waitFor(() => {
      expect(screen.getByText('LightRAG answer')).toBeInTheDocument()
    })
    expect(screen.queryByText('You')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search knowledge base')).toHaveValue('what is in the media vm')
    expect(screen.getByText(/runs Plex, Sonarr, Radarr/i)).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/rag/search', {
      query: 'what is in the media vm',
      limit: 12,
      conversation_history: [],
      history_turns: 3,
    })
    expect(screen.queryByText('Loading more matches...')).not.toBeInTheDocument()
  })

  it('uses a chat loading state while the LightRAG answer is pending', async () => {
    vi.mocked(api.post).mockReturnValue(new Promise(() => {}))

    renderKnowledgeBase()

    fireEvent.change(screen.getByLabelText('Search knowledge base'), {
      target: { value: 'what is in the media vm' },
    })
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 350))
    })

    await waitFor(() => {
      expect(screen.getByText('Searching LightRAG...')).toBeInTheDocument()
    })
    expect(screen.queryByText('Loading more matches...')).not.toBeInTheDocument()
  })

  it('does not render graph labels as LightRAG chat answers', async () => {
    vi.mocked(api.get).mockImplementation(path => {
      if (path === '/api/rag/status') {
        return Promise.resolve({ configured: true, reachable: true, backend: 'lightrag' })
      }
      if (path.startsWith('/api/knowledge?')) {
        return new Promise(() => {})
      }
      if (path.startsWith('/api/rag/graph/labels?')) {
        return Promise.resolve({ labels: ['Media VM'] })
      }
      return Promise.resolve({})
    })
    vi.mocked(api.post).mockResolvedValue({
      results: [],
    })

    renderKnowledgeBase()

    fireEvent.change(screen.getByLabelText('Search knowledge base'), {
      target: { value: 'What is the media vm?' },
    })
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 350))
    })

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('q=media+vm'))
    })
    expect(screen.queryByText(/Matched LightRAG graph label/i)).not.toBeInTheDocument()
  })
})
