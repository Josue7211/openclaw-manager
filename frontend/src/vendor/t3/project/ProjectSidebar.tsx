/*
 * Copied/adapted from T3 Code apps/web/src/components/Sidebar.tsx.
 * ClawControl maps its sessions/projects into this project-first sidebar so
 * Chat.tsx stays as orchestration instead of owning a parallel sidebar UI.
 */

import { useRef, useState, type ReactNode } from 'react'
import {
  CaretLeft,
  CaretRight,
  FolderOpen,
  FolderPlus,
  HardDrives,
  MagnifyingGlass,
  Plus,
  PushPin,
} from '@phosphor-icons/react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { ClaudeSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import type { ChatWorkspaceProject } from '@/chat/t3-adapters/projectWorkspace'
import {
  buildProjectSidebarGroups,
  logicalProjectHint,
  projectMachineLabel,
  projectPathHint,
} from '@/chat/t3-adapters/projectSidebar'
import {
  loadProjectGroupingMode,
  loadProjectSortOrder,
  saveProjectGroupingMode,
  saveProjectSortOrder,
} from '@/chat/t3-adapters/sidebarPreferences'
import {
  sessionMatchesLogicalProject,
  sessionProjectName,
  sessionWorkingDir,
} from '@/chat/t3-adapters/sidebarSessionMatching'
import { splitProjectScopedSessions } from '@/chat/t3-adapters/sidebarSessionBuckets'
import { copyContextId } from '@/chat/t3-adapters/sessionProjectRefs'
import ChatSettingsMenu from '@/vendor/t3/settings/ChatSettingsMenu'
import {
  ProjectActionMenu,
  ProjectIconButton,
  ProjectViewMenu,
} from './ProjectSidebarControls'
import {
  ProjectSidebarEmpty,
  ProjectSidebarThread,
} from './ProjectSidebarThread'
import type {
  ChatProjectGroupingMode,
  ChatProjectSortOrder,
} from '@/chat/t3-adapters/projectWorkspace'

