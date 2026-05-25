// Copied/adapted from T3 Code project/sidebar contracts for clawctrl.
// This file intentionally keeps the T3-shaped data model at the vendor edge.

export type EnvironmentId = string
export type ProjectId = string
export type SidebarProjectGroupingMode = 'repository' | 'repository-path' | 'separate'

export interface ScopedProjectRef {
  environmentId: EnvironmentId
  projectId: ProjectId
}

export interface RepositoryIdentity {
  canonicalKey?: string | null
  rootPath?: string | null
  displayName?: string | null
  name?: string | null
}

export interface Project {
  id: ProjectId
  environmentId: EnvironmentId
  name: string
  cwd: string
  repositoryIdentity?: RepositoryIdentity | null
}

export function scopeProjectRef(environmentId: EnvironmentId, projectId: ProjectId): ScopedProjectRef {
  return { environmentId, projectId }
}

export function scopedProjectKey(ref: ScopedProjectRef): string {
  return `${ref.environmentId}:${ref.projectId}`
}
