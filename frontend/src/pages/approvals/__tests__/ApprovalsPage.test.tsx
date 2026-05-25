import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApprovalsPage from '../ApprovalsPage'
import { useApprovals } from '@/hooks/useApprovals'

vi.mock('@/hooks/useApprovals', () => ({
  useApprovals: vi.fn(),
}))

const useApprovalsMock = vi.mocked(useApprovals)

function mockApprovals(overrides: Partial<ReturnType<typeof useApprovals>> = {}) {
  useApprovalsMock.mockReturnValue({
    approvals: [],
    sources: [],
    pendingCount: 0,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    isApproving: false,
    isRejecting: false,
    ...overrides,
  })
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Hermes Agent for missing and legacy harness approval sources', () => {
    mockApprovals({
      sources: [{ source: 'harness', label: 'Harness', configured: true, ok: true, count: 2 }],
      approvals: [
        {
          id: 'approval-1',
          tool: 'shell',
          args: {},
          context: 'Run command',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'approval-2',
          source: 'harness',
          tool: 'edit',
          args: {},
          context: 'Edit file',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
      ],
    })

    render(<ApprovalsPage />)

    expect(screen.getAllByText('Hermes Agent').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Harness')).not.toBeInTheDocument()
    expect(screen.queryByText('harness')).not.toBeInTheDocument()
  })

  it('keeps raw source keys for filtering while using Hermes labels', () => {
    mockApprovals({
      approvals: [
        {
          id: 'approval-1',
          source: 'harness',
          tool: 'shell',
          args: {},
          context: 'Run command',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'approval-2',
          source: 'agentsecrets',
          sourceLabel: 'Agent Secrets',
          tool: 'secret.read',
          args: {},
          context: 'Read secret',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
      ],
    })

    render(<ApprovalsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Hermes Agent' }))

    expect(screen.getByText('shell')).toBeInTheDocument()
    expect(screen.queryByText('secret.read')).not.toBeInTheDocument()
  })
})