function SidebarAction({
  icon,
  label,
  onClick,
  muted = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover-bg"
      style={{
        height: 34,
        border: 'none',
        borderRadius: 8,
        background: 'transparent',
        color: muted ? 'var(--text-muted)' : 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px',
        font: 'inherit',
        fontSize: 14,
        cursor: muted ? 'default' : 'pointer',
        textAlign: 'left',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function SidebarSection({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title} style={{ display: 'grid', gap: 3, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px', color: 'var(--text-muted)', fontSize: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {icon}
          <span>{title}</span>
        </span>
        {action && <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>{action}</span>}
      </div>
      {children}
    </section>
  )
}

function SidebarHeaderButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="hover-bg"
      style={{
        width: 24,
        height: 22,
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--text-muted)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export default function ProjectSidebar({
  sessions,
  sessionsAvailable,
  sessionsLoading,
  selectedSessionKey,
  onSelectSession,
  onNewChat,
  onCollapse,
  onRenameSession,
  onDeleteSession,
  onCompactSession,
  compactingSessionKey,
  projects,
  selectedPath,
  onSelectProject,
  onNewProjectChat,
  onAddProject,
  onRenameProject,
  onProjectGroupingOverride,
  onRemoveProject,
}: {
  sessions: ClaudeSession[]
  sessionsAvailable: boolean
  sessionsLoading: boolean
  selectedSessionKey: string | null
  onSelectSession: (key: string) => void
  onNewChat: () => void
  onCollapse: () => void
  onRenameSession: (key: string, label: string) => void
  onDeleteSession: (key: string) => void
  onCompactSession: (key: string) => void
  compactingSessionKey: string | null
  projects: ChatWorkspaceProject[]
  selectedPath: string
  onSelectProject: (path: string) => void
  onNewProjectChat: (path: string) => void
  onAddProject: () => void
  onRenameProject: (path: string) => void
  onProjectGroupingOverride: (path: string, value: string) => void
  onRemoveProject: (path: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [projectGroupingMode, setProjectGroupingMode] = useState<ChatProjectGroupingMode>(loadProjectGroupingMode)
  const [projectSortOrder, setProjectSortOrder] = useState<ChatProjectSortOrder>(loadProjectSortOrder)
  const [copyAnnouncement, setCopyAnnouncement] = useState('')
  const {
    copyToClipboard,
    copiedContext,
    errorContext,
  } = useCopyToClipboard<{ id: string; label: string }>({
    onCopy: (context) => setCopyAnnouncement(`Copied ${context.label}`),
    onError: (error, context) => setCopyAnnouncement(`Could not copy ${context.label}: ${error.message}`),
  })
  const searchRef = useRef<HTMLInputElement>(null)
  const copiedId = copyContextId(copiedContext)
  const copyErrorId = copyContextId(errorContext)
  const query = searchQuery.trim().toLowerCase()
  const filteredSessions = sessions.filter((session) => {
    if (!query) return true
    return [
      session.label,
      session.key,
      session.agentKey,
      sessionProjectName(session),
      sessionWorkingDir(session),
    ]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(query))
  })
  const pinnedSessions = filteredSessions.filter((session) => session.pinned === true || session.favorite === true)
  const recentSessions = filteredSessions.filter((session) => !pinnedSessions.includes(session))
  const groups = buildProjectSidebarGroups(projects, {
    groupingMode: projectGroupingMode,
    sortOrder: projectSortOrder,
    sessions,
  })
  const { projectScopedSessionKeys, unscopedRecentSessions } = splitProjectScopedSessions({
    sessions: filteredSessions,
    recentSessions,
    projects: groups.flatMap((group) => group.projects),
  })
  const unscopedPinnedSessions = pinnedSessions.filter(
    session => !projectScopedSessionKeys.has(session.key),
  )

  const handleProjectGroupingModeChange = (value: string) => {
    const next = (value === 'repository-path' || value === 'separate') ? value : 'repository'
    setProjectGroupingMode(next)
    saveProjectGroupingMode(next)
  }

  const handleProjectSortOrderChange = (value: string) => {
    const next = (value === 'machine' || value === 'recent') ? value : 'name'
    setProjectSortOrder(next)
    saveProjectSortOrder(next)
  }

  const copyProjectPath = (path: string, label: string) => {
    copyToClipboard(path, { id: `project-path:${path}`, label })
  }

  const copyThreadId = (session: ClaudeSession) => {
    const label = (session.label as string) || 'thread id'
    copyToClipboard(session.key, { id: `thread:${session.key}`, label: `${label} thread id` })
  }

  return (
    <div
      data-testid="session-list"
      data-t3-project-sidebar
      data-selected-id={selectedSessionKey ?? ''}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        padding: '8px',
        gap: 8,
        background: 'color-mix(in srgb, var(--bg-base) 94%, black)',
      }}
    >
      <div role="status" aria-live="polite" style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}>
        {copyAnnouncement}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <SidebarAction icon={<Plus size={16} />} label="New chat" onClick={onNewChat} />
        <SidebarAction
          icon={<MagnifyingGlass size={16} />}
          label="Search"
          onClick={() => searchRef.current?.focus()}
        />
      </div>

      <label style={{
        height: 32,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}>
        <MagnifyingGlass size={14} style={{ flexShrink: 0 }} />
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          style={{
            minWidth: 0,
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            font: 'inherit',
            fontSize: 12,
          }}
        />
        <ProjectIconButton label="Collapse chat list" onClick={onCollapse} size={30}>
          <CaretLeft size={15} />
        </ProjectIconButton>
      </label>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
        {!sessionsAvailable && (
          <div role="alert" style={{ padding: '8px 10px', color: 'var(--red-500)', fontSize: 12 }}>
            Gateway sessions unavailable
          </div>
        )}

        {sessionsLoading && (
          <div role="status" aria-label="Loading chats" style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
            Loading chats...
          </div>
        )}

        <SidebarSection
          title="Projects"
          icon={<FolderOpen size={13} />}
          action={(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ProjectViewMenu
                groupingValue={projectGroupingMode}
                sortValue={projectSortOrder}
                onGroupingChange={handleProjectGroupingModeChange}
                onSortChange={handleProjectSortOrderChange}
              />
              <SidebarHeaderButton label="Add project" onClick={onAddProject}>
                <FolderPlus size={14} />
              </SidebarHeaderButton>
            </span>
          )}
        >
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} style={{ display: 'grid', gap: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 24,
                padding: '0 8px',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}>
                <HardDrives size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.label}
                </span>
              </div>
              {group.projects.map((project) => {
                const projectSessions = filteredSessions.filter((session) => sessionMatchesLogicalProject(session, project))
                const selected = project.projects.some((member) => member.path === selectedPath)
                const selectedMember = selected
                  ? project.projects.find((member) => member.path === selectedPath) ?? project.representative
                  : project.projects.find((member) => member.environmentId === 'local') ?? project.representative
                const selectPath = selectedMember.path
                return (
                  <div key={project.key} style={{ display: 'grid', gap: 1 }}>
                    <div style={{
                      minHeight: 34,
                      borderRadius: 8,
                      background: selected ? 'var(--active-bg)' : 'transparent',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      alignItems: 'center',
                    }}>
                      <button
                        type="button"
                        onClick={() => onSelectProject(selectPath)}
                        aria-current={selected ? 'true' : undefined}
                        aria-label={`Select project ${project.displayName}`}
                        className="hover-bg"
                        style={{
                          minHeight: 34,
                          border: 'none',
                          borderRadius: 8,
                          background: 'transparent',
                          color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                          display: 'grid',
                          gridTemplateColumns: 'auto minmax(0, 1fr)',
                          gap: 8,
                          alignItems: 'center',
                          padding: '5px 8px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          font: 'inherit',
                          width: '100%',
                        }}
                      >
                        <CaretRight size={12} color={selected ? 'var(--accent)' : 'var(--text-muted)'} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 650 }}>
                            {project.displayName}
                          </span>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>
                            {logicalProjectHint(project)}
                          </span>
                        </span>
                      </button>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, paddingRight: 4 }}>
                        <ProjectIconButton
                          label={`New chat in project ${project.displayName}`}
                          onClick={() => onNewProjectChat(selectPath)}
                        >
                          <Plus size={13} />
                        </ProjectIconButton>
                        <ProjectActionMenu
                          label={`project ${project.displayName}`}
                          groupingLabel={`Grouping for project ${project.displayName}`}
                          groupingValue={selectedMember.groupingOverride ?? ''}
                          copyLabel={copiedId === `project-path:${selectPath}` ? `Copied path for project ${project.displayName}` : `Copy path for project ${project.displayName}`}
                          copied={copiedId === `project-path:${selectPath}`}
                          copyErrored={copyErrorId === `project-path:${selectPath}`}
                          renameLabel={`Rename project ${project.displayName}`}
                          removeLabel={`Remove project ${project.displayName}`}
                          onCopy={() => copyProjectPath(selectPath, `${project.displayName} path`)}
                          onRename={() => onRenameProject(selectPath)}
                          onGroupingChange={(value) => onProjectGroupingOverride(selectPath, value)}
                          onRemove={() => onRemoveProject(selectPath)}
                        />
                      </span>
                    </div>
                    {project.projects.length > 1 && (
                      <div style={{ display: 'grid', gap: 1, paddingLeft: 22 }}>
                        {project.projects.map((member) => {
                          const memberSelected = member.path === selectedPath
                          const memberLabel = projectMachineLabel(member)
                          return (
                            <div
                              key={member.path}
                              style={{
                                minHeight: 26,
                                borderRadius: 7,
                                background: memberSelected ? 'color-mix(in srgb, var(--active-bg) 72%, transparent)' : 'transparent',
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                alignItems: 'center',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => onSelectProject(member.path)}
                                aria-current={memberSelected ? 'true' : undefined}
                                aria-label={`Select ${project.displayName} root ${memberLabel}`}
                                className="hover-bg"
                                style={{
                                  minHeight: 26,
                                  border: 'none',
                                  borderRadius: 7,
                                  background: 'transparent',
                                  color: memberSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                                  display: 'grid',
                                  gridTemplateColumns: 'minmax(0, 0.45fr) minmax(0, 1fr)',
                                  gap: 8,
                                  alignItems: 'center',
                                  padding: '3px 8px',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  font: 'inherit',
                                  width: '100%',
                                }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: memberSelected ? 700 : 500 }}>
                                  {memberLabel}
                                </span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                                  {projectPathHint(member)}
                                </span>
                              </button>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, paddingRight: 3 }}>
                                <ProjectIconButton
                                  label={`New chat in ${project.displayName} root ${memberLabel}`}
                                  onClick={() => onNewProjectChat(member.path)}
                                >
                                  <Plus size={12} />
                                </ProjectIconButton>
                                <ProjectActionMenu
                                  label={`${project.displayName} root ${memberLabel}`}
                                  groupingLabel={`Grouping for ${project.displayName} root ${memberLabel}`}
                                  groupingValue={member.groupingOverride ?? ''}
                                  copyLabel={copiedId === `project-path:${member.path}` ? `Copied path for ${project.displayName} root ${memberLabel}` : `Copy path for ${project.displayName} root ${memberLabel}`}
                                  copied={copiedId === `project-path:${member.path}`}
                                  copyErrored={copyErrorId === `project-path:${member.path}`}
                                  renameLabel={`Rename ${project.displayName} root ${memberLabel}`}
                                  removeLabel={`Remove ${project.displayName} root ${memberLabel}`}
                                  onCopy={() => copyProjectPath(member.path, `${project.displayName} ${memberLabel} path`)}
                                  onRename={() => onRenameProject(member.path)}
                                  onGroupingChange={(value) => onProjectGroupingOverride(member.path, value)}
                                  onRemove={() => onRemoveProject(member.path)}
                                  compact
                                />
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: 1, paddingLeft: 22 }}>
                      {projectSessions.length > 0 ? projectSessions.slice(0, 6).map((session) => (
                        <ProjectSidebarThread
                          key={`${project.key}:${session.key}`}
                          session={session}
                          selected={session.key === selectedSessionKey}
                          onSelect={() => onSelectSession(session.key)}
                          onRename={onRenameSession}
                          onDelete={onDeleteSession}
                          onCompact={onCompactSession}
                          onCopyThreadId={copyThreadId}
                          isCompacting={compactingSessionKey === session.key}
                          copiedThreadId={copiedId === `thread:${session.key}`}
                          copyThreadError={copyErrorId === `thread:${session.key}`}
                          compact
                        />
                      )) : (
                        <ProjectSidebarEmpty>No chats</ProjectSidebarEmpty>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </SidebarSection>

        {unscopedPinnedSessions.length > 0 && (
          <SidebarSection title="Pinned" icon={<PushPin size={13} />}>
            {unscopedPinnedSessions.map((session) => (
              <ProjectSidebarThread
                key={session.key}
                session={session}
                selected={session.key === selectedSessionKey}
                onSelect={() => onSelectSession(session.key)}
                onRename={onRenameSession}
                onDelete={onDeleteSession}
                onCompact={onCompactSession}
                onCopyThreadId={copyThreadId}
                isCompacting={compactingSessionKey === session.key}
                copiedThreadId={copiedId === `thread:${session.key}`}
                copyThreadError={copyErrorId === `thread:${session.key}`}
              />
            ))}
          </SidebarSection>
        )}

        {unscopedRecentSessions.length > 0 && (
          <SidebarSection title="Recent">
            {unscopedRecentSessions.map((session) => (
              <ProjectSidebarThread
                key={session.key}
                session={session}
                selected={session.key === selectedSessionKey}
                onSelect={() => onSelectSession(session.key)}
                onRename={onRenameSession}
                onDelete={onDeleteSession}
                onCompact={onCompactSession}
                onCopyThreadId={copyThreadId}
                isCompacting={compactingSessionKey === session.key}
                copiedThreadId={copiedId === `thread:${session.key}`}
                copyThreadError={copyErrorId === `thread:${session.key}`}
              />
            ))}
          </SidebarSection>
        )}
      </div>

      <div style={{ flexShrink: 0, display: 'grid', gap: 2 }}>
        <ChatSettingsMenu />
      </div>
    </div>
  )
}
