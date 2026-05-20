import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockApiGet, mockUseCodexLbUsage } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockUseCodexLbUsage: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
  },
}))

vi.mock('@/hooks/useCodexLbUsage', () => ({
  useCodexLbUsage: () => mockUseCodexLbUsage(),
}))

import SettingsPage from '../Settings'

function renderSettings(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Settings chat parity routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/status') {
        return { name: 'Hermes', emoji: '', model: 'gpt-5.5', status: 'online', host: 'local' }
      }
      if (path === '/api/auth/session') {
        return { authenticated: false }
      }
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes', ready: true, selectable: true, detail: 'Hermes/Codex LB configured' },
            { id: 'claudeAgent', name: 'Claude Code', ready: false, selectable: false, detail: 'Claude Code command not found: claude' },
            { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true, detail: 'Codex CLI command found: codex' },
          ],
        }
      }
      if (path === '/api/chat/models') {
        return {
          models: [
            { id: 'gpt-5.5', name: 'GPT 5.5', provider: 'codex-lb', local: false },
          ],
          currentModel: 'gpt-5.5',
        }
      }
      return {}
    })
    mockUseCodexLbUsage.mockReturnValue({
      usage: {
        raw: {},
        used: 40,
        limit: 100,
        remaining: 60,
        percent: 40,
        totalCost: 1.25,
        accounts: [{ id: 'personal', label: 'personal', remaining: 60, percent: 40, windows: [] }],
        windows: [
          { id: 'fiveHour', label: '5h', percent: 40 },
          { id: 'weekly', label: 'Week', percent: 55 },
        ],
      },
      loading: false,
      fetching: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('mounts the usage shortcut route without crashing', () => {
    renderSettings('/settings?section=usage')

    expect(screen.getByText('Codex LB Usage')).toBeInTheDocument()
    expect(screen.getByText('60 left')).toBeInTheDocument()
  })

  it('mounts the providers shortcut route without OpenClaw', async () => {
    renderSettings('/settings?section=providers')

    expect(await screen.findByLabelText('Hermes provider status')).toBeInTheDocument()
    expect(screen.getByLabelText('Claude Code provider status')).toBeInTheDocument()
    expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
  })

  it('mounts the Codex LB shortcut route with usage windows', () => {
    renderSettings('/settings?section=codex-lb')

    expect(screen.getAllByText('Codex LB').length).toBeGreaterThan(0)
    expect(screen.getByText('5h limit')).toBeInTheDocument()
    expect(screen.getByText('Weekly limit')).toBeInTheDocument()
  })
})
