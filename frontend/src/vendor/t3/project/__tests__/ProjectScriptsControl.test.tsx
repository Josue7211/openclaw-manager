import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectScriptsControl from '../ProjectScriptsControl'

const scripts = [
  { id: 'dev', name: 'Tauri dev', command: 'cargo tauri dev', icon: 'play' },
  { id: 'test', name: 'Chat tests', command: 'npm run test', icon: 'test' },
]

describe('T3 copied ProjectScriptsControl adapter', () => {
  it('runs the selected primary action and exposes the adjacent T3-style menu entries', () => {
    const onRunScript = vi.fn()
    const onSelectScript = vi.fn()
    const onAddScript = vi.fn()
    const onEditScript = vi.fn()
    const onDeleteScript = vi.fn()
    const onChangeEnvironment = vi.fn()
    const onOpenTerminal = vi.fn()
    const onOpenReview = vi.fn()
    const onOpenInfo = vi.fn()

    render(
      <ProjectScriptsControl
        scripts={scripts}
        preferredScriptId="dev"
        onSelectScript={onSelectScript}
        onRunScript={onRunScript}
        onAddScript={onAddScript}
        onEditScript={onEditScript}
        onDeleteScript={onDeleteScript}
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

    fireEvent.click(screen.getByRole('menuitem', { name: 'Chat tests' }))
    expect(onSelectScript).toHaveBeenCalledWith('test')
    expect(onRunScript).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected action' }))
    expect(onDeleteScript).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev' }))
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
