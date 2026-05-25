import { describe, expect, it } from 'vitest'
import { splitProjectScopedSessions } from '../sidebarSessionBuckets'

const project = {
  projects: [{
    id: 'local:clawctrl',
    name: 'clawctrl',
    path: '/Volumes/T7/projects/clawctrl',
    root: '/Volumes/T7/projects/clawctrl',
  }],
}

describe('T3 sidebar session buckets adapter', () => {
  it('keeps project-owned chats out of Recent', () => {
    const projectById = {
      key: 'project-by-id',
      label: 'Project chat',
      projectId: 'local:clawctrl',
    }
    const projectByCwd = {
      key: 'project-by-cwd',
      label: 'Nested project chat',
      workingDir: '/Volumes/T7/projects/clawctrl/frontend',
    }
    const unscoped = {
      key: 'unscoped',
      label: 'Loose chat',
      workingDir: '/Users/josue/notes',
    }

    const buckets = splitProjectScopedSessions({
      sessions: [projectById, projectByCwd, unscoped],
      recentSessions: [projectById, projectByCwd, unscoped],
      projects: [project],
    })

    expect([...buckets.projectScopedSessionKeys]).toEqual(['project-by-id', 'project-by-cwd'])
    expect(buckets.unscopedRecentSessions).toEqual([unscoped])
  })

  it('makes Recent empty when every visible chat is project-owned', () => {
    const projectSession = {
      key: 'project-only',
      label: 'Project only',
      metadata: { projectRoot: '/Volumes/T7/projects/clawctrl' },
    }

    const buckets = splitProjectScopedSessions({
      sessions: [projectSession],
      recentSessions: [projectSession],
      projects: [project],
    })

    expect(buckets.unscopedRecentSessions).toEqual([])
  })

  it('scopes project-owned bucket keys by environment when thread ids collide', () => {
    const localProject = {
      projects: [{
        id: 'local:clawctrl',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        environmentId: 'local',
      }],
    }
    const remoteProject = {
      projects: [{
        id: 'desktop:agent-shell',
        name: 'AgentShell',
        path: '/Users/josue/AgentShell',
        environmentId: 'desktop',
      }],
    }
    const localSession = {
      key: 'shared-thread',
      label: 'Local shared thread',
      workingDir: '/Volumes/T7/projects/clawctrl',
      environmentId: 'local',
    }
    const remoteSession = {
      key: 'shared-thread',
      label: 'Desktop shared thread',
      workingDir: '/Users/josue/AgentShell',
      environmentId: 'desktop',
    }

    const buckets = splitProjectScopedSessions({
      sessions: [localSession, remoteSession],
      recentSessions: [localSession, remoteSession],
      projects: [localProject, remoteProject],
    })

    expect([...buckets.projectScopedSessionKeys]).toEqual(['local:shared-thread', 'desktop:shared-thread'])
    expect(buckets.unscopedRecentSessions).toEqual([])
  })
})
