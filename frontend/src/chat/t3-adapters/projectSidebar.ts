/*
 * Copied/adapted from T3 Code's logicalProject/sidebarProjectGrouping layer.
 * ClawControl maps its workspace project records into T3 project snapshots here
 * so Chat.tsx does not carry a parallel sidebar grouping implementation.
 */

import {
  buildSidebarProjectSnapshots,
  type SidebarProjectSnapshot,
} from '@/vendor/t3/project/sidebarProjectGrouping'
import {
  derivePhysicalProjectKey,
  type ProjectGroupingSettings,
} from '@/vendor/t3/project/logicalProject'
import type { Project as T3Project } from '@/vendor/t3/project/types'
import type { ClaudeSession } from './gatewaySessionTypes'
import { sessionMatchesLogicalProject } from './sidebarSessionMatching'
import type {
  ChatLogicalProject,
  ChatProjectGroupingMode,
  ChatProjectSidebarGroup,
  ChatProjectSortOrder,
  ChatWorkspaceProject,
} from './projectWorkspace'

function dirname(value: string): string {
  const normalized = value.replace(/\/+$/g, '')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : normalized
}

export function projectGroupLabel(project: ChatWorkspaceProject): string {
  const explicit = project.machineLabel || project.machine || project.host || project.group
  if (explicit?.trim()) return explicit.trim()
  if (project.root?.trim()) return project.root.trim()

  const path = project.path
  if (path.startsWith('/Volumes/')) {
    const [, , volume] = path.split('/')
    if (volume) return volume
  }
  if (path.startsWith('/Users/')) return 'Local Mac'
  if (path.startsWith('/home/')) return 'Linux'
  if (/^[A-Za-z]:[\\/]/.test(path)) return path.slice(0, 2)
  return dirname(path) || 'Projects'
}

export function projectMachineLabel(project: ChatWorkspaceProject): string {
  return projectGroupLabel(project)
}

export function normalizedProjectPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

export function projectEnvironmentId(project: ChatWorkspaceProject): string {
  return project.environmentId?.trim()
    || projectMachineLabel(project)
    || 'local'
}

export function projectId(project: ChatWorkspaceProject): string {
  return project.id?.trim()
    || normalizedProjectPath(project.path)
    || project.name
}

export function toT3Project(project: ChatWorkspaceProject): T3Project {
  const repositoryIdentity = project.repositoryIdentity || project.root
    ? {
        ...project.repositoryIdentity,
        rootPath: project.repositoryIdentity?.rootPath || project.root || null,
      }
    : null

  return {
    id: projectId(project),
    environmentId: projectEnvironmentId(project),
    name: project.name,
    cwd: project.path,
    repositoryIdentity,
  }
}

export function projectPathHint(project: ChatWorkspaceProject): string {
  const parent = dirname(project.path)
  if (!parent || parent === project.path) return project.path
  return parent
}

export function logicalProjectHint(project: ChatLogicalProject): string {
  if (project.projects.length <= 1) return projectPathHint(project.representative)
  const labels = project.projects
    .map(projectMachineLabel)
    .filter((label, index, labels) => labels.indexOf(label) === index)
  return `${project.projects.length} roots${labels.length > 0 ? ` · ${labels.join(', ')}` : ''}`
}

function projectSessionLastActivity(project: ChatLogicalProject, sessions: ClaudeSession[]): number {
  let latest = 0
  for (const session of sessions) {
    if (!sessionMatchesLogicalProject(session, project)) continue
    const timestamp = new Date(session.lastActivity).getTime()
    if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp)
  }
  return latest
}

function sortLogicalProjects(
  projects: ChatLogicalProject[],
  sortOrder: ChatProjectSortOrder,
  sessions: ClaudeSession[],
): ChatLogicalProject[] {
  return [...projects].sort((left, right) => {
    if (sortOrder === 'recent') {
      const activitySort = projectSessionLastActivity(right, sessions) - projectSessionLastActivity(left, sessions)
      if (activitySort) return activitySort
    }
    if (sortOrder === 'machine') {
      const machineSort = projectMachineLabel(left.representative).localeCompare(projectMachineLabel(right.representative))
      if (machineSort) return machineSort
    }
    return left.displayName.localeCompare(right.displayName)
  })
}

function sidebarProjectDisplayName(
  snapshot: SidebarProjectSnapshot,
  representative: ChatWorkspaceProject,
): string {
  return representative.repositoryIdentity?.displayName?.trim()
    || representative.repositoryIdentity?.name?.trim()
    || snapshot.displayName
}

