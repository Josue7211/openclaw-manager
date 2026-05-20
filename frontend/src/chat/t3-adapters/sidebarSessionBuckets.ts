/*
 * Copied/adapted from T3 Code's sidebar project/thread ownership behavior.
 * T3 keeps project-owned threads under their project group; ClawControl uses
 * this adapter to keep only truly unscoped gateway sessions in Recent.
 */

import {
  sessionMatchesLogicalProject,
  type SidebarLogicalProjectLike,
  type SidebarProjectLike,
  type SidebarSessionLike,
} from './sidebarSessionMatching'

export interface SidebarSessionBuckets<Session extends SidebarSessionLike> {
  projectScopedSessionKeys: Set<string>
  unscopedRecentSessions: Session[]
}

export function splitProjectScopedSessions<
  Session extends SidebarSessionLike & { key: string },
  Project extends SidebarProjectLike,
>(input: {
  sessions: readonly Session[]
  recentSessions: readonly Session[]
  projects: readonly SidebarLogicalProjectLike<Project>[]
}): SidebarSessionBuckets<Session> {
  const projectScopedSessionKeys = new Set<string>()
  for (const session of input.sessions) {
    if (input.projects.some(project => sessionMatchesLogicalProject(session, project))) {
      projectScopedSessionKeys.add(session.key)
    }
  }

  return {
    projectScopedSessionKeys,
    unscopedRecentSessions: input.recentSessions.filter(
      session => !projectScopedSessionKeys.has(session.key),
    ),
  }
}
