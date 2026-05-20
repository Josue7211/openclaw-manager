import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SessionCard } from '../SessionCard'
import type { ClaudeSession } from '../types'

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    key: 'chat-1',
    label: 'Weather dashboard page',
    messageCount: 3,
    lastActivity: new Date().toISOString(),
    agentKey: 'main',
    ...overrides,
  }
}

describe('SessionCard', () => {
  it('renders as a selectable option with session-specific actions', () => {
    const onSelect = vi.fn()

    render(
      <SessionCard
        session={makeSession()}
        selected={true}
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onCompact={vi.fn()}
      />,
    )

    const option = screen.getByRole('option', { name: /weather dashboard page, 3 messages/i })
    expect(option).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(option, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('button', { name: 'Session actions for Weather dashboard page' })).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('opens the action menu and commits rename/delete/compact actions', () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const onCompact = vi.fn()

    render(
      <SessionCard
        session={makeSession()}
        selected={false}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
        onCompact={onCompact}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Session actions for Weather dashboard page' }))
    expect(screen.getByRole('menu', { name: 'Session actions' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Compact' }))
    expect(onCompact).toHaveBeenCalledWith('chat-1')

    fireEvent.click(screen.getByRole('button', { name: 'Session actions for Weather dashboard page' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('chat-1')

    fireEvent.click(screen.getByRole('button', { name: 'Session actions for Weather dashboard page' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByLabelText('Rename session')
    fireEvent.change(input, { target: { value: 'Better chat title' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('chat-1', 'Better chat title')
  })
})
