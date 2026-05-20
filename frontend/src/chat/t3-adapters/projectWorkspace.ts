/*
 * Copied/adapted from T3 Code's project script/workspace control boundary.
 * ClawControl keeps product-specific persistence here so Chat.tsx only wires
 * selected project state into the copied T3 ProjectScriptsControl surface.
 */

import type { ProjectScript as T3ProjectScript } from '@/vendor/t3/project/ProjectScriptsControl'
import { normalizeProjectScriptId } from '@/vendor/t3/project/projectScripts'
import { api } from '@/lib/api'

export const CHAT_PROJECT_SCRIPTS_KEY = 'chat-project-scripts'
export const CHAT_ADDED_PROJECTS_KEY = 'chat-added-projects'

export interface ChatWorkspaceContext {
  projects: ChatWorkspaceProject[]
  runtimeModes: string[]
}

export interface ChatWorkspaceProject {
  id?: string | null
  environmentId?: string | null
  name: string
  path: string
  branches: string[]
  currentBranch?: string | null
  repositoryIdentity?: ChatRepositoryIdentity | null
  machine?: string | null
  machineLabel?: string | null
  host?: string | null
  group?: string | null
  root?: string | null
  scripts?: ChatProjectScript[]
  groupingOverride?: ChatProjectGroupingMode | null
}

export interface ChatRepositoryIdentity {
  canonicalKey: string
  rootPath?: string | null
  displayName?: string | null
  name?: string | null
  owner?: string | null
  remoteName?: string | null
  remoteUrl?: string | null
}

export interface ChatLogicalProject {
  key: string
  displayName: string
  projects: ChatWorkspaceProject[]
  representative: ChatWorkspaceProject
}

export interface ChatProjectSidebarGroup {
  label: string
  projects: ChatLogicalProject[]
}

export type ChatProjectGroupingMode = 'repository' | 'repository-path' | 'separate'
export type ChatProjectSortOrder = 'name' | 'machine' | 'recent'
export type ChatActivePanel = 'review' | 'info' | null

export interface ChatProjectScript {
  id: string
  name: string
  command: string
  cwd?: string | null
  icon?: string | null
  runOnWorktreeCreate?: boolean
}

export const FALLBACK_PROJECT: ChatWorkspaceProject = {
  name: 'clawcontrol',
  path: '/Volumes/T7/projects/clawcontrol',
  branches: ['main'],
  currentBranch: 'main',
}

export const FALLBACK_WORKSPACE_CONTEXT: ChatWorkspaceContext = {
  projects: [FALLBACK_PROJECT],
  runtimeModes: ['Work locally'],
}

export const DEFAULT_CHAT_PROJECT_SCRIPTS: ChatProjectScript[] = [
  { id: 'tauri-dev', name: 'Tauri dev', command: 'cargo tauri dev', cwd: 'src-tauri' },
  { id: 'frontend-dev', name: 'Frontend dev', command: 'npm run dev', cwd: 'frontend' },
  { id: 'typecheck', name: 'Typecheck', command: 'npm run typecheck', cwd: 'frontend' },
  { id: 'test-chat', name: 'Chat tests', command: 'npm run test -- src/pages/__tests__/ChatPage.new-chat.test.tsx src/components/__tests__/Sidebar.test.tsx', cwd: 'frontend' },
  { id: 'lint-chat', name: 'Chat lint', command: 'npx eslint src/pages/Chat.tsx src/pages/chat/ChatInput.tsx src/pages/chat/useChatState.ts src/hooks/useTerminal.ts src/chat/t3-adapters src/vendor/t3/project src/vendor/t3/providers src/vendor/t3/terminal', cwd: 'frontend' },
]

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/g, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function machineLabelForPath(path: string): string {
  if (path.startsWith('/Volumes/')) {
    const [, , volume] = path.split('/')
    if (volume) return volume
  }
  if (path.startsWith('/Users/')) return 'Local Mac'
  if (path.startsWith('/home/')) return 'Linux'
  if (/^[A-Za-z]:[\\/]/.test(path)) return path.slice(0, 2)
  const normalized = path.replace(/\/+$/g, '')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : 'Projects'
}

function normalizedProjectPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

export function normalizeWorkspaceProject(project: Partial<ChatWorkspaceProject>): ChatWorkspaceProject {
  const path = String(project.path || '').trim()
  const name = String(project.name || basename(path) || 'Project')
  const branches = Array.isArray(project.branches) && project.branches.length > 0
    ? project.branches.map(String).filter(Boolean)
    : (project.currentBranch ? [String(project.currentBranch)] : ['main'])
  const groupingOverride = project.groupingOverride === 'repository'
    || project.groupingOverride === 'repository-path'
    || project.groupingOverride === 'separate'
    ? project.groupingOverride
    : undefined
  return {
    ...project,
    name,
    path,
    branches: branches.length > 0 ? branches : ['main'],
    currentBranch: project.currentBranch || branches[0] || 'main',
    scripts: normalizeOptionalProjectScripts(project.scripts),
    groupingOverride,
  }
}

