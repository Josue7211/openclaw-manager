import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SessionList } from '../SessionList'
import type { ClaudeSession } from '../types'

const mockIsDemoMode = vi.fn()
const mockUseGatewaySessions = vi.fn()
const mockUseHarnessStatus = vi.fn()
const mockRenameMutate = vi.fn()
const mockDeleteMutate = vi.fn()
const mockCompactMutate = vi.fn()

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('@/hooks/sessions/useGatewaySessions', () => ({
  useGatewaySessions: () => mockUseGatewaySessions(),
}))

vi.mock('@/hooks/useHarnessStatus', () => ({
  useHarnessStatus: () => mockUseHarnessStatus(),
}))

vi.mock('@/hooks/sessions/useSessionMutations', () => ({
  useSessionMutations: () => ({
    renameMutation: { mutate: mockRenameMutate },
    deleteMutation: { mutate: mockDeleteMutate },
    compactMutation: { mutate: mockCompactMutate, isPending: false, variables: null },
  }),
}))

vi.mock('@/components/GatewayStatusDot', () => ({
  GatewayStatusDot: () => <span aria-label="Gateway status" />,
}))

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    key: 'chat-1',
    label: 'Weather dashboard page',
    messageCount: 3,
    lastActivity: new Date('2026-05-16T20:00:00Z').toISOString(),
    agentKey: 'hermes',
    ...overrides,
  }
}

describe('SessionList', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(false)
    mockUseGatewaySessions.mockReturnValue({
      sessions: [],
      available: true,
      isLoading: false,
    })
    mockUseHarnessStatus.mockReturnValue({
      providerLabel: 'Harness',
      detail: undefined,
    })
    mockRenameMutate.mockReset()
    mockDeleteMutate.mockReset()
    mockCompactMutate.mockReset()
  })

  it('shows an empty chat state with a new-chat action', () => {
    const onNewSession = vi.fn()

    render(
      <SessionList
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteSelected={vi.fn()}
        onNewSession={onNewSession}
        title="Chats"
      />,
    )

    expect(screen.getByRole('listbox', { name: 'Chats list' })).toBeInTheDocument()
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(onNewSession).toHaveBeenCalledTimes(1)
  })

  it('surfaces unavailable gateway detail as an alert', () => {
    mockUseGatewaySessions.mockReturnValue({
      sessions: [],
      available: false,
      isLoading: false,
    })
    mockUseHarnessStatus.mockReturnValue({
      providerLabel: 'Hermes',
      detail: 'Harness auth is missing.',
    })

    render(
      <SessionList
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteSelected={vi.fn()}
        title="Chats"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Harness auth is missing.')
  })

  it('marks the list busy while sessions are loading', () => {
    mockUseGatewaySessions.mockReturnValue({
      sessions: [],
      available: true,
      isLoading: true,
    })

    render(
      <SessionList
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteSelected={vi.fn()}
        title="Chats"
      />,
    )

    expect(screen.getByRole('listbox', { name: 'Chats list' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status', { name: 'Loading chats' })).toBeInTheDocument()
    expect(screen.queryByText('No sessions yet')).not.toBeInTheDocument()
  })

  it('filters sessions by title, agent, and key without losing selectable rows', () => {
    mockUseGatewaySessions.mockReturnValue({
      available: true,
      isLoading: false,
      sessions: [
        makeSession(),
        makeSession({
          key: 'chat-2',
          label: 'Terminal fix',
          messageCount: 1,
          agentKey: 'codex',
        }),
      ],
    })

    const onSelect = vi.fn()
    render(
      <SessionList
        selectedId="chat-2"
        onSelect={onSelect}
        onDeleteSelected={vi.fn()}
        title="Chats"
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search chats' }), {
      target: { value: 'codex' },
    })

    expect(screen.queryByRole('option', { name: /weather dashboard/i })).not.toBeInTheDocument()
    const terminal = screen.getByRole('option', { name: /terminal fix, 1 message/i })
    expect(terminal).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(terminal)
    expect(onSelect).toHaveBeenCalledWith('chat-2')
  })
})
