import { describe, expect, it } from 'vitest'
import {
  sessionMatchesLogicalProject,
  sessionMatchesProject,
} from '../sidebarSessionMatching'

const project = {
  id: 'local:clawcontrol',
  name: 'clawcontrol',
  path: '/Volumes/T7/projects/clawcontrol',
  root: '/Volumes/T7/projects',
  repositoryIdentity: {
    displayName: 'josue7211/clawcontrol',
    name: 'clawcontrol',
  },
}

describe('T3 sidebar session matching adapter', () => {
  it('matches project-owned chats by project id first', () => {
    expect(sessionMatchesProject({
      key: 'thread-1',
      projectId: 'local:clawcontrol',
      workingDir: '/tmp/unrelated',
    }, project)).toBe(true)

    expect(sessionMatchesProject({
      key: 'thread-1b',
      projectId: 'local:other',
      workingDir: '/Volumes/T7/projects/clawcontrol',
    }, project)).toBe(false)
  })

  it('matches project-owned chats by normalized project roots, including nested metadata', () => {
    expect(sessionMatchesProject({
      key: 'thread-2',
      metadata: {
        projectRoot: '/Volumes/T7/projects/clawcontrol/frontend',
      },
    }, project)).toBe(true)

    expect(sessionMatchesProject({
      key: 'thread-3',
      workspace: {
        workingDir: '/volumes/t7/projects/clawcontrol',
      },
    }, project)).toBe(true)
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
