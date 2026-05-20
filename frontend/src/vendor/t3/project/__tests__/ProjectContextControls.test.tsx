import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClaudeSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import type { ChatWorkspaceProject } from '@/chat/t3-adapters/projectWorkspace'
import {
  ProjectComposerContextBar,
  ProjectEnvironmentDialog,
  ProjectHeaderPanel,
} from '../ProjectContextControls'

const project: ChatWorkspaceProject = {
  id: 'local:clawcontrol:stable',
  name: 'clawcontrol',
  path: '/Volumes/T7/projects/clawcontrol',
  environmentId: 'local',
  branches: ['main', 'codex/t3'],
  currentBranch: 'main',
}

const session: ClaudeSession = {
  key: 'thread-1',
  label: 'Project chat',
  agentKey: 'main',
  messageCount: 3,
  lastActivity: new Date().toISOString(),
}

describe('T3 copied ProjectContextControls adapter', () => {
  it('renders header info and review panels from the vendor surface', () => {
    const onClose = vi.fn()
    const onRunReview = vi.fn()

    const { rerender } = render(
      <ProjectHeaderPanel
        panel="info"
        project={project}
        session={session}
        runtime="Work locally"
        branch="main"
        onClose={onClose}
        onRunReview={onRunReview}
      />,
    )

    expect(screen.getByRole('region', { name: 'Session info' })).toHaveAttribute('data-t3-project-header-panel')
    expect(screen.getByText('Project chat')).toBeInTheDocument()
    expect(screen.getByText('/Volumes/T7/projects/clawcontrol')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Session info' }))
    expect(onClose).toHaveBeenCalled()

    rerender(
      <ProjectHeaderPanel
        panel="review"
        project={project}
        session={session}
        runtime="Work locally"
        branch="main"
        onClose={onClose}
        onRunReview={onRunReview}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run Codex review' }))
    expect(onRunReview).toHaveBeenCalled()
  })

  it('renders composer project/runtime/branch controls and usage slot', () => {
    const onProjectChange = vi.fn()
    const onRuntimeChange = vi.fn()
    const onBranchChange = vi.fn()

    render(
      <ProjectComposerContextBar
        projectPath={project.path}
        projects={[project]}
        onProjectChange={onProjectChange}
        runtime="Work locally"
        runtimeModes={['Work locally', 'Harness VM']}
        onRuntimeChange={onRuntimeChange}
        branch="main"
        branches={project.branches}
        onBranchChange={onBranchChange}
        usageSlot={<span>Codex LB usage</span>}
      />,
    )

    expect(screen.getByLabelText('Local chat context')).toHaveAttribute('data-t3-project-context-toolbar')
    fireEvent.change(screen.getByLabelText('Runtime'), { target: { value: 'Harness VM' } })
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'codex/t3' } })
    expect(onRuntimeChange).toHaveBeenCalledWith('Harness VM')
    expect(onBranchChange).toHaveBeenCalledWith('codex/t3')
    expect(screen.getByText('Codex LB usage')).toBeInTheDocument()
  })

  it('renders environment dialog controls and close action', () => {
    const onClose = vi.fn()
    const onProjectChange = vi.fn()

    render(
      <ProjectEnvironmentDialog
        projectPath={project.path}
        projects={[project]}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        branch="main"
        branches={project.branches}
        onProjectChange={onProjectChange}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Environment settings' })).toHaveAttribute('data-t3-project-environment-dialog')
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: project.path } })
    expect(onProjectChange).toHaveBeenCalledWith(project.path)
    fireEvent.click(screen.getByRole('button', { name: 'Close environment settings' }))
    expect(onClose).toHaveBeenCalled()
  })
})
