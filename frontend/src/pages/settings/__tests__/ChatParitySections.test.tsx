import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

const mockUseHarnessUsage = vi.fn()

vi.mock('@/hooks/useCodexLbUsage', () => ({
  useCodexLbUsage: () => mockUseHarnessUsage(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '@/lib/api'
import { CodexLbSection, ProvidersSection, UsageSection } from '../ChatParitySections'

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('chat parity settings sections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseHarnessUsage.mockReturnValue({
      usage: {
        totalTokens: 42000,
        totalCost: 1.25,
        remaining: 58000,
        used: 42000,
        period: 'May 2026',
        accounts: [{ id: 'personal', label: 'personal', remaining: 12000, percent: 40, windows: [] }],
        windows: [{ id: 'fiveHour', label: '5h', used: 40, limit: 100, remaining: 60, percent: 40 }],
      },
      loading: false,
      error: null,
    })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes', ready: true, selectable: true, detail: 'Hermes/Codex LB configured' },
            { id: 'claudeAgent', name: 'Claude Code', ready: true, selectable: true, detail: 'Claude Code command found: claude' },
            { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true, detail: 'Codex CLI command found: codex' },
          ],
        }
      }
      if (path === '/api/chat/models') {
        return {
          models: [
            { id: 'openai/gpt-5.2', name: 'GPT 5.2', provider: 'codex-lb', local: false },
          ],
        }
      }
      if (path === '/api/harness/runtime-config') {
        return { currentModel: 'openai/gpt-5.2', favoriteModels: ['openai/gpt-5.2'] }
      }
      return null
    })
  })

  it('renders usage remaining data', () => {
    renderWithQuery(<UsageSection />)

    expect(screen.getByText('Codex LB Usage')).toBeInTheDocument()
    expect(screen.getByText('42k')).toBeInTheDocument()
    expect(screen.getByText('58k')).toBeInTheDocument()
    expect(screen.getByText('$1.25')).toBeInTheDocument()
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    expect(screen.getByText('12k left')).toBeInTheDocument()
  })

  it('does not crash when usage data is partial while loading from Codex LB', () => {
    mockUseHarnessUsage.mockReturnValue({
      usage: {
        totalTokens: 5000,
        remaining: 2500,
      },
      loading: false,
      error: null,
    })

    renderWithQuery(<UsageSection />)
    renderWithQuery(<CodexLbSection />)

    expect(screen.getByText('Codex LB Usage')).toBeInTheDocument()
    expect(screen.getByText('5.0k')).toBeInTheDocument()
    expect(screen.getByText('2.5k')).toBeInTheDocument()
    expect(screen.getByText('Usage accounts')).toBeInTheDocument()
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
  })

  it('renders provider readiness for all chat providers', async () => {
    renderWithQuery(<ProvidersSection />)

    expect(screen.getByText('Chat Providers')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('Hermes provider status')).toBeInTheDocument()
      expect(screen.getByLabelText('Claude Code provider status')).toBeInTheDocument()
      expect(screen.getByLabelText('Codex CLI provider status')).toBeInTheDocument()
      expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
      expect(screen.queryByText('Needs setup')).not.toBeInTheDocument()
      expect(screen.getAllByText('Shown in chat')).toHaveLength(3)
      expect(within(screen.getByLabelText('Hermes provider status')).getByText('1 available')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Hermes provider status')).getByText('Codex LB runtime config')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Hermes provider status')).getByText('HERMES_API_URL or HARNESS_API_URL')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Claude Code provider status')).getByText('Direct local provider, no model selection')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Claude Code provider status')).getByText('claude CLI on PATH')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Claude Code provider status')).getByText('CLAWCONTROL_CLAUDE_COMMAND or claude')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Codex CLI provider status')).getByText('CLAWCONTROL_CODEX_COMMAND or codex')).toBeInTheDocument()
    })
  })

  it('keeps unavailable direct providers visible for setup while hiding them from chat picker', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes', ready: true, selectable: true, detail: 'Hermes/Codex LB configured' },
            { id: 'openclaw', name: 'OpenClaw', ready: true, selectable: true, detail: 'Out of scope' },
            { id: 'claudeAgent', name: 'Claude Code', ready: false, selectable: false, detail: 'Claude Code command not found: claude' },
            { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true, detail: 'Codex CLI command found: codex' },
          ],
        }
      }
      if (path === '/api/chat/models') return { models: [] }
      return null
    })

    renderWithQuery(<ProvidersSection />)

    await waitFor(() => {
      expect(screen.getByText('Hermes')).toBeInTheDocument()
      expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
    })

    const claude = screen.getByLabelText('Claude Code provider status')
    expect(within(claude).getByText('Needs setup')).toBeInTheDocument()
    expect(within(claude).getByText('Hidden from chat')).toBeInTheDocument()
    expect(within(claude).getByText('Claude Code command not found: claude')).toBeInTheDocument()
    expect(within(claude).getByText('claude CLI on PATH')).toBeInTheDocument()
  })

  it('renders Codex LB runtime config', async () => {
    renderWithQuery(<CodexLbSection />)

    expect(screen.getByText('Codex LB')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('openai/gpt-5.2')).toBeInTheDocument()
      expect(screen.getByText('Hermes')).toBeInTheDocument()
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('40%')).toBeInTheDocument()
    })
  })
})
