import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'

// Mock useAgents hook
const mockAgents = [
  {
    id: 'agent-1',
    name: 'bjorn',
    display_name: 'Bjorn',
    emoji: '\uD83E\uDDAC',
    role: 'General purpose',
    status: 'active',
    current_task: 'Reviewing PR #42',
    color: '#5865f2',
    model: 'claude-sonnet-4-6',
    sort_order: 0,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T12:00:00Z',
  },
  {
    id: 'agent-2',
    name: 'scout',
    display_name: 'Scout',
    emoji: '\uD83E\uDD85',
    role: 'Code review',
    status: 'idle',
    current_task: null,
    color: null,
    model: 'claude-haiku-4-5',
    sort_order: 1,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
  },
]

vi.mock('@/hooks/useAgents', () => ({
  useAgents: () => ({
    agents: mockAgents,
    loading: false,
    createMutation: { mutate: vi.fn() },
    updateMutation: { mutate: vi.fn() },
    deleteMutation: { mutate: vi.fn() },
    actionMutation: { mutate: vi.fn() },
    invalidateAgents: vi.fn(),
  }),
}))

// Mock useTableRealtime (SSE hook)
vi.mock('@/lib/hooks/useRealtimeSSE', () => ({
  useTableRealtime: vi.fn(),
  useRealtimeSSE: vi.fn(),
}))

// Mock useGatewaySSE (EventSource not available in test env)
vi.mock('@/lib/hooks/useGatewaySSE', () => ({
  useGatewaySSE: vi.fn(),
}))

// Mock demo-data
vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => false,
  DEMO_AGENTS: [],
}))

// Mock api
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
  API_BASE: 'http://localhost:3000',
}))

// Mock Skeleton (avoid rendering complex loading states)
vi.mock('@/components/Skeleton', () => ({
  SkeletonList: () => createElement('div', { 'data-testid': 'skeleton' }, 'Loading...'),
}))

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  Robot: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'robot-icon', ...props }),
  Plus: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'plus-icon', ...props }),
  Trash: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'trash-icon', ...props }),
  Pencil: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'pencil-icon', ...props }),
  Play: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'play-icon', ...props }),
  Stop: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'stop-icon', ...props }),
  ArrowClockwise: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'restart-icon', ...props }),
  CaretDown: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'caret-icon', ...props }),
  Circle: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'circle-icon', ...props }),
  CircleDashed: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'circle-dashed-icon', ...props }),
  Terminal: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'terminal-icon', ...props }),
  Copy: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'copy-icon', ...props }),
  Eye: (props: Record<string, unknown>) => createElement('svg', { 'data-testid': 'eye-icon', ...props }),
}))

import AgentsPage from '../../Agents'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, children),
    )
}

describe('AgentsPage', () => {
  it('renders without throwing', () => {
    expect(() => {
      render(createElement(AgentsPage), { wrapper: createWrapper() })
    }).not.toThrow()
  })

  it('displays both agent names', () => {
    render(createElement(AgentsPage), { wrapper: createWrapper() })
    expect(screen.getByText('Bjorn')).toBeInTheDocument()
    expect(screen.getByText('Scout')).toBeInTheDocument()
  })

  it('shows empty state text when no agent is selected', () => {
    render(createElement(AgentsPage), { wrapper: createWrapper() })
    expect(screen.getByText('Select an agent to view settings')).toBeInTheDocument()
  })

  it('renders the Agents header', () => {
    render(createElement(AgentsPage), { wrapper: createWrapper() })
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders create button with aria-label', () => {
    render(createElement(AgentsPage), { wrapper: createWrapper() })
    expect(screen.getByLabelText('Create new agent')).toBeInTheDocument()
  })
})