export function normalizeWorkspaceContext(value: Partial<ChatWorkspaceContext> | null | undefined): ChatWorkspaceContext {
  const projects = Array.isArray(value?.projects) && value.projects.length > 0
    ? value.projects
        .filter((project): project is ChatWorkspaceProject => Boolean(project?.name && project?.path))
        .map(normalizeWorkspaceProject)
    : FALLBACK_WORKSPACE_CONTEXT.projects
  return {
    projects: projects.length > 0 ? projects : FALLBACK_WORKSPACE_CONTEXT.projects,
    runtimeModes: Array.isArray(value?.runtimeModes) && value.runtimeModes.length > 0
      ? value.runtimeModes
      : FALLBACK_WORKSPACE_CONTEXT.runtimeModes,
  }
}

export function projectFromPath(path: string): ChatWorkspaceProject {
  const cleanPath = path.trim()
  const name = basename(cleanPath) || 'New project'
  return normalizeWorkspaceProject({
    name,
    path: cleanPath,
    branches: ['main'],
    currentBranch: 'main',
    machineLabel: machineLabelForPath(cleanPath),
  })
}

export async function resolveProjectFromPath(path: string): Promise<ChatWorkspaceProject> {
  if (window.__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const project = await invoke<ChatWorkspaceProject>('get_chat_project_for_path', { path })
      return normalizeWorkspaceProject(project)
    } catch (error) {
      console.warn('Failed to resolve selected project folder:', error)
    }
  }
  return projectFromPath(path)
}

interface AddWorkspaceProjectResponse {
  project: ChatWorkspaceProject
  projects?: ChatWorkspaceProject[]
}

export async function addProjectToBackend(path: string): Promise<ChatWorkspaceProject> {
  const response = await api.post<AddWorkspaceProjectResponse>('/api/chat/workspace-projects', { path })
  return normalizeWorkspaceProject(response.project)
}

export async function updateProjectInBackend(
  project: ChatWorkspaceProject,
  patch: Partial<Pick<ChatWorkspaceProject, 'name' | 'machineLabel' | 'scripts' | 'groupingOverride'>>,
): Promise<ChatWorkspaceProject> {
  const response = await api.patch<AddWorkspaceProjectResponse>('/api/chat/workspace-projects', {
    id: project.id || undefined,
    path: project.path,
    ...patch,
  })
  return normalizeWorkspaceProject(response.project)
}

export async function removeProjectFromBackend(project: ChatWorkspaceProject): Promise<ChatWorkspaceProject[]> {
  const response = await api.del<ChatWorkspaceProject[]>('/api/chat/workspace-projects', {
    id: project.id || undefined,
    path: project.path,
  })
  return response.map(normalizeWorkspaceProject)
}

export function loadAddedProjects(): ChatWorkspaceProject[] {
  try {
    const raw = localStorage.getItem(CHAT_ADDED_PROJECTS_KEY)
    if (!raw) return []
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value
      .filter((project): project is ChatWorkspaceProject => Boolean(
        project
        && typeof project === 'object'
        && 'name' in project
        && 'path' in project
        && typeof project.name === 'string'
        && typeof project.path === 'string',
      ))
      .map(normalizeWorkspaceProject)
  } catch {
    return []
  }
}

export function saveAddedProjects(projects: ChatWorkspaceProject[]) {
  try {
    localStorage.setItem(CHAT_ADDED_PROJECTS_KEY, JSON.stringify(projects))
  } catch {
    // ignore storage access failures
  }
}

export function pruneMigratedAddedProjects(
  legacyProjects: ChatWorkspaceProject[],
  backendProjects: ChatWorkspaceProject[],
): ChatWorkspaceProject[] {
  const backendPaths = new Set(backendProjects.map((project) => normalizedProjectPath(project.path)))
  return legacyProjects.filter((project) => !backendPaths.has(normalizedProjectPath(project.path)))
}

export function mergeWorkspaceProjects(
  context: ChatWorkspaceContext,
  addedProjects: ChatWorkspaceProject[],
): ChatWorkspaceContext {
  const projects = [...context.projects]
  for (const project of addedProjects) {
    if (!projects.some((candidate) => candidate.path === project.path)) {
      projects.push(project)
    }
  }
  return { ...context, projects }
}

export function replaceWorkspaceProject(
  context: ChatWorkspaceContext,
  project: ChatWorkspaceProject,
): ChatWorkspaceContext {
  const projects = context.projects.some((candidate) => candidate.path === project.path)
    ? context.projects.map((candidate) => (candidate.path === project.path ? project : candidate))
    : [...context.projects, project]
  return { ...context, projects }
}

