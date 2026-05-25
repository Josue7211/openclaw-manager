/*
 * Copied/adapted from T3 Code apps/web/src/components/Sidebar.tsx.
 * ClawControl maps its sessions/projects into this project-first sidebar so
 * Chat.tsx stays as orchestration instead of owning a parallel sidebar UI.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  FolderOpen,
  FolderPlus,
  HardDrives,
  MagnifyingGlass,
  Plus,
  PushPin,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { HermesSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import type { ChatWorkspaceProject } from '@/chat/t3-adapters/projectWorkspace'
import {
  buildProjectSidebarGroups,
  logicalProjectHint,
  projectEnvironmentDisplayLabel,
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
import {
  sidebarSessionScopeKey,
  splitProjectScopedSessions,
} from '@/chat/t3-adapters/sidebarSessionBuckets'
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
import { normalizeProjectPathForComparison } from './projectPaths'
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

function projectPathCopyId(path: string, environmentId?: string | null): string {
  const environment = environmentId?.trim() || 'local'
  return `project-path:${environment}:${path}`
}

function projectEnvironmentKey(project: Pick<ChatWorkspaceProject, 'environmentId'>): string {
  return project.environmentId?.trim().toLowerCase() || 'local'
}

function projectCopyRootLabel(project: ChatWorkspaceProject): string {
  return projectEnvironmentDisplayLabel(project) || projectMachineLabel(project)
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
  disabled = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
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
  selectedSessionEnvironmentId = '',
  onSelectSession,
  onNewChat,
  onCollapse,
  onRenameSession,
  onDeleteSession,
  onPinSession,
  onCompactSession,
  compactingSessionKey,
  projects,
  selectedPath,
  selectedEnvironmentId = '',
  onSelectProject,
  onNewProjectChat,
  onAddProject,
  addProjectPending = false,
  onRenameProject,
  onProjectGroupingOverride,
  onRemoveProject,
}: {
  sessions: HermesSession[]
  sessionsAvailable: boolean
  sessionsLoading: boolean
  selectedSessionKey: string | null
  selectedSessionEnvironmentId?: string | null
  onSelectSession: (key: string, environmentId?: string | null) => void
  onNewChat: () => void
  onCollapse: () => void
  onRenameSession: (key: string, label: string, environmentId?: string | null) => void
  onDeleteSession: (key: string, environmentId?: string | null) => void
  onPinSession: (key: string, pinned: boolean, environmentId?: string | null) => void
  onCompactSession: (key: string, environmentId?: string | null) => void
  compactingSessionKey: string | null
  projects: ChatWorkspaceProject[]
  selectedPath: string
  selectedEnvironmentId?: string
  onSelectProject: (path: string, environmentId?: string | null) => void
  onNewProjectChat: (path: string, environmentId?: string | null) => void
  onAddProject: () => void
  addProjectPending?: boolean
  onRenameProject: (path: string, environmentId?: string | null) => void
  onProjectGroupingOverride: (path: string, value: string, environmentId?: string | null) => void
  onRemoveProject: (path: string, environmentId?: string | null) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [projectGroupingMode, setProjectGroupingMode] = useState<ChatProjectGroupingMode>(loadProjectGroupingMode)
  const [projectSortOrder, setProjectSortOrder] = useState<ChatProjectSortOrder>(loadProjectSortOrder)
  const [copyAnnouncement, setCopyAnnouncement] = useState('')
  const [expandedProjectThreadKeys, setExpandedProjectThreadKeys] = useState<Set<string>>(() => new Set())
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
  const copyStatusIsError = Boolean(copyAnnouncement && copyAnnouncement.startsWith('Could not copy'))
  const query = searchQuery.trim().toLowerCase()
  const selectedPathKey = normalizeProjectPathForComparison(selectedPath)
  const selectedEnvironmentKey = selectedEnvironmentId.trim().toLowerCase()
  const selectedPathMatches = projects.filter((project) => (
    normalizeProjectPathForComparison(project.path) === selectedPathKey
  ))
  const selectedPathEnvironmentKeys = new Set(selectedPathMatches.map(projectEnvironmentKey))
  const selectedFallbackEnvironmentKey = selectedPathEnvironmentKeys.size > 1
    ? (
      selectedPathMatches.find((project) => projectEnvironmentKey(project) === 'local')
      ?? selectedPathMatches[0]
    )
    : null

  useEffect(() => {
    const focusSearchFromKeyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]')) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', focusSearchFromKeyboard)
    return () => window.removeEventListener('keydown', focusSearchFromKeyboard)
  }, [])

  const memberMatchesSelectedProject = (member: ChatWorkspaceProject) => (
    normalizeProjectPathForComparison(member.path) === selectedPathKey
    && (
      selectedEnvironmentKey
        ? projectEnvironmentKey(member) === selectedEnvironmentKey
        : !selectedFallbackEnvironmentKey || projectEnvironmentKey(member) === projectEnvironmentKey(selectedFallbackEnvironmentKey)
    )
  )
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
  const groups = buildProjectSidebarGroups(projects, {
    groupingMode: projectGroupingMode,
    sortOrder: projectSortOrder,
    sessions,
  })
  const projectMatchesQuery = (project: (typeof groups)[number]['projects'][number]) => {
    if (!query) return true
    return [
      project.key,
      project.displayName,
      logicalProjectHint(project),
      ...project.projects.flatMap((member) => [
        member.id,
        member.name,
        member.path,
        member.root,
        member.environmentId,
        member.machineLabel,
        member.machine,
        member.host,
        projectMachineLabel(member),
        projectPathHint(member),
      ]),
    ]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(query))
  }
  const filteredGroups = groups
    .map((group) => {
      const groupProjects = group.projects.filter((project) => (
        projectMatchesQuery(project)
        || filteredSessions.some((session) => sessionMatchesLogicalProject(session, project))
      ))
      return { ...group, projects: groupProjects }
    })
    .filter((group) => group.projects.length > 0)
  const pinnedSessions = filteredSessions.filter((session) => session.pinned === true || session.favorite === true)
  const recentSessions = filteredSessions.filter((session) => !pinnedSessions.includes(session))
  const allGroupedProjects = filteredGroups.flatMap((group) => group.projects.flatMap((project) => project.projects))
  const { projectScopedSessionKeys, unscopedRecentSessions } = splitProjectScopedSessions({
    sessions: filteredSessions,
    recentSessions,
    projects: filteredGroups.flatMap((group) => group.projects),
  })
  const unscopedPinnedSessions = pinnedSessions.filter(
    session => !projectScopedSessionKeys.has(sidebarSessionScopeKey(session)),
  )
  const selectedSessionScopeKey = selectedSessionKey
    ? sidebarSessionScopeKey({
        key: selectedSessionKey,
        environmentId: selectedSessionEnvironmentId || undefined,
      })
    : ''
  const sessionIsSelected = (session: HermesSession) => {
    if (!selectedSessionKey) return false
    if (selectedSessionEnvironmentId?.trim()) {
      return sidebarSessionScopeKey(session) === selectedSessionScopeKey
    }
    return session.key === selectedSessionKey
  }
  const sessionIsCompacting = (session: HermesSession) => (
    compactingSessionKey === session.key || compactingSessionKey === sidebarSessionScopeKey(session)
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

  const copyProjectPath = (path: string, label: string, environmentId?: string | null) => {
    copyToClipboard(path, { id: projectPathCopyId(path, environmentId), label })
  }

  const copyThreadId = (session: HermesSession) => {
    const label = (session.label as string) || 'thread id'
    copyToClipboard(session.key, { id: `thread:${sidebarSessionScopeKey(session)}`, label: `${label} thread id` })
  }

  const expandProjectThreads = (projectKey: string) => {
    setExpandedProjectThreadKeys((current) => {
      const next = new Set(current)
      next.add(projectKey)
      return next
    })
  }

  const hasDuplicatePhysicalPath = (project: ChatWorkspaceProject) => {
    const pathKey = normalizeProjectPathForComparison(project.path)
    const environmentKey = (project.environmentId || '').trim().toLowerCase()
    return allGroupedProjects.some((candidate) => (
      candidate !== project
      && normalizeProjectPathForComparison(candidate.path) === pathKey
      && (candidate.environmentId || '').trim().toLowerCase() !== environmentKey
    ))
  }

  return (
    <div
      data-testid="session-list"
      data-t3-project-sidebar
      data-selected-id={selectedSessionKey ?? ''}
      className="chat-project-sidebar-panel"
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
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            if (searchQuery) {
              setSearchQuery('')
              return
            }
            searchRef.current?.blur()
          }}
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
        {searchQuery ? (
          <ProjectIconButton label="Clear chat search" onClick={() => setSearchQuery('')} size={24}>
            <X size={12} />
          </ProjectIconButton>
        ) : null}
        <ProjectIconButton label="Collapse chat list" onClick={onCollapse} size={30}>
          <CaretLeft size={15} />
        </ProjectIconButton>
      </label>

      {copyAnnouncement ? (
        <div
          role="status"
          aria-label="Copy status"
          style={{
            minHeight: 28,
            border: `1px solid ${copyStatusIsError
              ? 'color-mix(in srgb, var(--red-500, #ef4444) 28%, var(--border))'
              : 'color-mix(in srgb, var(--accent) 28%, var(--border))'}`,
            borderRadius: 8,
            background: copyStatusIsError
              ? 'color-mix(in srgb, var(--red-500, #ef4444) 12%, var(--bg-card))'
              : 'color-mix(in srgb, var(--accent) 12%, var(--bg-card))',
            color: copyStatusIsError ? 'var(--red-500, #ef4444)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 9px',
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          {copyStatusIsError ? <WarningCircle size={14} /> : <CheckCircle size={14} />}
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{copyAnnouncement}</span>
        </div>
      ) : null}

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
              <SidebarHeaderButton label="Add project" onClick={onAddProject} disabled={addProjectPending}>
                <FolderPlus size={14} />
              </SidebarHeaderButton>
            </span>
          )}
        >
          {filteredGroups.length === 0 && (
            <ProjectSidebarEmpty>{query ? 'No matching projects' : 'Add a project folder to scope chats and Hermes Agent.'}</ProjectSidebarEmpty>
          )}
          {filteredGroups.map((group) => (
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
                const projectExpanded = expandedProjectThreadKeys.has(project.key)
                const visibleProjectSessions = query || projectExpanded ? projectSessions : projectSessions.slice(0, 6)
                const hiddenProjectSessionCount = Math.max(0, projectSessions.length - visibleProjectSessions.length)
                const selected = project.projects.some(memberMatchesSelectedProject)
                const selectedMember = selected
                  ? project.projects.find(memberMatchesSelectedProject) ?? project.representative
                  : project.projects.find((member) => member.environmentId === 'local') ?? project.representative
                const selectPath = selectedMember.path
                const selectEnvironmentId = selectedMember.environmentId ?? null
                const selectCopyId = projectPathCopyId(selectPath, selectEnvironmentId)
                const qualifyCopyTargetByRoot = project.projects.length > 1 || hasDuplicatePhysicalPath(selectedMember)
                const selectCopyTarget = qualifyCopyTargetByRoot
                  ? `project ${project.displayName} root ${projectCopyRootLabel(selectedMember)}`
                  : `project ${project.displayName}`
                return (
                  <div key={project.key} style={{ display: 'grid', gap: 1 }}>
                    <div
                      className="chat-sidebar-selectable chat-sidebar-project-row"
                      data-selected={selected ? 'true' : 'false'}
                      style={{
                        minHeight: 34,
                        borderRadius: 8,
                        background: 'transparent',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        alignItems: 'center',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectProject(selectPath, selectEnvironmentId)}
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
                          onClick={() => onNewProjectChat(selectPath, selectEnvironmentId)}
                        >
                          <Plus size={13} />
                        </ProjectIconButton>
                        <ProjectActionMenu
                          label={`project ${project.displayName}`}
                          groupingLabel={`Grouping for project ${project.displayName}`}
                          groupingValue={selectedMember.groupingOverride ?? ''}
                          copyLabel={copiedId === selectCopyId ? `Copied path for ${selectCopyTarget}` : `Copy path for ${selectCopyTarget}`}
                          copied={copiedId === selectCopyId}
                          copyErrored={copyErrorId === selectCopyId}
                          renameLabel={`Rename project ${project.displayName}`}
                          removeLabel={`Remove project ${project.displayName}`}
                          onCopy={() => copyProjectPath(selectPath, `${project.displayName}${qualifyCopyTargetByRoot ? ` ${projectCopyRootLabel(selectedMember)}` : ''} path`, selectEnvironmentId)}
                          onRename={() => onRenameProject(selectPath, selectEnvironmentId)}
                          onGroupingChange={(value) => onProjectGroupingOverride(selectPath, value, selectEnvironmentId)}
                          onRemove={() => onRemoveProject(selectPath, selectEnvironmentId)}
                        />
                      </span>
                    </div>
                    {project.projects.length > 1 && (
                      <div style={{ display: 'grid', gap: 1, paddingLeft: 22 }}>
                        {project.projects.map((member) => {
                          const memberSelected = memberMatchesSelectedProject(member)
                          const memberLabel = projectMachineLabel(member)
                          const memberCopyId = projectPathCopyId(member.path, member.environmentId ?? null)
                          return (
                            <div
                              key={`${member.environmentId || 'project'}:${member.id || member.path}`}
                              className="chat-sidebar-selectable chat-sidebar-project-root-row"
                              data-selected={memberSelected ? 'true' : 'false'}
                              style={{
                                minHeight: 26,
                                borderRadius: 7,
                                background: 'transparent',
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                alignItems: 'center',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => onSelectProject(member.path, member.environmentId ?? null)}
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
                                  onClick={() => onNewProjectChat(member.path, member.environmentId ?? null)}
                                >
                                  <Plus size={12} />
                                </ProjectIconButton>
                                <ProjectActionMenu
                                  label={`${project.displayName} root ${memberLabel}`}
                                  groupingLabel={`Grouping for ${project.displayName} root ${memberLabel}`}
                                  groupingValue={member.groupingOverride ?? ''}
                                  copyLabel={copiedId === memberCopyId ? `Copied path for ${project.displayName} root ${memberLabel}` : `Copy path for ${project.displayName} root ${memberLabel}`}
                                  copied={copiedId === memberCopyId}
                                  copyErrored={copyErrorId === memberCopyId}
                                  renameLabel={`Rename ${project.displayName} root ${memberLabel}`}
                                  removeLabel={`Remove ${project.displayName} root ${memberLabel}`}
                                  onCopy={() => copyProjectPath(member.path, `${project.displayName} ${memberLabel} path`, member.environmentId ?? null)}
                                  onRename={() => onRenameProject(member.path, member.environmentId ?? null)}
                                  onGroupingChange={(value) => onProjectGroupingOverride(member.path, value, member.environmentId ?? null)}
                                  onRemove={() => onRemoveProject(member.path, member.environmentId ?? null)}
                                  compact
                                />
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: 1, paddingLeft: 22 }}>
                      {projectSessions.length > 0 ? visibleProjectSessions.map((session) => (
                          <ProjectSidebarThread
                          key={`${project.key}:${sidebarSessionScopeKey(session)}`}
                          session={session}
                          selected={sessionIsSelected(session)}
                          onSelect={() => onSelectSession(session.key, session.environmentId ?? null)}
                          onRename={onRenameSession}
                          onDelete={onDeleteSession}
                          onPin={onPinSession}
                          onCompact={onCompactSession}
                          onCopyThreadId={copyThreadId}
                          isCompacting={sessionIsCompacting(session)}
                          copiedThreadId={copiedId === `thread:${sidebarSessionScopeKey(session)}`}
                          copyThreadError={copyErrorId === `thread:${sidebarSessionScopeKey(session)}`}
                          compact
                        />
                      )) : (
                        <ProjectSidebarEmpty>No chats</ProjectSidebarEmpty>
                      )}
                      {hiddenProjectSessionCount > 0 && (
                        <button
                          type="button"
                          onClick={() => expandProjectThreads(project.key)}
                          className="hover-bg"
                          style={{
                            minHeight: 28,
                            border: 'none',
                            borderRadius: 7,
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            padding: '3px 8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            font: 'inherit',
                            fontSize: 12,
                          }}
                        >
                          Show {hiddenProjectSessionCount} more chat{hiddenProjectSessionCount === 1 ? '' : 's'}
                        </button>
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
                key={sidebarSessionScopeKey(session)}
                session={session}
                selected={sessionIsSelected(session)}
                onSelect={() => onSelectSession(session.key, session.environmentId ?? null)}
                onRename={onRenameSession}
                onDelete={onDeleteSession}
                onPin={onPinSession}
                onCompact={onCompactSession}
                onCopyThreadId={copyThreadId}
                isCompacting={sessionIsCompacting(session)}
                copiedThreadId={copiedId === `thread:${sidebarSessionScopeKey(session)}`}
                copyThreadError={copyErrorId === `thread:${sidebarSessionScopeKey(session)}`}
              />
            ))}
          </SidebarSection>
        )}

        {unscopedRecentSessions.length > 0 && (
          <SidebarSection title="Recent">
            {unscopedRecentSessions.map((session) => (
              <ProjectSidebarThread
                key={sidebarSessionScopeKey(session)}
                session={session}
                selected={sessionIsSelected(session)}
                onSelect={() => onSelectSession(session.key, session.environmentId ?? null)}
                onRename={onRenameSession}
                onDelete={onDeleteSession}
                onPin={onPinSession}
                onCompact={onCompactSession}
                onCopyThreadId={copyThreadId}
                isCompacting={sessionIsCompacting(session)}
                copiedThreadId={copiedId === `thread:${sidebarSessionScopeKey(session)}`}
                copyThreadError={copyErrorId === `thread:${sidebarSessionScopeKey(session)}`}
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
