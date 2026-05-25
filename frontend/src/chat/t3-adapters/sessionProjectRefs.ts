/*
 * Copied/adapted from T3 Code's project-scoped thread routing model.
 * ClawControl keeps local session reference persistence here so project-owned
 * chats remain attached to their directory/project instead of floating in Recent.
 */

import type { HermesSession } from './gatewaySessionTypes'
import {
  sessionEnvironmentId,
  sessionMatchesProject,
  sessionProjectId,
  type SidebarSessionLike,
} from './sidebarSessionMatching'
import type { ChatWorkspaceProject } from './projectWorkspace'

export const CHAT_SESSION_PROJECT_REFS_KEY = 'chat-session-project-refs'

export interface ChatSessionProjectRef {
  project?: string
  projectId?: string
  projectRoot?: string
  workingDir?: string
  environmentId?: string
  branch?: string
  runtime?: string
}

const PROJECT_REF_KEYS = [
  'project',
  'projectId',
  'projectRoot',
  'workingDir',
  'environmentId',
  'branch',
  'runtime',
] as const satisfies readonly (keyof ChatSessionProjectRef)[]

const PROJECT_REF_FIELD_SPECS = [
  {
    key: 'project',
    aliases: ['project', 'projectName', 'project_name'],
  },
  {
    key: 'projectId',
    aliases: ['projectId', 'project_id', 'projectRef', 'project_ref'],
  },
  {
    key: 'projectRoot',
    aliases: [
      'projectRoot',
      'project_root',
      'workingDir',
      'working_dir',
      'cwd',
      'projectPath',
      'project_path',
      'workspacePath',
      'workspace_path',
      'workspaceRoot',
      'workspace_root',
      'repositoryRoot',
      'repository_root',
      'repoRoot',
      'repo_root',
      'root',
      'path',
    ],
  },
  {
    key: 'workingDir',
    aliases: [
      'projectRoot',
      'project_root',
      'workingDir',
      'working_dir',
      'cwd',
      'projectPath',
      'project_path',
      'workspacePath',
      'workspace_path',
      'workspaceRoot',
      'workspace_root',
      'repositoryRoot',
      'repository_root',
      'repoRoot',
      'repo_root',
      'root',
      'path',
    ],
  },
  {
    key: 'environmentId',
    aliases: ['environmentId', 'environment_id', 'env', 'environment'],
  },
  {
    key: 'branch',
    aliases: ['branch'],
  },
  {
    key: 'runtime',
    aliases: ['runtime'],
  },
] as const

function hasNonEmptySessionField(session: HermesSession, aliases: readonly string[]): boolean {
  return aliases.some((alias) => (
    typeof session[alias] === 'string' && Boolean((session[alias] as string).trim())
  ))
}

function normalizeSessionProjectRef(value: unknown): ChatSessionProjectRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const ref: ChatSessionProjectRef = {}
  for (const key of PROJECT_REF_KEYS) {
    const raw = input[key]
    if (typeof raw !== 'string') continue
    const text = raw.trim()
    if (text) ref[key] = text
  }
  return Object.keys(ref).length > 0 ? ref : null
}

function normalizeSessionProjectRefs(value: unknown): Record<string, ChatSessionProjectRef> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const refs: Record<string, ChatSessionProjectRef> = {}
  for (const [key, ref] of Object.entries(value)) {
    const sessionKey = key.trim()
    if (!sessionKey) continue
    const normalizedRef = normalizeSessionProjectRef(ref)
    if (normalizedRef) refs[sessionKey] = normalizedRef
  }
  return refs
}

function normalizeEnvironmentId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || ''
}

export function chatSessionProjectRefKey(sessionKey: string, environmentId?: string | null): string {
  const key = sessionKey.trim()
  const environment = normalizeEnvironmentId(environmentId)
  return environment ? `${environment}:${key}` : key
}

export function chatSessionProjectRefLookupKeys(
  sessionKey: string,
  environmentId?: string | null,
): string[] {
  const key = sessionKey.trim()
  if (!key) return []
  const scopedKey = chatSessionProjectRefKey(key, environmentId)
  return scopedKey === key ? [key] : [scopedKey, key]
}

function refMatchesSessionEnvironment(
  ref: ChatSessionProjectRef,
  sessionEnvironmentIdValue?: string | null,
  scopedLookup = false,
): boolean {
  const sessionEnvironment = normalizeEnvironmentId(sessionEnvironmentIdValue)
  const refEnvironment = normalizeEnvironmentId(sessionEnvironmentId(ref as SidebarSessionLike))
  if (scopedLookup && !refEnvironment) return true
  if (!sessionEnvironment) return true
  return (refEnvironment || 'local') === sessionEnvironment
}

