import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))
const tauriMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: apiMock,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriMock.invoke,
}))

import {
  addProjectToBackend,
  CHAT_ADDED_PROJECTS_KEY,
  CHAT_PROJECT_PICKER_LAST_DIR_KEY,
  CHAT_PROJECT_PREFERRED_SCRIPTS_KEY,
  CHAT_PROJECT_SCRIPTS_KEY,
  DEFAULT_CHAT_PROJECT_SCRIPTS,
  FALLBACK_PROJECT,
  FALLBACK_WORKSPACE_CONTEXT,
  loadAddedProjects,
  loadProjectPreferredScriptStore,
  loadProjectScriptStore,
  mergeWorkspaceProjects,
  normalizeProjectScripts,
  normalizeWorkspaceContext,
  preferredScriptIdForProject,
  projectFromPath,
  projectPickerDefaultPath,
  projectScriptStorageKeys,
  pruneProjectPreferredScriptStoreForProject,
  pruneProjectScriptStoreForProject,
  pruneMigratedAddedProjects,
  removeProjectFromBackend,
  removeWorkspaceProject,
  replaceWorkspaceProject,
  resolveProjectFromPath,
  saveAddedProjects,
  savePreferredScriptIdForProject,
  rememberProjectPickerDirectory,
  resolveScriptCwd,
  saveProjectScriptStore,
  sanitizeProjectPathInput,
  scriptsAreEquivalent,
  scriptsForProject,
  terminalProjectEnv,
  terminalProcessScope,
  toT3ProjectScript,
  updateProjectInBackend,
  type ChatProjectScript,
} from '../projectWorkspace'

