import { describe, expect, it } from 'vitest'
import {
  buildProjectSidebarGroups,
  findProjectByRouteIdentity,
  logicalProjectHint,
  normalizedProjectPath,
  projectEnvironmentDisplayLabel,
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
    expect(projectMachineLabel(remoteProject)).toBe('Hermes Agent VM')
    expect(projectEnvironmentDisplayLabel(remoteProject)).toBe('Hermes Agent VM')
    expect(projectGroupLabel({
      ...localProject,
      path: '/run/media/josue/T7/projects/clawctrl',
      root: undefined,
      machineLabel: undefined,
      machine: undefined,
      host: undefined,
      group: undefined,
    })).toBe('T7')
    expect(projectEnvironmentDisplayLabel({
      ...localProject,
      path: '/run/media/josue/T7/projects/clawctrl',
      root: '/run/media/josue/T7/projects/clawctrl',
      machineLabel: undefined,
      machine: undefined,
      host: undefined,
      group: undefined,
      environmentId: 'local',
    })).toBe('T7')
    expect(projectPathHint(localProject)).toBe('/Users/josue')
    expect(normalizedProjectPath('/Users/josue/AgentShell/')).toBe('/users/josue/agentshell')
    expect(workspaceSessionRoots([
      localProject,
      { ...localProject, id: 'local:agent-shell:duplicate', root: '/Users/josue/AgentShell/' },
      remoteProject,
    ])).toEqual([
      '/home/josue/AgentShell',
      '/Users/josue/AgentShell',
    ])
  })

  it('builds T3 logical project sidebar groups from clawctrl workspace projects', () => {
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
      'remote-vm',
    )).toEqual(remoteProject)

    const params = new URLSearchParams()
    setProjectRouteParams(params, remoteProject, { branch: 'main', runtime: 'Remote harness' })

    expect(params.get('projectId')).toBe(remoteProject.id)
    expect(params.get('cwd')).toBe(remoteProject.path)
    expect(params.get('env')).toBe(remoteProject.environmentId)
    expect(params.get('branch')).toBe('main')
    expect(params.get('runtime')).toBe('Remote harness')
  })

  it('uses route environment to disambiguate colliding project ids', () => {
    const remoteSamePathId = {
      ...remoteProject,
      id: localProject.id,
      path: localProject.path,
      root: localProject.root,
    }

    expect(findProjectByRouteIdentity(
      [localProject, remoteSamePathId],
      localProject.id,
      null,
      'remote-vm',
    )).toEqual(remoteSamePathId)

    expect(findProjectByRouteIdentity(
      [localProject, remoteSamePathId],
      localProject.id,
      null,
      'LOCAL',
    )).toEqual(localProject)

    expect(findProjectByRouteIdentity(
      [localProject, remoteSamePathId],
      localProject.id,
      null,
      'missing-vm',
    )).toBeNull()
  })

  it('does not resolve exact project ids when the explicit route environment mismatches', () => {
    expect(findProjectByRouteIdentity(
      [remoteProject],
      remoteProject.id,
      null,
      'local',
    )).toBeNull()
  })

  it('does not resolve cwd-only stale environment routes to a same-path project from another environment', () => {
    expect(findProjectByRouteIdentity(
      [localProject],
      null,
      localProject.path,
      'missing-vm',
    )).toBeNull()

    expect(findProjectByRouteIdentity(
      [localProject, remoteProject],
      null,
      localProject.path,
      'remote-vm',
    )).toBeNull()
  })

  it('does not treat route environment alone as a project selector', () => {
    expect(findProjectByRouteIdentity(
      [localProject, remoteProject],
      null,
      null,
      'local',
    )).toBeNull()

    expect(findProjectByRouteIdentity(
      [localProject, remoteProject],
      null,
      null,
      'remote-vm',
    )).toBeNull()
  })

  it('resolves path-like project ids by normalized project path variants', () => {
    expect(findProjectByRouteIdentity(
      [localProject],
      '/Users/josue/AgentShell/',
      null,
      null,
    )).toEqual(localProject)

    expect(findProjectByRouteIdentity(
      [localProject],
      '/Users/josue/AgentShell',
      '/tmp/other',
      'other-env',
    )).toBeNull()
  })

  it('keeps exact stable project ids authoritative even when stale path context is present', () => {
    expect(findProjectByRouteIdentity(
      [localProject, remoteProject],
      remoteProject.id,
      localProject.path,
      'remote-vm',
    )).toEqual(remoteProject)
  })

  it('removes cwd route state for placeholder projects without a real folder', () => {
    const params = new URLSearchParams('projectId=old&cwd=/tmp/old&env=local')

    setProjectRouteParams(params, {
      name: 'Select a project',
      path: '',
      branches: ['main'],
      currentBranch: 'main',
    }, { branch: 'main', runtime: 'Work locally' })

    expect(params.get('projectId')).toBeNull()
    expect(params.get('cwd')).toBeNull()
    expect(params.get('env')).toBeNull()
    expect(params.get('branch')).toBe('main')
    expect(params.get('runtime')).toBe('Work locally')
  })
})
