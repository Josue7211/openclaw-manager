import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { ClaudeSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import type { ChatWorkspaceProject } from '@/chat/t3-adapters/projectWorkspace'
import ProjectSidebar from '../ProjectSidebar'

const project: ChatWorkspaceProject = {
  id: 'local:project',
  environmentId: 'local',
  name: 'Project',
  path: '/Users/josue/Project',
  root: '/Users/josue/Project',
  branches: ['main'],
  currentBranch: 'main',
}

function projectSession(index: number): ClaudeSession {
  return {
    key: `thread-${index}`,
    label: `Project chat ${index}`,
    agentKey: 'codex-cli',
    messageCount: index,
    lastActivity: `2026-05-${String(index).padStart(2, '0')}T10:00:00.000Z`,
    projectId: project.id,
    workingDir: project.path,
  }
}

function renderSidebar(sessions: ClaudeSession[], overrides: Partial<ComponentProps<typeof ProjectSidebar>> = {}) {
  return render(
    <MemoryRouter>
      <ProjectSidebar
        sessions={sessions}
        sessionsAvailable
        sessionsLoading={false}
        selectedSessionKey={null}
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onCollapse={vi.fn()}
        onRenameSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onPinSession={vi.fn()}
        onCompactSession={vi.fn()}
        compactingSessionKey={null}
        projects={[project]}
        selectedPath={project.path}
        onSelectProject={vi.fn()}
        onNewProjectChat={vi.fn()}
        onAddProject={vi.fn()}
        onRenameProject={vi.fn()}
        onProjectGroupingOverride={vi.fn()}
        onRemoveProject={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('T3 copied ProjectSidebar adapter', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('keeps extra project chats reachable behind a show-more control', () => {
    renderSidebar(Array.from({ length: 8 }, (_, index) => projectSession(index + 1)))

    const projects = screen.getByRole('group', { name: '/Users/josue/Project' })
    expect(within(projects).getByRole('option', { name: 'Project chat 1, 1 message' })).toBeInTheDocument()
    expect(within(projects).queryByRole('option', { name: 'Project chat 8, 8 messages' })).not.toBeInTheDocument()

    fireEvent.click(within(projects).getByRole('button', { name: 'Show 2 more chats' }))

    expect(within(projects).getByRole('option', { name: 'Project chat 8, 8 messages' })).toBeInTheDocument()
  })

  it('shows all matching project chats while searching', () => {
    renderSidebar(Array.from({ length: 8 }, (_, index) => projectSession(index + 1)))

    fireEvent.change(screen.getByRole('textbox', { name: 'Search chats' }), {
      target: { value: 'Project chat' },
    })

    expect(screen.getByRole('option', { name: 'Project chat 8, 8 messages' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show .* more chats/ })).not.toBeInTheDocument()
  })

  it('filters project groups by project name and path while searching', () => {
    const otherProject: ChatWorkspaceProject = {
      id: 'local:other',
      environmentId: 'local',
      name: 'Other',
      path: '/Users/josue/Other',
      root: '/Users/josue/Other',
      branches: ['main'],
      currentBranch: 'main',
    }

    renderSidebar([], {
      projects: [project, otherProject],
      selectedPath: '',
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Search chats' }), {
      target: { value: '/Users/josue/Project' },
    })

    expect(screen.getByRole('button', { name: 'Select project Project' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select project Other' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search chats' }), {
      target: { value: 'no-matching-project' },
    })

    expect(screen.getByText('No matching projects')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select project Project' })).not.toBeInTheDocument()
  })

  it('clears sidebar search from the clear button and Escape', () => {
    renderSidebar(Array.from({ length: 2 }, (_, index) => projectSession(index + 1)))

    const search = screen.getByRole('textbox', { name: 'Search chats' })
    fireEvent.change(search, { target: { value: 'Project chat 1' } })

    expect(search).toHaveValue('Project chat 1')
    expect(screen.getByRole('button', { name: 'Clear chat search' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Project chat 2, 2 messages' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear chat search' }))

    expect(search).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Project chat 2, 2 messages' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear chat search' })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Project chat 1' } })
    fireEvent.keyDown(search, { key: 'Escape' })

    expect(search).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Project chat 2, 2 messages' })).toBeInTheDocument()
  })

  it('focuses sidebar search with slash without stealing typing from inputs', () => {
    render(
      <MemoryRouter>
        <input aria-label="Outside field" />
        <ProjectSidebar
          sessions={[]}
          sessionsAvailable
          sessionsLoading={false}
          selectedSessionKey={null}
          onSelectSession={vi.fn()}
          onNewChat={vi.fn()}
          onCollapse={vi.fn()}
          onRenameSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onPinSession={vi.fn()}
          onCompactSession={vi.fn()}
          compactingSessionKey={null}
          projects={[project]}
          selectedPath={project.path}
          onSelectProject={vi.fn()}
          onNewProjectChat={vi.fn()}
          onAddProject={vi.fn()}
          onRenameProject={vi.fn()}
          onProjectGroupingOverride={vi.fn()}
          onRemoveProject={vi.fn()}
        />
      </MemoryRouter>,
    )

    const search = screen.getByRole('textbox', { name: 'Search chats' })
    const outside = screen.getByRole('textbox', { name: 'Outside field' })

    fireEvent.keyDown(window, { key: '/' })
    expect(search).toHaveFocus()

    outside.focus()
    fireEvent.keyDown(outside, { key: '/' })
    expect(outside).toHaveFocus()
  })

  it('exposes project deletion from the project action menu', () => {
    const onRemoveProject = vi.fn()
    renderSidebar([], { onRemoveProject })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for project Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project Project' }))

    expect(onRemoveProject).toHaveBeenCalledWith('/Users/josue/Project', 'local')
  })

  it('matches the selected project with normalized path variants', () => {
    const onSelectProject = vi.fn()
    renderSidebar([], {
      selectedPath: '/Users/josue/Project/',
      onSelectProject,
    })

    const projectButton = screen.getByRole('button', { name: 'Select project Project' })
    expect(projectButton).toHaveAttribute('aria-current', 'true')

    fireEvent.click(projectButton)

    expect(onSelectProject).toHaveBeenCalledWith('/Users/josue/Project', 'local')
  })

  it('keeps same-path project roots distinct by environment id', () => {
    const onSelectProject = vi.fn()
    const onRemoveProject = vi.fn()
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'remote:project',
      environmentId: 'remote-vm',
      machineLabel: 'Harness VM',
    }

    renderSidebar([], {
      projects: [project, remoteProject],
      selectedPath: remoteProject.path,
      selectedEnvironmentId: 'remote-vm',
      onSelectProject,
      onRemoveProject,
    })

    const localGroup = screen.getByRole('group', { name: '/Users/josue/Project' })
    const remoteGroup = screen.getByRole('group', { name: 'Hermes Agent VM' })
    const remoteRoot = within(remoteGroup).getByRole('button', { name: 'Select project Project' })
    expect(remoteRoot).toHaveAttribute('aria-current', 'true')
    fireEvent.click(within(localGroup).getByRole('button', { name: 'Select project Project' }))
    expect(onSelectProject).toHaveBeenCalledWith('/Users/josue/Project', 'local')

    fireEvent.click(within(remoteGroup).getByRole('button', { name: 'More actions for project Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project Project' }))
    expect(onRemoveProject).toHaveBeenCalledWith('/Users/josue/Project', 'remote-vm')
  })

  it('uses remove wording for grouped project root actions', () => {
    const onRemoveProject = vi.fn()
    const repositoryIdentity = {
      canonicalKey: 'github.com/josue/project',
      displayName: 'Project',
      name: 'Project',
      rootPath: '/Users/josue/Project',
    }
    const appProject: ChatWorkspaceProject = {
      ...project,
      id: 'local:project-app',
      name: 'Project App',
      path: '/Users/josue/Project/app',
      root: '/Users/josue/Project',
      repositoryIdentity,
    }
    const apiProject: ChatWorkspaceProject = {
      ...project,
      id: 'local:project-api',
      name: 'Project API',
      path: '/Users/josue/Project/api',
      root: '/Users/josue/Project',
      repositoryIdentity,
    }

    renderSidebar([], {
      projects: [appProject, apiProject],
      selectedPath: appProject.path,
      onRemoveProject,
    })

    const group = screen.getByRole('group', { name: '/Users/josue/Project' })
    expect(within(group).getByRole('button', { name: 'Select project Project' })).toBeInTheDocument()

    fireEvent.click(within(group).getAllByRole('button', { name: 'More actions for Project root /Users/josue/Project' })[0]!)

    expect(screen.queryByRole('menuitem', { name: /Delete .*root/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Project root /Users/josue/Project' }))

    expect(onRemoveProject).toHaveBeenCalledWith('/Users/josue/Project/api', 'local')
  })

  it('does not select every same-path project root when saved environment is missing', () => {
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'remote:project',
      environmentId: 'remote-vm',
      machineLabel: 'Harness VM',
    }

    renderSidebar([], {
      projects: [project, remoteProject],
      selectedPath: project.path,
      selectedEnvironmentId: '',
    })

    const localGroup = screen.getByRole('group', { name: '/Users/josue/Project' })
    const remoteGroup = screen.getByRole('group', { name: 'Hermes Agent VM' })
    expect(within(localGroup).getByRole('button', { name: 'Select project Project' })).toHaveAttribute('aria-current', 'true')
    expect(within(remoteGroup).getByRole('button', { name: 'Select project Project' })).not.toHaveAttribute('aria-current')
  })

  it('selects the only matching project root when saved environment is missing', () => {
    const onSelectProject = vi.fn()
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'remote:project',
      environmentId: 'remote-vm',
      machineLabel: 'Harness VM',
    }

    renderSidebar([], {
      projects: [remoteProject],
      selectedPath: remoteProject.path,
      selectedEnvironmentId: '',
      onSelectProject,
    })

    const projectButton = screen.getByRole('button', { name: 'Select project Project' })
    expect(projectButton).toHaveAttribute('aria-current', 'true')
    fireEvent.click(projectButton)
    expect(onSelectProject).toHaveBeenCalledWith('/Users/josue/Project', 'remote-vm')
  })

  it('scopes sidebar thread selection and clicks by environment when thread ids collide', () => {
    const onSelectSession = vi.fn()
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'desktop:project',
      environmentId: 'desktop',
      machineLabel: 'Desktop',
    }
    const localSession: ClaudeSession = {
      key: 'shared-thread',
      label: 'Local shared thread',
      agentKey: 'codex-cli',
      messageCount: 2,
      lastActivity: '2026-05-10T10:00:00.000Z',
      workingDir: project.path,
      environmentId: 'local',
    }
    const desktopSession: ClaudeSession = {
      key: 'shared-thread',
      label: 'Desktop shared thread',
      agentKey: 'codex-cli',
      messageCount: 4,
      lastActivity: '2026-05-11T10:00:00.000Z',
      workingDir: remoteProject.path,
      environmentId: 'desktop',
    }

    renderSidebar([localSession, desktopSession], {
      projects: [project, remoteProject],
      selectedSessionKey: 'shared-thread',
      selectedSessionEnvironmentId: 'desktop',
      onSelectSession,
    })

    expect(screen.getByRole('option', { name: 'Local shared thread, 2 messages' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('option', { name: 'Desktop shared thread, 4 messages' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('option', { name: 'Local shared thread, 2 messages' }))
    expect(onSelectSession).toHaveBeenLastCalledWith('shared-thread', 'local')

    fireEvent.click(screen.getByRole('option', { name: 'Desktop shared thread, 4 messages' }))
    expect(onSelectSession).toHaveBeenLastCalledWith('shared-thread', 'desktop')
  })

  it('tracks copied project paths by environment when roots share the same path', async () => {
    const remoteProject: ChatWorkspaceProject = {
      ...project,
      id: 'remote:project',
      environmentId: 'remote-vm',
      machineLabel: 'Harness VM',
    }

    renderSidebar([], {
      projects: [project, remoteProject],
      selectedPath: remoteProject.path,
      selectedEnvironmentId: 'remote-vm',
    })

    const remoteGroup = screen.getByRole('group', { name: 'Hermes Agent VM' })
    fireEvent.click(within(remoteGroup).getByRole('button', { name: 'More actions for project Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path for project Project root Hermes Agent VM' }))

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Copy status' })).toHaveTextContent('Copied Project Hermes Agent VM path')
    })

    const localGroup = screen.getByRole('group', { name: '/Users/josue/Project' })
    fireEvent.click(within(localGroup).getByRole('button', { name: 'More actions for project Project' }))

    expect(screen.getByRole('menuitem', { name: 'Copy path for project Project root Local Mac' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Copied path for project Project root Local Mac' })).not.toBeInTheDocument()
  })

  it('shows a visible sidebar copy error when clipboard writes fail', async () => {
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    writeText.mockRejectedValueOnce(new Error('permission denied'))

    renderSidebar([], {
      selectedPath: project.path,
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for project Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path for project Project' }))

    expect(await screen.findByRole('status', { name: 'Copy status' })).toHaveTextContent(
      'Could not copy Project path: permission denied',
    )
  })

  it('tracks copied thread ids by environment when thread ids collide', async () => {
    const localSession: ClaudeSession = {
      key: 'shared-thread',
      label: 'Local shared thread',
      agentKey: 'codex-cli',
      messageCount: 2,
      lastActivity: '2026-05-10T10:00:00.000Z',
      workingDir: project.path,
      environmentId: 'local',
    }
    const remoteSession: ClaudeSession = {
      key: 'shared-thread',
      label: 'Remote shared thread',
      agentKey: 'codex-cli',
      messageCount: 3,
      lastActivity: '2026-05-11T10:00:00.000Z',
      workingDir: '/Users/josue/RemoteProject',
      environmentId: 'remote-vm',
    }

    renderSidebar([localSession, remoteSession], {
      selectedPath: '',
    })

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Local shared thread, 2 messages' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Local shared thread' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy thread id for Local shared thread' }))

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Copy status' })).toHaveTextContent('Copied Local shared thread thread id')
    })

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Remote shared thread, 3 messages' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Remote shared thread' }))

    expect(screen.getByRole('menuitem', { name: 'Copy thread id for Remote shared thread' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Copied thread id for Remote shared thread' })).not.toBeInTheDocument()
  })
})