export function buildProjectSidebarGroups(
  projects: ChatWorkspaceProject[],
  options: {
    groupingMode: ChatProjectGroupingMode
    sortOrder: ChatProjectSortOrder
    sessions: ClaudeSession[]
  },
): ChatProjectSidebarGroup[] {
  const t3Projects = projects.map(toT3Project)
  const originalByPhysicalKey = new Map<string, ChatWorkspaceProject>()
  const sidebarProjectGroupingOverrides: ProjectGroupingSettings['sidebarProjectGroupingOverrides'] = {}

  for (let index = 0; index < t3Projects.length; index += 1) {
    const t3Project = t3Projects[index]
    const originalProject = projects[index]
    if (!t3Project || !originalProject) continue
    const physicalKey = derivePhysicalProjectKey(t3Project)
    originalByPhysicalKey.set(physicalKey, originalProject)
    if (originalProject.groupingOverride) {
      sidebarProjectGroupingOverrides[physicalKey] = originalProject.groupingOverride
    }
  }

  const snapshots = buildSidebarProjectSnapshots({
    projects: t3Projects,
    settings: {
      sidebarProjectGroupingMode: options.groupingMode,
      sidebarProjectGroupingOverrides,
    },
    primaryEnvironmentId: 'local',
    resolveEnvironmentLabel: (environmentId) => environmentId,
  })

  const groups: ChatProjectSidebarGroup[] = []
  for (const snapshot of snapshots) {
    const members = snapshot.memberProjects
      .map(member => originalByPhysicalKey.get(member.physicalProjectKey))
      .filter((project): project is ChatWorkspaceProject => Boolean(project))
    const sortedMembers = members.length > 0 ? [...members].sort((left, right) => {
      const machineSort = projectMachineLabel(left).localeCompare(projectMachineLabel(right))
      return machineSort || left.path.localeCompare(right.path)
    }) : []
    const representative = sortedMembers[0]
    if (!representative) continue
    const machineLabels = sortedMembers
      .map(projectMachineLabel)
      .filter((label, index, labels) => labels.indexOf(label) === index)
    const logicalProject: ChatLogicalProject = {
      key: snapshot.projectKey,
      displayName: sidebarProjectDisplayName(snapshot, representative),
      projects: sortedMembers,
      representative,
    }
    const groupLabel = machineLabels.length > 1 ? 'Repositories' : (machineLabels[0] || 'Projects')
    const existing = groups.find((group) => group.label === groupLabel)
    if (existing) existing.projects.push(logicalProject)
    else groups.push({ label: groupLabel, projects: [logicalProject] })
  }

  return groups.map((group) => ({
    ...group,
    projects: sortLogicalProjects(group.projects, options.sortOrder, options.sessions),
  })).sort((left, right) => left.label.localeCompare(right.label))
}

export function workspaceSessionRoots(projects: ChatWorkspaceProject[]): string[] {
  return Array.from(new Set(
    projects
      .map((project) => (project.root || project.path || '').trim())
      .filter(Boolean),
  )).sort()
}

export function projectMatchesCwd(project: ChatWorkspaceProject, cwd: string): boolean {
  const value = normalizedProjectPath(cwd.trim())
  if (!value) return false
  return normalizedProjectPath(project.path) === value || normalizedProjectPath(project.root || '') === value
}

export function projectRouteParams(project: ChatWorkspaceProject): { projectId?: string; cwd: string; env?: string } {
  return {
    projectId: project.id?.trim() || undefined,
    cwd: project.path,
    env: project.environmentId?.trim() || undefined,
  }
}

export function setProjectRouteParams(
  params: URLSearchParams,
  project: ChatWorkspaceProject,
  context?: { branch?: string; runtime?: string },
) {
  const route = projectRouteParams(project)
  if (route.projectId) params.set('projectId', route.projectId)
  else params.delete('projectId')
  params.set('cwd', route.cwd)
  if (route.env) params.set('env', route.env)
  else params.delete('env')
  const branch = context?.branch?.trim()
  const runtime = context?.runtime?.trim()
  if (branch) params.set('branch', branch)
  else params.delete('branch')
  if (runtime) params.set('runtime', runtime)
  else params.delete('runtime')
}

export function findProjectByRouteIdentity(
  projects: ChatWorkspaceProject[],
  projectId: string | null,
  cwd: string | null,
  env: string | null,
): ChatWorkspaceProject | null {
  const trimmedProjectId = projectId?.trim() || ''
  const trimmedCwd = cwd?.trim() || ''
  const trimmedEnv = env?.trim() || ''
  if (!trimmedProjectId && !trimmedCwd && !trimmedEnv) return null

  return projects.find((project) => Boolean(
    trimmedProjectId
    && (project.id === trimmedProjectId || project.path === trimmedProjectId || project.root === trimmedProjectId),
  ))
    ?? projects.find((project) => (
    Boolean(trimmedCwd && trimmedEnv)
    && project.environmentId === trimmedEnv
    && projectMatchesCwd(project, trimmedCwd)
  ))
    ?? projects.find((project) => Boolean(trimmedCwd && projectMatchesCwd(project, trimmedCwd)))
    ?? projects.find((project) => Boolean(trimmedEnv && project.environmentId === trimmedEnv))
    ?? null
}
