import { fireEvent, render, screen } from '@testing-library/react'
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

    fireEvent.click(screen.getByRole('button', { name: 'Project view options' }))

    expect(screen.getByRole('menu', { name: 'Project view options' })).toHaveAttribute('data-t3-project-view-menu')
    fireEvent.change(screen.getByLabelText('Project grouping'), { target: { value: 'separate' } })
    fireEvent.change(screen.getByLabelText('Project sort'), { target: { value: 'recent' } })
    expect(onGroupingChange).toHaveBeenCalledWith('separate')
    expect(onSortChange).toHaveBeenCalledWith('recent')
  })

  it('renders project action menu callbacks and grouping override controls', () => {
    const onCopy = vi.fn()
    const onRename = vi.fn()
    const onGroupingChange = vi.fn()
    const onRemove = vi.fn()

    render(
      <ProjectActionMenu
        label="clawcontrol"
        groupingLabel="Grouping for clawcontrol"
        groupingValue=""
        copyLabel="Copy path"
        copied={false}
        copyErrored={false}
        renameLabel="Rename"
        removeLabel="Remove"
        onCopy={onCopy}
        onRename={onRename}
        onGroupingChange={onGroupingChange}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions for clawcontrol' }))

    expect(screen.getByRole('menu', { name: 'Actions for clawcontrol' })).toHaveAttribute('data-t3-project-action-menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))
    expect(onCopy).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions for clawcontrol' }))
    fireEvent.change(screen.getByLabelText('Grouping for clawcontrol'), { target: { value: 'repository-path' } })
    expect(onGroupingChange).toHaveBeenCalledWith('repository-path')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onRename).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions for clawcontrol' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalled()
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
