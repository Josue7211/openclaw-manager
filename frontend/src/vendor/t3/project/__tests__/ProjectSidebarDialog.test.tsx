import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectSidebarDialog from '../ProjectSidebarDialog'

describe('ProjectSidebarDialog', () => {
  it('confirms project deletion without rendering an editable field', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()

    render(
      <ProjectSidebarDialog
        mode="delete"
        value="AgentShell"
        projectPath="/Users/josue/AgentShell"
        projectEnvironmentLabel="Harness VM"
        onChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Remove project' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveFocus()
    expect(dialog).toHaveAttribute('aria-describedby', 'project-sidebar-dialog-delete-description')
    expect(screen.getByText('Hermes Agent VM')).toBeInTheDocument()
    expect(screen.queryByText('Harness VM')).not.toBeInTheDocument()
    expect(screen.getByText('/Users/josue/AgentShell')).toBeInTheDocument()
    expect(screen.getByText('Remove this project from the Hermes Agent workspace. Saved chats and files are not deleted.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('does not delete the folder')
    expect(screen.getByRole('note')).toHaveTextContent('Hermes Agent workspace')
    expect(screen.getByRole('note')).not.toHaveTextContent('ClawControl')
    expect(screen.getByRole('note')).not.toHaveTextContent('chat workspace')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('presentation')).toHaveStyle({
      zIndex: '10020',
      backdropFilter: 'none',
    })
    expect(dialog).toHaveStyle({
      opacity: '1',
      isolation: 'isolate',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove project AgentShell' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('supports keyboard confirm and cancel in delete mode', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()

    render(
      <ProjectSidebarDialog
        mode="delete"
        value="AgentShell"
        projectPath="/Users/josue/AgentShell"
        onChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not submit or cancel from keyboard while submitting', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()

    render(
      <ProjectSidebarDialog
        mode="delete"
        value="AgentShell"
        projectPath="/Users/josue/AgentShell"
        submitting
        onChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('describes add mode as adding folders to Hermes Agent workspace', () => {
    render(
      <ProjectSidebarDialog
        mode="add"
        value=""
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Add project' })).toHaveTextContent(
      'Enter local project directories to add them to the Hermes Agent workspace.',
    )
    expect(screen.getByRole('textbox', { name: 'Project folder path' })).toBeInTheDocument()
    expect(screen.queryByText(/chat sidebar/i)).not.toBeInTheDocument()
  })
})
