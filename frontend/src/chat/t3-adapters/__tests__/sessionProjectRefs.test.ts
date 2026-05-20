import { beforeEach, describe, expect, it } from 'vitest'
import type { ClaudeSession } from '../gatewaySessionTypes'
import {
  CHAT_SESSION_PROJECT_REFS_KEY,
  attachChatSessionProjectRefs,
  copyContextId,
  findProjectForSession,
  loadChatSessionProjectRefs,
  projectRefFromProject,
  saveChatSessionProjectRefs,
} from '../sessionProjectRefs'
import type { ChatWorkspaceProject } from '../projectWorkspace'

const project: ChatWorkspaceProject = {
  id: 'local:clawcontrol:stable',
  name: 'clawcontrol',
  path: '/Volumes/T7/projects/clawcontrol',
  root: '/Volumes/T7/projects/clawcontrol',
  environmentId: 'local',
  branches: ['main'],
  currentBranch: 'main',
}

const session: ClaudeSession = {
  key: 'thread-1',
  label: 'Project chat',
  agentKey: 'main',
  messageCount: 2,
  lastActivity: '2026-05-17T18:00:00.000Z',
}

describe('T3 session project reference adapter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists bounded project refs outside Chat.tsx', () => {
    const ref = projectRefFromProject(project, { branch: 'main', runtime: 'Work locally' })

    expect(ref).toEqual({
      project: 'clawcontrol',
      projectId: 'local:clawcontrol:stable',
      projectRoot: '/Volumes/T7/projects/clawcontrol',
      workingDir: '/Volumes/T7/projects/clawcontrol',
      environmentId: 'local',
      branch: 'main',
      runtime: 'Work locally',
    })

    saveChatSessionProjectRefs(
      Object.fromEntries(Array.from({ length: 105 }, (_, index) => [
        `thread-${index}`,
        { ...ref, branch: `branch-${index}` },
      ])),
    )

    const stored = JSON.parse(localStorage.getItem(CHAT_SESSION_PROJECT_REFS_KEY) || '{}')
    expect(Object.keys(stored)).toHaveLength(100)
    expect(stored['thread-0']).toBeUndefined()
    expect(loadChatSessionProjectRefs()['thread-104']).toMatchObject({ branch: 'branch-104' })
  })

  it('attaches refs to sessions while preserving live gateway session fields', () => {
    const sessions = attachChatSessionProjectRefs(
      [{ ...session, label: 'Live label' }],
      {
        [session.key]: {
          project: 'stale project',
          projectId: project.id || undefined,
          workingDir: project.path,
          branch: 'main',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      key: session.key,
      label: 'Live label',
      projectId: project.id,
      workingDir: project.path,
      branch: 'main',
    })
  })

  it('finds project ownership and normalizes copy context ids', () => {
    expect(findProjectForSession([project], { ...session, projectId: project.id })).toEqual(project)
    expect(findProjectForSession([project], { ...session, workingDir: project.path })).toEqual(project)
    expect(findProjectForSession([project], session)).toBeNull()
    expect(copyContextId({ id: 'thread-1' })).toBe('thread-1')
    expect(copyContextId(null)).toBe('')
  })
})
