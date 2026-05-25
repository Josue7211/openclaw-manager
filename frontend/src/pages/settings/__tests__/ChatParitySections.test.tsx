import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

const mockUseHarnessUsage = vi.fn()

vi.mock('@/hooks/useHermesUsage', () => ({
  useHermesUsage: () => mockUseHarnessUsage(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '@/lib/api'
import { HermesAgentSection, ProvidersSection, UsageSection } from '../ChatParitySections'

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
            { id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true, detail: 'Hermes Agent configured' },
          ],
        }
      }
      if (path === '/api/chat/models') {
        return {
          models: [
            { id: 'openai/gpt-5.2', name: 'GPT 5.2', provider: 'hermes', local: false },
          ],
        }
      }
      if (path === '/api/hermes/runtime-config') {
        return { currentModel: 'openai/gpt-5.2', favoriteModels: ['openai/gpt-5.2'] }
      }
      if (path === '/api/hermes/dashboard/overview?timeframe=7d') {
        return {
          lastSyncAt: '2026-05-20T21:53:03Z',
          accounts: [
            {
              accountId: 'acc-1',
              email: 'primary@example.com',
              displayName: 'primary@example.com',
              planType: 'pro',
              status: 'active',
              usage: { primaryRemainingPercent: 89, secondaryRemainingPercent: 98 },
              requestUsage: { requestCount: 12, totalTokens: 49390, cachedInputTokens: 1000, totalCostUsd: 0.42 },
              auth: { access: { state: 'valid', expiresAt: '2026-05-24T00:00:00Z' } },
            },
          ],
          summary: {
            primaryWindow: { remainingPercent: 83, capacityCredits: 1600, remainingCredits: 1330, resetAt: '2026-05-20T23:15:00Z' },
            secondaryWindow: { remainingPercent: 96, capacityCredits: 53800, remainingCredits: 51500, resetAt: '2026-05-27T00:00:00Z' },
            cost: { totalUsd: 0.57, currency: 'USD' },
            metrics: { requests: 17, tokens: 371880, cachedInputTokens: 81410, errorRate: 0, errorCount: 0, topError: null },
          },
          trends: {
            requests: [{ t: '2026-05-19T00:00:00Z', v: 1 }, { t: '2026-05-20T00:00:00Z', v: 17 }],
            tokens: [{ t: '2026-05-19T00:00:00Z', v: 1000 }, { t: '2026-05-20T00:00:00Z', v: 371880 }],
            cost: [{ t: '2026-05-19T00:00:00Z', v: 0.01 }, { t: '2026-05-20T00:00:00Z', v: 0.57 }],
            errorRate: [{ t: '2026-05-19T00:00:00Z', v: 0 }, { t: '2026-05-20T00:00:00Z', v: 0 }],
          },
        }
      }
      if (path === '/api/hermes/dashboard/accounts') {
        return {
          accounts: [
            {
              accountId: 'acc-1',
              email: 'primary@example.com',
              displayName: 'primary@example.com',
              planType: 'pro',
              status: 'active',
              usage: { primaryRemainingPercent: 89, secondaryRemainingPercent: 98 },
              requestUsage: { requestCount: 12, totalTokens: 49390, cachedInputTokens: 1000, totalCostUsd: 0.42 },
              auth: { access: { state: 'valid' } },
            },
          ],
        }
      }
      if (path === '/api/hermes/dashboard/api-keys') {
        return [
          {
            id: 'key-1',
            name: 'hermes-agent',
            keyPrefix: 'sk-clb-test',
            isActive: true,
            expiresAt: null,
            usageSummary: { requestCount: 4, totalTokens: 68270, cachedInputTokens: 10750, totalCostUsd: 0.11 },
            limits: [],
          },
        ]
      }
      if (path === '/api/hermes/dashboard/request-logs?limit=25') {
        return {
          total: 1,
          hasMore: false,
          requests: [
            {
              requestedAt: '2026-05-20T20:57:22Z',
              accountId: 'acc-1',
              apiKeyName: 'hermes-agent',
              model: 'gpt-5.3-codex',
              transport: 'http',
              status: 'ok',
              tokens: 22120,
              cachedInputTokens: 0,
              costUsd: 0.04,
            },
          ],
        }
      }
      if (path === '/api/hermes/dashboard/settings') {
        return { routingStrategy: 'capacity_weighted', version: '1.12.0' }
      }
      return null
    })
  })

  it('renders usage remaining data', () => {
    renderWithQuery(<UsageSection />)

    expect(screen.getByText('Hermes Agent Usage')).toBeInTheDocument()
    expect(screen.getByText('42k')).toBeInTheDocument()
    expect(screen.getByText('58k')).toBeInTheDocument()
    expect(screen.getByText('$1.25')).toBeInTheDocument()
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    expect(screen.getByText('12k left')).toBeInTheDocument()
  })

  it('does not crash when usage data is partial while loading from Hermes Agent', () => {
    mockUseHarnessUsage.mockReturnValue({
      usage: {
        totalTokens: 5000,
        remaining: 2500,
      },
      loading: false,
      error: null,
    })

    renderWithQuery(<UsageSection />)
    renderWithQuery(<HermesAgentSection />)

    expect(screen.getByText('Hermes Agent Usage')).toBeInTheDocument()
    expect(screen.getAllByText('5.0k').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('2.5k').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Usage accounts')).toBeInTheDocument()
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Hermes Agent provider readiness only', async () => {
    renderWithQuery(<ProvidersSection />)

    expect(screen.getByLabelText('Hermes Agent readiness')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('Hermes Agent status')).toBeInTheDocument()
      expect(screen.queryByLabelText('Legacy local agent provider status')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Legacy local CLI provider status')).not.toBeInTheDocument()
      expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
      expect(screen.queryByText('Needs setup')).not.toBeInTheDocument()
      expect(screen.getAllByText('Available in chat')).toHaveLength(1)
      expect(within(screen.getByLabelText('Hermes Agent status')).getByText('1 available')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Hermes Agent status')).getByText('Hermes Agent runtime config')).toBeInTheDocument()
      expect(within(screen.getByLabelText('Hermes Agent status')).getByText('HERMES_API_URL')).toBeInTheDocument()
    })
  })

  it('ignores stale local providers in settings while keeping Hermes visible', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true, detail: 'Hermes Agent configured' },
            { id: 'openclaw', name: 'OpenClaw', ready: true, selectable: true, detail: 'Out of scope' },
            { id: 'claudeAgent', name: 'Legacy local agent', ready: false, selectable: false, detail: 'Legacy local agent unavailable' },
            { id: 'codex-cli', name: 'Legacy local CLI', ready: true, selectable: true, detail: 'Legacy local CLI available' },
          ],
        }
      }
      if (path === '/api/chat/models') return { models: [] }
      return null
    })

    renderWithQuery(<ProvidersSection />)

    await waitFor(() => {
      expect(screen.getByLabelText('Hermes Agent status')).toBeInTheDocument()
      expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
      expect(screen.queryByText('Legacy local agent')).not.toBeInTheDocument()
      expect(screen.queryByText('Legacy local CLI')).not.toBeInTheDocument()
    })
  })

  it('renders Hermes Agent runtime config', async () => {
    renderWithQuery(<HermesAgentSection />)

    expect(screen.getByRole('heading', { name: 'Hermes Agent Dashboard' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('openai/gpt-5.2')).toBeInTheDocument()
      expect(screen.getByText('Chat provider').parentElement).toHaveTextContent('Hermes Agent')
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('83%')).toBeInTheDocument()
    })
  })

  it('renders the full Hermes Agent dashboard data surface', async () => {
    renderWithQuery(<HermesAgentSection />)

    await waitFor(() => {
      expect(screen.getByText('Requests (7d)')).toBeInTheDocument()
      expect(screen.getByText('372k')).toBeInTheDocument()
      expect(screen.getAllByText('primary@example.com').length).toBeGreaterThan(0)
      expect(screen.getByText('gpt-5.3-codex')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'APIs' }))
    expect(await screen.findByText('hermes-agent')).toBeInTheDocument()
    expect(screen.getByText('sk-clb-test')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'logs' }))
    expect(await screen.findByText('HTTP')).toBeInTheDocument()
    expect(screen.getByText('$0.04')).toBeInTheDocument()
  })

  it('prefers live usage quota over stale quota-exceeded account status and normalizes log aliases', async () => {
    mockUseHarnessUsage.mockReturnValue({
      usage: {
        accounts: [{
          id: 'acc-1',
          label: 'primary@example.com',
          remaining: 60,
          windows: [{ id: 'fiveHour', label: '5h', used: 26, limit: 100, remaining: 74, percent: 26 }],
        }],
        windows: [{ id: 'fiveHour', label: '5h', used: 26, limit: 100, remaining: 74, percent: 26 }],
      },
      loading: false,
      error: null,
    })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/hermes/dashboard/overview?timeframe=7d') {
        return {
          accounts: [{
            accountId: 'acc-1',
            email: 'primary@example.com',
            status: 'quota_exceeded',
            usage: { primaryRemainingPercent: 0 },
          }],
          summary: { metrics: {} },
        }
      }
      if (path === '/api/hermes/dashboard/accounts') {
        return {
          accounts: [{
            accountId: 'acc-1',
            email: 'primary@example.com',
            status: 'quota_exceeded',
            usage: { primaryRemainingPercent: 0 },
          }],
        }
      }
      if (path === '/api/hermes/dashboard/request-logs?limit=25') {
        return {
          total: 1,
          requests: [{
            createdAt: '2026-05-20T22:10:00Z',
            account_id: 'acc-1',
            api_key_name: 'hermes-agent',
            modelName: 'openai/gpt-5.5',
            totalTokens: 1200,
            totalCostUsd: 0.02,
            state: 'ok',
          }],
        }
      }
      if (path === '/api/hermes/dashboard/api-keys') return []
      if (path === '/api/hermes/dashboard/settings') return {}
      if (path === '/api/hermes/runtime-config') return {}
      return null
    })

    renderWithQuery(<HermesAgentSection />)

    await waitFor(() => {
      expect(screen.queryByText('Quota Exceeded')).not.toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('gpt-5.5')).toBeInTheDocument()
      expect(screen.getByText('1.2k')).toBeInTheDocument()
    })
  })
})
