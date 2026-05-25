/*
 * Copied/adapted from T3 Code's project script/workspace control boundary.
 * ClawControl keeps product-specific persistence here so Chat.tsx only wires
 * selected project state into the copied T3 ProjectScriptsControl surface.
 */

import type { ProjectScript as T3ProjectScript } from '@/vendor/t3/project/ProjectScriptsControl'
import { normalizeProjectScriptId } from '@/vendor/t3/project/projectScripts'
import { api } from '@/lib/api'

export const CHAT_PROJECT_SCRIPTS_KEY = 'chat-project-scripts'
export const CHAT_PROJECT_PREFERRED_SCRIPTS_KEY = 'chat-project-preferred-scripts'
export const CHAT_ADDED_PROJECTS_KEY = 'chat-added-projects'
export const CHAT_PROJECT_PICKER_LAST_DIR_KEY = 'chat-project-picker-last-dir'

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
  keybinding?: string | null
  runOnWorktreeCreate?: boolean
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/g, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

export function sanitizeProjectPathInput(value: string): string {
  let path = value.trim()
  const quote = path[0]
  if (
    path.length >= 2
    && (quote === '"' || quote === '\'' || quote === '`')
    && path[path.length - 1] === quote
  ) {
    path = path.slice(1, -1).trim()
  }

  if (/^file:\/\//i.test(path)) {
    try {
      const url = new URL(path)
      path = decodeURIComponent(url.pathname)
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1)
    } catch {
      path = path.replace(/^file:\/\//i, '')
    }
  } else {
    try {
      path = decodeURIComponent(path)
    } catch {
      // Keep the original path when it contains non-URI percent sequences.
    }
  }

  path = path.replace(/\\([ "'()&!$])/g, '$1')
  return path.trim()
}

function requireProjectPathInput(value: string): string {
  const path = sanitizeProjectPathInput(value)
  if (!path) throw new Error('Project path is required.')
  return path
}

function canonicalProjectPath(path: string): string {
  const normalized = sanitizeProjectPathInput(path).replace(/\\/g, '/')
  if (normalized === '/') return normalized
  if (/^[A-Za-z]:\/?$/.test(normalized)) return normalized.replace(/\/+$/g, '')
  return normalized.replace(/\/+$/g, '')
}

function projectParentDirectory(path: string): string {
  const normalized = sanitizeProjectPathInput(path).replace(/\\/g, '/').replace(/\/+$/g, '')
  if (!normalized || normalized === '/') return normalized
  const index = normalized.lastIndexOf('/')
  if (index < 0) return ''
  if (index === 0) return '/'
  if (index === 2 && /^[A-Za-z]:\//.test(normalized)) return normalized.slice(0, 3)
  return normalized.slice(0, index)
}

function loadStoredProjectPickerDirectory(): string {
  try {
    return sanitizeProjectPathInput(localStorage.getItem(CHAT_PROJECT_PICKER_LAST_DIR_KEY) || '')
  } catch {
    return ''
  }
}

export function projectPickerDefaultPath({
  preferredProjectPath,
  selectedProjectPath,
  projects = [],
}: {
  preferredProjectPath?: string | null
  selectedProjectPath?: string | null
  projects?: Array<Pick<ChatWorkspaceProject, 'path'>>
} = {}): string | undefined {
  const preferredParent = projectParentDirectory(preferredProjectPath || '')
  if (preferredParent) return preferredParent

  const selectedParent = projectParentDirectory(selectedProjectPath || '')
  if (selectedParent) return selectedParent

  const stored = loadStoredProjectPickerDirectory()
  if (stored) return stored

  const workspaceProjectParent = projects
    .map((project) => projectParentDirectory(project.path))
    .find(Boolean)
  if (workspaceProjectParent) return workspaceProjectParent

  return undefined
}

export function rememberProjectPickerDirectory(projectPath: string) {
  const parent = projectParentDirectory(projectPath)
  if (!parent) return
  try {
    localStorage.setItem(CHAT_PROJECT_PICKER_LAST_DIR_KEY, parent)
  } catch {
    // ignore storage access failures
  }
}

function hexId(value: string): string {
  return Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, '0')).join('')
}

function stableProjectId(path: string, environmentId?: string | null): string | undefined {
  if (!path) return undefined
  const environment = environmentId?.trim().toLowerCase() || 'local'
  const pathId = hexId(path)
  if (environment === 'local') return `local-${pathId}`
  return `env-${hexId(environment)}-${pathId}`
}

function isStablePathProjectId(value: string | null | undefined): boolean {
  return /^(?:local|env-[0-9a-f]+)-[0-9a-f]+$/i.test(value?.trim() || '')
}

export const FALLBACK_PROJECT: ChatWorkspaceProject = {
  name: 'Select a project',
  path: '',
  branches: ['main'],
  currentBranch: 'main',
}

export const FALLBACK_WORKSPACE_CONTEXT: ChatWorkspaceContext = {
  projects: [],
  runtimeModes: ['Work locally'],
}

export const DEFAULT_CHAT_PROJECT_SCRIPTS: ChatProjectScript[] = []

function machineLabelForPath(path: string): string {
  if (path.startsWith('/run/media/')) {
    const [, , , , volume] = path.split('/')
    if (volume) return volume
  }
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

function projectEnvironmentKey(project: Pick<ChatWorkspaceProject, 'environmentId'>): string {
  return project.environmentId?.trim().toLowerCase() || ''
}

function projectLocationEnvironmentKey(project: Pick<ChatWorkspaceProject, 'environmentId'>): string {
  return projectEnvironmentKey(project) || 'local'
}

function projectScriptScopedStorageKey(
  project: Pick<ChatWorkspaceProject, 'environmentId'>,
  path: string | null | undefined,
): string {
  const environment = projectEnvironmentKey(project) || 'local'
  const normalizedPath = typeof path === 'string' ? normalizedProjectPath(path) : ''
  return normalizedPath ? `env:${environment}:path:${normalizedPath}` : ''
}

function sameProjectLocation(
  left: Pick<ChatWorkspaceProject, 'path' | 'environmentId'>,
  right: Pick<ChatWorkspaceProject, 'path' | 'environmentId'>,
): boolean {
  if (normalizedProjectPath(left.path) !== normalizedProjectPath(right.path)) return false
  return projectLocationEnvironmentKey(left) === projectLocationEnvironmentKey(right)
}

export function normalizeWorkspaceProject(project: Partial<ChatWorkspaceProject>): ChatWorkspaceProject {
  const path = canonicalProjectPath(String(project.path || ''))
  const name = String(project.name || basename(path) || 'Project')
  const environmentId = project.environmentId || (path ? 'local' : undefined)
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
    id: project.id || stableProjectId(path, environmentId),
    environmentId,
    name,
    path,
    branches: branches.length > 0 ? branches : ['main'],
    currentBranch: project.currentBranch || branches[0] || 'main',
    root: typeof project.root === 'string' && project.root.trim()
      ? canonicalProjectPath(project.root)
      : project.root,
    scripts: normalizeOptionalProjectScripts(project.scripts),
    groupingOverride,
  }
}

export function normalizeWorkspaceContext(value: Partial<ChatWorkspaceContext> | null | undefined): ChatWorkspaceContext {
  const projects = Array.isArray(value?.projects) && value.projects.length > 0
    ? value.projects
        .filter((project): project is ChatWorkspaceProject => Boolean(project?.name && project?.path))
        .map(normalizeWorkspaceProject)
    : []
  return {
    projects,
    runtimeModes: Array.isArray(value?.runtimeModes) && value.runtimeModes.length > 0
      ? value.runtimeModes
      : FALLBACK_WORKSPACE_CONTEXT.runtimeModes,
  }
}

export function projectFromPath(path: string): ChatWorkspaceProject {
  const cleanPath = canonicalProjectPath(requireProjectPathInput(path))
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
  const projectPath = requireProjectPathInput(path)
  if (window.__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const project = await invoke<ChatWorkspaceProject>('get_chat_project_for_path', { path: projectPath })
      return normalizeWorkspaceProject(project)
    } catch (error) {
      console.warn('Failed to resolve selected project folder:', error)
      throw error instanceof Error ? error : new Error('Unable to resolve selected project folder.')
    }
  }
  return projectFromPath(projectPath)
}

export interface WorkspaceProjectMutationResult {
  project: ChatWorkspaceProject
  projects: ChatWorkspaceProject[]
}

interface WorkspaceProjectMutationResponse {
  project: ChatWorkspaceProject
  projects?: ChatWorkspaceProject[]
}

function normalizeWorkspaceProjectMutationResponse(
  response: WorkspaceProjectMutationResponse,
): WorkspaceProjectMutationResult {
  const project = normalizeWorkspaceProject(response.project)
  const projects = Array.isArray(response.projects) && response.projects.length > 0
    ? response.projects.map(normalizeWorkspaceProject)
    : [project]
  return { project, projects }
}

export async function addProjectToBackend(path: string): Promise<WorkspaceProjectMutationResult> {
  const projectPath = requireProjectPathInput(path)
  if (window.__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
    const response = await invoke<WorkspaceProjectMutationResponse>('add_chat_workspace_project', {
      path: projectPath,
    })
    return normalizeWorkspaceProjectMutationResponse(response)
  }
  const response = await api.post<WorkspaceProjectMutationResponse>('/api/chat/workspace-projects', {
    path: projectPath,
  })
  return normalizeWorkspaceProjectMutationResponse(response)
}

export async function updateProjectInBackend(
  project: ChatWorkspaceProject,
  patch: Partial<Pick<ChatWorkspaceProject, 'name' | 'machineLabel' | 'scripts' | 'groupingOverride'>>,
): Promise<WorkspaceProjectMutationResult> {
  if (window.__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
    const response = await invoke<WorkspaceProjectMutationResponse>('update_chat_workspace_project', {
      id: project.id || undefined,
      path: project.path,
      environmentId: project.environmentId || undefined,
      patch,
    })
    return normalizeWorkspaceProjectMutationResponse(response)
  }
  const response = await api.patch<WorkspaceProjectMutationResponse>('/api/chat/workspace-projects', {
    id: project.id || undefined,
    path: project.path,
    environmentId: project.environmentId || undefined,
    ...patch,
  })
  return normalizeWorkspaceProjectMutationResponse(response)
}

export async function removeProjectFromBackend(project: ChatWorkspaceProject): Promise<ChatWorkspaceProject[]> {
  if (window.__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
    const response = await invoke<ChatWorkspaceProject[]>('remove_chat_workspace_project', {
      id: project.id || undefined,
      path: project.path,
      environmentId: project.environmentId || undefined,
    })
    return response.map(normalizeWorkspaceProject)
  }
  const response = await api.del<ChatWorkspaceProject[]>('/api/chat/workspace-projects', {
    id: project.id || undefined,
    path: project.path,
    environmentId: project.environmentId || undefined,
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
  return legacyProjects.filter((project) => (
    !backendProjects.some((backendProject) => sameProjectLocation(project, backendProject))
  ))
}

export function mergeWorkspaceProjects(
  context: ChatWorkspaceContext,
  addedProjects: ChatWorkspaceProject[],
): ChatWorkspaceContext {
  const projects = [...context.projects]
  for (const project of addedProjects) {
    const existingIndex = projects.findIndex((candidate) => sameProjectLocation(candidate, project))
    if (existingIndex >= 0) {
      projects[existingIndex] = project
    } else {
      projects.push(project)
    }
  }
  return { ...context, projects }
}

export function replaceWorkspaceProject(
  context: ChatWorkspaceContext,
  project: ChatWorkspaceProject,
): ChatWorkspaceContext {
  const projects = context.projects.some((candidate) => sameProjectLocation(candidate, project))
    ? context.projects.map((candidate) => (sameProjectLocation(candidate, project) ? project : candidate))
    : [...context.projects, project]
  return { ...context, projects }
}

export function removeWorkspaceProject(
  context: ChatWorkspaceContext,
  targetProject: string | Pick<ChatWorkspaceProject, 'path' | 'environmentId'>,
): ChatWorkspaceContext {
  const target = typeof targetProject === 'string' ? { path: targetProject, environmentId: null } : targetProject
  const projects = context.projects.filter((project) => !sameProjectLocation(project, target))
  return {
    ...context,
    projects,
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
    keybinding: typeof script?.keybinding === 'string' && script.keybinding.trim() ? script.keybinding.trim() : undefined,
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
    projectScriptScopedStorageKey(project ?? { environmentId: 'local' }, project?.root),
    projectScriptScopedStorageKey(project ?? { environmentId: 'local' }, project?.path),
  ]
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter(Boolean)
  return keys.filter((key, index) => keys.indexOf(key) === index)
}

function legacyProjectScriptPathKeys(project: ChatWorkspaceProject | null): string[] {
  const keys = [
    project?.root,
    project?.path,
    project?.root ? normalizedProjectPath(project.root) : '',
    project?.path ? normalizedProjectPath(project.path) : '',
  ]
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter(Boolean)
  return keys.filter((key, index) => keys.indexOf(key) === index)
}

export function projectScriptWriteStorageKeys(project: ChatWorkspaceProject | null): string[] {
  const keys = projectScriptStorageKeys(project)
  const environment = projectEnvironmentKey(project ?? { environmentId: 'local' })
  if (!environment || environment === 'local') {
    keys.push(...legacyProjectScriptPathKeys(project))
  }
  return keys.filter((key, index) => keys.indexOf(key) === index)
}

export function pruneProjectScriptStoreForProject(
  store: Record<string, ChatProjectScript[]>,
  project: ChatWorkspaceProject,
): Record<string, ChatProjectScript[]> {
  const directKeys = new Set(projectScriptStorageKeys(project))
  const shouldPruneLegacyPathKeys = !projectEnvironmentKey(project) || projectEnvironmentKey(project) === 'local'
  const normalizedPathKeys = new Set(
    shouldPruneLegacyPathKeys
      ? legacyProjectScriptPathKeys(project).map(normalizedProjectPath)
      : [],
  )

  return Object.fromEntries(
    Object.entries(store).filter(([key]) => (
      !directKeys.has(key)
      && !normalizedPathKeys.has(normalizedProjectPath(key))
    )),
  )
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

export function loadProjectPreferredScriptStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CHAT_PROJECT_PREFERRED_SCRIPTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : ''])
        .filter(([key, value]) => Boolean(key && value)),
    )
  } catch {
    return {}
  }
}

