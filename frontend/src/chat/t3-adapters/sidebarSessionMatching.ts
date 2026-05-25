/*
 * Copied/adapted from T3 Code's project/thread sidebar scoping behavior.
 * clawctrl keeps raw gateway sessions, so this adapter maps common
 * session metadata shapes into T3-style project ownership checks.
 */

export interface SidebarSessionLike {
  [key: string]: unknown
}

export interface SidebarProjectLike {
  id?: string | null
  environmentId?: string | null
  name: string
  path: string
  root?: string | null
  repositoryIdentity?: {
    displayName?: string | null
    name?: string | null
  } | null
}

export interface SidebarLogicalProjectLike<Project extends SidebarProjectLike = SidebarProjectLike> {
  projects: Project[]
}

const SESSION_METADATA_CONTAINERS = [
  'metadata',
  'context',
  'projectContext',
  'workspace',
] as const

function sessionContainers(session: SidebarSessionLike): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = [session]
  for (const key of SESSION_METADATA_CONTAINERS) {
    const value = session[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      containers.push(value as Record<string, unknown>)
    }
  }
  return containers
}

export function sessionString(session: SidebarSessionLike, keys: string[]): string | null {
  const containers = sessionContainers(session)
  for (const key of keys) {
    for (const container of containers) {
      const value = container[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

export function sessionWorkingDir(session: SidebarSessionLike): string | null {
  return sessionString(session, [
    'workingDir',
    'working_dir',
    'cwd',
    'projectPath',
    'project_path',
    'workspacePath',
    'workspace_path',
  ])
}

export function sessionProjectRoot(session: SidebarSessionLike): string | null {
  return sessionString(session, [
    'projectRoot',
    'project_root',
    'workspaceRoot',
    'workspace_root',
    'repositoryRoot',
    'repository_root',
    'repoRoot',
    'repo_root',
    'root',
    'path',
  ])
}

export function sessionProjectName(session: SidebarSessionLike): string | null {
  return sessionString(session, ['project', 'projectName', 'project_name'])
}

export function sessionProjectId(session: SidebarSessionLike): string | null {
  return sessionString(session, ['projectId', 'project_id', 'projectRef', 'project_ref'])
}

export function sessionEnvironmentId(session: SidebarSessionLike): string | null {
  return sessionString(session, ['environmentId', 'environment_id', 'env', 'environment'])
}

function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

function normalizeEnvironmentId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || ''
}

export function sessionMatchesProject(
  session: SidebarSessionLike,
  project: SidebarProjectLike,
): boolean {
  const projectId = project.id?.trim()
  const sessionId = sessionProjectId(session)
  const sessionEnv = normalizeEnvironmentId(sessionEnvironmentId(session))
  const projectEnv = normalizeEnvironmentId(project.environmentId)
  const environmentMatches = !sessionEnv || !projectEnv || sessionEnv === projectEnv

  const cwd = sessionWorkingDir(session)
  const root = sessionProjectRoot(session)
  const normalizedCwd = cwd ? normalizeProjectPath(cwd) : ''
  const normalizedSessionRoot = root ? normalizeProjectPath(root) : ''
  const normalizedPath = normalizeProjectPath(project.path)
  const normalizedRoot = normalizeProjectPath(project.root || '')
  const projectPathIsRoot = Boolean(normalizedRoot && normalizedPath === normalizedRoot)
  const normalizedSessionId = sessionId ? normalizeProjectPath(sessionId) : ''

  if (projectId && sessionId) {
    if (projectId === sessionId) return environmentMatches
    if (
      environmentMatches
      && normalizedSessionId
      && (normalizedSessionId === normalizedPath || (normalizedRoot && normalizedSessionId === normalizedRoot))
    ) {
      return true
    }
    return false
  }

  if (!environmentMatches) return false

  if (normalizedCwd && (normalizedCwd === normalizedPath || normalizedCwd.startsWith(`${normalizedPath}/`))) return true
  if (normalizedCwd && projectPathIsRoot && (normalizedCwd === normalizedRoot || normalizedCwd.startsWith(`${normalizedRoot}/`))) return true
  if (!normalizedCwd && normalizedSessionRoot && (normalizedSessionRoot === normalizedPath || normalizedSessionRoot.startsWith(`${normalizedPath}/`))) return true
  if (!normalizedCwd && normalizedSessionRoot && projectPathIsRoot && normalizedSessionRoot === normalizedRoot) return true

  const projectName = sessionProjectName(session)
  const identityName = project.repositoryIdentity?.displayName || project.repositoryIdentity?.name
  return Boolean(projectName && (projectName === project.name || projectName === identityName))
}

export function sessionMatchesLogicalProject<Project extends SidebarProjectLike>(
  session: SidebarSessionLike,
  project: SidebarLogicalProjectLike<Project>,
): boolean {
  return project.projects.some((member) => sessionMatchesProject(session, member))
}
