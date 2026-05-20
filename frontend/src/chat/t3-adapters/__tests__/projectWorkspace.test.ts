import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHAT_ADDED_PROJECTS_KEY,
  CHAT_PROJECT_SCRIPTS_KEY,
  DEFAULT_CHAT_PROJECT_SCRIPTS,
  FALLBACK_PROJECT,
  FALLBACK_WORKSPACE_CONTEXT,
  loadAddedProjects,
  loadProjectScriptStore,
  mergeWorkspaceProjects,
  normalizeProjectScripts,
  normalizeWorkspaceContext,
  projectFromPath,
  pruneMigratedAddedProjects,
  removeWorkspaceProject,
  replaceWorkspaceProject,
  saveAddedProjects,
  resolveScriptCwd,
  saveProjectScriptStore,
  scriptsForProject,
  terminalProcessScope,
  toT3ProjectScript,
  type ChatProjectScript,
} from '../projectWorkspace'

describe('T3 project workspace adapter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('normalizes project scripts using T3-style stable ids and defaults', () => {
    expect(normalizeProjectScripts('bad-input')).toBe(DEFAULT_CHAT_PROJECT_SCRIPTS)
    expect(normalizeProjectScripts([
      { name: 'Run Tests', command: 'npm test', cwd: 'frontend', icon: 'test' },
      { name: 'No command' },
    ])).toEqual([
      {
        id: 'run-tests',
        name: 'Run Tests',
        command: 'npm test',
        cwd: 'frontend',
        icon: 'test',
        runOnWorktreeCreate: false,
      },
    ])
  })

  it('keeps workspace project normalization and legacy added-project storage out of Chat.tsx', () => {
    const project = projectFromPath('/Users/josue/AgentShell/')

    expect(project).toMatchObject({
      name: 'AgentShell',
      path: '/Users/josue/AgentShell/',
      machineLabel: 'Local Mac',
      branches: ['main'],
      currentBranch: 'main',
    })

    const context = normalizeWorkspaceContext({
      projects: [{ name: 'Repo', path: '/repo', branches: [], currentBranch: '' }],
      runtimeModes: ['Work locally', 'Harness VM'],
    })
    expect(context.projects[0]).toMatchObject({ name: 'Repo', path: '/repo', branches: ['main'] })
    expect(context.runtimeModes).toEqual(['Work locally', 'Harness VM'])
    expect(normalizeWorkspaceContext(null)).toEqual(FALLBACK_WORKSPACE_CONTEXT)

    saveAddedProjects([project])
    expect(localStorage.getItem(CHAT_ADDED_PROJECTS_KEY)).toContain('AgentShell')
    expect(loadAddedProjects()).toEqual([project])
  })

  it('merges, replaces, removes, and prunes workspace project records in the adapter', () => {
    const added = projectFromPath('/tmp/added')
    const existing = { ...FALLBACK_PROJECT, path: '/tmp/existing', name: 'existing' }
    const context = { projects: [existing], runtimeModes: ['Work locally'] }

    expect(mergeWorkspaceProjects(context, [added]).projects.map(project => project.path)).toEqual([
      '/tmp/existing',
      '/tmp/added',
    ])
    expect(replaceWorkspaceProject(context, { ...existing, name: 'renamed' }).projects[0].name).toBe('renamed')
    expect(removeWorkspaceProject(context, '/tmp/existing')).toEqual(FALLBACK_WORKSPACE_CONTEXT)
    expect(pruneMigratedAddedProjects([added, existing], [existing])).toEqual([added])
  })

  it('persists project scripts outside Chat.tsx and resolves project overrides first', () => {
    const stored: ChatProjectScript[] = [{ id: 'dev', name: 'Dev', command: 'npm run dev' }]
    const normalizedStored: ChatProjectScript[] = [{
      id: 'dev',
      name: 'Dev',
      command: 'npm run dev',
      runOnWorktreeCreate: false,
    }]
    saveProjectScriptStore({ [FALLBACK_PROJECT.path]: stored })

    expect(localStorage.getItem(CHAT_PROJECT_SCRIPTS_KEY)).toContain('npm run dev')
    expect(loadProjectScriptStore()).toEqual({ [FALLBACK_PROJECT.path]: normalizedStored })
    expect(scriptsForProject(loadProjectScriptStore(), { ...FALLBACK_PROJECT })).toEqual(normalizedStored)
    expect(scriptsForProject({}, { ...FALLBACK_PROJECT, scripts: stored })).toEqual(stored)
  })

  it('adapts ClawControl scripts to the copied T3 toolbar and resolves command cwd/scope', () => {
    const script: ChatProjectScript = { id: 'lint', name: 'Lint', command: 'npm run lint', cwd: 'frontend' }

    expect(toT3ProjectScript(script)).toEqual({ ...script, icon: 'play' })
    expect(resolveScriptCwd(FALLBACK_PROJECT, script)).toBe('/Volumes/T7/projects/clawcontrol/frontend')
    expect(resolveScriptCwd(FALLBACK_PROJECT, { ...script, cwd: '/tmp/work' })).toBe('/tmp/work')
    expect(terminalProcessScope(FALLBACK_PROJECT, null)).toBe('volumes-t7-projects-clawcontrol')
    expect(terminalProcessScope({ ...FALLBACK_PROJECT, id: 'local:repo:stable' }, 'thread-123')).toBe('thread-123')
  })
})
