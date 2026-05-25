import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectScriptsControl from '../ProjectScriptsControl'

const scripts = [
  { id: 'dev', name: 'Tauri dev', command: 'cargo tauri dev', icon: 'play' },
  { id: 'test', name: 'Chat tests', command: 'npm run test', icon: 'test' },
]

describe('T3 copied ProjectScriptsControl adapter', () => {
  it('runs the selected primary action and exposes the adjacent T3-style menu entries', async () => {
    const onRunScript = vi.fn()
    const onSelectScript = vi.fn()
    const onAddScript = vi.fn()
    const onEditScript = vi.fn()
    const onDeleteScript = vi.fn()
    const onRenameProject = vi.fn()
    const onDeleteProject = vi.fn()
    const onChangeEnvironment = vi.fn()
    const onOpenTerminal = vi.fn()
    const onOpenReview = vi.fn()
    const onOpenInfo = vi.fn()
    const clipboardWriteText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    })

    render(
      <ProjectScriptsControl
        scripts={scripts}
        preferredScriptId="dev"
        projectName="clawctrl"
        projectPath="/Volumes/T7/projects/clawctrl"
        projectEnvironmentLabel="T7"
        onSelectScript={onSelectScript}
        onRunScript={onRunScript}
        onAddScript={onAddScript}
        onEditScript={onEditScript}
        onDeleteScript={onDeleteScript}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onChangeEnvironment={onChangeEnvironment}
        onOpenTerminal={onOpenTerminal}
        onOpenReview={onOpenReview}
        onOpenInfo={onOpenInfo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run Tauri dev' }))
    expect(onRunScript).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev' }))

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('menu', { name: 'Project action menu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tauri dev' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Chat tests' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add action' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit selected action' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete selected action' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Change environment' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('clawctrl')
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('T7 / .../projects/clawctrl')
    expect(screen.getByRole('menuitem', { name: 'Copy project path' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename project clawctrl' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove project clawctrl' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Project danger actions' })).toContainElement(
      screen.getByRole('menuitem', { name: 'Remove project clawctrl' }),
    )
    expect(screen.getByRole('menuitem', { name: 'Delete selected action' })).toHaveStyle({
      color: 'var(--danger, #ef4444)',
    })
    expect(screen.getByRole('menuitem', { name: 'Remove project clawctrl' })).toHaveStyle({
      color: 'var(--danger, #ef4444)',
    })
    expect(screen.queryByRole('button', { name: 'Remove project clawctrl' })).not.toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'Project action menu' })).toHaveStyle({
      overflow: 'hidden',
      backgroundColor: '#18181f',
    })
    expect(screen.getByRole('menu', { name: 'Project action menu' }).querySelector('[data-t3-project-action-menu-scroll]')).toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'Project action menu' }).querySelector('[data-t3-project-action-menu-footer]')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Chat tests' }))
    expect(onSelectScript).toHaveBeenCalledWith('test')
    expect(onRunScript).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy project path' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('/Volumes/T7/projects/clawctrl'))

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected action' }))
    expect(onDeleteScript).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev' }))

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename project clawctrl' }))
    expect(onRenameProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project clawctrl' }))
    expect(onDeleteProject).toHaveBeenCalledTimes(1)
  })

  it('runs project script shortcuts and displays them in the action menu', () => {
    const onRunScript = vi.fn()
    const onSelectScript = vi.fn()

    render(
      <ProjectScriptsControl
        scripts={scripts}
        preferredScriptId="dev"
        keybindings={[
          { key: 'ctrl+shift+t', command: 'script.test.run' },
        ]}
        onSelectScript={onSelectScript}
        onRunScript={onRunScript}
        onAddScript={vi.fn()}
        onEditScript={vi.fn()}
        onDeleteScript={vi.fn()}
        onChangeEnvironment={vi.fn()}
        onOpenTerminal={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenInfo={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('menuitem', { name: 'Chat tests · ctrl+shift+t' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 't', ctrlKey: true, shiftKey: true })

    expect(onSelectScript).toHaveBeenCalledWith('test')
    expect(onRunScript).toHaveBeenCalledWith(expect.objectContaining({ id: 'test' }))
  })

  it('keeps copy project path available when project mutation actions are not wired', async () => {
    const clipboardWriteText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    })

    render(
      <ProjectScriptsControl
        scripts={scripts}
        preferredScriptId="dev"
        projectName="clawctrl"
        projectPath="/Volumes/T7/projects/clawctrl"
        onRunScript={vi.fn()}
        onAddScript={vi.fn()}
        onEditScript={vi.fn()}
        onDeleteScript={vi.fn()}
        onChangeEnvironment={vi.fn()}
        onOpenTerminal={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenInfo={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('clawctrl')
    expect(screen.queryByRole('menuitem', { name: 'Rename project clawctrl' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Remove project clawctrl' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy project path' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('/Volumes/T7/projects/clawctrl'))
  })

  it('exposes recovery actions for unavailable selected folders in the opaque project menu', async () => {
    const onAddProject = vi.fn()
    const onClearProject = vi.fn()
    const onDeleteProject = vi.fn()
    const clipboardWriteText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    })

    render(
      <ProjectScriptsControl
        scripts={scripts}
        projectReady={false}
        projectName="Selected folder unavailable"
        projectPath="/Users/josue/projects/missing-app"
        projectEnvironmentLabel="local"
        onSelectScript={vi.fn()}
        onRunScript={vi.fn()}
        onAddScript={vi.fn()}
        onEditScript={vi.fn()}
        onDeleteScript={vi.fn()}
        onAddProject={onAddProject}
        onClearProject={onClearProject}
        onDeleteProject={onDeleteProject}
        onChangeEnvironment={vi.fn()}
        onOpenTerminal={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenInfo={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))

    const menu = screen.getByRole('menu', { name: 'Project action menu' })
    expect(menu).toHaveStyle({
      opacity: '1',
      backgroundColor: '#18181f',
    })
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('Selected folder unavailable')
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('local / .../projects/missing-app')
    expect(screen.getByRole('menuitem', { name: 'Copy selected folder path' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Remove project/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove selected folder' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Project danger actions' })).toContainElement(
      screen.getByRole('menuitem', { name: 'Remove selected folder' }),
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy selected folder path' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('/Users/josue/projects/missing-app'))

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add selected folder' }))
    expect(onAddProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear selected folder' }))

    expect(onClearProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove selected folder' }))

    expect(onDeleteProject).toHaveBeenCalledTimes(1)
  })

  it('uses script-level shortcuts and lets explicit keybindings override them', () => {
    const onRunScript = vi.fn()
    const onSelectScript = vi.fn()

    render(
      <ProjectScriptsControl
        scripts={[
          scripts[0],
          { ...scripts[1], keybinding: 'ctrl+shift+t' },
        ]}
        keybindings={[
          { key: 'ctrl+alt+t', command: 'script.test.run' },
        ]}
        onSelectScript={onSelectScript}
        onRunScript={onRunScript}
        onAddScript={vi.fn()}
        onEditScript={vi.fn()}
        onDeleteScript={vi.fn()}
        onChangeEnvironment={vi.fn()}
        onOpenTerminal={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenInfo={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('menuitem', { name: 'Chat tests · ctrl+alt+t' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 't', ctrlKey: true, shiftKey: true })
    expect(onRunScript).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 't', ctrlKey: true, altKey: true })
    expect(onSelectScript).toHaveBeenCalledWith('test')
    expect(onRunScript).toHaveBeenCalledWith(expect.objectContaining({ id: 'test' }))
  })

  it('does not run project script shortcuts while typing in form fields', () => {
    const onRunScript = vi.fn()

    render(
      <>
        <input aria-label="Composer" />
        <ProjectScriptsControl
          scripts={scripts}
          keybindings={[
            { key: 'ctrl+shift+t', command: 'script.test.run' },
          ]}
          onRunScript={onRunScript}
          onAddScript={vi.fn()}
          onEditScript={vi.fn()}
          onDeleteScript={vi.fn()}
          onChangeEnvironment={vi.fn()}
          onOpenTerminal={vi.fn()}
          onOpenReview={vi.fn()}
          onOpenInfo={vi.fn()}
        />
      </>,
    )

    fireEvent.keyDown(screen.getByLabelText('Composer'), { key: 't', ctrlKey: true, shiftKey: true })

    expect(onRunScript).not.toHaveBeenCalled()
  })

  it('renders the project action menu as an opaque viewport-clamped menu', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 180 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 })

    render(
      <ProjectScriptsControl
        scripts={scripts}
        preferredScriptId="dev"
        onSelectScript={vi.fn()}
        onRunScript={vi.fn()}
        onAddScript={vi.fn()}
        onEditScript={vi.fn()}
        onDeleteScript={vi.fn()}
        onChangeEnvironment={vi.fn()}
        onOpenTerminal={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenInfo={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'More project actions' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 168,
      y: 16,
      width: 32,
      height: 32,
      top: 16,
      right: 200,
      bottom: 48,
      left: 168,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Project action menu' })
    expect(menu).toHaveStyle({
      left: '8px',
      top: '8px',
      width: '164px',
      position: 'fixed',
      zIndex: '10000',
    })
    expect(menu).toHaveStyle({
      opacity: '1',
      backdropFilter: 'none',
      backgroundColor: '#18181f',
    })

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
  })

  it('supports keyboard navigation to project deletion and returns focus on escape', async () => {
    render(
      <ProjectScriptsControl
        scripts={scripts}
        preferredScriptId="dev"
        projectName="clawctrl"
        projectPath="/Volumes/T7/projects/clawctrl"
        onSelectScript={vi.fn()}
        onRunScript={vi.fn()}
        onAddScript={vi.fn()}
        onEditScript={vi.fn()}
        onDeleteScript={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onChangeEnvironment={vi.fn()}
        onOpenTerminal={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenInfo={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'More project actions' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Project action menu' })

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Tauri dev' })).toHaveFocus()
    })

    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Remove project clawctrl' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })

    expect(screen.queryByRole('menu', { name: 'Project action menu' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('opens terminal, review, and info as explicit header buttons', () => {
    const onOpenTerminal = vi.fn()
    const onOpenReview = vi.fn()
    const onOpenInfo = vi.fn()

    render(
      <ProjectScriptsControl
        scripts={scripts}
        onRunScript={vi.fn()}
        onAddScript={vi.fn()}
        onEditScript={vi.fn()}
        onDeleteScript={vi.fn()}
        onChangeEnvironment={vi.fn()}
        onOpenTerminal={onOpenTerminal}
        onOpenReview={onOpenReview}
        onOpenInfo={onOpenInfo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Session info' }))

    expect(onOpenTerminal).toHaveBeenCalledTimes(1)
    expect(onOpenReview).toHaveBeenCalledTimes(1)
    expect(onOpenInfo).toHaveBeenCalledTimes(1)

    const toolbar = screen.getByTestId('chat-top-actions-toolbar')
    const terminalButton = screen.getByRole('button', { name: 'Open terminal' })
    const reviewButton = screen.getByRole('button', { name: 'Review changes' })
    const infoButton = screen.getByRole('button', { name: 'Session info' })
    expect(toolbar.compareDocumentPosition(terminalButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(terminalButton.compareDocumentPosition(reviewButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(reviewButton.compareDocumentPosition(infoButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
