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
        onPin={vi.fn()}
        onCompact={vi.fn()}
        onCopyThreadId={vi.fn()}
      />,
    )

    const row = screen.getByRole('option', { name: 'Project chat, 3 messages' })
    expect(row).toHaveAttribute('data-t3-project-sidebar-thread')
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalled()
  })

  it('fires copy, rename, pin, compact, and delete actions from the thread action menu', () => {
    const onCopyThreadId = vi.fn()
    const onRename = vi.fn()
    const onPin = vi.fn()
    const onCompact = vi.fn()
    const onDelete = vi.fn()

    render(
      <ProjectSidebarThread
        session={session}
        selected={false}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
        onPin={onPin}
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename chat Project chat' }))
    const input = screen.getByLabelText('Rename Project chat')
    fireEvent.change(input, { target: { value: 'Renamed project chat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('thread-1', 'Renamed project chat', null)

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin chat Project chat' }))
    expect(onPin).toHaveBeenCalledWith('thread-1', true, null)

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compact chat Project chat' }))
    expect(onCompact).toHaveBeenCalledWith('thread-1', null)

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete chat Project chat' }))
    expect(onDelete).toHaveBeenCalledWith('thread-1', null)
  })

  it('renders the thread action menu as an opaque viewport-clamped menu', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 170 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 180 })

    render(
      <ProjectSidebarThread
        session={session}
        selected={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPin={vi.fn()}
        onCompact={vi.fn()}
        onCopyThreadId={vi.fn()}
      />,
    )

    const row = screen.getByRole('option', { name: 'Project chat, 3 messages' })
    fireEvent.mouseEnter(row)
    const trigger = screen.getByRole('button', { name: 'More actions for Project chat' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 160,
      y: 12,
      width: 22,
      height: 22,
      top: 12,
      right: 182,
      bottom: 34,
      left: 160,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Actions for Project chat' })
    expect(menu).toHaveStyle({
      left: '8px',
      top: '8px',
      width: '154px',
      position: 'fixed',
      zIndex: '10000',
    })
    expect(menu).toHaveStyle({
      backgroundColor: '#18181f',
      opacity: '1',
      backdropFilter: 'none',
      isolation: 'isolate',
    })
    expect(screen.getByRole('menuitem', { name: 'Compact chat Project chat' }).compareDocumentPosition(
      screen.getByRole('menuitem', { name: 'Delete chat Project chat' }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
  })

  it('exposes unpin for pinned threads', () => {
    const onPin = vi.fn()
    render(
      <ProjectSidebarThread
        session={{ ...session, pinned: true }}
        selected={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPin={onPin}
        onCompact={vi.fn()}
        onCopyThreadId={vi.fn()}
      />,
    )

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Project chat, 3 messages' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Project chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unpin chat Project chat' }))

    expect(onPin).toHaveBeenCalledWith('thread-1', false, null)
  })

  it('renders the empty project bucket row from the vendor surface', () => {
    render(<ProjectSidebarEmpty>No chats</ProjectSidebarEmpty>)

    expect(screen.getByText('No chats')).toBeInTheDocument()
  })
})