describe('T3 project workspace adapter', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    delete window.__TAURI_INTERNALS__
  })

  it('normalizes project scripts using T3-style stable ids and empty generic defaults', () => {
    expect(DEFAULT_CHAT_PROJECT_SCRIPTS).toEqual([])
    expect(normalizeProjectScripts('bad-input')).toEqual([])
    expect(normalizeProjectScripts([
      { name: 'Run Tests', command: 'npm test', cwd: 'frontend', icon: 'test', keybinding: ' ctrl+shift+t ' },
      { name: 'No command' },
    ])).toEqual([
      {
        id: 'run-tests',
        name: 'Run Tests',
        command: 'npm test',
        cwd: 'frontend',
        icon: 'test',
        keybinding: 'ctrl+shift+t',
        runOnWorktreeCreate: false,
      },
    ])
  })

  it('compares complete project action definitions before treating scripts as unchanged', () => {
    const scripts: ChatProjectScript[] = [{
      id: 'test',
      name: 'Test',
      command: 'npm test',
      cwd: 'frontend',
      icon: 'test',
      keybinding: 'ctrl+shift+t',
      runOnWorktreeCreate: false,
    }]

    expect(scriptsAreEquivalent(scripts, scripts)).toBe(true)
    expect(scriptsAreEquivalent(scripts, [{ ...scripts[0], icon: 'play' }])).toBe(false)
    expect(scriptsAreEquivalent(scripts, [{ ...scripts[0], keybinding: 'ctrl+shift+r' }])).toBe(false)
    expect(scriptsAreEquivalent(scripts, [{ ...scripts[0], runOnWorktreeCreate: true }])).toBe(false)
  })

  it('keeps workspace project normalization and legacy added-project storage out of Chat.tsx', () => {
    const project = projectFromPath('/Users/josue/AgentShell/')

    expect(project).toMatchObject({
      id: 'local-2f55736572732f6a6f7375652f4167656e745368656c6c',
      environmentId: 'local',
      name: 'AgentShell',
      path: '/Users/josue/AgentShell',
      machineLabel: 'Local Mac',
      branches: ['main'],
      currentBranch: 'main',
    })

    const context = normalizeWorkspaceContext({
      projects: [{ name: 'Repo', path: '/repo/', root: '/repo/', branches: [], currentBranch: '' }],
      runtimeModes: ['Work locally', 'Harness VM'],
    })
    expect(context.projects[0]).toMatchObject({
      id: 'local-2f7265706f',
      environmentId: 'local',
      name: 'Repo',
      path: '/repo',
      root: '/repo',
      branches: ['main'],
    })
    expect(context.runtimeModes).toEqual(['Work locally', 'Harness VM'])
    expect(normalizeWorkspaceContext(null)).toEqual(FALLBACK_WORKSPACE_CONTEXT)
    expect(FALLBACK_PROJECT).toMatchObject({
      name: 'Select a project',
      path: '',
      branches: ['main'],
      currentBranch: 'main',
    })

    saveAddedProjects([project])
    expect(localStorage.getItem(CHAT_ADDED_PROJECTS_KEY)).toContain('AgentShell')
    expect(loadAddedProjects()).toEqual([project])
  })

  it('remembers a non-hardcoded start directory for the native project folder picker', () => {
    expect(projectPickerDefaultPath({
      projects: [{ path: '/Volumes/T7/projects/clawcontrol' }],
    })).toBe('/Volumes/T7/projects')

    expect(projectPickerDefaultPath({
      selectedProjectPath: '/Users/josue/AgentShell',
      projects: [{ path: '/Volumes/T7/projects/clawcontrol' }],
    })).toBe('/Users/josue')

    rememberProjectPickerDirectory('/Users/josue/Work/NewProject')

    expect(localStorage.getItem(CHAT_PROJECT_PICKER_LAST_DIR_KEY)).toBe('/Users/josue/Work')
    expect(projectPickerDefaultPath({
      selectedProjectPath: '/Users/josue/AgentShell',
      projects: [{ path: '/Volumes/T7/projects/clawcontrol' }],
    })).toBe('/Users/josue')

    expect(projectPickerDefaultPath({
      projects: [{ path: '/Volumes/T7/projects/clawcontrol' }],
    })).toBe('/Users/josue/Work')

    expect(projectPickerDefaultPath({
      preferredProjectPath: '/Users/josue/TypedProject',
      selectedProjectPath: '/Users/josue/AgentShell',
      projects: [{ path: '/Volumes/T7/projects/clawcontrol' }],
    })).toBe('/Users/josue')
  })

  it('sanitizes pasted project paths before deriving local project records', () => {
    expect(sanitizeProjectPathInput(' "file:///Users/josue/My%20Project/" ')).toBe('/Users/josue/My Project/')
    expect(sanitizeProjectPathInput(String.raw`/Users/josue/My\ Project`)).toBe('/Users/josue/My Project')

    expect(projectFromPath(' "file:///Users/josue/My%20Project/" ')).toMatchObject({
      name: 'My Project',
      path: '/Users/josue/My Project',
      machineLabel: 'Local Mac',
    })
    expect(projectFromPath('C:\\Users\\josue\\Repo\\')).toMatchObject({
      name: 'Repo',
      path: 'C:/Users/josue/Repo',
      machineLabel: 'C:',
    })
    expect(projectFromPath('/run/media/josue/T7/projects/clawcontrol')).toMatchObject({
      name: 'clawcontrol',
      path: '/run/media/josue/T7/projects/clawcontrol',
      machineLabel: 'T7',
    })
  })

  it('sanitizes typed project paths before backend persistence', async () => {
    apiMock.post.mockResolvedValueOnce({
      project: {
        name: 'My Project',
        path: '/Users/josue/My Project',
        branches: ['main'],
        currentBranch: 'main',
      },
    })

    await addProjectToBackend(' "file:///Users/josue/My%20Project/" ')

    expect(apiMock.post).toHaveBeenCalledWith('/api/chat/workspace-projects', {
      path: '/Users/josue/My Project/',
    })
  })

  it('rejects blank project paths before creating or persisting project records', async () => {
    expect(() => projectFromPath('   ')).toThrow('Project path is required.')
    await expect(addProjectToBackend('   ')).rejects.toThrow('Project path is required.')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('does not fall back to synthetic projects when native folder validation fails', async () => {
    window.__TAURI_INTERNALS__ = {} as typeof window.__TAURI_INTERNALS__
    tauriMock.invoke.mockRejectedValueOnce(new Error('project folder does not exist'))

    await expect(resolveProjectFromPath('/tmp/missing-project')).rejects.toThrow('project folder does not exist')

    expect(tauriMock.invoke).toHaveBeenCalledWith('get_chat_project_for_path', {
      path: '/tmp/missing-project',
    })
  })

  it('merges, replaces, removes, and prunes workspace project records in the adapter', () => {
    const added = projectFromPath('/tmp/added')
    const existing = { ...FALLBACK_PROJECT, path: '/tmp/existing', name: 'existing' }
    const context = { projects: [existing], runtimeModes: ['Work locally'] }

    expect(mergeWorkspaceProjects(context, [added]).projects.map(project => project.path)).toEqual([
      '/tmp/existing',
      '/tmp/added',
    ])
    expect(mergeWorkspaceProjects(context, [{ ...existing, name: 'fresh existing' }]).projects).toEqual([
      { ...existing, name: 'fresh existing' },
    ])
    expect(replaceWorkspaceProject(context, { ...existing, name: 'renamed' }).projects[0].name).toBe('renamed')
    expect(removeWorkspaceProject(context, '/tmp/existing')).toEqual(FALLBACK_WORKSPACE_CONTEXT)
    expect(pruneMigratedAddedProjects([added, existing], [existing])).toEqual([added])
  })

  it('matches project records by normalized path without collapsing distinct environments', () => {
    const local = {
      ...projectFromPath('/Users/josue/AgentShell/'),
      id: 'local-agent-shell',
      environmentId: 'local',
    }
    const sameLocalFromBackend = {
      ...projectFromPath('/Users/josue/AgentShell'),
      id: 'local-agent-shell-refreshed',
      environmentId: 'local',
      name: 'AgentShell refreshed',
      branches: ['main', 'codex/path-normalized'],
      currentBranch: 'codex/path-normalized',
    }
    const remoteSamePath = {
      ...projectFromPath('/Users/josue/AgentShell'),
      id: 'remote-agent-shell',
      environmentId: 'remote-vm',
      name: 'Remote AgentShell',
    }
    const context = { projects: [local, remoteSamePath], runtimeModes: ['Work locally'] }

    expect(mergeWorkspaceProjects(context, [sameLocalFromBackend]).projects).toEqual([
      sameLocalFromBackend,
      remoteSamePath,
    ])
    expect(replaceWorkspaceProject(context, sameLocalFromBackend).projects).toEqual([
      sameLocalFromBackend,
      remoteSamePath,
    ])
    expect(removeWorkspaceProject(context, sameLocalFromBackend).projects).toEqual([
      remoteSamePath,
    ])
    expect(pruneMigratedAddedProjects([local, remoteSamePath], [sameLocalFromBackend])).toEqual([
      remoteSamePath,
    ])
  })

  it('synthesizes environment-scoped ids for same-path projects without backend ids', () => {
    const context = normalizeWorkspaceContext({
      projects: [
        {
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          environmentId: 'local',
          branches: ['main'],
        },
        {
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          environmentId: 'harness-vm',
          branches: ['main'],
        },
      ],
    })

    const [localProject, remoteProject] = context.projects
    expect(localProject.id).toBe('local-2f55736572732f6a6f7375652f4167656e745368656c6c')
    expect(remoteProject.id).toBe('env-6861726e6573732d766d-2f55736572732f6a6f7375652f4167656e745368656c6c')
    expect(localProject.id).not.toBe(remoteProject.id)
    expect(terminalProcessScope(remoteProject, null)).toBe('harness-vm-users-josue-agentshell')
  })

  it('treats legacy missing environments as local instead of matching every same-path environment', () => {
    const legacyLocal = {
      ...projectFromPath('/Users/josue/AgentShell'),
      id: 'legacy-agent-shell',
      environmentId: undefined,
      name: 'Legacy local AgentShell',
    }
    const remoteSamePath = {
      ...projectFromPath('/Users/josue/AgentShell'),
      id: 'remote-agent-shell',
      environmentId: 'harness-vm',
      name: 'Remote AgentShell',
    }
    const refreshedRemote = {
      ...remoteSamePath,
      name: 'Remote AgentShell refreshed',
    }
    const context = { projects: [legacyLocal], runtimeModes: ['Work locally'] }

    expect(mergeWorkspaceProjects(context, [refreshedRemote]).projects).toEqual([
      legacyLocal,
      refreshedRemote,
    ])
    expect(replaceWorkspaceProject(context, refreshedRemote).projects).toEqual([
      legacyLocal,
      refreshedRemote,
    ])
    expect(removeWorkspaceProject({
      projects: [legacyLocal, remoteSamePath],
      runtimeModes: ['Work locally'],
    }, '/Users/josue/AgentShell').projects).toEqual([
      remoteSamePath,
    ])
  })

  it('returns the refreshed backend project list for add and update mutations', async () => {
    apiMock.post.mockResolvedValueOnce({
      project: {
        name: 'existing',
        path: '/tmp/existing',
        branches: ['main'],
        currentBranch: 'main',
      },
      projects: [
        {
          name: 'existing',
          path: '/tmp/existing',
          branches: ['main', 'feature/refreshed'],
          currentBranch: 'feature/refreshed',
        },
        {
          name: 'other',
          path: '/tmp/other',
          branches: ['main'],
          currentBranch: 'main',
        },
      ],
    })
    apiMock.patch.mockResolvedValueOnce({
      project: {
        name: 'renamed',
        path: '/tmp/existing',
        branches: ['main'],
        currentBranch: 'main',
      },
    })

    await expect(addProjectToBackend('/tmp/existing')).resolves.toMatchObject({
      project: { path: '/tmp/existing', currentBranch: 'main' },
      projects: [
        { path: '/tmp/existing', currentBranch: 'feature/refreshed' },
        { path: '/tmp/other', currentBranch: 'main' },
      ],
    })
    await expect(updateProjectInBackend(projectFromPath('/tmp/existing'), { name: 'renamed' })).resolves.toMatchObject({
      project: { path: '/tmp/existing', name: 'renamed' },
      projects: [{ path: '/tmp/existing', name: 'renamed' }],
    })
  })

  it('sends project environment identity when mutating backend projects', async () => {
    const project = {
      ...projectFromPath('/tmp/shared-path'),
      id: 'remote:shared-path',
      environmentId: 'harness-vm',
    }
    apiMock.patch.mockResolvedValueOnce({ project })
    apiMock.del.mockResolvedValueOnce([])

    await updateProjectInBackend(project, { name: 'Remote shared path' })
    await removeProjectFromBackend(project)

    expect(apiMock.patch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
      id: 'remote:shared-path',
      path: '/tmp/shared-path',
      environmentId: 'harness-vm',
      name: 'Remote shared path',
    }))
    expect(apiMock.del).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
      id: 'remote:shared-path',
      path: '/tmp/shared-path',
      environmentId: 'harness-vm',
    }))
  })

  it('uses native workspace project mutation commands inside Tauri', async () => {
    window.__TAURI_INTERNALS__ = {} as typeof window.__TAURI_INTERNALS__
    const project = {
      ...projectFromPath('/tmp/shared-path'),
      id: 'remote:shared-path',
      environmentId: 'harness-vm',
    }
    tauriMock.invoke
      .mockResolvedValueOnce({
        project,
        projects: [project],
      })
      .mockResolvedValueOnce({
        project: { ...project, name: 'Remote shared path' },
        projects: [{ ...project, name: 'Remote shared path' }],
      })
      .mockResolvedValueOnce([])

    await expect(addProjectToBackend('/tmp/shared-path')).resolves.toMatchObject({
      project: { path: '/tmp/shared-path', id: 'remote:shared-path' },
      projects: [{ path: '/tmp/shared-path', id: 'remote:shared-path' }],
    })
    await updateProjectInBackend(project, { name: 'Remote shared path' })
    await removeProjectFromBackend(project)

    expect(tauriMock.invoke).toHaveBeenNthCalledWith(1, 'add_chat_workspace_project', {
      path: '/tmp/shared-path',
    })
    expect(tauriMock.invoke).toHaveBeenNthCalledWith(2, 'update_chat_workspace_project', {
      id: 'remote:shared-path',
      path: '/tmp/shared-path',
      environmentId: 'harness-vm',
      patch: { name: 'Remote shared path' },
    })
    expect(tauriMock.invoke).toHaveBeenNthCalledWith(3, 'remove_chat_workspace_project', {
      id: 'remote:shared-path',
      path: '/tmp/shared-path',
      environmentId: 'harness-vm',
    })
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(apiMock.patch).not.toHaveBeenCalled()
    expect(apiMock.del).not.toHaveBeenCalled()
  })

  it('persists project scripts outside Chat.tsx and resolves project overrides first', () => {
    const scriptProject = projectFromPath('/tmp/script-project')
    const stored: ChatProjectScript[] = [{ id: 'dev', name: 'Dev', command: 'npm run dev' }]
    const normalizedStored: ChatProjectScript[] = [{
      id: 'dev',
      name: 'Dev',
      command: 'npm run dev',
      runOnWorktreeCreate: false,
    }]
    saveProjectScriptStore({ [scriptProject.path]: stored })

    expect(localStorage.getItem(CHAT_PROJECT_SCRIPTS_KEY)).toContain('npm run dev')
    expect(loadProjectScriptStore()).toEqual({ [scriptProject.path]: normalizedStored })
    expect(scriptsForProject(loadProjectScriptStore(), { ...scriptProject })).toEqual(normalizedStored)
    expect(scriptsForProject({}, { ...scriptProject, scripts: stored })).toEqual(stored)
    expect(scriptsForProject(loadProjectScriptStore(), { ...scriptProject, scripts: [] })).toEqual([])
  })

  it('persists preferred project actions per project and prunes them with removed projects', () => {
    const project = {
      ...projectFromPath('/Users/josue/AgentShell'),
      id: 'agent-shell',
      environmentId: 'local',
      root: '/Users/josue/AgentShell',
    }
    const otherProject = projectFromPath('/Users/josue/OtherProject')

    savePreferredScriptIdForProject(project, 'test')

    expect(localStorage.getItem(CHAT_PROJECT_PREFERRED_SCRIPTS_KEY)).toContain('test')
    expect(preferredScriptIdForProject(project)).toBe('test')
    expect(loadProjectPreferredScriptStore()).toEqual(expect.objectContaining({
      'agent-shell': 'test',
      'env:local:path:/users/josue/agentshell': 'test',
      '/Users/josue/AgentShell': 'test',
    }))

    savePreferredScriptIdForProject(otherProject, 'dev')
    const pruned = pruneProjectPreferredScriptStoreForProject(loadProjectPreferredScriptStore(), project)

    expect(pruned).not.toHaveProperty('agent-shell')
    expect(pruned).not.toHaveProperty('env:local:path:/users/josue/agentshell')
    expect(pruned).not.toHaveProperty('/Users/josue/AgentShell')
    expect(pruned).toHaveProperty('/Users/josue/OtherProject', 'dev')
  })

  it('resolves legacy script stores by normalized project path variants', () => {
    const project = {
      ...projectFromPath('/Users/josue/AgentShell'),
      root: '/Users/josue/AgentShell',
    }
    const stored: ChatProjectScript[] = [{ id: 'dev', name: 'Dev', command: 'npm run dev' }]
    const normalizedStored: ChatProjectScript[] = [{
      id: 'dev',
      name: 'Dev',
      command: 'npm run dev',
      runOnWorktreeCreate: false,
    }]

    saveProjectScriptStore({ ['/Users/josue/AgentShell/']: stored })

    expect(projectScriptStorageKeys(project)).toEqual(expect.arrayContaining([
      'env:local:path:/users/josue/agentshell',
    ]))
    expect(projectScriptStorageKeys(project)).not.toContain('/Users/josue/AgentShell')
    expect(scriptsForProject(loadProjectScriptStore(), project)).toEqual(normalizedStored)
  })

  it('keeps project action storage scoped by environment for same-path roots', () => {
    const localProject = {
      ...projectFromPath('/Users/josue/AgentShell'),
      id: 'local-agent-shell',
      environmentId: 'local',
    }
    const remoteProject = {
      ...localProject,
      id: 'remote-agent-shell',
      environmentId: 'harness-vm',
      machineLabel: 'Harness VM',
    }
    const localScripts: ChatProjectScript[] = [{ id: 'local-dev', name: 'Local dev', command: 'npm run dev' }]
    const remoteScripts: ChatProjectScript[] = [{ id: 'remote-dev', name: 'Remote dev', command: 'pnpm dev' }]
    const localScopedKey = projectScriptStorageKeys(localProject).find((key) => key.startsWith('env:local:path:'))
    const remoteScopedKey = projectScriptStorageKeys(remoteProject).find((key) => key.startsWith('env:harness-vm:path:'))

    expect(localScopedKey).toBe('env:local:path:/users/josue/agentshell')
    expect(remoteScopedKey).toBe('env:harness-vm:path:/users/josue/agentshell')
    expect(scriptsForProject({
      [localScopedKey || '']: localScripts,
      [remoteScopedKey || '']: remoteScripts,
      ['/Users/josue/AgentShell']: localScripts,
    }, localProject)).toEqual(localScripts)
    expect(scriptsForProject({
      [localScopedKey || '']: localScripts,
      [remoteScopedKey || '']: remoteScripts,
      ['/Users/josue/AgentShell']: localScripts,
    }, remoteProject)).toEqual(remoteScripts)
    expect(scriptsForProject({
      [localScopedKey || '']: localScripts,
      ['/Users/josue/AgentShell']: localScripts,
    }, remoteProject)).toEqual([])
  })

  it('prunes project script storage for deleted projects across path variants', () => {
    const project = {
      ...projectFromPath('/Users/josue/AgentShell/'),
      id: 'local-agent-shell',
      root: '/Users/josue/AgentShell',
    }
    const scripts: ChatProjectScript[] = [{ id: 'dev', name: 'Dev', command: 'npm run dev' }]
    const store = {
      [project.id || '']: scripts,
      ['env:local:path:/users/josue/agentshell']: scripts,
      ['/Users/josue/AgentShell/']: scripts,
      ['/users/josue/agentshell']: scripts,
      ['/Users/josue/Other']: scripts,
    }

    expect(pruneProjectScriptStoreForProject(store, project)).toEqual({
      '/Users/josue/Other': scripts,
    })
  })

  it('does not prune legacy path action storage when deleting a non-local same-path project', () => {
    const remoteProject = {
      ...projectFromPath('/Users/josue/AgentShell/'),
      id: 'remote-agent-shell',
      environmentId: 'harness-vm',
      root: '/Users/josue/AgentShell',
    }
    const scripts: ChatProjectScript[] = [{ id: 'dev', name: 'Dev', command: 'npm run dev' }]
    const store = {
      [remoteProject.id || '']: scripts,
      ['env:harness-vm:path:/users/josue/agentshell']: scripts,
      ['/Users/josue/AgentShell/']: scripts,
    }

    expect(pruneProjectScriptStoreForProject(store, remoteProject)).toEqual({
      '/Users/josue/AgentShell/': scripts,
    })
  })

  it('adapts project scripts to the copied T3 toolbar and resolves command cwd/scope', () => {
    const project = projectFromPath('/Volumes/T7/projects/clawcontrol')
    const script: ChatProjectScript = { id: 'lint', name: 'Lint', command: 'npm run lint', cwd: 'frontend', keybinding: 'ctrl+shift+l' }

    expect(toT3ProjectScript(script)).toEqual({ ...script, icon: 'play' })
    expect(resolveScriptCwd(project, script)).toBe('/Volumes/T7/projects/clawcontrol/frontend')
    expect(resolveScriptCwd(project, { ...script, cwd: '/tmp/work' })).toBe('/tmp/work')
    expect(resolveScriptCwd(project, { ...script, cwd: './frontend/../src-tauri' })).toBe('/Volumes/T7/projects/clawcontrol/src-tauri')
    expect(resolveScriptCwd(project, { ...script, cwd: '../outside' })).toBe('/Volumes/T7/projects/clawcontrol/outside')
    expect(resolveScriptCwd(project, { ...script, cwd: String.raw`frontend\\src` })).toBe('/Volumes/T7/projects/clawcontrol/frontend/src')
    expect(resolveScriptCwd(project, { ...script, cwd: ' "file:///tmp/My%20Work/" ' })).toBe('/tmp/My Work')
    expect(terminalProcessScope(project, null)).toBe('local-volumes-t7-projects-clawcontrol')
    expect(terminalProcessScope({ ...project, environmentId: 'harness-vm' }, null)).toBe('harness-vm-volumes-t7-projects-clawcontrol')
    expect(terminalProcessScope({ ...project, id: 'local:repo:stable' }, 'thread-123')).toBe('thread-123')
  })

  it('builds Hermes terminal project env with generic and legacy aliases for existing scripts', () => {
    const project = {
      ...projectFromPath('/tmp/agent-shell'),
      id: 'local:agent-shell:stable',
      environmentId: 'local',
    }

    expect(terminalProjectEnv({
      project,
      projectReady: true,
      projectPath: project.path,
      terminalCwd: '/tmp/agent-shell/frontend',
      sessionKey: 'hermes-session-1',
      runtime: 'Work locally',
      branch: 'main',
    })).toEqual({
      CHAT_SESSION_KEY: 'hermes-session-1',
      CHAT_PROJECT_ID: 'local:agent-shell:stable',
      CHAT_PROJECT_PATH: '/tmp/agent-shell',
      CHAT_PROJECT_ROOT: '/tmp/agent-shell',
      CHAT_PROJECT_NAME: 'agent-shell',
      CHAT_ENVIRONMENT_ID: 'local',
      CHAT_RUNTIME: 'Work locally',
      CHAT_BRANCH: 'main',
      CHAT_WORKSPACE_CWD: '/tmp/agent-shell',
      CHAT_WORKING_DIR: '/tmp/agent-shell/frontend',
      CHAT_TERMINAL_CWD: '/tmp/agent-shell/frontend',
      CHAT_REPOSITORY_ROOT: '/tmp/agent-shell',
      AGENT_PROJECT_ID: 'local:agent-shell:stable',
      AGENT_SESSION_KEY: 'hermes-session-1',
      AGENT_PROJECT_PATH: '/tmp/agent-shell',
      AGENT_PROJECT_ROOT: '/tmp/agent-shell',
      AGENT_PROJECT_NAME: 'agent-shell',
      AGENT_ENVIRONMENT_ID: 'local',
      AGENT_RUNTIME: 'Work locally',
      AGENT_BRANCH: 'main',
      AGENT_WORKSPACE_CWD: '/tmp/agent-shell',
      AGENT_WORKING_DIR: '/tmp/agent-shell/frontend',
      AGENT_TERMINAL_CWD: '/tmp/agent-shell/frontend',
      AGENT_REPOSITORY_ROOT: '/tmp/agent-shell',
      HERMES_AGENT_PROJECT_ID: 'local:agent-shell:stable',
      HERMES_AGENT_SESSION_KEY: 'hermes-session-1',
      HERMES_AGENT_PROJECT_PATH: '/tmp/agent-shell',
      HERMES_AGENT_PROJECT_ROOT: '/tmp/agent-shell',
      HERMES_AGENT_PROJECT_NAME: 'agent-shell',
      HERMES_AGENT_ENVIRONMENT_ID: 'local',
      HERMES_AGENT_RUNTIME: 'Work locally',
      HERMES_AGENT_BRANCH: 'main',
      HERMES_AGENT_WORKSPACE_CWD: '/tmp/agent-shell',
      HERMES_AGENT_WORKING_DIR: '/tmp/agent-shell/frontend',
      HERMES_AGENT_TERMINAL_CWD: '/tmp/agent-shell/frontend',
      HERMES_AGENT_REPOSITORY_ROOT: '/tmp/agent-shell',
      HERMES_PROJECT_ID: 'local:agent-shell:stable',
      HERMES_SESSION_KEY: 'hermes-session-1',
      HERMES_PROJECT_PATH: '/tmp/agent-shell',
      HERMES_PROJECT_ROOT: '/tmp/agent-shell',
      HERMES_PROJECT_NAME: 'agent-shell',
      HERMES_ENVIRONMENT_ID: 'local',
      HERMES_RUNTIME: 'Work locally',
      HERMES_BRANCH: 'main',
      HERMES_WORKSPACE_CWD: '/tmp/agent-shell',
      HERMES_WORKING_DIR: '/tmp/agent-shell/frontend',
      HERMES_TERMINAL_CWD: '/tmp/agent-shell/frontend',
      HERMES_REPOSITORY_ROOT: '/tmp/agent-shell',
      CLAWCONTROL_PROJECT_ID: 'local:agent-shell:stable',
      CLAWCONTROL_SESSION_KEY: 'hermes-session-1',
      CLAWCONTROL_PROJECT_PATH: '/tmp/agent-shell',
      CLAWCONTROL_PROJECT_ROOT: '/tmp/agent-shell',
      CLAWCONTROL_PROJECT_NAME: 'agent-shell',
      CLAWCONTROL_ENVIRONMENT_ID: 'local',
      CLAWCONTROL_RUNTIME: 'Work locally',
      CLAWCONTROL_BRANCH: 'main',
      CLAWCONTROL_WORKSPACE_CWD: '/tmp/agent-shell',
      CLAWCONTROL_WORKING_DIR: '/tmp/agent-shell/frontend',
      CLAWCONTROL_TERMINAL_CWD: '/tmp/agent-shell/frontend',
      CLAWCONTROL_REPOSITORY_ROOT: '/tmp/agent-shell',
    })
  })

  it('does not leak fallback project identity into terminal env when no project is ready', () => {
    expect(terminalProjectEnv({
      project: FALLBACK_PROJECT,
      projectReady: false,
      projectPath: '',
      terminalCwd: '/tmp/should-not-leak',
      sessionKey: 'stale-session',
      runtime: 'Work locally',
      branch: 'main',
    })).toMatchObject({
      CHAT_SESSION_KEY: '',
      CHAT_PROJECT_ID: '',
      CHAT_PROJECT_PATH: '',
      CHAT_PROJECT_ROOT: '',
      CHAT_PROJECT_NAME: '',
      CHAT_ENVIRONMENT_ID: '',
      CHAT_RUNTIME: '',
      CHAT_BRANCH: '',
      CHAT_WORKSPACE_CWD: '',
      CHAT_WORKING_DIR: '',
      CHAT_TERMINAL_CWD: '',
      CHAT_REPOSITORY_ROOT: '',
      AGENT_PROJECT_NAME: '',
      AGENT_WORKSPACE_CWD: '',
      AGENT_WORKING_DIR: '',
      AGENT_TERMINAL_CWD: '',
      AGENT_SESSION_KEY: '',
      HERMES_AGENT_PROJECT_NAME: '',
      HERMES_AGENT_WORKSPACE_CWD: '',
      HERMES_AGENT_WORKING_DIR: '',
      HERMES_AGENT_TERMINAL_CWD: '',
      HERMES_AGENT_SESSION_KEY: '',
      HERMES_PROJECT_NAME: '',
      HERMES_WORKSPACE_CWD: '',
      HERMES_WORKING_DIR: '',
      HERMES_TERMINAL_CWD: '',
      HERMES_SESSION_KEY: '',
      CLAWCONTROL_PROJECT_NAME: '',
      CLAWCONTROL_SESSION_KEY: '',
      CLAWCONTROL_WORKSPACE_CWD: '',
      CLAWCONTROL_WORKING_DIR: '',
      CLAWCONTROL_TERMINAL_CWD: '',
      CLAWCONTROL_REPOSITORY_ROOT: '',
    })
  })
})
