import { describe, expect, it } from 'vitest'
import { splitProjectScopedSessions } from '../sidebarSessionBuckets'

const project = {
  projects: [{
    id: 'local:clawcontrol',
    name: 'clawcontrol',
    path: '/Volumes/T7/projects/clawcontrol',
    root: '/Volumes/T7/projects/clawcontrol',
  }],
}

describe('T3 sidebar session buckets adapter', () => {
  it('keeps project-owned chats out of Recent', () => {
    const projectById = {
      key: 'project-by-id',
      label: 'Project chat',
      projectId: 'local:clawcontrol',
    }
    const projectByCwd = {
      key: 'project-by-cwd',
      label: 'Nested project chat',
      workingDir: '/Volumes/T7/projects/clawcontrol/frontend',
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
      metadata: { projectRoot: '/Volumes/T7/projects/clawcontrol' },
    }

    const buckets = splitProjectScopedSessions({
      sessions: [projectSession],
      recentSessions: [projectSession],
      projects: [project],
    })

    expect(buckets.unscopedRecentSessions).toEqual([])
  })
})
