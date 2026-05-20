/*
 * Copied/adapted from T3 Code's project-scoped thread routing model.
 * ClawControl keeps local session reference persistence here so project-owned
 * chats remain attached to their directory/project instead of floating in Recent.
 */

import type { ClaudeSession } from './gatewaySessionTypes'
import { sessionMatchesProject } from './sidebarSessionMatching'
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, ChatSessionProjectRef>
  } catch {
    return {}
  }
}

export function saveChatSessionProjectRefs(refs: Record<string, ChatSessionProjectRef>) {
  try {
    const entries = Object.entries(refs).slice(-100)
    localStorage.setItem(CHAT_SESSION_PROJECT_REFS_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // ignore storage access failures
  }
}

export function attachChatSessionProjectRefs(
  sessions: ClaudeSession[],
  refs: Record<string, ChatSessionProjectRef>,
): ClaudeSession[] {
  return sessions.map((session) => {
    const ref = refs[session.key]
    return ref ? { ...ref, ...session } : session
  })
}

export function findProjectForSession(
  projects: ChatWorkspaceProject[],
  session: ClaudeSession | null | undefined,
): ChatWorkspaceProject | null {
  if (!session) return null
  return projects.find((project) => sessionMatchesProject(session, project)) ?? null
}

export function copyContextId(context: { id: string } | null): string {
  return context?.id ?? ''
}