export function removeChatSessionProjectRef(
  refs: Record<string, ChatSessionProjectRef>,
  sessionKey: string,
  environmentId?: string | null,
): Record<string, ChatSessionProjectRef> {
  const keys = chatSessionProjectRefLookupKeys(sessionKey, environmentId)
  if (keys.length === 0) return refs
  let changed = false
  const next = { ...refs }
  const environment = normalizeEnvironmentId(environmentId)
  for (const key of keys) {
    if (!next[key]) continue
    if (key === sessionKey && environment) {
      const refEnvironment = normalizeEnvironmentId(sessionEnvironmentId(next[key] as SidebarSessionLike))
      if ((refEnvironment || 'local') !== environment) continue
    }
    delete next[key]
    changed = true
  }
  return changed ? next : refs
}

function uniqueScopedProjectRefForUnscopedSession(
  refs: Record<string, ChatSessionProjectRef>,
  sessionKey: string,
): ChatSessionProjectRef | null {
  const key = sessionKey.trim()
  if (!key) return null
  const suffix = `:${key}`
  const matches = Object.entries(refs).filter(([refKey, ref]) => (
    refKey.endsWith(suffix)
    && Boolean(ref)
    && refMatchesSessionEnvironment(ref, refKey.slice(0, -suffix.length), true)
  ))
  return matches.length === 1 ? matches[0][1] : null
}

export function projectRefFromProject(
  project: ChatWorkspaceProject,
  context?: { branch?: string; runtime?: string },
): ChatSessionProjectRef {
  return {
    project: project.name,
    projectId: project.id || undefined,
    projectRoot: project.root || project.path,
    workingDir: project.path,
    environmentId: project.environmentId || undefined,
    branch: context?.branch,
    runtime: context?.runtime,
  }
}

export function loadChatSessionProjectRefs(): Record<string, ChatSessionProjectRef> {
  try {
    const raw = localStorage.getItem(CHAT_SESSION_PROJECT_REFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return normalizeSessionProjectRefs(parsed)
  } catch {
    return {}
  }
}

export function saveChatSessionProjectRefs(refs: Record<string, ChatSessionProjectRef>) {
  try {
    const entries = Object.entries(normalizeSessionProjectRefs(refs)).slice(-100)
    if (entries.length === 0) {
      localStorage.removeItem(CHAT_SESSION_PROJECT_REFS_KEY)
      return
    }
    localStorage.setItem(CHAT_SESSION_PROJECT_REFS_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // ignore storage access failures
  }
}

export function attachChatSessionProjectRefs(
  sessions: HermesSession[],
  refs: Record<string, ChatSessionProjectRef>,
): HermesSession[] {
  return sessions.map((session) => {
    const sessionEnvironment = sessionEnvironmentId(session)
    const ref = chatSessionProjectRefLookupKeys(session.key, sessionEnvironment)
      .map((key, index) => {
        const ref = refs[key]
        if (!ref) return null
        return refMatchesSessionEnvironment(ref, sessionEnvironment, index === 0 && key !== session.key) ? ref : null
      })
      .find(Boolean)
      ?? (sessionEnvironment ? null : uniqueScopedProjectRefForUnscopedSession(refs, session.key))
    if (!ref) return session
    const merged: HermesSession = { ...session }
    for (const { key, aliases } of PROJECT_REF_FIELD_SPECS) {
      const value = typeof ref[key] === 'string' ? ref[key]?.trim() : ''
      if (!value) continue
      if (hasNonEmptySessionField(session, aliases)) continue
      merged[key] = value
    }
    return merged
  })
}

export function findProjectForSession(
  projects: ChatWorkspaceProject[],
  session: HermesSession | null | undefined,
): ChatWorkspaceProject | null {
  if (!session) return null
  return projects.find((project) => sessionMatchesProject(session, project)) ?? null
}

export function pruneSessionProjectRefsForProject(
  refs: Record<string, ChatSessionProjectRef>,
  project: ChatWorkspaceProject,
): Record<string, ChatSessionProjectRef> {
  const projectEnvironment = project.environmentId?.trim().toLowerCase() || ''
  const next: Record<string, ChatSessionProjectRef> = {}
  for (const [key, ref] of Object.entries(refs)) {
    const refEnvironment = sessionEnvironmentId(ref as SidebarSessionLike)?.trim().toLowerCase() || ''
    const refProjectId = sessionProjectId(ref as SidebarSessionLike)
    const exactProjectIdMatch = Boolean(project.id?.trim() && refProjectId === project.id)
    if (
      projectEnvironment
      && projectEnvironment !== 'local'
      && !refEnvironment
      && !exactProjectIdMatch
    ) {
      next[key] = ref
      continue
    }
    if (sessionMatchesProject(ref as SidebarSessionLike, project)) continue
    next[key] = ref
  }
  return next
}

export function copyContextId(context: { id: string } | null): string {
  return context?.id ?? ''
}