export function saveProjectPreferredScriptStore(store: Record<string, string>) {
  try {
    localStorage.setItem(CHAT_PROJECT_PREFERRED_SCRIPTS_KEY, JSON.stringify(store))
  } catch {
    // ignore storage access failures
  }
}

export function preferredScriptIdForProject(project: ChatWorkspaceProject | null): string {
  const store = loadProjectPreferredScriptStore()
  for (const key of projectScriptStorageKeys(project)) {
    const scriptId = store[key]?.trim()
    if (scriptId) return scriptId
  }
  return ''
}

export function savePreferredScriptIdForProject(project: ChatWorkspaceProject | null, scriptId: string) {
  const keys = projectScriptWriteStorageKeys(project)
  if (keys.length === 0) return
  const next = loadProjectPreferredScriptStore()
  const value = scriptId.trim()
  for (const key of keys) {
    if (value) next[key] = value
    else delete next[key]
  }
  saveProjectPreferredScriptStore(next)
}

export function pruneProjectPreferredScriptStoreForProject(
  store: Record<string, string>,
  project: ChatWorkspaceProject,
): Record<string, string> {
  const scriptKeys = new Set(projectScriptWriteStorageKeys(project))
  const normalizedPathKeys = new Set(legacyProjectScriptPathKeys(project).map(normalizedProjectPath))

  return Object.fromEntries(
    Object.entries(store).filter(([key]) => (
      !scriptKeys.has(key)
      && !normalizedPathKeys.has(normalizedProjectPath(key))
    )),
  )
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
      && (script.icon ?? '') === (candidate.icon ?? '')
      && (script.keybinding ?? '') === (candidate.keybinding ?? '')
      && Boolean(script.runOnWorktreeCreate) === Boolean(candidate.runOnWorktreeCreate)
  })
}