export function removeWorkspaceProject(context: ChatWorkspaceContext, path: string): ChatWorkspaceContext {
  const projects = context.projects.filter((project) => project.path !== path)
  return {
    ...context,
    projects: projects.length > 0 ? projects : FALLBACK_WORKSPACE_CONTEXT.projects,
  }
}

export async function loadChatWorkspaceContext(): Promise<ChatWorkspaceContext> {
  if (window.__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<ChatWorkspaceContext>('get_chat_workspace_context')
  }
  return api.get<ChatWorkspaceContext>('/api/chat/workspace-context')
}

export function toT3ProjectScript(script: ChatProjectScript): T3ProjectScript {
  return {
    ...script,
    icon: script.icon || 'play',
  }
}

export function normalizeProjectScript(script: Partial<ChatProjectScript> | null | undefined): ChatProjectScript | null {
  const name = String(script?.name || '').trim()
  const command = String(script?.command || '').trim()
  if (!name || !command) return null
  const fallbackId = normalizeProjectScriptId(name)
  return {
    id: String(script?.id || fallbackId).trim() || fallbackId,
    name,
    command,
    cwd: typeof script?.cwd === 'string' && script.cwd.trim() ? script.cwd.trim() : undefined,
    icon: typeof script?.icon === 'string' && script.icon.trim() ? script.icon.trim() : undefined,
    runOnWorktreeCreate: Boolean(script?.runOnWorktreeCreate),
  }
}

export function normalizeProjectScripts(
  value: unknown,
  fallback: ChatProjectScript[] = DEFAULT_CHAT_PROJECT_SCRIPTS,
): ChatProjectScript[] {
  if (!Array.isArray(value)) return fallback
  const scripts = value
    .map((item) => normalizeProjectScript(item as Partial<ChatProjectScript>))
    .filter((script): script is ChatProjectScript => Boolean(script))
  return scripts.length > 0 ? scripts : fallback
}

export function normalizeOptionalProjectScripts(value: unknown): ChatProjectScript[] | undefined {
  if (!Array.isArray(value)) return undefined
  return normalizeProjectScripts(value)
}

export function projectScriptStorageKeys(project: ChatWorkspaceProject | null): string[] {
  const keys = [
    project?.id,
    project?.root,
    project?.path,
    FALLBACK_PROJECT.path,
  ]
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter(Boolean)
  return keys.filter((key, index) => keys.indexOf(key) === index)
}

export function loadProjectScriptStore(): Record<string, ChatProjectScript[]> {
  try {
    const raw = localStorage.getItem(CHAT_PROJECT_SCRIPTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key, normalizeProjectScripts(value)])
        .filter(([key]) => Boolean(key)),
    )
  } catch {
    return {}
  }
}

export function saveProjectScriptStore(store: Record<string, ChatProjectScript[]>) {
  try {
    localStorage.setItem(CHAT_PROJECT_SCRIPTS_KEY, JSON.stringify(store))
  } catch {
    // ignore storage access failures
  }
}

export function scriptsAreEquivalent(left: ChatProjectScript[] | undefined, right: ChatProjectScript[]): boolean {
  if (!left || left.length !== right.length) return false
  return left.every((script, index) => {
    const candidate = right[index]
    return Boolean(candidate)
      && script.id === candidate.id
      && script.name === candidate.name
      && script.command === candidate.command
      && (script.cwd ?? '') === (candidate.cwd ?? '')
  })
}

export function scriptsForProject(
  store: Record<string, ChatProjectScript[]>,
  project: ChatWorkspaceProject | null,
): ChatProjectScript[] {
  if (project?.scripts && !scriptsAreEquivalent(project.scripts, DEFAULT_CHAT_PROJECT_SCRIPTS)) {
    return project.scripts
  }
  for (const key of projectScriptStorageKeys(project)) {
    if (store[key]) return store[key]
  }
  return project?.scripts ?? DEFAULT_CHAT_PROJECT_SCRIPTS
}

export function resolveScriptCwd(project: ChatWorkspaceProject, script?: ChatProjectScript | null): string {
  const projectPath = project.path.replace(/\/+$/g, '')
  const scriptCwd = script?.cwd?.trim()
  if (!scriptCwd) return project.path
  if (scriptCwd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(scriptCwd)) return scriptCwd
  return `${projectPath}/${scriptCwd.replace(/^\/+/g, '')}`
}

export function terminalProcessScope(project: ChatWorkspaceProject, sessionKey: string | null): string {
  const raw = sessionKey?.trim() || project.id?.trim() || project.path
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'chat'
}
