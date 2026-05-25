import { beforeEach, describe, expect, it } from 'vitest'
import type { ClaudeSession } from '../gatewaySessionTypes'
import {
  CHAT_SESSION_PROJECT_REFS_KEY,
  attachChatSessionProjectRefs,
  chatSessionProjectRefKey,
  copyContextId,
  findProjectForSession,
  loadChatSessionProjectRefs,
  projectRefFromProject,
  pruneSessionProjectRefsForProject,
  removeChatSessionProjectRef,
  saveChatSessionProjectRefs,
} from '../sessionProjectRefs'
import type { ChatWorkspaceProject } from '../projectWorkspace'

const project: ChatWorkspaceProject = {
  id: 'local:clawctrl:stable',
  name: 'clawctrl',
  path: '/Volumes/T7/projects/clawctrl',
  root: '/Volumes/T7/projects/clawctrl',
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
      project: 'clawctrl',
      projectId: 'local:clawctrl:stable',
      projectRoot: '/Volumes/T7/projects/clawctrl',
      workingDir: '/Volumes/T7/projects/clawctrl',
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

  it('removes persisted storage when all project refs are cleared', () => {
    const ref = projectRefFromProject(project)

    saveChatSessionProjectRefs({ [session.key]: ref })
    expect(localStorage.getItem(CHAT_SESSION_PROJECT_REFS_KEY)).toContain(session.key)

    saveChatSessionProjectRefs({})
    expect(localStorage.getItem(CHAT_SESSION_PROJECT_REFS_KEY)).toBeNull()
    expect(loadChatSessionProjectRefs()).toEqual({})
  })

  it('normalizes corrupted stored refs instead of trusting arbitrary localStorage JSON', () => {
    localStorage.setItem(CHAT_SESSION_PROJECT_REFS_KEY, JSON.stringify({
      ' thread-1 ': {
        project: ' clawctrl ',
        projectId: 42,
        workingDir: '/Volumes/T7/projects/clawctrl ',
        branch: '',
        runtime: ' Work locally ',
      },
      empty: {
        project: '',
        workingDir: 123,
      },
      list: ['bad'],
    }))

    expect(loadChatSessionProjectRefs()).toEqual({
      'thread-1': {
        project: 'clawctrl',
        workingDir: '/Volumes/T7/projects/clawctrl',
        runtime: 'Work locally',
      },
    })
  })

  it('saves only normalized string refs and drops empty records', () => {
    saveChatSessionProjectRefs({
      [session.key]: {
        project: ' clawctrl ',
        projectId: undefined,
        workingDir: '/Volumes/T7/projects/clawctrl ',
        runtime: ' ',
      },
      empty: {
        project: '',
      },
    })

    expect(JSON.parse(localStorage.getItem(CHAT_SESSION_PROJECT_REFS_KEY) || '{}')).toEqual({
      [session.key]: {
        project: 'clawctrl',
        workingDir: '/Volumes/T7/projects/clawctrl',
      },
    })
  })

  it('backfills missing project refs without replacing live gateway session fields', () => {
    const sessions = attachChatSessionProjectRefs(
      [{
        ...session,
        label: 'Live label',
        projectId: 'live-project-id',
        workingDir: '/tmp/live-cwd',
        branch: 'live-branch',
      }],
      {
        [session.key]: {
          project: 'ref project',
          projectId: project.id || undefined,
          workingDir: project.path,
          environmentId: 'local',
          branch: 'main',
          runtime: 'Work locally',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      key: session.key,
      label: 'Live label',
      project: 'ref project',
      projectId: 'live-project-id',
      workingDir: '/tmp/live-cwd',
      environmentId: 'local',
      branch: 'live-branch',
      runtime: 'Work locally',
    })
  })

  it('backfills duplicate thread ids from environment-scoped refs', () => {
    const sessions = attachChatSessionProjectRefs(
      [
        { ...session, key: 'shared-thread', environmentId: 'local' },
        { ...session, key: 'shared-thread', environmentId: 'desktop' },
      ],
      {
        [chatSessionProjectRefKey('shared-thread', 'local')]: {
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
          branch: 'main',
        },
        [chatSessionProjectRefKey('shared-thread', 'desktop')]: {
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
          branch: 'feature/agent-shell',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      key: 'shared-thread',
      project: 'clawctrl',
      workingDir: '/Volumes/T7/projects/clawctrl',
      environmentId: 'local',
      branch: 'main',
    })
    expect(sessions[1]).toMatchObject({
      key: 'shared-thread',
      project: 'AgentShell',
      workingDir: '/Users/josue/AgentShell',
      environmentId: 'desktop',
      branch: 'feature/agent-shell',
    })
  })

  it('keeps legacy raw-key refs as fallback for existing localStorage', () => {
    const sessions = attachChatSessionProjectRefs(
      [{ ...session, key: 'legacy-thread', environmentId: 'desktop' }],
      {
        'legacy-thread': {
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      key: 'legacy-thread',
      project: 'AgentShell',
      workingDir: '/Users/josue/AgentShell',
      environmentId: 'desktop',
    })
  })

  it('uses explicit legacy ref environments to backfill gateway sessions that omit environment identity', () => {
    const sessions = attachChatSessionProjectRefs(
      [{ ...session, key: 'legacy-desktop-thread' }],
      {
        'legacy-desktop-thread': {
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      key: 'legacy-desktop-thread',
      project: 'AgentShell',
      workingDir: '/Users/josue/AgentShell',
      environmentId: 'desktop',
    })
  })

  it('backfills an unscoped gateway session from one unambiguous scoped ref', () => {
    const sessions = attachChatSessionProjectRefs(
      [{ ...session, key: 'restored-thread' }],
      {
        [chatSessionProjectRefKey('restored-thread', 'desktop')]: {
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
          branch: 'feature/desktop',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      key: 'restored-thread',
      project: 'AgentShell',
      workingDir: '/Users/josue/AgentShell',
      environmentId: 'desktop',
      branch: 'feature/desktop',
    })
  })

  it('does not guess an unscoped gateway session when multiple scoped refs collide', () => {
    const sessions = attachChatSessionProjectRefs(
      [{ ...session, key: 'restored-thread' }],
      {
        [chatSessionProjectRefKey('restored-thread', 'local')]: {
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
        [chatSessionProjectRefKey('restored-thread', 'desktop')]: {
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
        },
      },
    )

    expect(sessions[0]).toEqual({
      ...session,
      key: 'restored-thread',
    })
  })

  it('ignores a scoped ref whose stored environment contradicts the scoped key', () => {
    const sessions = attachChatSessionProjectRefs(
      [{ ...session, key: 'restored-thread' }],
      {
        [chatSessionProjectRefKey('restored-thread', 'desktop')]: {
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
      },
    )

    expect(sessions[0]).toEqual({
      ...session,
      key: 'restored-thread',
    })
  })

  it('does not attach legacy local refs to same-key sessions in another environment', () => {
    const sessions = attachChatSessionProjectRefs(
      [{ ...session, key: 'shared-thread', environmentId: 'desktop' }],
      {
        'shared-thread': {
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
      },
    )

    expect(sessions[0]).toEqual({
      ...session,
      key: 'shared-thread',
      environmentId: 'desktop',
    })
  })

  it('treats unscoped legacy refs as local when same-key remote sessions exist', () => {
    const sessions = attachChatSessionProjectRefs(
      [
        { ...session, key: 'legacy-thread', environmentId: 'local' },
        { ...session, key: 'legacy-thread', environmentId: 'harness-vm' },
      ],
      {
        'legacy-thread': {
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      key: 'legacy-thread',
      project: 'clawctrl',
      workingDir: '/Volumes/T7/projects/clawctrl',
      environmentId: 'local',
    })
    expect(sessions[1]).toEqual({
      ...session,
      key: 'legacy-thread',
      environmentId: 'harness-vm',
    })
  })

  it('removes only the scoped project ref when duplicate thread ids collide', () => {
    const refs = {
      [chatSessionProjectRefKey('shared-thread', 'local')]: {
        workingDir: '/Volumes/T7/projects/clawctrl',
        environmentId: 'local',
      },
      [chatSessionProjectRefKey('shared-thread', 'desktop')]: {
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'desktop',
      },
    }

    expect(removeChatSessionProjectRef(refs, 'shared-thread', 'desktop')).toEqual({
      [chatSessionProjectRefKey('shared-thread', 'local')]: refs[chatSessionProjectRefKey('shared-thread', 'local')],
    })
  })

  it('keeps unscoped legacy refs when removing a non-local colliding thread id', () => {
    const refs = {
      'shared-thread': {
        workingDir: '/Volumes/T7/projects/clawctrl',
      },
      [chatSessionProjectRefKey('shared-thread', 'desktop')]: {
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'desktop',
      },
    }

    expect(removeChatSessionProjectRef(refs, 'shared-thread', 'desktop')).toEqual({
      'shared-thread': refs['shared-thread'],
    })
  })

  it('does not let stale refs override live metadata aliases', () => {
    const sessions = attachChatSessionProjectRefs(
      [{
        ...session,
        project_id: 'live-project-id',
        cwd: '/tmp/live-cwd',
        env: 'remote',
      }],
      {
        [session.key]: {
          projectId: project.id || undefined,
          projectRoot: project.root || undefined,
          workingDir: project.path,
          environmentId: 'local',
        },
      },
    )

    expect(sessions[0]).toMatchObject({
      project_id: 'live-project-id',
      cwd: '/tmp/live-cwd',
      env: 'remote',
    })
    expect(sessions[0].projectId).toBeUndefined()
    expect(sessions[0].projectRoot).toBeUndefined()
    expect(sessions[0].workingDir).toBeUndefined()
    expect(sessions[0].environmentId).toBeUndefined()
  })

  it('finds project ownership and normalizes copy context ids', () => {
    expect(findProjectForSession([project], { ...session, projectId: project.id })).toEqual(project)
    expect(findProjectForSession([project], { ...session, workingDir: project.path })).toEqual(project)
    expect(findProjectForSession([project], session)).toBeNull()
    expect(copyContextId({ id: 'thread-1' })).toBe('thread-1')
    expect(copyContextId(null)).toBe('')
  })

  it('prunes refs that belong to a removed project', () => {
    const refs = {
      ownedById: {
        projectId: project.id,
        workingDir: '/other/path',
      },
      ownedByDir: {
        workingDir: project.path,
      },
      other: {
        projectId: 'local:other:stable',
        workingDir: '/Volumes/T7/projects/other',
      },
    }

    expect(pruneSessionProjectRefsForProject(refs, project)).toEqual({
      other: refs.other,
    })
  })

  it('keeps ambiguous legacy path refs when pruning a non-local same-path project', () => {
    const remoteProject = {
      ...project,
      id: 'remote:clawctrl:stable',
      environmentId: 'remote-vm',
    }
    const refs = {
      localLegacyPathOnly: {
        workingDir: project.path,
      },
      remoteByEnvironment: {
        workingDir: remoteProject.path,
        environmentId: 'remote-vm',
      },
      remoteByProjectId: {
        projectId: remoteProject.id,
        workingDir: '/other/path',
      },
      other: {
        projectId: 'local:other:stable',
        workingDir: '/Volumes/T7/projects/other',
      },
    }

    expect(pruneSessionProjectRefsForProject(refs, remoteProject)).toEqual({
      localLegacyPathOnly: refs.localLegacyPathOnly,
      other: refs.other,
    })
  })
})
