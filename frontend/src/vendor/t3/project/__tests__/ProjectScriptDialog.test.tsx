import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectScriptDialog, { type ProjectScriptDialogDraft } from '../ProjectScriptDialog'

describe('T3 copied ProjectScriptDialog adapter', () => {
  it('edits and validates project action shortcuts', () => {
    let draft: ProjectScriptDialogDraft = {
      name: 'Chat tests',
      command: 'npm run test',
      icon: 'test',
      keybinding: '',
      runOnWorktreeCreate: false,
    }
    const onSave = vi.fn()

    const { rerender } = render(
      <ProjectScriptDialog
        mode="add"
        draft={draft}
        onDraftChange={(next) => {
          draft = next
          rerender(
            <ProjectScriptDialog
              mode="add"
              draft={draft}
              onDraftChange={(updated) => {
                draft = updated
              }}
              onCancel={vi.fn()}
              onSave={onSave}
            />,
          )
        }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('Shortcut'), { target: { value: 'ctrl+shift+t' } })
    expect(draft.keybinding).toBe('ctrl+shift+t')
    fireEvent.change(screen.getByLabelText('Working directory'), { target: { value: 'frontend' } })
    expect(draft.cwd).toBe('frontend')

    fireEvent.click(screen.getByRole('button', { name: 'Save action' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid project action shortcuts', () => {
    const onSave = vi.fn()

    render(
      <ProjectScriptDialog
        mode="add"
        draft={{
          name: 'Chat tests',
          command: 'npm run test',
          icon: 'test',
          keybinding: 'ctrl+shift+💥',
          runOnWorktreeCreate: false,
        }}
        onDraftChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save action' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid keybinding.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('renders edit and icon picker surfaces as opaque panels', () => {
    render(
      <ProjectScriptDialog
        mode="edit"
        draft={{
          name: 'Chat tests',
          command: 'npm run test',
          icon: 'test',
          keybinding: 'ctrl+shift+t',
          runOnWorktreeCreate: false,
        }}
        editingScript={{ id: 'test', name: 'Chat tests', command: 'npm run test', icon: 'test' }}
        onDraftChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const overlay = screen.getByRole('dialog', { name: 'Edit Action' })
    expect(overlay).toHaveStyle({ zIndex: '10020' })

    const dialog = overlay.querySelector('form')
    expect(dialog).toHaveStyle({
      opacity: '1',
      isolation: 'isolate',
    })
    expect(dialog?.style.background).toContain('--bg-panel-solid')
    expect(dialog?.style.background).toContain('--bg-base')

    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    const iconMenu = screen.getByRole('menu', { name: 'Action icons' })
    expect(iconMenu).toHaveStyle({
      opacity: '1',
      isolation: 'isolate',
    })
    expect(iconMenu.style.background).toContain('--bg-panel-solid')
    expect(iconMenu.style.background).toContain('--bg-base')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog', { name: 'Delete action Chat tests?' })).toHaveStyle({
      zIndex: '10020',
    })
  })
})
