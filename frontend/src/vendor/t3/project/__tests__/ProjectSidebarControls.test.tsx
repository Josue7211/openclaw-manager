import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ProjectActionMenu,
  ProjectIconButton,
  ProjectMenuButton,
  ProjectViewMenu,
} from '../ProjectSidebarControls'

describe('T3 copied ProjectSidebarControls adapter', () => {
  it('renders project view grouping and sort controls from the vendor surface', () => {
    const onGroupingChange = vi.fn()
    const onSortChange = vi.fn()

    render(
      <ProjectViewMenu
        groupingValue="repository"
        sortValue="name"
        onGroupingChange={onGroupingChange}
        onSortChange={onSortChange}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Project view options' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')

    fireEvent.click(trigger)

    expect(screen.getByRole('menu', { name: 'Project view options' })).toHaveAttribute('data-t3-project-view-menu')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('menu', { name: 'Project view options' }).id)
    fireEvent.change(screen.getByLabelText('Project grouping'), { target: { value: 'separate' } })
    fireEvent.change(screen.getByLabelText('Project sort'), { target: { value: 'recent' } })
    expect(onGroupingChange).toHaveBeenCalledWith('separate')
    expect(onSortChange).toHaveBeenCalledWith('recent')
  })

  it('keeps the project view menu inside narrow viewports', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 170 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 180 })

    render(
      <ProjectViewMenu
        groupingValue="repository"
        sortValue="name"
        onGroupingChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Project view options' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 158,
      y: 12,
      width: 24,
      height: 22,
      top: 12,
      right: 182,
      bottom: 34,
      left: 158,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Project view options' })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })

    expect(menu).toHaveStyle({
      left: '8px',
      top: '38px',
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
  })

  it('renders project action menu callbacks and grouping override controls', () => {
    const onCopy = vi.fn()
    const onRename = vi.fn()
    const onGroupingChange = vi.fn()
    const onRemove = vi.fn()

    render(
      <ProjectActionMenu
        label="clawctrl"
        groupingLabel="Grouping for clawctrl"
        groupingValue=""
        copyLabel="Copy path"
        copied={false}
        copyErrored={false}
        renameLabel="Rename"
        removeLabel="Remove project"
        onCopy={onCopy}
        onRename={onRename}
        onGroupingChange={onGroupingChange}
        onRemove={onRemove}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'More actions for clawctrl' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Actions for clawctrl' })
    expect(menu).toHaveAttribute('data-t3-project-action-menu')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    expect(menu).toHaveStyle({
      width: '236px',
      zIndex: '10000',
      position: 'fixed',
    })
    expect(menu).toHaveStyle({
      backgroundColor: '#18181f',
      opacity: '1',
      backdropFilter: 'none',
      isolation: 'isolate',
    })
    expect(screen.getByLabelText('Grouping for clawctrl').compareDocumentPosition(
      screen.getByRole('menuitem', { name: 'Remove project' }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Remove project' })).toHaveAttribute('title', 'Remove project')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))
    expect(onCopy).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions for clawctrl' }))
    fireEvent.change(screen.getByLabelText('Grouping for clawctrl'), { target: { value: 'repository-path' } })
    expect(onGroupingChange).toHaveBeenCalledWith('repository-path')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onRename).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions for clawctrl' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project' }))
    expect(onRemove).toHaveBeenCalled()
  })

  it('supports keyboard navigation and focus return in project action menus', async () => {
    render(
      <ProjectActionMenu
        label="clawctrl"
        groupingLabel="Grouping for clawctrl"
        groupingValue=""
        copyLabel="Copy path"
        copied={false}
        copyErrored={false}
        renameLabel="Rename"
        removeLabel="Remove project"
        onCopy={vi.fn()}
        onRename={vi.fn()}
        onGroupingChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'More actions for clawctrl' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Actions for clawctrl' })

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Copy path' })).toHaveFocus()
    })

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Remove project' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'Copy path' })).toHaveFocus()

    const groupingSelect = screen.getByLabelText('Grouping for clawctrl')
    groupingSelect.focus()
    fireEvent.keyDown(groupingSelect, { key: 'ArrowDown' })
    expect(groupingSelect).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Actions for clawctrl' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('supports keyboard focus return in project view menus', async () => {
    render(
      <ProjectViewMenu
        groupingValue="repository"
        sortValue="name"
        onGroupingChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Project view options' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Project view options' })

    await waitFor(() => {
      expect(screen.getByLabelText('Project grouping')).toHaveFocus()
    })

    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByLabelText('Project sort')).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Project view options' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps the project action menu inside narrow viewports', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 180 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 })

    render(
      <ProjectActionMenu
        label="clawctrl"
        groupingLabel="Grouping for clawctrl"
        groupingValue=""
        copyLabel="Copy path"
        copied={false}
        copyErrored={false}
        renameLabel="Rename"
        removeLabel="Remove project"
        onCopy={vi.fn()}
        onRename={vi.fn()}
        onGroupingChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'More actions for clawctrl' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 168,
      y: 16,
      width: 22,
      height: 22,
      top: 16,
      right: 190,
      bottom: 38,
      left: 168,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Actions for clawctrl' })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })

    expect(menu).toHaveStyle({
      left: '8px',
      top: '8px',
      width: '164px',
    })
  })

  it('keeps shared menu button semantics for remaining chat sidebar thread menus', () => {
    const onClick = vi.fn()
    render(<ProjectMenuButton label="Copy thread id" icon={<span />} onClick={onClick} />)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy thread id' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('keeps shared icon button semantics for project/sidebar row actions', () => {
    const onClick = vi.fn()
    render(<ProjectIconButton label="New chat in project" onClick={onClick}><span /></ProjectIconButton>)

    fireEvent.click(screen.getByRole('button', { name: 'New chat in project' }))
    expect(onClick).toHaveBeenCalled()
  })
})