export function scriptsForProject(
  store: Record<string, ChatProjectScript[]>,
  project: ChatWorkspaceProject | null,
): ChatProjectScript[] {
  if (project?.scripts) {
    return project.scripts
  }
  for (const key of projectScriptStorageKeys(project)) {
    if (store[key]) return store[key]
  }
  const environment = projectEnvironmentKey(project ?? { environmentId: 'local' })
  if (!environment || environment === 'local') {
    const normalizedProjectPathKeys = new Set(legacyProjectScriptPathKeys(project).map(normalizedProjectPath))
    if (normalizedProjectPathKeys.size > 0) {
      for (const [key, scripts] of Object.entries(store)) {
        if (normalizedProjectPathKeys.has(normalizedProjectPath(key))) {
          return scripts
        }
      }
    }
  }
  return project?.scripts ?? DEFAULT_CHAT_PROJECT_SCRIPTS
}

export function resolveScriptCwd(project: ChatWorkspaceProject, script?: ChatProjectScript | null): string {
  const projectPath = canonicalProjectPath(project.path)
  const scriptCwd = script?.cwd ? sanitizeProjectPathInput(script.cwd) : ''
  if (!scriptCwd) return project.path
  if (scriptCwd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(scriptCwd)) return canonicalProjectPath(scriptCwd)
  const normalizedParts: string[] = []
  for (const part of scriptCwd.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      normalizedParts.pop()
      continue
    }
    normalizedParts.push(part)
  }
  const relativePath = normalizedParts.join('/')
  return relativePath ? `${projectPath}/${relativePath}` : projectPath
}

