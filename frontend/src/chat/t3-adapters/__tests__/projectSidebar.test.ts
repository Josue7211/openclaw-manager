import { describe, expect, it } from 'vitest'
import {
  buildProjectSidebarGroups,
  findProjectByRouteIdentity,
  logicalProjectHint,
  normalizedProjectPath,
  projectGroupLabel,
  projectMachineLabel,
  projectPathHint,
  setProjectRouteParams,
  workspaceSessionRoots,
} from '../projectSidebar'
import type { ChatWorkspaceProject } from '../projectWorkspace'

const localProject: ChatWorkspaceProject = {
  id: 'local:agent-shell:stable',
  environmentId: 'local',
  name: 'AgentShell',
  path: '/Users/josue/AgentShell',
  root: '/Users/josue/AgentShell',
  branches: ['main'],
  currentBranch: 'main',
  repositoryIdentity: {
    canonicalKey: 'github.com/josue/agent-shell',
    displayName: 'josue/agent-shell',
    name: 'agent-shell',
  },
}

const remoteProject: ChatWorkspaceProject = {
  ...localProject,
  id: 'remote:agent-shell:stable',
  environmentId: 'remote-vm',
  path: '/home/josue/AgentShell',
  root: '/home/josue/AgentShell',
  machineLabel: 'Harness VM',
}

describe('T3 project sidebar adapter', () => {
  it('derives labels, hints, roots, and normalized paths outside Chat.tsx', () => {
    expect(projectGroupLabel(localProject)).toBe('/Users/josue/AgentShell')
    expect(projectMachineLabel(remoteProject)).toBe('Harness VM')
    expect(projectPathHint(localProject)).toBe('/Users/josue')
    expect(normalizedProjectPath('/Users/josue/AgentShell/')).toBe('/users/josue/agentshell')
    expect(workspaceSessionRoots([localProject, remoteProject])).toEqual([
      '/Users/josue/AgentShell',
      '/home/josue/AgentShell',
    ])
  })

  it('builds T3 logical project sidebar groups from ClawControl workspace projects', () => {
    const groups = buildProjectSidebarGroups(
      [localProject, remoteProject],
      {
        groupingMode: 'repository',
        sortOrder: 'name',
        sessions: [{
          key: 'thread-1',
          label: 'Thread',
          agentKey: 'main',
          messageCount: 1,
          lastActivity: '2026-05-17T10:00:00.000Z',
          projectId: localProject.id,
        }],
      })

    const repositories = groups.find(group => group.label === 'Repositories')
    expect(repositories?.projects).toHaveLength(1)
    expect(repositories?.projects[0]).toMatchObject({
      displayName: 'josue/agent-shell',
      projects: expect.arrayContaining([
        expect.objectContaining({ id: localProject.id }),
        expect.objectContaining({ id: remoteProject.id }),
      ]),
    })
    expect(logicalProjectHint(repositories!.projects[0])).toContain('2 roots')
  })

  it('resolves routes by project id before cwd and writes T3 thread route params', () => {
    expect(findProjectByRouteIdentity(
      [localProject, remoteProject],
      remoteProject.id,
      localProject.path,
      'local',
    )).toEqual(remoteProject)

    const params = new URLSearchParams()
    setProjectRouteParams(params, remoteProject, { branch: 'main', runtime: 'Remote harness' })

    expect(params.get('projectId')).toBe(remoteProject.id)
    expect(params.get('cwd')).toBe(remoteProject.path)
    expect(params.get('env')).toBe(remoteProject.environmentId)
    expect(params.get('branch')).toBe('main')
    expect(params.get('runtime')).toBe('Remote harness')
  })
})
