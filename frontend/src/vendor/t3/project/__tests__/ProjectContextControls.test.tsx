import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClaudeSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import type { ChatWorkspaceProject } from '@/chat/t3-adapters/projectWorkspace'
import {
  ProjectComposerContextBar,
  ProjectEnvironmentDialog,
  ProjectHeaderPanel,
  projectRuntimeDisplayLabel,
} from '../ProjectContextControls'

const project: ChatWorkspaceProject = {
  id: 'local:clawctrl:stable',
  name: 'clawctrl',
  path: '/Volumes/T7/projects/clawctrl',
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

function projectOptionValue(item: ChatWorkspaceProject, duplicatePath = false): string {
  return duplicatePath ? JSON.stringify([item.environmentId || '', item.path]) : item.path
}

describe('T3 copied ProjectContextControls adapter', () => {
  it('keeps generic runtime values but renders Hermes Agent labels for current UI copy', () => {
    expect(projectRuntimeDisplayLabel('Remote harness')).toBe('Hermes Agent remote')
    expect(projectRuntimeDisplayLabel('remote-harness')).toBe('Hermes Agent remote')
    expect(projectRuntimeDisplayLabel('Harness VM')).toBe('Hermes Agent VM')
    expect(projectRuntimeDisplayLabel('harness_vm')).toBe('Hermes Agent VM')
    expect(projectRuntimeDisplayLabel('Work locally')).toBe('Work locally')
  })

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
    expect(screen.getByText('/Volumes/T7/projects/clawctrl')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Run Hermes review' }))
    expect(onRunReview).toHaveBeenCalled()
  })

  it('renders unscoped session info without fake project runtime details', () => {
    render(
      <ProjectHeaderPanel
        panel="info"
        project={{ name: 'Select a project', path: '', branches: ['main'], currentBranch: 'main' }}
        session={null}
        runtime="Work locally"
        branch="main"
        projectReady={false}
        onClose={vi.fn()}
        onRunReview={vi.fn()}
      />,
    )

    const info = screen.getByRole('region', { name: 'Session info' })
    expect(info).toHaveTextContent('No project selected')
    expect(info).toHaveTextContent('Unscoped chat')
    expect(info).not.toHaveTextContent('Select a project')
    expect(info).not.toHaveTextContent('Work locally')
    expect(info).not.toHaveTextContent('main')
  })

  it('renders unavailable selected folder details in session info', () => {
    render(
      <ProjectHeaderPanel
        panel="info"
        project={{ name: 'Select a project', path: '', branches: ['main'], currentBranch: 'main' }}
        projectPath="/tmp/stale"
        projectEnvironmentId="agent-vm"
        session={null}
        runtime="Work locally"
        branch="main"
        projectReady={false}
        onClose={vi.fn()}
        onRunReview={vi.fn()}
      />,
    )

    const info = screen.getByRole('region', { name: 'Session info' })
    expect(info).toHaveTextContent('Selected folder unavailable')
    expect(info).toHaveTextContent('/tmp/stale')
    expect(info).toHaveTextContent('agent-vm')
    expect(info).not.toHaveTextContent('Unscoped chat')
    expect(info).not.toHaveTextContent('Work locally')
  })

  it('does not run Hermes review without an available project folder', () => {
    const onRunReview = vi.fn()

    const { rerender } = render(
      <ProjectHeaderPanel
        panel="review"
        project={{ name: 'Select a project', path: '', branches: ['main'], currentBranch: 'main' }}
        session={null}
        runtime="Work locally"
        branch="main"
        projectReady={false}
        onClose={vi.fn()}
        onRunReview={onRunReview}
      />,
    )

    const unscopedReview = screen.getByRole('button', { name: 'Select a project before review' })
    expect(unscopedReview).toBeDisabled()
    expect(screen.getByText('No project folder selected')).toBeInTheDocument()
    fireEvent.click(unscopedReview)
    expect(onRunReview).not.toHaveBeenCalled()

    rerender(
      <ProjectHeaderPanel
        panel="review"
        project={{ name: 'Select a project', path: '', branches: ['main'], currentBranch: 'main' }}
        projectPath="/tmp/stale"
        projectEnvironmentId="agent-vm"
        session={null}
        runtime="Work locally"
        branch="main"
        projectReady={false}
        onClose={vi.fn()}
        onRunReview={onRunReview}
      />,
    )

    const unavailableReview = screen.getByRole('button', { name: 'Selected folder unavailable' })
    expect(unavailableReview).toBeDisabled()
    expect(screen.getByText('/tmp/stale')).toBeInTheDocument()
    fireEvent.click(unavailableReview)
    expect(onRunReview).not.toHaveBeenCalled()
  })

  it('renders composer project/runtime/branch controls and usage slot', () => {
    const onProjectChange = vi.fn()
    const onRuntimeChange = vi.fn()
    const onBranchChange = vi.fn()
    const onOpenEnvironment = vi.fn()

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
        onOpenEnvironment={onOpenEnvironment}
        usageSlot={<span>Hermes Agent usage</span>}
      />,
    )

    expect(screen.getByLabelText('Local chat context')).toHaveAttribute('data-t3-project-context-toolbar')
    expect(screen.getByRole('status', { name: 'Selected chat project context' })).toHaveTextContent('clawctrl')
    expect(screen.getByRole('status', { name: 'Selected chat project context' })).toHaveTextContent('/Volumes/T7/projects/clawctrl')
    expect(screen.getByRole('status', { name: 'Selected chat project context' })).toHaveTextContent('T7')
    expect(screen.getByRole('option', { name: 'Hermes Agent VM' })).toHaveValue('Harness VM')
    fireEvent.click(screen.getByRole('button', { name: 'Manage project context' }))
    expect(onOpenEnvironment).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Runtime'), { target: { value: 'Harness VM' } })
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'codex/t3' } })
    expect(onRuntimeChange).toHaveBeenCalledWith('Harness VM')
    expect(onBranchChange).toHaveBeenCalledWith('codex/t3')
    expect(screen.getByText('Hermes Agent usage')).toBeInTheDocument()
  })

  it('shows the canonical project option when the selected path has a variant form', () => {
    render(
      <ProjectComposerContextBar
        projectPath={`${project.path}/`}
        projects={[project]}
        onProjectChange={vi.fn()}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={project.branches}
        onBranchChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Project')).toHaveValue(projectOptionValue(project))
  })

  it('lets the composer clear project scope even when projects exist', () => {
    const onProjectChange = vi.fn()

    render(
      <ProjectComposerContextBar
        projectPath={project.path}
        projects={[project]}
        onProjectChange={onProjectChange}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={project.branches}
        onBranchChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'No project' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '' } })

    expect(onProjectChange).toHaveBeenCalledWith('', null)
  })

  it('does not render placeholder projects as duplicate blank selector options', () => {
    render(
      <ProjectComposerContextBar
        projectPath=""
        projects={[{ name: 'Select a project', path: '', branches: ['main'], currentBranch: 'main' }]}
        onProjectChange={vi.fn()}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={['main']}
        onBranchChange={vi.fn()}
        projectReady={false}
      />,
    )

    const blankOptions = screen.getAllByRole('option').filter((option) => (
      option instanceof HTMLOptionElement && option.value === ''
    ))
    expect(blankOptions).toHaveLength(1)
    expect(blankOptions[0]).toHaveTextContent('Select a project')
    expect(screen.queryByRole('option', { name: 'No project' })).not.toBeInTheDocument()
  })

  it('keeps an unavailable selected project visible in the composer selector', async () => {
    const onProjectChange = vi.fn()
    const onAddProject = vi.fn()
    const clipboardWriteText = vi.fn(async () => undefined)
    const missingPath = '/Volumes/T7/projects/missing-app'
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    })

    render(
      <ProjectComposerContextBar
        projectPath={missingPath}
        projects={[project]}
        onProjectChange={onProjectChange}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={project.branches}
        onBranchChange={vi.fn()}
        projectReady={false}
        onAddProject={onAddProject}
      />,
    )

    const selector = screen.getByLabelText('Project')
    expect(selector).toHaveValue(missingPath)
    expect(screen.getByRole('option', { name: 'Unavailable - .../projects/missing-app' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'No project' })).toBeInTheDocument()

    fireEvent.change(selector, { target: { value: '' } })
    expect(onProjectChange).toHaveBeenCalledWith('', null)

    fireEvent.click(screen.getByRole('button', { name: 'Add selected folder' }))
    expect(onAddProject).toHaveBeenCalledWith(missingPath)

    fireEvent.click(screen.getByRole('button', { name: 'Copy selected folder path' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith(missingPath))

    fireEvent.click(screen.getByRole('button', { name: 'Clear selected folder' }))
    expect(onProjectChange).toHaveBeenLastCalledWith('', null)
  })

  it('does not show a stale selected environment as the available same-path project', () => {
    const missingEnvironmentValue = JSON.stringify(['harness-vm', project.path])

    render(
      <ProjectComposerContextBar
        projectPath={project.path}
        projectEnvironmentId="harness-vm"
        projects={[project]}
        onProjectChange={vi.fn()}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={project.branches}
        onBranchChange={vi.fn()}
        projectReady={false}
        onAddProject={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Project')).toHaveValue(missingEnvironmentValue)
    expect(screen.getByRole('option', { name: 'Unavailable - Hermes Agent VM / .../projects/clawctrl' })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'Selected chat project context' })).toHaveTextContent('Hermes Agent VM')
    expect(screen.getByRole('status', { name: 'Selected chat project context' })).not.toHaveTextContent('harness-vm')
    expect(screen.getByRole('option', { name: 'clawctrl' })).toHaveValue(projectOptionValue(project))
  })

  it('disambiguates projects with the same folder name in project selects', () => {
    const localProject: ChatWorkspaceProject = {
      ...project,
      id: 'local:clawctrl',
      path: '/run/media/josue/T7/projects/clawctrl',
      machineLabel: undefined,
      machine: undefined,
      host: undefined,
      environmentId: 'local',
    }
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'vm:clawctrl',
      path: '/home/josue/projects/clawctrl',
      environmentId: 'agent-vm',
      machineLabel: 'Agent VM',
    }

    render(
      <ProjectComposerContextBar
        projectPath={localProject.path}
        projects={[localProject, remoteProject]}
        onProjectChange={vi.fn()}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={project.branches}
        onBranchChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', {
      name: 'clawctrl - T7 / .../projects/clawctrl',
    })).toBeInTheDocument()
    expect(screen.getByRole('option', {
      name: 'clawctrl - Agent VM / .../projects/clawctrl',
    })).toBeInTheDocument()
  })

  it('routes same-path project select changes with environment identity', () => {
    const onProjectChange = vi.fn()
    const localProject: ChatWorkspaceProject = {
      ...project,
      id: 'local:clawctrl',
      environmentId: 'local',
      machineLabel: 'T7',
    }
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'vm:clawctrl',
      environmentId: 'agent-vm',
      machineLabel: 'Agent VM',
    }

    render(
      <ProjectComposerContextBar
        projectPath={remoteProject.path}
        projectEnvironmentId={remoteProject.environmentId ?? undefined}
        projects={[localProject, remoteProject]}
        onProjectChange={onProjectChange}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={project.branches}
        onBranchChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Project')).toHaveValue(projectOptionValue(remoteProject, true))
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: projectOptionValue(localProject, true) } })
    expect(onProjectChange).toHaveBeenCalledWith(localProject.path, 'local')
  })

  it('prefers local for legacy path-only same-path project selection state', () => {
    const onProjectChange = vi.fn()
    const localProject: ChatWorkspaceProject = {
      ...project,
      id: 'local:clawctrl',
      environmentId: 'local',
      machineLabel: 'T7',
    }
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'vm:clawctrl',
      environmentId: 'agent-vm',
      machineLabel: 'Agent VM',
    }

    render(
      <ProjectComposerContextBar
        projectPath={project.path}
        projects={[remoteProject, localProject]}
        onProjectChange={onProjectChange}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={project.branches}
        onBranchChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Project')).toHaveValue(projectOptionValue(localProject, true))
  })


  it('surfaces project add from composer context when no project is selected', () => {
    const onAddProject = vi.fn()

    render(
      <ProjectComposerContextBar
        projectPath=""
        projects={[{ name: 'Select a project', path: '', branches: ['main'], currentBranch: 'main' }]}
        onProjectChange={vi.fn()}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        onRuntimeChange={vi.fn()}
        branch="main"
        branches={['main']}
        onBranchChange={vi.fn()}
        projectReady={false}
        onAddProject={onAddProject}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add project folder' }))
    expect(onAddProject).toHaveBeenCalledTimes(1)
    expect(onAddProject).toHaveBeenCalledWith(undefined)
    expect(screen.getByLabelText('Runtime')).toBeDisabled()
    expect(screen.getByLabelText('Branch')).toBeDisabled()
  })

  it('renders environment dialog controls and close action', () => {
    const onClose = vi.fn()
    const onAddProject = vi.fn()
    const onProjectChange = vi.fn()
    const onRemoveProject = vi.fn()

    render(
      <ProjectEnvironmentDialog
        projectPath={project.path}
        projectEnvironmentId={project.environmentId ?? undefined}
        projects={[project]}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        branch="main"
        branches={project.branches}
        onProjectChange={onProjectChange}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        onAddProject={onAddProject}
        onRemoveProject={onRemoveProject}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Environment settings' })
    expect(dialog).toHaveAttribute('data-t3-project-environment-dialog')
    expect(dialog).toHaveStyle({
      background: 'rgba(0, 0, 0, 0.72)',
      zIndex: '10020',
    })
    const panel = dialog.querySelector('[data-t3-project-environment-panel]')
    expect(panel).toHaveStyle({
      opacity: '1',
      isolation: 'isolate',
    })
    expect((panel as HTMLElement).style.background).toContain('--bg-panel-solid')
    expect((panel as HTMLElement).style.background).toContain('--bg-base')
    const projectSelect = screen.getByLabelText('Project')
    expect((projectSelect.closest('label') as HTMLElement).style.background).toContain('--bg-card-solid')
    expect((projectSelect as HTMLSelectElement).style.backgroundColor).toContain('--bg-card-solid')
    const selectedProjectActions = screen.getByRole('region', { name: 'Selected project actions' })
    expect(selectedProjectActions).toHaveTextContent('clawctrl')
    expect(selectedProjectActions).toHaveTextContent('/Volumes/T7/projects/clawctrl')
    expect((selectedProjectActions as HTMLElement).style.border).toContain('var(--border)')
    expect(screen.getAllByRole('button', { name: /Remove selected project/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected project clawctrl' }))
    expect(onRemoveProject).toHaveBeenCalledWith(project.path, 'local')
    onRemoveProject.mockClear()
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: projectOptionValue(project) } })
    expect(onProjectChange).toHaveBeenCalledWith(project.path, 'local')
    fireEvent.click(screen.getByRole('button', { name: 'Add project folder' }))
    expect(onAddProject).toHaveBeenCalledWith(undefined)
    expect(onRemoveProject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close environment settings' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('filters and selects visible project roots in environment settings', () => {
    const onProjectChange = vi.fn()
    const localProject: ChatWorkspaceProject = {
      ...project,
      id: 'local:clawctrl',
      machineLabel: 'T7',
    }
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'vm:agentshell',
      name: 'AgentShell',
      path: '/Users/josue/AgentShell',
      environmentId: 'agent-vm',
      machineLabel: 'Agent VM',
    }

    render(
      <ProjectEnvironmentDialog
        projectPath={localProject.path}
        projectEnvironmentId={localProject.environmentId ?? undefined}
        projects={[localProject, remoteProject]}
        runtime="Work locally"
        runtimeModes={['Work locally', 'Remote harness']}
        branch="main"
        branches={project.branches}
        onProjectChange={onProjectChange}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('listbox', { name: 'Project folders' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search project folders' })).toHaveFocus()
    expect(screen.getByRole('option', { name: 'Select project folder clawctrl T7' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.change(screen.getByRole('textbox', { name: 'Search project folders' }), {
      target: { value: 'agent vm' },
    })

    expect(screen.queryByRole('option', { name: 'Select project folder clawctrl T7' })).not.toBeInTheDocument()
    const remoteOption = screen.getByRole('option', { name: 'Select project folder AgentShell Agent VM' })
    expect(remoteOption).toBeInTheDocument()
    fireEvent.click(remoteOption)

    expect(onProjectChange).toHaveBeenCalledWith('/Users/josue/AgentShell', 'agent-vm')
    fireEvent.click(screen.getByRole('button', { name: 'Clear project search' }))
    expect(screen.getByRole('option', { name: 'Select project folder clawctrl T7' })).toBeInTheDocument()
  })

  it('selects filtered project roots from the keyboard before closing the dialog', () => {
    const onClose = vi.fn()
    const onProjectChange = vi.fn()
    const localProject: ChatWorkspaceProject = {
      ...project,
      id: 'local:clawctrl',
      machineLabel: 'T7',
    }
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'vm:agentshell',
      name: 'AgentShell',
      path: '/Users/josue/AgentShell',
      environmentId: 'agent-vm',
      machineLabel: 'Agent VM',
    }

    render(
      <ProjectEnvironmentDialog
        projectPath={localProject.path}
        projectEnvironmentId={localProject.environmentId ?? undefined}
        projects={[localProject, remoteProject]}
        runtime="Work locally"
        runtimeModes={['Work locally', 'Remote harness']}
        branch="main"
        branches={project.branches}
        onProjectChange={onProjectChange}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        onClose={onClose}
      />,
    )

    const search = screen.getByRole('textbox', { name: 'Search project folders' })
    fireEvent.change(search, { target: { value: 'agent vm' } })

    expect(search).toHaveAttribute('aria-activedescendant', 'chat-environment-project-folders-option-1')
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onProjectChange).toHaveBeenCalledWith('/Users/josue/AgentShell', 'agent-vm')

    fireEvent.change(search, { target: { value: 'claw' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveValue('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dismisses environment settings with Escape and backdrop clicks', () => {
    const onClose = vi.fn()

    render(
      <ProjectEnvironmentDialog
        projectPath={project.path}
        projects={[project]}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        branch="main"
        branches={project.branches}
        onProjectChange={vi.fn()}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Environment settings' })
    const panel = dialog.querySelector('[data-t3-project-environment-panel]')

    fireEvent.mouseDown(panel as Element)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('canonicalizes selected project path variants in the environment dialog', () => {
    const onRemoveProject = vi.fn()

    render(
      <ProjectEnvironmentDialog
        projectPath={`${project.path}/`}
        projectEnvironmentId="local"
        projects={[project]}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        branch="main"
        branches={project.branches}
        onProjectChange={vi.fn()}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        onRemoveProject={onRemoveProject}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Project')).toHaveValue(projectOptionValue(project))
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected project clawctrl' }))
    expect(onRemoveProject).toHaveBeenCalledWith(project.path, 'local')
  })

  it('surfaces project add from environment settings when no project is selected', () => {
    const onAddProject = vi.fn()

    render(
      <ProjectEnvironmentDialog
        projectPath=""
        projects={[{ name: 'Select a project', path: '', branches: ['main'], currentBranch: 'main' }]}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        branch="main"
        branches={['main']}
        onProjectChange={vi.fn()}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        projectReady={false}
        onAddProject={onAddProject}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add project folder' }))
    expect(onAddProject).toHaveBeenCalledTimes(1)
    expect(onAddProject).toHaveBeenCalledWith(undefined)
    expect(screen.getByLabelText('Runtime')).toBeDisabled()
    expect(screen.getByLabelText('Branch')).toBeDisabled()
  })

  it('keeps an unavailable selected project visible in environment settings', async () => {
    const missingPath = '/Users/josue/projects/missing-app'
    const onProjectChange = vi.fn()
    const onAddProject = vi.fn()
    const onRemoveProject = vi.fn()
    const clipboardWriteText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    })

    render(
      <ProjectEnvironmentDialog
        projectPath={missingPath}
        projects={[project]}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        branch="main"
        branches={project.branches}
        onProjectChange={onProjectChange}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        projectReady={false}
        onAddProject={onAddProject}
        onRemoveProject={onRemoveProject}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Project')).toHaveValue(missingPath)
    expect(screen.getByRole('option', { name: 'Unavailable - .../projects/missing-app' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add selected folder' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Selected project unavailable' })).toHaveTextContent('Selected folder unavailable')
    expect(screen.getByRole('status', { name: 'Selected project unavailable' })).toHaveTextContent('.../projects/missing-app')

    fireEvent.click(screen.getByRole('button', { name: 'Add selected folder' }))
    expect(onAddProject).toHaveBeenCalledWith(missingPath)

    fireEvent.click(screen.getByRole('button', { name: 'Add selected project folder' }))
    expect(onAddProject).toHaveBeenCalledWith(missingPath)

    fireEvent.click(screen.getByRole('button', { name: 'Copy selected folder path' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith(missingPath))

    fireEvent.click(screen.getByRole('button', { name: 'Clear selected folder' }))
    expect(onProjectChange).toHaveBeenCalledWith('', null)

    fireEvent.click(screen.getByRole('button', { name: 'Remove selected folder' }))
    expect(onRemoveProject).toHaveBeenCalledWith(missingPath, null)
  })

  it('keeps a stale selected environment visible in environment settings', () => {
    const missingEnvironmentValue = JSON.stringify(['harness-vm', project.path])
    const onProjectChange = vi.fn()
    const onAddProject = vi.fn()
    const onRemoveProject = vi.fn()

    render(
      <ProjectEnvironmentDialog
        projectPath={project.path}
        projectEnvironmentId="harness-vm"
        projects={[project]}
        runtime="Work locally"
        runtimeModes={['Work locally']}
        branch="main"
        branches={project.branches}
        onProjectChange={onProjectChange}
        onRuntimeChange={vi.fn()}
        onBranchChange={vi.fn()}
        projectReady={false}
        onAddProject={onAddProject}
        onRemoveProject={onRemoveProject}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Project')).toHaveValue(missingEnvironmentValue)
    expect(screen.getByRole('option', { name: 'Unavailable - Hermes Agent VM / .../projects/clawctrl' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Add selected folder' }))
    expect(onAddProject).toHaveBeenCalledWith(project.path)
    expect(screen.getByRole('status', { name: 'Selected project unavailable' })).toHaveTextContent('Hermes Agent VM / .../projects/clawctrl')
    expect(screen.getByRole('status', { name: 'Selected project unavailable' })).not.toHaveTextContent('harness-vm')

    fireEvent.click(screen.getByRole('button', { name: 'Clear selected folder' }))
    expect(onProjectChange).toHaveBeenCalledWith('', null)

    fireEvent.click(screen.getByRole('button', { name: 'Remove selected folder' }))
    expect(onRemoveProject).toHaveBeenCalledWith(project.path, 'harness-vm')
  })
})
