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
      providerLabel: 'Hermes Agent',
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
      providerLabel: 'Hermes Agent',
      detail: 'Hermes Agent auth is missing.',
    })

    render(
      <SessionList
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteSelected={vi.fn()}
        title="Chats"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Hermes Agent auth is missing.')
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
    expect(onSelect).toHaveBeenCalledWith('chat-2', undefined)
  })

  it('scopes selection and mutations by environment when session keys collide', () => {
    mockUseGatewaySessions.mockReturnValue({
      available: true,
      isLoading: false,
      sessions: [
        makeSession({
          key: 'shared-thread',
          label: 'Shared thread',
          environmentId: 'local',
        }),
        makeSession({
          key: 'shared-thread',
          label: 'Shared thread',
          environmentId: 'desktop',
        }),
      ],
    })

    const onSelect = vi.fn()
    const onDeleteSelected = vi.fn()
    render(
      <SessionList
        selectedId="shared-thread"
        selectedEnvironmentId="desktop"
        onSelect={onSelect}
        onDeleteSelected={onDeleteSelected}
        title="Chats"
      />,
    )

    const rows = screen.getAllByRole('option', { name: /shared thread/i })
    expect(rows[0]).toHaveAttribute('aria-selected', 'false')
    expect(rows[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(rows[0])
    expect(onSelect).toHaveBeenCalledWith('shared-thread', 'local')

    fireEvent.click(screen.getAllByRole('button', { name: 'Session actions for Shared thread' })[1])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compact' }))
    expect(mockCompactMutate).toHaveBeenCalledWith({ key: 'shared-thread', environmentId: 'desktop' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Session actions for Shared thread' })[1])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mockDeleteMutate).toHaveBeenCalledWith({ key: 'shared-thread', environmentId: 'desktop' })
    expect(onDeleteSelected).toHaveBeenCalledWith('shared-thread', 'desktop')
  })
})