export function terminalProcessScope(project: ChatWorkspaceProject, sessionKey: string | null): string {
  const projectId = project.id?.trim()
  const environmentId = project.environmentId?.trim()
  const rawProject = projectId && !isStablePathProjectId(projectId) ? projectId : project.path
  const raw = sessionKey?.trim() || [environmentId, rawProject].filter(Boolean).join(':')
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'chat'
}

export function terminalProjectEnv({
  project,
  projectReady,
  projectPath,
  terminalCwd,
  sessionKey,
  runtime,
  branch,
}: {
  project: ChatWorkspaceProject
  projectReady: boolean
  projectPath: string
  terminalCwd?: string
  sessionKey?: string | null
  runtime: string
  branch: string
}): Record<string, string> {
  const readyProjectPath = projectReady ? projectPath : ''
  const readyTerminalCwd = projectReady ? (terminalCwd?.trim() || readyProjectPath) : ''
  const readyProjectName = projectReady ? project.name : ''
  const readyProjectId = projectReady ? (project.id || '') : ''
  const readyEnvironmentId = projectReady ? (project.environmentId || '') : ''
  const readySessionKey = projectReady ? (sessionKey?.trim() || '') : ''
  const readyRuntime = projectReady ? runtime : ''
  const readyBranch = projectReady ? branch : ''
  const generic = {
    CHAT_SESSION_KEY: readySessionKey,
    CHAT_PROJECT_ID: readyProjectId,
    CHAT_PROJECT_PATH: readyProjectPath,
    CHAT_PROJECT_ROOT: projectReady ? (project.root || readyProjectPath) : '',
    CHAT_PROJECT_NAME: readyProjectName,
    CHAT_ENVIRONMENT_ID: readyEnvironmentId,
    CHAT_RUNTIME: readyRuntime,
    CHAT_BRANCH: readyBranch,
    CHAT_WORKSPACE_CWD: readyProjectPath,
    CHAT_WORKING_DIR: readyTerminalCwd,
    CHAT_TERMINAL_CWD: readyTerminalCwd,
    CHAT_REPOSITORY_ROOT: projectReady ? (project.root || readyProjectPath) : '',
  }

  return {
    ...generic,
    AGENT_PROJECT_ID: generic.CHAT_PROJECT_ID,
    AGENT_SESSION_KEY: generic.CHAT_SESSION_KEY,
    AGENT_PROJECT_PATH: generic.CHAT_PROJECT_PATH,
    AGENT_PROJECT_ROOT: generic.CHAT_PROJECT_ROOT,
    AGENT_PROJECT_NAME: generic.CHAT_PROJECT_NAME,
    AGENT_ENVIRONMENT_ID: generic.CHAT_ENVIRONMENT_ID,
    AGENT_RUNTIME: generic.CHAT_RUNTIME,
    AGENT_BRANCH: generic.CHAT_BRANCH,
    AGENT_WORKSPACE_CWD: generic.CHAT_WORKSPACE_CWD,
    AGENT_WORKING_DIR: generic.CHAT_WORKING_DIR,
    AGENT_TERMINAL_CWD: generic.CHAT_TERMINAL_CWD,
    AGENT_REPOSITORY_ROOT: generic.CHAT_REPOSITORY_ROOT,
    HERMES_AGENT_PROJECT_ID: generic.CHAT_PROJECT_ID,
    HERMES_AGENT_SESSION_KEY: generic.CHAT_SESSION_KEY,
    HERMES_AGENT_PROJECT_PATH: generic.CHAT_PROJECT_PATH,
    HERMES_AGENT_PROJECT_ROOT: generic.CHAT_PROJECT_ROOT,
    HERMES_AGENT_PROJECT_NAME: generic.CHAT_PROJECT_NAME,
    HERMES_AGENT_ENVIRONMENT_ID: generic.CHAT_ENVIRONMENT_ID,
    HERMES_AGENT_RUNTIME: generic.CHAT_RUNTIME,
    HERMES_AGENT_BRANCH: generic.CHAT_BRANCH,
    HERMES_AGENT_WORKSPACE_CWD: generic.CHAT_WORKSPACE_CWD,
    HERMES_AGENT_WORKING_DIR: generic.CHAT_WORKING_DIR,
    HERMES_AGENT_TERMINAL_CWD: generic.CHAT_TERMINAL_CWD,
    HERMES_AGENT_REPOSITORY_ROOT: generic.CHAT_REPOSITORY_ROOT,
    HERMES_PROJECT_ID: generic.CHAT_PROJECT_ID,
    HERMES_SESSION_KEY: generic.CHAT_SESSION_KEY,
    HERMES_PROJECT_PATH: generic.CHAT_PROJECT_PATH,
    HERMES_PROJECT_ROOT: generic.CHAT_PROJECT_ROOT,
    HERMES_PROJECT_NAME: generic.CHAT_PROJECT_NAME,
    HERMES_ENVIRONMENT_ID: generic.CHAT_ENVIRONMENT_ID,
    HERMES_RUNTIME: generic.CHAT_RUNTIME,
    HERMES_BRANCH: generic.CHAT_BRANCH,
    HERMES_WORKSPACE_CWD: generic.CHAT_WORKSPACE_CWD,
    HERMES_WORKING_DIR: generic.CHAT_WORKING_DIR,
    HERMES_TERMINAL_CWD: generic.CHAT_TERMINAL_CWD,
    HERMES_REPOSITORY_ROOT: generic.CHAT_REPOSITORY_ROOT,
    CLAWCONTROL_PROJECT_ID: generic.CHAT_PROJECT_ID,
    CLAWCONTROL_SESSION_KEY: generic.CHAT_SESSION_KEY,
    CLAWCONTROL_PROJECT_PATH: generic.CHAT_PROJECT_PATH,
    CLAWCONTROL_PROJECT_ROOT: generic.CHAT_PROJECT_ROOT,
    CLAWCONTROL_PROJECT_NAME: generic.CHAT_PROJECT_NAME,
    CLAWCONTROL_ENVIRONMENT_ID: generic.CHAT_ENVIRONMENT_ID,
    CLAWCONTROL_RUNTIME: generic.CHAT_RUNTIME,
    CLAWCONTROL_BRANCH: generic.CHAT_BRANCH,
    CLAWCONTROL_WORKSPACE_CWD: generic.CHAT_WORKSPACE_CWD,
    CLAWCONTROL_WORKING_DIR: generic.CHAT_WORKING_DIR,
    CLAWCONTROL_TERMINAL_CWD: generic.CHAT_TERMINAL_CWD,
    CLAWCONTROL_REPOSITORY_ROOT: generic.CHAT_REPOSITORY_ROOT,
  }
}
