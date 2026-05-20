import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClaudeSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import { ProjectSidebarEmpty, ProjectSidebarThread } from '../ProjectSidebarThread'

const session: ClaudeSession = {
  key: 'thread-1',
  label: 'Project chat',
  agentKey: 'main',
  messageCount: 3,
  lastActivity: new Date().toISOString(),
}

describe('T3 copied ProjectSidebarThread adapter', () => {
  it('renders a selectable project thread row from the vendor surface', () => {
    const onSelect = vi.fn()

    render(
      <ProjectSidebarThread
        session={session}
        selected
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onCompact={vi.fn()}
        onCopyThreadId={vi.fn()}
      />,
    )

    const row = screen.getByRole('option', { name: 'Project chat, 3 messages' })
    expect(row).toHaveAttribute('data-t3-project-sidebar-thread')
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalled()
  })

  it('fires copy, rename, compact, and delete actions from the thread action menu', () => {
    const onCopyThreadId = vi.fn()
    const onRename = vi.fn()
    const onCompact = vi.fn()
    const onDelete = vi.fn()

    render(
      <ProjectSidebarThread
        session={session}
        selected={false}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
        onCompact={onCompact}
        onCopyThreadId={onCopyThreadId}
      />,
    )

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Project chat, 3 messages' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))

    expect(screen.getByRole('menu', { name: 'Actions for Project chat' })).toHaveAttribute('data-t3-project-sidebar-thread-menu')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy thread id for Project chat' }))
    expect(onCopyThreadId).toHaveBeenCalledWith(session)

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename Project chat' }))
    const input = screen.getByLabelText('Rename Project chat')
    fireEvent.change(input, { target: { value: 'Renamed project chat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('thread-1', 'Renamed project chat')

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compact Project chat' }))
    expect(onCompact).toHaveBeenCalledWith('thread-1')

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Project chat' }))
    expect(onDelete).toHaveBeenCalledWith('thread-1')
  })

  it('renders the empty project bucket row from the vendor surface', () => {
    render(<ProjectSidebarEmpty>No chats</ProjectSidebarEmpty>)

    expect(screen.getByText('No chats')).toBeInTheDocument()
  })
})
