import { describe, expect, it } from 'vitest'
import {
  sessionMatchesLogicalProject,
  sessionMatchesProject,
} from '../sidebarSessionMatching'

const project = {
  id: 'local:clawctrl',
  environmentId: 'local',
  name: 'clawctrl',
  path: '/Volumes/T7/projects/clawctrl',
  root: '/Volumes/T7/projects',
  repositoryIdentity: {
    displayName: 'josue7211/clawctrl',
    name: 'clawctrl',
  },
}

describe('T3 sidebar session matching adapter', () => {
  it('matches project-owned chats by project id first', () => {
    expect(sessionMatchesProject({
      key: 'thread-1',
      projectId: 'local:clawctrl',
      workingDir: '/tmp/unrelated',
    }, project)).toBe(true)

    expect(sessionMatchesProject({
      key: 'thread-1b',
      projectId: 'local:other',
      workingDir: '/Volumes/T7/projects/clawctrl',
    }, project)).toBe(false)
  })

  it('matches path-like project ids after normalization', () => {
    expect(sessionMatchesProject({
      key: 'thread-path-project-id',
      projectId: '/Volumes/T7/projects/clawctrl/',
      environmentId: 'local',
    }, project)).toBe(true)
  })

  it('does not match explicit environment mismatches by cwd or project name', () => {
    expect(sessionMatchesProject({
      key: 'remote-project-id-collision',
      projectId: 'local:clawctrl',
      environmentId: 'remote-vm',
    }, project)).toBe(false)

    expect(sessionMatchesProject({
      key: 'remote-cwd-collision',
      environmentId: 'remote-vm',
      workingDir: '/Volumes/T7/projects/clawctrl/frontend',
    }, project)).toBe(false)

    expect(sessionMatchesProject({
      key: 'remote-name-collision',
      environmentId: 'remote-vm',
      project: 'clawctrl',
    }, project)).toBe(false)
  })

  it('matches project id collisions only when environment identity is compatible', () => {
    expect(sessionMatchesProject({
      key: 'same-env-project-id-collision',
      projectId: 'local:clawctrl',
      environmentId: 'LOCAL',
    }, project)).toBe(true)

    expect(sessionMatchesProject({
      key: 'legacy-project-id-without-env',
      projectId: 'local:clawctrl',
    }, project)).toBe(true)
  })

  it('matches project-owned chats by normalized project roots, including nested metadata', () => {
    expect(sessionMatchesProject({
      key: 'thread-2',
      metadata: {
        projectRoot: '/Volumes/T7/projects/clawctrl/frontend',
      },
    }, project)).toBe(true)

    expect(sessionMatchesProject({
      key: 'thread-3',
      workspace: {
        workingDir: '/volumes/t7/projects/clawctrl',
      },
    }, project)).toBe(true)
  })

  it('prefers concrete working directories over broad project roots when both are present', () => {
    const webProject = {
      ...project,
      id: 'local:web',
      name: 'web',
      path: '/repo/apps/web',
      root: '/repo',
    }
    const apiProject = {
      ...project,
      id: 'local:api',
      name: 'api',
      path: '/repo/apps/api',
      root: '/repo',
    }
    const session = {
      key: 'monorepo-web-thread',
      projectRoot: '/repo',
      workingDir: '/repo/apps/web',
      environmentId: 'local',
    }

    expect(sessionMatchesProject(session, webProject)).toBe(true)
    expect(sessionMatchesProject(session, apiProject)).toBe(false)
  })

  it('keeps unrelated chats out of project groups so only those can reach Recent', () => {
    const unrelated = {
      key: 'thread-4',
      workingDir: '/Users/josue/other-project',
      project: 'other-project',
    }

    expect(sessionMatchesLogicalProject(unrelated, { projects: [project] })).toBe(false)
  })
})
