



import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DemoBadge } from '@/components/DemoModeBanner'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { useSessionMutations } from '@/hooks/sessions/useSessionMutations'
import {
  CaretRight,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Play,
  Terminal,
  Trash,
} from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import type { ChatTerminalStatusSnapshot } from './chat/ChatTerminalDrawer'
import type { HermesSession } from '@/chat/t3-adapters/gatewaySessionTypes'

const Lightbox = lazy(() => import('@/components/Lightbox'))
const ChatTerminalDrawer = lazy(() => import('./chat/ChatTerminalDrawer'))

import ChatThread from './chat/ChatThread'
import ChatInput, { type ChatInputHistoryEntry } from './chat/ChatInput'
import { withOptimisticAttachmentFallbacks } from './chat/optimisticAttachmentCache'
import HermesUsagePill from './chat/HermesUsagePill'
import { NotConfiguredBanner } from './chat/NotConfiguredBanner'
import { HistoryErrorBanner } from './chat/HistoryErrorBanner'
import {
  CHAT_IMAGE_LIMIT,
  type ChatComposerDraftStorageKeys,
} from './chat/constants'
import type { ChatContextFileAttachment, ChatMessage } from './chat/types'
import { useChatState } from './chat/useChatState'
import {
  loadSelectedChatSessionEnvironmentId,
  loadSelectedChatSessionKey,
  saveSelectedChatSessionKey,
} from '@/lib/chat-session-selection'
import { CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT } from '@/lib/preferences-sync'
import ProjectScriptsControl, {
  type ProjectScriptIcon as T3ProjectScriptIcon,
  type ProjectScriptStatusSnapshot,
} from '@/vendor/t3/project/ProjectScriptsControl'
import ProjectScriptDialog, {
  type ProjectScriptDialogDraft,
} from '@/vendor/t3/project/ProjectScriptDialog'
import ProjectSidebarDialog, {
  type ProjectSidebarDialogMode,
} from '@/vendor/t3/project/ProjectSidebarDialog'
import ProjectSidebar from '@/vendor/t3/project/ProjectSidebar'
import {
  nextProjectScriptId,
  primaryProjectScript,
} from '@/vendor/t3/project/projectScripts'
import {
  ProjectComposerContextBar as ChatComposerContextBar,
  ProjectEnvironmentDialog as ChatEnvironmentDialog,
  ProjectHeaderPanel as ChatHeaderPanel,
  projectRuntimeDisplayLabel,
} from '@/vendor/t3/project/ProjectContextControls'
import {
  attachChatSessionProjectRefs,
  chatSessionProjectRefKey,
  findProjectForSession,
  loadChatSessionProjectRefs,
  projectRefFromProject,
  pruneSessionProjectRefsForProject,
  removeChatSessionProjectRef,
  saveChatSessionProjectRefs,
  type ChatSessionProjectRef,
} from '@/chat/t3-adapters/sessionProjectRefs'
import {
  applyChatThreadRouteParams,
  resolveChatThreadRouteSessionKey,
} from '@/chat/t3-adapters/threadSessionRoutes'
import {
  deriveSessionTitle,
  isRepairableSessionLabel,
} from '@/chat/t3-adapters/sessionTitles'
import {
  CHAT_SELECTED_BRANCH_KEY,
  CHAT_SELECTED_PROJECT_ENVIRONMENT_KEY,
  CHAT_SELECTED_PROJECT_PATH_KEY,
  CHAT_SELECTED_RUNTIME_KEY,
  loadSidebarCollapsed,
  loadStoredValue,
  saveSidebarCollapsed,
  saveStoredValue,
} from '@/chat/t3-adapters/sidebarPreferences'
import {
  DEFAULT_CHAT_PROJECT_SCRIPTS,
  FALLBACK_PROJECT,
  FALLBACK_WORKSPACE_CONTEXT,
  addProjectToBackend,
  loadAddedProjects,
  loadChatWorkspaceContext,
  loadProjectPreferredScriptStore,
  loadProjectScriptStore,
  preferredScriptIdForProject,
  mergeWorkspaceProjects,
  normalizeWorkspaceContext,
  normalizeWorkspaceProject,
  projectPickerDefaultPath,
  projectScriptWriteStorageKeys,
  pruneProjectPreferredScriptStoreForProject,
  pruneProjectScriptStoreForProject,
  pruneMigratedAddedProjects,
  rememberProjectPickerDirectory,
  removeProjectFromBackend,
  removeWorkspaceProject,
  replaceWorkspaceProject,
  resolveProjectFromPath,
  resolveScriptCwd,
  savePreferredScriptIdForProject,
  saveProjectPreferredScriptStore,
  saveProjectScriptStore,
  saveAddedProjects,
  sanitizeProjectPathInput,
  scriptsForProject,
  terminalProjectEnv,
  terminalProcessScope,
  toT3ProjectScript,
  updateProjectInBackend,
  type ChatActivePanel,
  type ChatProjectScript,
  type ChatWorkspaceContext,
  type ChatWorkspaceProject,
} from '@/chat/t3-adapters/projectWorkspace'
import {
  findProjectByRouteIdentity,
  normalizedProjectPath,
  projectEnvironmentDisplayLabel,
  projectEnvironmentLabelDisplay,
  projectGroupLabel,
  setProjectRouteParams,
  workspaceSessionRoots,
} from '@/chat/t3-adapters/projectSidebar'

function removeComposerDraftItem(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore storage access failures.
  }
}

function replaceComposerDraftItem(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    removeComposerDraftItem(key)
  }
}

function replaceComposerDraftJson(key: string, value: unknown) {
  try {
    replaceComposerDraftItem(key, JSON.stringify(value))
  } catch {
    removeComposerDraftItem(key)
  }
}

function persistComposerDraftSnapshot(
  draftStorageKeys: ChatComposerDraftStorageKeys,
  text: string,
  images: string[] = [],
  contextFiles: ChatMessage['contextFiles'] = [],
) {
  replaceComposerDraftItem(draftStorageKeys.text, text)
  if (images.length > 0) {
    replaceComposerDraftJson(draftStorageKeys.images, images)
  } else {
    removeComposerDraftItem(draftStorageKeys.images)
  }
  if (contextFiles.length > 0) {
    replaceComposerDraftJson(draftStorageKeys.contextFiles, contextFiles)
  } else {
    removeComposerDraftItem(draftStorageKeys.contextFiles)
  }
}

function normalizedEnvironmentId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || ''
}

function normalizedSessionEnvironmentId(value: string | null | undefined): string {
  return normalizedEnvironmentId(value) || 'local'
}

function preferredProjectForEnvironment(
  projects: ChatWorkspaceProject[],
  environmentId?: string | null,
): ChatWorkspaceProject | null {
  const environmentKey = normalizedEnvironmentId(environmentId)
  if (environmentKey) {
    return projects.find((project) => normalizedEnvironmentId(project.environmentId) === environmentKey) ?? null
  }
  return projects.find((project) => normalizedEnvironmentId(project.environmentId) === 'local')
    ?? projects.find((project) => !normalizedEnvironmentId(project.environmentId))
    ?? projects[0]
    ?? null
}

function uniqueProjectForEnvironment(
  projects: ChatWorkspaceProject[],
  environmentId?: string | null,
): ChatWorkspaceProject | null {
  const environmentKey = normalizedEnvironmentId(environmentId)
  if (!environmentKey) return null
  const matches = projects.filter((project) => normalizedEnvironmentId(project.environmentId || 'local') === environmentKey)
  return matches.length === 1 ? matches[0] : null
}

function findProjectByPathAndEnvironment(
  projects: ChatWorkspaceProject[],
  path: string,
  environmentId?: string | null,
): ChatWorkspaceProject | null {
  const trimmedPath = path.trim()
  const pathKey = normalizedProjectPath(path)
  if (!pathKey) return null

  const exactPathMatch = preferredProjectForEnvironment(
    projects.filter((project) => project.path.trim() === trimmedPath),
    environmentId,
  )
  if (exactPathMatch) return exactPathMatch

  return preferredProjectForEnvironment(
    projects.filter((project) => normalizedProjectPath(project.path) === pathKey),
    environmentId,
  )
}

function normalizedNativeAttachmentPaths(selected: string | string[] | null): string[] {
  const values = Array.isArray(selected) ? selected : (selected ? [selected] : [])
  const seen = new Set<string>()
  return values
    .filter((path): path is string => typeof path === 'string')
    .map((path) => sanitizeProjectPathInput(path))
    .filter((path) => {
      if (!path) return false
      const key = normalizedProjectPath(path) || path
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function normalizedProjectPickerPaths(selected: string | string[] | null): string[] {
  const values = Array.isArray(selected)
    ? selected
    : (selected ? selected.split(/\r?\n/).map((path) => path.trim()).filter(Boolean) : [])
  const seenPaths = new Set<string>()
  return values
    .filter((path): path is string => typeof path === 'string')
    .map((path) => sanitizeProjectPathInput(path))
    .filter((path) => {
      if (!path) return false
      const key = normalizedProjectPath(path) || path
      if (seenPaths.has(key)) return false
      seenPaths.add(key)
      return true
    })
}

function unavailableProjectFromPath(
  path: string,
  environmentId?: string | null,
  name?: string | null,
): ChatWorkspaceProject {
  const normalizedPath = sanitizeProjectPathInput(path).replace(/[\\/]+$/g, '')
  const projectName = name?.trim()
    || normalizedPath.split(/[\\/]/).filter(Boolean).at(-1)
    || 'Selected folder'
  const fallbackBranch = FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0] || 'main'
  return normalizeWorkspaceProject({
    name: projectName,
    path: normalizedPath || path,
    environmentId: environmentId?.trim() || 'local',
    branches: [fallbackBranch],
    currentBranch: fallbackBranch,
  })
}

function isWorkspaceProjectNotFoundError(error: unknown): boolean {
  return error instanceof Error
    ? /workspace project not found/i.test(error.message)
    : /workspace project not found/i.test(String(error ?? ''))
}

function findSessionByRouteIdentity(
  sessions: HermesSession[],
  sessionKey: string | null,
  routeEnvironmentId?: string | null,
): HermesSession | null {
  if (!sessionKey) return null
  const environmentKey = normalizedEnvironmentId(routeEnvironmentId)
  if (environmentKey) {
    return sessions.find((session) => (
      session.key === sessionKey
      && normalizedSessionEnvironmentId(session.environmentId) === environmentKey
    )) ?? null
  }
  return sessions.find((session) => session.key === sessionKey) ?? null
}

function sessionScopeKey(sessionKey: string, environmentId?: string | null): string {
  const environment = normalizedEnvironmentId(environmentId)
  return environment ? `${environment}:${sessionKey}` : sessionKey
}

function sessionMutationTarget(sessionKey: string, environmentId?: string | null): string | { key: string; environmentId: string } {
  const environment = environmentId?.trim()
  return environment ? { key: sessionKey, environmentId: environment } : sessionKey
}

function routeProjectResolutionKey(
  projectId?: string | null,
  cwd?: string | null,
  environmentId?: string | null,
): string {
  return [
    projectId?.trim() || '',
    cwd?.trim() || '',
    environmentId?.trim().toLowerCase() || '',
  ].join('\u0000')
}

function routeProjectPathCandidate(projectId?: string | null, cwd?: string | null): string {
  const routeCwd = cwd?.trim()
  if (routeCwd) return routeCwd
  const routeProjectId = projectId?.trim() || ''
  if (
    routeProjectId.startsWith('/')
    || routeProjectId.startsWith('~/')
    || routeProjectId === '~'
    || /^file:\/\//i.test(routeProjectId)
    || /^[A-Za-z]:[\\/]/.test(routeProjectId)
  ) {
    return routeProjectId
  }
  return ''
}

function routeEnvironmentAllowsLocalResolution(environmentId?: string | null): boolean {
  const environmentKey = environmentId?.trim().toLowerCase() || ''
  return !environmentKey || environmentKey === 'local'
}

function chatShortcutBlockedTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null
  return Boolean(element?.closest(
    'textarea,input,select,[contenteditable="true"],[role="dialog"],[role="menu"],[role="listbox"],[data-chat-provider-model-picker]',
  ))
}

function visibleProjectEnvironmentLabel(value: string | null | undefined, fallback: string): string {
  const label = value?.trim()
  return label ? projectEnvironmentLabelDisplay(label) : fallback
}

function ChatProjectStartPanel({
  projectReady,
  projectName,
  projectPath,
  environmentLabel,
  runtime,
  branch,
  onAddProject,
  onManageProject,
}: {
  projectReady: boolean
  projectName?: string | null
  projectPath?: string | null
  environmentLabel?: string | null
  runtime: string
  branch: string
  onAddProject: () => void
  onManageProject: () => void
}) {
  const selectedPath = projectPath?.trim() || ''
  const title = projectReady
    ? `${projectName || 'Project'} chat ready`
    : selectedPath
      ? 'Selected folder unavailable'
      : 'Unscoped chat'
  const detail = projectReady
    ? selectedPath
    : selectedPath
      ? selectedPath
      : 'Add a project folder to unlock Hermes Agent workspace chat, terminal actions, and file context.'
  const primaryActionLabel = selectedPath && !projectReady ? 'Add selected folder' : 'Add project folder'
  const runtimeLabel = projectRuntimeDisplayLabel(runtime)

  return (
    <section
      role="region"
      aria-label="Chat start context"
      className="chat-start-context-panel"
      style={{
        width: 'min(720px, 100%)',
        border: projectReady
          ? '1px solid color-mix(in srgb, var(--secondary) 28%, var(--border))'
          : selectedPath
            ? '1px solid color-mix(in srgb, var(--warning, #f59e0b) 40%, var(--border))'
            : '1px solid color-mix(in srgb, var(--accent) 24%, var(--border))',
        borderRadius: 8,
        background: projectReady
          ? 'color-mix(in srgb, var(--secondary) 8%, var(--bg-card-solid, #18181f))'
          : selectedPath
            ? 'color-mix(in srgb, var(--warning, #f59e0b) 10%, var(--bg-card-solid, #18181f))'
            : 'color-mix(in srgb, var(--accent) 8%, var(--bg-card-solid, #18181f))',
        color: 'var(--text-secondary)',
        display: 'grid',
        gap: 14,
        padding: 18,
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <FolderOpen size={18} style={{ color: projectReady ? 'var(--secondary)' : 'var(--accent)', flexShrink: 0 }} />
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20, lineHeight: 1.15 }}>
            {title}
          </h2>
        </div>
        <div
          title={detail}
          style={{
            color: selectedPath ? 'var(--text-muted)' : 'var(--text-secondary)',
            fontFamily: selectedPath ? 'monospace' : 'inherit',
            fontSize: selectedPath ? 12 : 13,
            lineHeight: 1.45,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {detail}
        </div>
      </div>

      <div className="chat-start-context-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px', fontSize: 12 }}>
          {visibleProjectEnvironmentLabel(environmentLabel, projectReady ? 'Local' : 'No environment')}
        </span>
        {projectReady ? (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px', fontSize: 12 }}>
              <Terminal size={13} />
              {runtimeLabel}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px', fontSize: 12 }}>
              <GitBranch size={13} />
              {branch}
            </span>
          </>
        ) : null}
      </div>

      <div className="chat-start-context-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onAddProject}
          style={{
            minHeight: 32,
            border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--accent) 18%, var(--bg-card-solid, #18181f))',
            color: 'var(--text-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 11px',
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <FolderPlus size={14} />
          {primaryActionLabel}
        </button>
        <button
          type="button"
          onClick={onManageProject}
          style={{
            minHeight: 32,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 11px',
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 12,
          }}
        >
          <FolderOpen size={14} />
          Manage project context
        </button>
      </div>
    </section>
  )
}

function ChatProjectScopeStrip({
  projectReady,
  projectName,
  projectPath,
  environmentLabel,
  runtime,
  branch,
  onAddProject,
  onManageProject,
  onClearProject,
  onRemoveProject,
}: {
  projectReady: boolean
  projectName?: string | null
  projectPath?: string | null
  environmentLabel?: string | null
  runtime: string
  branch: string
  onAddProject: () => void
  onManageProject: () => void
  onClearProject: () => void
  onRemoveProject: () => void
}) {
  const selectedPath = projectPath?.trim() || ''
  const selectedUnavailable = Boolean(selectedPath && !projectReady)
  const title = projectReady
    ? `Project: ${projectName || 'Project'}`
    : selectedUnavailable
      ? 'Selected folder unavailable'
      : 'No project selected'
  const detail = projectReady
    ? selectedPath
    : selectedUnavailable
      ? selectedPath
      : 'Chat is unscoped. Pick any folder before running Hermes Agent workspace actions, terminals, reviews, or file-aware prompts.'
  const accent = projectReady
    ? 'var(--secondary)'
    : selectedUnavailable
      ? 'var(--warning, #f59e0b)'
      : 'var(--accent)'
  const border = selectedUnavailable
    ? '1px solid color-mix(in srgb, var(--warning, #f59e0b) 46%, var(--border))'
    : projectReady
      ? '1px solid color-mix(in srgb, var(--secondary) 34%, var(--border))'
      : '1px solid color-mix(in srgb, var(--accent) 32%, var(--border))'
  const background = selectedUnavailable
    ? 'color-mix(in srgb, var(--warning, #f59e0b) 12%, var(--bg-card-solid, #18181f))'
    : projectReady
      ? 'color-mix(in srgb, var(--secondary) 9%, var(--bg-card-solid, #18181f))'
      : 'color-mix(in srgb, var(--accent) 10%, var(--bg-card-solid, #18181f))'
  const runtimeLabel = projectRuntimeDisplayLabel(runtime)

  const actionButton = (
    label: string,
    onClick: () => void,
    icon: ReactNode,
    danger = false,
  ) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        minHeight: 30,
        border: danger
          ? '1px solid color-mix(in srgb, var(--danger, #ef4444) 36%, var(--border))'
          : '1px solid var(--border)',
        borderRadius: 8,
        background: danger
          ? 'color-mix(in srgb, var(--danger, #ef4444) 12%, var(--bg-card-solid, #18181f))'
          : 'var(--bg-card-solid, #18181f)',
        color: danger ? 'var(--danger, #ef4444)' : 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '0 10px',
        font: 'inherit',
        fontSize: 12,
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )

  return (
    <section
      role="region"
      aria-label="Current project scope"
      data-chat-project-scope-strip
      style={{
        border,
        borderRadius: 8,
        background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minWidth: 0,
        marginBottom: 12,
        padding: '9px 10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 14px ${accent}`,
            flexShrink: 0,
          }}
        />
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.2 }}>
              {title}
            </strong>
            <span
              style={{
                border: '1px solid var(--border)',
                borderRadius: 999,
                color: 'var(--text-secondary)',
                fontSize: 11,
                lineHeight: 1.2,
                padding: '2px 7px',
                whiteSpace: 'nowrap',
              }}
            >
              {visibleProjectEnvironmentLabel(environmentLabel, projectReady ? 'Local' : 'Unscoped')}
            </span>
            {projectReady ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
                  <Terminal size={12} />
                  {runtimeLabel}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
                  <GitBranch size={12} />
                  {branch}
                </span>
              </>
            ) : null}
          </div>
          <span
            title={detail}
            style={{
              color: selectedUnavailable ? 'var(--warning, #f59e0b)' : 'var(--text-muted)',
              fontFamily: selectedPath ? 'monospace' : 'inherit',
              fontSize: 11,
              lineHeight: 1.35,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {detail}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, flexWrap: 'wrap' }}>
        {actionButton(projectReady || selectedUnavailable ? 'Change project' : 'Add project folder', projectReady || selectedUnavailable ? onManageProject : onAddProject, <FolderOpen size={14} />)}
        {selectedUnavailable ? actionButton('Add selected folder', onAddProject, <FolderPlus size={14} />) : null}
        {selectedPath ? actionButton(projectReady ? 'Remove project' : 'Remove selected folder', onRemoveProject, <Trash size={14} />, true) : null}
        {selectedPath ? actionButton('Clear', onClearProject, <FolderOpen size={14} />) : null}
      </div>
    </section>
  )
}

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const newChatParam = searchParams.get('new')
  const addProjectParam = searchParams.get('addProject')
  const routeSessionKey = resolveChatThreadRouteSessionKey(searchParams)
  const sessionParam = routeSessionKey
  const threadEnvironmentParam = searchParams.get('environmentId')
  const projectIdParam = searchParams.get('projectId')
  const cwdParam = searchParams.get('cwd')
  const envParam = searchParams.get('env')
  const branchParam = searchParams.get('branch')
  const runtimeParam = searchParams.get('runtime')
  const initialNewChat = newChatParam === '1'
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(() => (
    initialNewChat ? null : (routeSessionKey || loadSelectedChatSessionKey())
  ))
  const [selectedSessionEnvironmentId, setSelectedSessionEnvironmentId] = useState<string | null>(() => (
    initialNewChat ? null : (threadEnvironmentParam?.trim() || loadSelectedChatSessionEnvironmentId())
  ))
  const [newChatRequested, setNewChatRequested] = useState(initialNewChat)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [, setAddedProjects] = useState<ChatWorkspaceProject[]>(loadAddedProjects)
  const [workspaceContext, setWorkspaceContext] = useState<ChatWorkspaceContext>(() => (
    mergeWorkspaceProjects(FALLBACK_WORKSPACE_CONTEXT, loadAddedProjects())
  ))
  const [workspaceContextReady, setWorkspaceContextReady] = useState(false)
  const [workspaceContextLoadFailed, setWorkspaceContextLoadFailed] = useState(false)
  const [selectedProjectPath, setSelectedProjectPath] = useState(() => cwdParam?.trim() || loadStoredValue(CHAT_SELECTED_PROJECT_PATH_KEY, FALLBACK_PROJECT.path))
  const [selectedProjectEnvironmentId, setSelectedProjectEnvironmentId] = useState(() => envParam?.trim() || loadStoredValue(CHAT_SELECTED_PROJECT_ENVIRONMENT_KEY, ''))
  const [selectedRuntime, setSelectedRuntime] = useState(() => runtimeParam?.trim() || loadStoredValue(CHAT_SELECTED_RUNTIME_KEY, FALLBACK_WORKSPACE_CONTEXT.runtimeModes[0]))
  const [selectedBranch, setSelectedBranch] = useState(() => branchParam?.trim() || loadStoredValue(CHAT_SELECTED_BRANCH_KEY, FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0]))
  const [projectScriptStore, setProjectScriptStore] = useState<Record<string, ChatProjectScript[]>>(loadProjectScriptStore)
  const [selectedScriptId, setSelectedScriptId] = useState(DEFAULT_CHAT_PROJECT_SCRIPTS[0]?.id ?? '')
  const [scriptDialogMode, setScriptDialogMode] = useState<'add' | 'edit' | null>(null)
  const [scriptDraft, setScriptDraft] = useState<ProjectScriptDialogDraft>({
    name: '',
    command: '',
    cwd: '',
    icon: 'play',
    keybinding: '',
    runOnWorktreeCreate: false,
  })
  const [projectDialogMode, setProjectDialogMode] = useState<ProjectSidebarDialogMode | null>(null)
  const [projectDialogDraft, setProjectDialogDraft] = useState('')
  const [projectDialogTargetPath, setProjectDialogTargetPath] = useState<string | null>(null)
  const [projectDialogTargetEnvironmentId, setProjectDialogTargetEnvironmentId] = useState<string | null>(null)
  const [projectDialogError, setProjectDialogError] = useState<string | null>(null)
  const [projectDialogSubmitting, setProjectDialogSubmitting] = useState(false)
  const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalCommand, setTerminalCommand] = useState<string | undefined>(undefined)
  const [terminalCwd, setTerminalCwd] = useState<string | undefined>(undefined)
  const [terminalEnv, setTerminalEnv] = useState<Record<string, string> | undefined>(undefined)
  const [terminalTitle, setTerminalTitle] = useState('Terminal')
  const [terminalProcessId, setTerminalProcessId] = useState<string | undefined>(undefined)
  const [terminalKey, setTerminalKey] = useState(0)
  const [terminalStatus, setTerminalStatus] = useState<ChatTerminalStatusSnapshot | null>(null)
  const [activePanel, setActivePanel] = useState<ChatActivePanel>(null)
  const [composerFocusSignal, setComposerFocusSignal] = useState(0)
  const [sessionProjectRefs, setSessionProjectRefs] = useState<Record<string, ChatSessionProjectRef>>(loadChatSessionProjectRefs)
  const [nativeContextReads, setNativeContextReads] = useState(0)
  const terminalLaunchCounterRef = useRef(0)
  const realWorkspaceProjects = useMemo(
    () => workspaceContext.projects.filter((project) => project.path.trim()),
    [workspaceContext.projects],
  )
  const { sessions: rawSessions, available: sessionsAvailable, isLoading: sessionsLoading } = useGatewaySessions({
    cwd: workspaceSessionRoots(realWorkspaceProjects),
    projectIds: realWorkspaceProjects
      .map((project) => project.id?.trim())
      .filter((projectId): projectId is string => Boolean(projectId)),
    includeUnscoped: true,
  })
  const sessions = useMemo(
    () => attachChatSessionProjectRefs(rawSessions, sessionProjectRefs),
    [rawSessions, sessionProjectRefs],
  )
  const { renameMutation, deleteMutation, pinMutation, compactMutation } = useSessionMutations()
  const newChatIntentRef = useRef(initialNewChat)
  const preserveNextNewChatDraftRef = useRef(false)
  const projectDialogSubmittingRef = useRef(false)
  const autoRenameAttemptedRef = useRef<Set<string>>(new Set())
  const branchProjectPathRef = useRef(selectedProjectPath)
  const scriptPreferenceScopeRef = useRef('')
  const pendingSessionBranchRef = useRef<{ projectPath: string; branch: string } | null>(null)
  const routeProjectResolutionFailuresRef = useRef<Set<string>>(new Set())
  const routeProjectResolutionInFlightRef = useRef<Set<string>>(new Set())
  const routeProjectResolutionActiveKeyRef = useRef('')
  const routeProjectClearedKeysRef = useRef<Set<string>>(new Set())
  const unscopedSessionSelectionKeyRef = useRef<string | null>(null)
  const pendingProjectSelectionRef = useRef<ChatWorkspaceProject | null>(null)
  const selectedRuntimeRef = useRef(selectedRuntime)
  const selectedBranchRef = useRef(selectedBranch)
  const pendingRuntimeSelectionRef = useRef<string | null>(null)
  const pendingBranchSelectionRef = useRef<string | null>(null)
  const selectedSession = findSessionByRouteIdentity(
    sessions,
    selectedSessionKey,
    selectedSessionEnvironmentId ?? threadEnvironmentParam,
  )
  const selectedProjectMatch = selectedProjectPath.trim()
    ? findProjectByPathAndEnvironment(realWorkspaceProjects, selectedProjectPath, selectedProjectEnvironmentId)
    : null
  const selectedProject = selectedProjectPath.trim()
    ? (selectedProjectMatch ?? FALLBACK_PROJECT)
    : FALLBACK_PROJECT
  const selectedProjectRealPath = selectedProject.path.trim()
  const selectedProjectAvailable = Boolean(selectedProjectMatch && selectedProjectRealPath)
  const selectedProjectReady = selectedProjectAvailable
  const activeProjectScripts = scriptsForProject(projectScriptStore, selectedProject)
  const selectedProjectScriptScope = selectedProjectReady
    ? projectScriptWriteStorageKeys(selectedProject).join('\u0000')
    : ''
  const selectedProjectScript = activeProjectScripts.find((script) => script.id === selectedScriptId)
    ?? primaryProjectScript(activeProjectScripts)
    ?? activeProjectScripts[0]
    ?? null
  const chatTitle = String(selectedSession?.label || 'New chat')
  const chatSubtitle = selectedSession
    ? `${selectedSession.messageCount || 0} messages`
    : 'Choose a chat or send a new message'

  const findRealWorkspaceProjectByPath = useCallback((path: string, environmentId?: string | null) => {
    return findProjectByPathAndEnvironment(realWorkspaceProjects, path, environmentId)
  }, [realWorkspaceProjects])

  const findWorkspaceProjectByPath = useCallback((path: string, environmentId?: string | null) => {
    return findProjectByPathAndEnvironment(workspaceContext.projects, path, environmentId)
  }, [workspaceContext.projects])

  const branchForSessionProject = useCallback((
    project: ChatWorkspaceProject | null,
    session: typeof selectedSession,
    fallback: string,
  ) => {
    const branch = typeof session?.branch === 'string' ? session.branch.trim() : ''
    if (project && branch && project.branches.includes(branch)) return branch
    return project?.currentBranch || project?.branches[0] || fallback
  }, [])

  const runtimeForSession = useCallback((session: typeof selectedSession, fallback: string) => {
    const runtime = typeof session?.runtime === 'string' ? session.runtime.trim() : ''
    if (runtime && workspaceContext.runtimeModes.includes(runtime)) return runtime
    return fallback
  }, [workspaceContext.runtimeModes])

  const sameProjectRecord = (left: ChatWorkspaceProject, right: ChatWorkspaceProject) => (
    normalizedProjectPath(left.path) === normalizedProjectPath(right.path)
    && (left.environmentId || 'local').trim().toLowerCase() === (right.environmentId || 'local').trim().toLowerCase()
  )

  const setProjectRouteParamsIfReady = useCallback((
    params: URLSearchParams,
    project: ChatWorkspaceProject,
    context?: { branch?: string; runtime?: string },
  ) => {
    if (!project.path.trim()) {
      params.delete('projectId')
      params.delete('cwd')
      params.delete('env')
      params.delete('branch')
      params.delete('runtime')
      return
    }
    setProjectRouteParams(params, project, context)
  }, [])

  useEffect(() => {
    let cancelled = false

    loadChatWorkspaceContext()
      .then((result) => {
        if (cancelled) return
        const normalized = normalizeWorkspaceContext(result)
        const legacyProjects = pruneMigratedAddedProjects(loadAddedProjects(), normalized.projects)
        saveAddedProjects(legacyProjects)
        setAddedProjects(legacyProjects)
        const next = mergeWorkspaceProjects(normalized, legacyProjects)
        const realProjects = next.projects.filter((project) => project.path.trim())
        const routeProject = findProjectByRouteIdentity(realProjects, projectIdParam, cwdParam, envParam)
        const routeRequestedProject = Boolean(projectIdParam?.trim() || cwdParam?.trim())
        const routeMissingProjectPath = routeRequestedProject && !routeProject
          ? routeProjectPathCandidate(projectIdParam, cwdParam)
          : ''
        const routeProjectStatePresent = routeRequestedProject || Boolean(envParam?.trim())
        const requestedSessionEnvironment = normalizedEnvironmentId(selectedSessionEnvironmentId ?? threadEnvironmentParam)
        const nonLocalSessionScopePresent = Boolean(
          selectedSessionKey?.trim()
          && requestedSessionEnvironment
          && requestedSessionEnvironment !== 'local',
        )
        const scopedRouteStatePresent = routeProjectStatePresent || nonLocalSessionScopePresent
        if (routeRequestedProject && !routeProject) {
          showAttachmentStatus('Project folder is no longer available. Add it again or select another project.', 5000)
        }
        const storedProject = findProjectByPathAndEnvironment(
          realProjects,
          selectedProjectPath,
          selectedProjectEnvironmentId,
        )
        const effectiveProject = routeProject
          ?? (scopedRouteStatePresent ? null : storedProject)
          ?? FALLBACK_PROJECT
        setWorkspaceContext(next)
        setWorkspaceContextLoadFailed(false)
        setSelectedProjectPath(routeMissingProjectPath || effectiveProject.path || '')
        setSelectedProjectEnvironmentId(routeMissingProjectPath ? (envParam?.trim() || '') : (effectiveProject.environmentId || ''))
        setSelectedRuntime((current) => {
          const routeRuntime = runtimeParam?.trim()
          if (routeRuntime && next.runtimeModes.includes(routeRuntime)) return routeRuntime
          return next.runtimeModes.includes(current) ? current : next.runtimeModes[0]
        })
        setSelectedBranch((current) => (
          branchParam?.trim() && effectiveProject.branches.includes(branchParam.trim())
            ? branchParam.trim()
            : effectiveProject.currentBranch && current === FALLBACK_PROJECT.currentBranch
              ? effectiveProject.currentBranch
              : effectiveProject.branches.includes(current)
                ? current
                : (effectiveProject.currentBranch || effectiveProject.branches[0] || 'main')
        ))
        setWorkspaceContextReady(true)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Failed to load chat workspace context:', err)
        setWorkspaceContextLoadFailed(true)
        setWorkspaceContextReady(true)
        showAttachmentStatus('Workspace folders could not be loaded. You can still chat unscoped or add a project manually.', 5000)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const reloadWorkspacePreferences = () => {
      const legacyProjects = pruneMigratedAddedProjects(loadAddedProjects(), workspaceContext.projects)
      saveAddedProjects(legacyProjects)
      setAddedProjects(legacyProjects)
      setWorkspaceContext((current) => mergeWorkspaceProjects(current, legacyProjects))
      setProjectScriptStore(loadProjectScriptStore())
    }

    window.addEventListener(CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT, reloadWorkspacePreferences)
    return () => {
      window.removeEventListener(CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT, reloadWorkspacePreferences)
    }
  }, [workspaceContext.projects])

  useEffect(() => {
    if (!selectedProjectAvailable) return
    const projectChanged = normalizedProjectPath(branchProjectPathRef.current) !== normalizedProjectPath(selectedProject.path)
    branchProjectPathRef.current = selectedProject.path
    setSelectedBranch((current) => {
      const fallbackBranch = selectedProject.currentBranch || selectedProject.branches[0] || 'main'
      if (projectChanged) {
        const pendingSessionBranch = pendingSessionBranchRef.current
        if (
          pendingSessionBranch
          && normalizedProjectPath(pendingSessionBranch.projectPath) === normalizedProjectPath(selectedProject.path)
          && selectedProject.branches.includes(pendingSessionBranch.branch)
        ) {
          pendingSessionBranchRef.current = null
          return pendingSessionBranch.branch
        }
        return fallbackBranch
      }
      return selectedProject.branches.includes(current) ? current : fallbackBranch
    })
  }, [selectedProject, selectedProjectAvailable])

  useEffect(() => {
    if (selectedProjectReady || activePanel !== 'review') return
    setActivePanel(null)
  }, [activePanel, selectedProjectReady])

  useEffect(() => {
    const pendingProjectSelection = pendingProjectSelectionRef.current
    if (!pendingProjectSelection || !selectedProjectReady) return
    if (findProjectByPathAndEnvironment([selectedProject], pendingProjectSelection.path, pendingProjectSelection.environmentId)) {
      pendingProjectSelectionRef.current = null
    }
  }, [selectedProject, selectedProjectReady])

  useEffect(() => {
    if (!workspaceContextReady) return
    if (newChatIntentRef.current) return
    if (newChatRequested) return
    if (!selectedSession) return

    const sessionProject = findProjectForSession(realWorkspaceProjects, selectedSession)
    const nextBranch = branchForSessionProject(sessionProject, selectedSession, selectedBranch)
    const nextRuntime = runtimeForSession(selectedSession, selectedRuntime)

    const explicitUnscopedSessionSelection = unscopedSessionSelectionKeyRef.current === selectedSession.key
    if (sessionProject) {
      unscopedSessionSelectionKeyRef.current = null
      if (
        normalizedProjectPath(selectedProjectPath) !== normalizedProjectPath(sessionProject.path)
        || (selectedProjectEnvironmentId || '') !== (sessionProject.environmentId || '')
      ) {
        pendingSessionBranchRef.current = { projectPath: sessionProject.path, branch: nextBranch }
        setSelectedProjectPath(sessionProject.path)
        setSelectedProjectEnvironmentId(sessionProject.environmentId || '')
      }
    } else if (explicitUnscopedSessionSelection && (selectedProjectPath.trim() || selectedProjectEnvironmentId.trim())) {
      setSelectedProjectPath('')
      setSelectedProjectEnvironmentId('')
    }
    if (selectedBranch !== nextBranch) {
      setSelectedBranch(nextBranch)
    }
    if (selectedRuntime !== nextRuntime) {
      setSelectedRuntime(nextRuntime)
    }
  }, [
    newChatRequested,
    branchForSessionProject,
    runtimeForSession,
    selectedBranch,
    selectedProjectEnvironmentId,
    selectedProjectPath,
    selectedRuntime,
    selectedSession,
    realWorkspaceProjects,
    workspaceContext.runtimeModes,
    workspaceContextReady,
  ])

  useEffect(() => {
    if (!workspaceContextReady) return
    const explicitProjectRouteRequested = Boolean(projectIdParam?.trim() || cwdParam?.trim())
    const selectedSessionProject = selectedSession && !newChatRequested
      ? findProjectForSession(realWorkspaceProjects, selectedSession)
      : null
    const selectedSessionIsUnscoped = Boolean(
      selectedSessionKey
      && unscopedSessionSelectionKeyRef.current === selectedSessionKey
      && selectedSession
      && !newChatRequested
      && !selectedSessionProject,
    )
    if (selectedSessionIsUnscoped && selectedSessionKey) {
      const scopedSessionKey = selectedSessionKey
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        applyChatThreadRouteParams(next, {
          sessionKey: scopedSessionKey,
          session: selectedSession,
          fallbackEnvironmentId: selectedSessionEnvironmentId ?? threadEnvironmentParam,
        })
        next.delete('projectId')
        next.delete('cwd')
        next.delete('env')
        next.delete('branch')
        next.delete('runtime')
        return next
      }, { replace: true })
      return
    }
    if (!selectedProjectReady) {
      if (explicitProjectRouteRequested) return
      const shouldApplySessionRoute = Boolean(selectedSessionKey && !newChatRequested && !newChatIntentRef.current)
      const shouldClearSessionRoute = Boolean(
        (newChatRequested || newChatIntentRef.current)
        && (
          routeSessionKey
          || searchParams.get('session')?.trim()
          || searchParams.get('threadId')?.trim()
          || searchParams.get('environmentId')?.trim()
        ),
      )
      const shouldClearProjectRoute = Boolean(
        projectIdParam?.trim()
        || cwdParam?.trim()
        || envParam?.trim()
        || branchParam?.trim()
        || runtimeParam?.trim()
      )
      if (!shouldApplySessionRoute && !shouldClearSessionRoute && !shouldClearProjectRoute) return
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (next.get('projectId')?.trim() || next.get('cwd')?.trim()) {
          return next
        }
        if (shouldApplySessionRoute && selectedSessionKey) {
          applyChatThreadRouteParams(next, {
            sessionKey: selectedSessionKey,
            session: selectedSession,
            fallbackEnvironmentId: selectedSessionEnvironmentId ?? threadEnvironmentParam,
          })
        } else if (newChatRequested || newChatIntentRef.current) {
          next.delete('session')
          next.delete('threadId')
          next.delete('environmentId')
        }
        next.delete('projectId')
        next.delete('cwd')
        next.delete('env')
        next.delete('branch')
        next.delete('runtime')
        return next
      }, { replace: true })
      return
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const prevProjectId = next.get('projectId')
      const prevCwd = next.get('cwd')
      const prevEnv = next.get('env')
      if (
        (prevProjectId?.trim() || prevCwd?.trim())
        && !findProjectByRouteIdentity([selectedProject], prevProjectId, prevCwd, prevEnv)
        && !newChatIntentRef.current
      ) {
        return next
      }
      const shouldApplySessionRoute = Boolean(selectedSessionKey && !newChatRequested && !newChatIntentRef.current)
      const pendingProjectSelection = pendingProjectSelectionRef.current
      if (
        newChatIntentRef.current
        && selectedSessionKey
        && pendingProjectSelection
        && !findProjectByPathAndEnvironment([selectedProject], pendingProjectSelection.path, pendingProjectSelection.environmentId)
      ) {
        return next
      }
      if (shouldApplySessionRoute && selectedSessionKey) {
        applyChatThreadRouteParams(next, {
          sessionKey: selectedSessionKey,
          session: selectedSession,
          fallbackEnvironmentId: selectedSessionEnvironmentId ?? threadEnvironmentParam ?? selectedProject.environmentId,
        })
      } else if (newChatRequested || newChatIntentRef.current) {
        next.delete('session')
        next.delete('threadId')
        next.delete('environmentId')
      }
      setProjectRouteParamsIfReady(next, selectedProject, {
        branch: pendingBranchSelectionRef.current || selectedBranch,
        runtime: pendingRuntimeSelectionRef.current || selectedRuntime,
      })
      return next
    }, { replace: true })
  }, [branchParam, cwdParam, envParam, newChatRequested, projectIdParam, realWorkspaceProjects, routeSessionKey, runtimeParam, searchParams, selectedBranch, selectedProject, selectedProjectReady, selectedRuntime, selectedSession, selectedSessionEnvironmentId, selectedSessionKey, setProjectRouteParamsIfReady, setSearchParams, threadEnvironmentParam, workspaceContextReady])

  useEffect(() => {
    if (newChatParam !== '1') return
    newChatIntentRef.current = true
    setSelectedSessionKey(null)
    setSelectedSessionEnvironmentId(null)
    saveSelectedChatSessionKey(null)
    setNewChatRequested(true)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('new')
      return next
    }, { replace: true })
  }, [newChatParam, setSearchParams])

  useEffect(() => {
    const nextKey = sessionParam?.trim()
    if (!nextKey) return
    if (newChatIntentRef.current) return
    newChatIntentRef.current = false
    setNewChatRequested(false)
    setSelectedSessionKey(nextKey)
    setSelectedSessionEnvironmentId(threadEnvironmentParam?.trim() || null)
    saveSelectedChatSessionKey(nextKey, threadEnvironmentParam)
  }, [sessionParam, threadEnvironmentParam])

  useEffect(() => {
    if (newChatIntentRef.current) return
    if (newChatRequested) return
    if (sessions.length === 0) return
    if (selectedSessionKey) return

    const nextKey = sessions[0]?.key as string | undefined
    if (nextKey) {
      const nextEnvironmentId = sessions[0]?.environmentId?.trim() || null
      setSelectedSessionEnvironmentId(nextEnvironmentId)
      setSelectedSessionKey(nextKey)
      saveSelectedChatSessionKey(nextKey, nextEnvironmentId)
    }
  }, [newChatRequested, selectedSessionKey, sessions])

  const handleSelectSession = (key: string, environmentId?: string | null) => {
    const session = findSessionByRouteIdentity(sessions, key, environmentId)
    const sessionProject = findProjectForSession(realWorkspaceProjects, session)
    const nextBranch = branchForSessionProject(sessionProject, session ?? null, selectedBranch)
    const nextRuntime = runtimeForSession(session ?? null, selectedRuntime)
    const nextSessionEnvironmentId = session?.environmentId?.trim() || environmentId?.trim() || null
    if (sessionProject) {
      unscopedSessionSelectionKeyRef.current = null
      pendingSessionBranchRef.current = { projectPath: sessionProject.path, branch: nextBranch }
      setSelectedProjectPath(sessionProject.path)
      setSelectedProjectEnvironmentId(sessionProject.environmentId || '')
      setSelectedBranch(nextBranch)
    } else {
      unscopedSessionSelectionKeyRef.current = key
      setSelectedProjectPath('')
      setSelectedProjectEnvironmentId('')
    }
    if (nextRuntime !== selectedRuntime) {
      setSelectedRuntime(nextRuntime)
    }
    newChatIntentRef.current = false
    setNewChatRequested(false)
    setSelectedSessionEnvironmentId(nextSessionEnvironmentId)
    setSelectedSessionKey(key)
    saveSelectedChatSessionKey(key, nextSessionEnvironmentId)
    clearChatComposerDraft()
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      applyChatThreadRouteParams(next, {
        sessionKey: key,
        session,
        fallbackEnvironmentId: sessionProject?.environmentId ?? undefined,
      })
      if (sessionProject) {
        setProjectRouteParamsIfReady(next, sessionProject, { branch: nextBranch, runtime: nextRuntime })
      } else {
        next.delete('projectId')
        next.delete('cwd')
        next.delete('env')
        next.delete('branch')
        next.delete('runtime')
      }
      return next
    }, { replace: true })
  }

  const setCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    saveSidebarCollapsed(collapsed)
  }

  useEffect(() => {
    if (!(projectIdParam?.trim() || cwdParam?.trim())) {
      routeProjectClearedKeysRef.current.clear()
    }
  }, [cwdParam, projectIdParam])

  useEffect(() => {
    saveStoredValue(CHAT_SELECTED_PROJECT_PATH_KEY, selectedProjectPath)
  }, [selectedProjectPath])

  useEffect(() => {
    saveStoredValue(CHAT_SELECTED_PROJECT_ENVIRONMENT_KEY, selectedProjectEnvironmentId)
  }, [selectedProjectEnvironmentId])

  useEffect(() => {
    saveStoredValue(CHAT_SELECTED_RUNTIME_KEY, selectedRuntime)
    selectedRuntimeRef.current = selectedRuntime
    if (pendingRuntimeSelectionRef.current === selectedRuntime) {
      pendingRuntimeSelectionRef.current = null
    }
  }, [selectedRuntime])

  useEffect(() => {
    saveStoredValue(CHAT_SELECTED_BRANCH_KEY, selectedBranch)
    selectedBranchRef.current = selectedBranch
    if (pendingBranchSelectionRef.current === selectedBranch) {
      pendingBranchSelectionRef.current = null
    }
  }, [selectedBranch])

  useEffect(() => {
    const scopeChanged = scriptPreferenceScopeRef.current !== selectedProjectScriptScope
    scriptPreferenceScopeRef.current = selectedProjectScriptScope

    if (!selectedProjectReady) {
      if (selectedScriptId) setSelectedScriptId('')
      return
    }

    const preferredScriptId = preferredScriptIdForProject(selectedProject)
    const preferredScript = activeProjectScripts.find((script) => script.id === preferredScriptId) ?? null
    if (scopeChanged && preferredScript && selectedScriptId !== preferredScript.id) {
      setSelectedScriptId(preferredScript.id)
      return
    }

    if (!scopeChanged && activeProjectScripts.some((script) => script.id === selectedScriptId)) return
    const fallbackScript = preferredScript
      ?? primaryProjectScript(activeProjectScripts)
      ?? activeProjectScripts[0]
      ?? null
    if (fallbackScript) {
      setSelectedScriptId(fallbackScript.id)
    } else if (selectedScriptId) {
      setSelectedScriptId('')
    }
  }, [activeProjectScripts, selectedProject, selectedProjectReady, selectedProjectScriptScope, selectedScriptId])

  const selectProjectScript = useCallback((scriptId: string) => {
    setSelectedScriptId(scriptId)
    if (selectedProjectReady) {
      savePreferredScriptIdForProject(selectedProject, scriptId)
    }
  }, [selectedProject, selectedProjectReady])

  const {
    _demo,
    messages,
    input, setInput,
    images, setImages, imagesRef,
    contextFiles, setContextFiles, contextFilesRef,
    pendingAttachmentReads,
    pendingQueuedSend,
    cancelQueuedSend,
    sending,
    connected,
    mounted,
    lightbox, setLightbox,
    atBottom, setAtBottom, setAtBottomRefOnly,
    optimistic,
    isTyping,
    systemMsg,
    notConfigured,
    historyError,
    model, setModel,
    provider, setProvider,
    providers,
    modelsData,
    visibleModels,
    wsConnected,
    historyIsError,
    bottomRef, scrollRef,
    optimisticImageCacheRef,
    optimisticContextFileCacheRef,
    draftTimerRef,
    draftStorageKeys,
    send,
    sendMessage,
    stop,
    retry,
    retryHistoryLoad,
    handleFileChange,
    handleContextFileChange,
    appendContextFileAttachments,
    showAttachmentStatus,
    onDrop,
  } = useChatState(selectedSessionKey, {
    blank: newChatRequested && !selectedSessionKey,
    newChat: newChatRequested && !selectedSessionKey,
    sessionEnvironmentId: selectedSessionEnvironmentId
      ?? selectedSession?.environmentId
      ?? threadEnvironmentParam
      ?? (selectedProjectReady ? selectedProject.environmentId : undefined),
    context: {
      projectId: selectedProjectReady ? (selectedProject.id || undefined) : undefined,
      project: selectedProjectReady ? selectedProject.name : undefined,
      projectRoot: selectedProjectReady ? (selectedProject.root || selectedProjectRealPath || undefined) : undefined,
      workingDir: selectedProjectReady ? selectedProjectRealPath : undefined,
      environmentId: selectedProjectReady ? (selectedProject.environmentId || undefined) : undefined,
      branch: selectedProjectReady ? selectedBranch : undefined,
      runtime: selectedProjectReady ? selectedRuntime : undefined,
    },
    attachmentInputLocked: nativeContextReads > 0,
    onSessionKey: (key, meta) => {
      const selectedRouteProject = selectedProjectReady ? selectedProject : null
      const createdEnvironmentId = meta?.environmentId?.trim() || selectedRouteProject?.environmentId?.trim() || null
      const routeProject = selectedRouteProject
        ?? uniqueProjectForEnvironment(realWorkspaceProjects, createdEnvironmentId)
      if (routeProject) {
        if (!selectedRouteProject) {
          setSelectedProjectPath(routeProject.path)
          setSelectedProjectEnvironmentId(routeProject.environmentId || '')
          setSelectedBranch(routeProject.currentBranch || routeProject.branches[0] || selectedBranch)
        }
        setSessionProjectRefs((current) => {
          const refKey = chatSessionProjectRefKey(key, createdEnvironmentId)
          const refProject = createdEnvironmentId && createdEnvironmentId !== (routeProject.environmentId || '')
            ? { ...routeProject, environmentId: createdEnvironmentId }
            : routeProject
          const next = {
            ...current,
            [refKey]: projectRefFromProject(refProject, {
              branch: selectedBranch,
              runtime: selectedRuntime,
            }),
          }
          saveChatSessionProjectRefs(next)
          return next
        })
      } else {
        setSessionProjectRefs((current) => {
          const next = removeChatSessionProjectRef(current, key, createdEnvironmentId ?? selectedSessionEnvironmentId)
          if (next === current) return current
          saveChatSessionProjectRefs(next)
          return next
        })
      }
      newChatIntentRef.current = false
      setNewChatRequested(false)
      setSelectedSessionEnvironmentId(createdEnvironmentId)
      setSelectedSessionKey(key)
      saveSelectedChatSessionKey(key, createdEnvironmentId)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        applyChatThreadRouteParams(next, {
          sessionKey: key,
          session: null,
          fallbackEnvironmentId: createdEnvironmentId,
        })
        if (routeProject) {
          setProjectRouteParamsIfReady(next, routeProject, { branch: selectedBranch, runtime: selectedRuntime })
        } else {
          next.delete('projectId')
          next.delete('cwd')
          next.delete('env')
          next.delete('branch')
          next.delete('runtime')
        }
        return next
      }, { replace: true })
    },
  })
  const hermesProviderLabel = providers.find((candidate) => candidate.id === 'hermes')?.name?.trim()
  const activeProviderLabel = hermesProviderLabel && hermesProviderLabel !== 'Hermes'
    ? hermesProviderLabel
    : 'Hermes Agent'
  const activeProvider = providers.find((candidate) => candidate.id === provider)
  const selectedProjectUnavailable = Boolean(selectedProjectPath.trim() && !selectedProjectReady)
  const sendDisabledReason = selectedProjectUnavailable
    ? `${activeProviderLabel} cannot use the selected folder because it is unavailable. Add it again or clear it before sending.`
    : activeProvider?.local && !selectedProjectReady
      ? `${activeProviderLabel} needs a project folder. Select or add a project before sending.`
      : null
  const sendDisabledProjectActionLabel = selectedProjectUnavailable
    ? 'Add selected folder'
    : activeProvider?.local && !selectedProjectReady
      ? 'Add project folder'
      : undefined
  const handleSendDisabledProjectAction = sendDisabledProjectActionLabel
    ? () => void handleAddProject(selectedProjectUnavailable ? selectedProjectPath : undefined)
    : undefined
  const promptHistory = useMemo<ChatInputHistoryEntry[]>(() => {
    const seen = new Set<string>()
    const entries: ChatInputHistoryEntry[] = []
    const pushEntry = (entry: ChatInputHistoryEntry) => {
      const text = entry.text.trim()
      const images = entry.images ?? []
      const files = entry.contextFiles ?? []
      if (!text && images.length === 0 && files.length === 0) return
      const fileKey = files.map((file) => `${file.path || file.name}:${file.size ?? ''}`).join('|')
      const imageKey = images.join('\u0000')
      const key = `${text}\u0000${imageKey}\u0000${fileKey}`
      if (seen.has(key)) return
      seen.add(key)
      entries.push({ text, images, contextFiles: files })
    }

    for (const message of [...optimistic].reverse()) {
      pushEntry({
        text: message.text,
        images: message.images ?? [],
        contextFiles: message.contextFiles ?? [],
      })
    }
    const messagesWithAttachmentFallbacks = withOptimisticAttachmentFallbacks(
      messages,
      optimisticImageCacheRef.current,
      optimisticContextFileCacheRef.current,
    )
    for (const message of [...messagesWithAttachmentFallbacks].reverse()) {
      if (message.role !== 'user') continue
      pushEntry({
        text: message.text,
        images: message.images ?? [],
        contextFiles: message.contextFiles ?? [],
      })
    }
    return entries.slice(0, 25)
  }, [messages, optimistic, optimisticContextFileCacheRef, optimisticImageCacheRef])

  const clearChatComposerDraft = useCallback(() => {
    setInput('')
    setImages([])
    imagesRef.current = []
    setContextFiles([])
    contextFilesRef.current = []
    removeComposerDraftItem(draftStorageKeys.text)
    removeComposerDraftItem(draftStorageKeys.images)
    removeComposerDraftItem(draftStorageKeys.contextFiles)
  }, [contextFilesRef, draftStorageKeys, imagesRef, setContextFiles, setImages, setInput])

  const useMessageAsPrompt = useCallback((message: ChatMessage) => {
    if (message.role !== 'user') return
    const nextText = message.text
    const nextImages = [...(message.images ?? [])]
    const nextContextFiles = [...(message.contextFiles ?? [])]
    setInput(nextText)
    setImages(nextImages)
    imagesRef.current = nextImages
    setContextFiles(nextContextFiles)
    contextFilesRef.current = nextContextFiles
    persistComposerDraftSnapshot(draftStorageKeys, nextText, nextImages, nextContextFiles)
  }, [contextFilesRef, draftStorageKeys, imagesRef, setContextFiles, setImages, setInput])

  const regenerateAssistantFromPrompt = useCallback((_assistantMessage: ChatMessage, previousUserMessage: ChatMessage | null) => {
    if (!previousUserMessage) return
    if (!sendDisabledReason && sendMessage(
      previousUserMessage.text,
      previousUserMessage.images ?? [],
      previousUserMessage.contextFiles ?? [],
    )) {
      return
    }
    useMessageAsPrompt(previousUserMessage)
  }, [sendDisabledReason, sendMessage, useMessageAsPrompt])

  const continueAssistantResponse = useCallback((_assistantMessage: ChatMessage) => {
    const nextText = 'Continue from your last response.'
    if (!sendDisabledReason && sendMessage(nextText)) return
    setInput(nextText)
    setImages([])
    imagesRef.current = []
    setContextFiles([])
    contextFilesRef.current = []
    persistComposerDraftSnapshot(draftStorageKeys, nextText)
  }, [contextFilesRef, draftStorageKeys, imagesRef, sendDisabledReason, sendMessage, setContextFiles, setImages, setInput])

  const runHermesReview = useCallback(() => {
    if (!selectedProjectReady) {
      showAttachmentStatus('Select a project before running a Hermes review.', 4000)
      return
    }
    const prompt = [
      'Review the current project for correctness, regressions, and missing tests.',
      'Focus on concrete findings first, with file/line references when possible.',
      '',
      `Project: ${selectedProject.name}`,
      `Working directory: ${selectedProjectRealPath}`,
      `Project root: ${selectedProject.root || selectedProjectRealPath}`,
      `Environment: ${selectedProject.environmentId || 'local'}`,
      `Branch: ${selectedBranch}`,
      `Runtime: ${selectedRuntime}`,
    ].join('\n')
    if (!sendDisabledReason && sendMessage(prompt)) return
    setInput(prompt)
    setImages([])
    imagesRef.current = []
    setContextFiles([])
    contextFilesRef.current = []
    persistComposerDraftSnapshot(draftStorageKeys, prompt)
  }, [
    contextFilesRef,
    draftStorageKeys,
    imagesRef,
    selectedBranch,
    selectedProject,
    selectedProjectReady,
    selectedProjectRealPath,
    selectedRuntime,
    sendDisabledReason,
    sendMessage,
    setContextFiles,
    setImages,
    setInput,
    showAttachmentStatus,
  ])

  const nativeAttachmentDefaultPath = useMemo(() => (
    selectedProjectReady
      ? selectedProjectRealPath
      : projectPickerDefaultPath({
        selectedProjectPath,
        projects: workspaceContext.projects,
      })
  ), [selectedProjectPath, selectedProjectReady, selectedProjectRealPath, workspaceContext.projects])

  const appendNativeImages = useCallback((dataUrls: string[]) => {
    const validDataUrls = dataUrls.filter((value) => typeof value === 'string' && value.startsWith('data:image/'))
    const availableSlots = Math.max(0, CHAT_IMAGE_LIMIT - imagesRef.current.length)
    if (validDataUrls.length > availableSlots) {
      showAttachmentStatus(`You can attach up to ${CHAT_IMAGE_LIMIT} images at once.`)
    }
    const nextImages = [
      ...imagesRef.current,
      ...validDataUrls.slice(0, availableSlots),
    ]
    imagesRef.current = nextImages
    setImages(nextImages)
    if (nextImages.length === 0) {
      removeComposerDraftItem(draftStorageKeys.images)
      return
    }
    const total = nextImages.reduce((sum, value) => sum + value.length, 0)
    if (total <= 4 * 1024 * 1024) {
      replaceComposerDraftJson(draftStorageKeys.images, nextImages)
    } else {
      removeComposerDraftItem(draftStorageKeys.images)
    }
  }, [draftStorageKeys.images, imagesRef, setImages, showAttachmentStatus])

  const attachNativeImagePaths = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: false,
        multiple: true,
        title: 'Attach image',
        defaultPath: nativeAttachmentDefaultPath,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
        }],
      })
      const paths = normalizedNativeAttachmentPaths(selected)
      if (paths.length === 0) return
      const { invoke } = await import('@tauri-apps/api/core')
      setNativeContextReads((current) => current + 1)
      try {
        const rawDataUrls = await invoke<string[]>('read_chat_image_data_urls', { paths })
        const dataUrls = Array.isArray(rawDataUrls) ? rawDataUrls : []
        if (dataUrls.length === 0) {
          showAttachmentStatus('No supported images were attached. Select PNG, JPG, GIF, or WebP files.')
          return
        }
        appendNativeImages(dataUrls)
      } finally {
        setNativeContextReads((current) => Math.max(0, current - 1))
      }
    } catch (error) {
      console.warn('Failed to attach native chat images:', error)
      showAttachmentStatus('Image attachment failed to load. Check the selected files and try again.', 4500)
    }
  }, [appendNativeImages, nativeAttachmentDefaultPath, showAttachmentStatus])

  const attachNativeContextPaths = useCallback(async (directory: boolean) => {
    if (!window.__TAURI_INTERNALS__) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory,
        multiple: true,
        title: directory ? 'Attach folder context' : 'Attach file context',
        defaultPath: nativeAttachmentDefaultPath,
      })
      const paths = normalizedNativeAttachmentPaths(selected)
      if (paths.length === 0) return
      const { invoke } = await import('@tauri-apps/api/core')
      setNativeContextReads((current) => current + 1)
      try {
        const rawAttachments = await invoke<ChatContextFileAttachment[]>('read_chat_context_files', { paths })
        const attachments = Array.isArray(rawAttachments) ? rawAttachments : []
        if (attachments.length === 0) {
          showAttachmentStatus(directory
            ? 'No supported text files were found in that folder.'
            : 'No supported text files were attached.')
          return
        }
        appendContextFileAttachments(attachments)
      } finally {
        setNativeContextReads((current) => Math.max(0, current - 1))
      }
    } catch (error) {
      console.warn('Failed to attach native chat context files:', error)
      showAttachmentStatus('Context attachment failed to load. Check the selected files or folder and try again.', 4500)
    }
  }, [appendContextFileAttachments, nativeAttachmentDefaultPath, showAttachmentStatus])

  useEffect(() => {
    if (!newChatRequested || selectedSessionKey) return
    if (preserveNextNewChatDraftRef.current) {
      preserveNextNewChatDraftRef.current = false
      return
    }
    clearChatComposerDraft()
  }, [clearChatComposerDraft, newChatRequested, selectedSessionKey])

  const beginNewChatForProject = useCallback((
    project: ChatWorkspaceProject | null,
    branch?: string,
    runtime?: string,
    options?: { preserveDraft?: boolean },
  ) => {
    const projectReady = Boolean(project?.path.trim())
    const nextBranch = projectReady
      ? (branch || project?.currentBranch || project?.branches[0] || 'main')
      : selectedBranch
    const nextRuntime = runtime || selectedRuntime
    newChatIntentRef.current = true
    pendingProjectSelectionRef.current = projectReady ? project : null
    setNewChatRequested(true)
    setSelectedSessionKey(null)
    setSelectedSessionEnvironmentId(null)
    setSelectedProjectPath(projectReady ? project!.path : '')
    setSelectedProjectEnvironmentId(projectReady ? (project!.environmentId || '') : '')
    setSelectedBranch(nextBranch)
    setSelectedRuntime(nextRuntime)
    saveSelectedChatSessionKey(null)
    if (options?.preserveDraft) {
      preserveNextNewChatDraftRef.current = true
    } else {
      clearChatComposerDraft()
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('session')
      next.delete('threadId')
      next.delete('environmentId')
      next.set('new', '1')
      if (projectReady) {
        setProjectRouteParamsIfReady(next, project!, { branch: nextBranch, runtime: nextRuntime })
      } else {
        next.delete('projectId')
        next.delete('cwd')
        next.delete('env')
        next.delete('branch')
        next.delete('runtime')
      }
      return next
    }, { replace: true })
  }, [clearChatComposerDraft, selectedBranch, selectedRuntime, setProjectRouteParamsIfReady, setSearchParams])

  const handleNewChat = () => {
    beginNewChatForProject(selectedProjectReady ? selectedProject : null, selectedBranch)
  }

  const handleNewProjectChat = (path: string, environmentId?: string | null) => {
    const project = findRealWorkspaceProjectByPath(path, environmentId)
    if (!project) return
    beginNewChatForProject(project)
  }

  const forkMessageAsNewChat = useCallback((message: ChatMessage) => {
    if (message.role !== 'user') return
    beginNewChatForProject(selectedProjectReady ? selectedProject : null, selectedBranch, undefined, { preserveDraft: true })
    useMessageAsPrompt(message)
    setComposerFocusSignal((current) => current + 1)
  }, [beginNewChatForProject, selectedBranch, selectedProject, selectedProjectReady, useMessageAsPrompt])

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (chatShortcutBlockedTarget(event.target)) return

      const key = event.key.toLowerCase()
      const commandModifier = event.metaKey || event.ctrlKey
      if (commandModifier && !event.altKey && key === 'n') {
        event.preventDefault()
        handleNewChat()
        setComposerFocusSignal((current) => current + 1)
        return
      }

      if (!commandModifier && !event.altKey && !event.shiftKey && event.key === '/') {
        event.preventDefault()
        if (!input.trim()) {
          setInput('/')
          replaceComposerDraftItem(draftStorageKeys.text, '/')
        }
        setComposerFocusSignal((current) => current + 1)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [draftStorageKeys.text, handleNewChat, input, setInput])

  const handleDeleteSession = (key: string, environmentId?: string | null) => {
    const mutationTarget = sessionMutationTarget(key, environmentId)
    const deletedSession = findSessionByRouteIdentity(sessions, key, environmentId)
    const previousSessionProjectRefs = sessionProjectRefs
    const previousSelectedSessionKey = selectedSessionKey
    const previousSelectedSessionEnvironmentId = selectedSessionEnvironmentId
    const previousNewChatRequested = newChatRequested
    const previousSearchParams = new URLSearchParams(searchParams)
    deleteMutation.mutate(mutationTarget, {
      onError: () => {
        setSessionProjectRefs(previousSessionProjectRefs)
        saveChatSessionProjectRefs(previousSessionProjectRefs)
        newChatIntentRef.current = previousNewChatRequested
        setSelectedSessionKey(previousSelectedSessionKey)
        setSelectedSessionEnvironmentId(previousSelectedSessionEnvironmentId)
        setNewChatRequested(previousNewChatRequested)
        saveSelectedChatSessionKey(previousSelectedSessionKey, previousSelectedSessionEnvironmentId)
        setSearchParams(previousSearchParams, { replace: true })
        showAttachmentStatus(`Chat deletion failed. Restored ${deletedSession?.label || 'the chat'}.`, 5000)
      },
    })
    setSessionProjectRefs((current) => {
      const next = removeChatSessionProjectRef(current, key, environmentId)
      if (next === current) return current
      saveChatSessionProjectRefs(next)
      return next
    })
    if (environmentId?.trim()) {
      const deletedScopeKey = sessionScopeKey(key, environmentId)
      const selectedScopeKey = selectedSessionKey
        ? sessionScopeKey(selectedSessionKey, selectedSessionEnvironmentId ?? selectedSession?.environmentId ?? threadEnvironmentParam)
        : ''
      const routeScopeKey = sessionParam
        ? sessionScopeKey(sessionParam, threadEnvironmentParam)
        : ''
      if (selectedScopeKey !== deletedScopeKey && routeScopeKey !== deletedScopeKey) return
    } else if (selectedSessionKey !== key && sessionParam !== key) {
      return
    }

    newChatIntentRef.current = true
    setNewChatRequested(true)
    setSelectedSessionKey(null)
    setSelectedSessionEnvironmentId(null)
    saveSelectedChatSessionKey(null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParamsIfReady(next, selectedProject, {
        branch: pendingBranchSelectionRef.current || selectedBranch,
        runtime: pendingRuntimeSelectionRef.current || selectedRuntime,
      })
      next.delete('session')
      next.delete('threadId')
      next.delete('environmentId')
      next.set('new', '1')
      return next
    }, { replace: true })
  }

  const openTerminal = (command?: string, title = 'Terminal', cwd = selectedProject.path) => {
    const resolvedCwd = selectedProjectReady ? (cwd.trim() || selectedProjectRealPath) : ''
    if (!resolvedCwd) return
    const requestedCommand = command?.trim() || undefined
    const terminalActive = terminalOpen && terminalStatus
      && ['starting', 'checking', 'connecting', 'connected', 'running'].includes(terminalStatus.status)
    if (terminalActive) {
      const existingCommand = terminalCommand?.trim() || undefined
      const sameTerminal = existingCommand === requestedCommand
        && terminalCwd === resolvedCwd
        && terminalTitle === title

      setTerminalOpen(true)
      if (sameTerminal) {
        setTerminalStatus({
          ...terminalStatus,
          displayText: terminalStatus.displayText === 'already running' ? terminalStatus.status : terminalStatus.displayText,
          error: null,
        })
      } else {
        setTerminalStatus({
          ...terminalStatus,
          displayText: 'already running',
          error: `Terminal is already running ${terminalTitle}. Stop it before starting ${title}.`,
        })
      }
      return
    }

    terminalLaunchCounterRef.current += 1
    const processId = `chat-${terminalProcessScope(selectedProject, selectedSessionKey)}-${terminalLaunchCounterRef.current}`
    setTerminalCommand(requestedCommand)
    setTerminalCwd(resolvedCwd)
    setTerminalProcessId(processId)
    setTerminalEnv(terminalProjectEnv({
      project: selectedProject,
      projectReady: selectedProjectReady,
      projectPath: selectedProjectRealPath,
      terminalCwd: resolvedCwd,
      sessionKey: selectedSessionKey,
      runtime: selectedRuntime,
      branch: selectedBranch,
    }))
    setTerminalTitle(title)
    setTerminalStatus({
      title,
      status: 'starting',
      displayText: 'starting',
      cwd: resolvedCwd,
      processId,
      error: null,
    })
    setTerminalOpen(true)
    setTerminalKey((value) => value + 1)
  }

  const handleProjectChange = (path: string, environmentId?: string | null) => {
    if (!path.trim()) {
      if (selectedSessionKey && !newChatRequested) {
        beginNewChatForProject(null)
        return
      }
      if (selectedProjectReady || selectedProjectPath.trim() || selectedProjectEnvironmentId.trim()) {
        clearChatComposerDraft()
      }
      setSelectedProjectPath('')
      setSelectedProjectEnvironmentId('')
      setSelectedBranch(FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0] || 'main')
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('projectId')
        next.delete('cwd')
        next.delete('env')
        next.delete('branch')
        next.delete('runtime')
        return next
      }, { replace: true })
      return
    }
    const nextProject = findRealWorkspaceProjectByPath(path, environmentId)
    if (!nextProject) {
      showAttachmentStatus('Project folder is no longer available. Add it again or select another project.', 5000)
      return
    }
    if (selectedSessionKey && !newChatRequested) {
      beginNewChatForProject(nextProject)
      return
    }
    if (
      normalizedProjectPath(nextProject.path) !== normalizedProjectPath(selectedProjectPath)
      || (nextProject.environmentId || '') !== (selectedProjectEnvironmentId || '')
    ) {
      clearChatComposerDraft()
    }
    setSelectedProjectPath(nextProject.path)
    setSelectedProjectEnvironmentId(nextProject.environmentId || '')
    const nextBranch = nextProject.currentBranch || nextProject.branches[0] || 'main'
    setSelectedBranch(nextBranch)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParamsIfReady(next, nextProject, {
        branch: pendingBranchSelectionRef.current || nextBranch,
        runtime: pendingRuntimeSelectionRef.current || selectedRuntime,
      })
      return next
    }, { replace: true })
  }

  useEffect(() => {
    if (!workspaceContextReady) return
    if (workspaceContextLoadFailed) return
    if (!(projectIdParam?.trim() || cwdParam?.trim())) return

    const lookupKey = routeProjectResolutionKey(projectIdParam, cwdParam, envParam)
    if (routeProjectClearedKeysRef.current.has(lookupKey)) return
    const existingRouteProject = findProjectByRouteIdentity(realWorkspaceProjects, projectIdParam, cwdParam, envParam)
    if (existingRouteProject) {
      routeProjectResolutionFailuresRef.current.delete(lookupKey)
      return
    }

    const requestedPath = routeEnvironmentAllowsLocalResolution(envParam)
      ? routeProjectPathCandidate(projectIdParam, cwdParam)
      : ''
    if (!requestedPath || routeProjectResolutionFailuresRef.current.has(lookupKey)) return
    const requestedEnvironmentId = envParam?.trim() || ''
    if (
      normalizedProjectPath(selectedProjectPath) !== normalizedProjectPath(requestedPath)
      || (selectedProjectEnvironmentId || '') !== requestedEnvironmentId
    ) {
      clearChatComposerDraft()
      setSelectedProjectPath(requestedPath)
      setSelectedProjectEnvironmentId(requestedEnvironmentId)
      setSelectedBranch(FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0] || 'main')
    }
    routeProjectResolutionActiveKeyRef.current = lookupKey
    if (routeProjectResolutionInFlightRef.current.has(lookupKey)) return

    routeProjectResolutionInFlightRef.current.add(lookupKey)
    addProjectToBackend(requestedPath)
      .then(({ project, projects }) => {
        if (routeProjectResolutionActiveKeyRef.current !== lookupKey) return
        if (routeProjectClearedKeysRef.current.has(lookupKey)) return
        routeProjectResolutionFailuresRef.current.delete(lookupKey)
        const syncedProjects = projects.length > 0 ? projects : [project]
        setAddedProjects((current) => {
          const next = pruneMigratedAddedProjects(current, syncedProjects)
          saveAddedProjects(next)
          return next
        })
        setWorkspaceContext((current) => mergeWorkspaceProjects(current, syncedProjects))

        const nextBranch = pendingBranchSelectionRef.current
          || (branchParam?.trim() && project.branches.includes(branchParam.trim())
            ? branchParam.trim()
            : (project.currentBranch || project.branches[0] || 'main'))
        const nextRuntime = pendingRuntimeSelectionRef.current
          || (runtimeParam?.trim() && workspaceContext.runtimeModes.includes(runtimeParam.trim())
            ? runtimeParam.trim()
            : selectedRuntime)
        if (selectedSessionKey && !newChatRequested) {
          beginNewChatForProject(project, nextBranch, nextRuntime)
          return
        }

        if (
          normalizedProjectPath(project.path) !== normalizedProjectPath(selectedProjectPath)
          || (project.environmentId || '') !== (selectedProjectEnvironmentId || '')
        ) {
          clearChatComposerDraft()
        }
        setSelectedProjectPath(project.path)
        setSelectedProjectEnvironmentId(project.environmentId || '')
        if (selectedBranch !== nextBranch) setSelectedBranch(nextBranch)
        if (selectedRuntime !== nextRuntime) setSelectedRuntime(nextRuntime)
      })
      .catch((error) => {
        if (routeProjectResolutionActiveKeyRef.current !== lookupKey) return
        if (routeProjectClearedKeysRef.current.has(lookupKey)) return
        routeProjectResolutionFailuresRef.current.add(lookupKey)
        console.warn('Failed to resolve route project folder:', error)
        if (
          normalizedProjectPath(selectedProjectPath) !== normalizedProjectPath(requestedPath)
          || (selectedProjectEnvironmentId || '') !== (envParam?.trim() || '')
        ) {
          clearChatComposerDraft()
        }
        setSelectedProjectPath(requestedPath)
        setSelectedProjectEnvironmentId(envParam?.trim() || '')
        setSelectedBranch(FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0] || 'main')
        showAttachmentStatus('Project folder is no longer available. Add it again or select another project.', 5000)
      })
      .finally(() => {
        routeProjectResolutionInFlightRef.current.delete(lookupKey)
      })

    return () => {
      if (routeProjectResolutionActiveKeyRef.current === lookupKey) {
        routeProjectResolutionActiveKeyRef.current = ''
      }
    }
  }, [
    beginNewChatForProject,
    branchParam,
    clearChatComposerDraft,
    cwdParam,
    envParam,
    newChatRequested,
    projectIdParam,
    realWorkspaceProjects,
    runtimeParam,
    selectedBranch,
    selectedProjectEnvironmentId,
    selectedProjectPath,
    selectedRuntime,
    selectedSessionKey,
    setSearchParams,
    showAttachmentStatus,
    workspaceContext.runtimeModes,
    workspaceContextLoadFailed,
    workspaceContextReady,
  ])

  useLayoutEffect(() => {
    if (!workspaceContextReady) return
    if (workspaceContextLoadFailed) return
    const selectedSessionProject = selectedSession && !newChatRequested
      ? findProjectForSession(realWorkspaceProjects, selectedSession)
      : null
    if (
      selectedSessionKey
      && unscopedSessionSelectionKeyRef.current === selectedSessionKey
      && selectedSession
      && !newChatRequested
      && !selectedSessionProject
    ) {
      if (selectedProjectPath.trim() || selectedProjectEnvironmentId.trim()) {
        setSelectedProjectPath('')
        setSelectedProjectEnvironmentId('')
      }
      return
    }
    if (!(projectIdParam?.trim() || cwdParam?.trim())) return

    const routeProject = findProjectByRouteIdentity(realWorkspaceProjects, projectIdParam, cwdParam, envParam)
    const lookupKey = routeProjectResolutionKey(projectIdParam, cwdParam, envParam)
    if (routeProjectClearedKeysRef.current.has(lookupKey)) return
    const pendingProjectSelection = pendingProjectSelectionRef.current
    if (
      newChatIntentRef.current
      && pendingProjectSelection
      && (projectIdParam?.trim() || cwdParam?.trim())
      && !findProjectByRouteIdentity([pendingProjectSelection], projectIdParam, cwdParam, envParam)
    ) {
      return
    }
    if (!routeProject) {
      if (
        routeEnvironmentAllowsLocalResolution(envParam)
        && routeProjectPathCandidate(projectIdParam, cwdParam)
        && !routeProjectResolutionFailuresRef.current.has(lookupKey)
      ) {
        return
      }
      const requestedPath = routeProjectPathCandidate(projectIdParam, cwdParam)
      if (requestedPath) {
        const requestedEnvironmentId = envParam?.trim() || ''
        const selectionChanged = normalizedProjectPath(selectedProjectPath) !== normalizedProjectPath(requestedPath)
          || (selectedProjectEnvironmentId || '') !== requestedEnvironmentId
        if (selectionChanged) {
          clearChatComposerDraft()
          setSelectedProjectPath(requestedPath)
          setSelectedProjectEnvironmentId(requestedEnvironmentId)
          showAttachmentStatus('Project folder is no longer available. Add it again or select another project.', 5000)
        }
        setSelectedBranch(FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0] || 'main')
        const samePathProjectExists = realWorkspaceProjects.some((project) => (
          normalizedProjectPath(project.path) === normalizedProjectPath(requestedPath)
        ))
        if (samePathProjectExists) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete('projectId')
            next.delete('cwd')
            next.delete('env')
            next.delete('branch')
            next.delete('runtime')
            return next
          }, { replace: true })
        }
        return
      }
      if (selectedProjectPath.trim() || selectedProjectEnvironmentId.trim()) {
        clearChatComposerDraft()
      }
      setSelectedProjectPath('')
      setSelectedProjectEnvironmentId('')
      setSelectedBranch(FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0] || 'main')
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('projectId')
        next.delete('cwd')
        next.delete('env')
        next.delete('branch')
        next.delete('runtime')
        return next
      }, { replace: true })
      showAttachmentStatus('Project folder is no longer available. Add it again or select another project.', 5000)
      return
    }

    const nextBranch = pendingBranchSelectionRef.current
      || (branchParam?.trim() && routeProject.branches.includes(branchParam.trim())
        ? branchParam.trim()
        : (routeProject.currentBranch || routeProject.branches[0] || 'main'))
    const nextRuntime = pendingRuntimeSelectionRef.current
      || (runtimeParam?.trim() && workspaceContext.runtimeModes.includes(runtimeParam.trim())
        ? runtimeParam.trim()
        : selectedRuntime)
    const projectChanged = normalizedProjectPath(routeProject.path) !== normalizedProjectPath(selectedProjectPath)
      || (routeProject.environmentId || '') !== (selectedProjectEnvironmentId || '')

    if (newChatIntentRef.current && selectedProjectReady && projectChanged) {
      return
    }
    if (selectedSessionKey && !newChatRequested && projectChanged) {
      beginNewChatForProject(routeProject, nextBranch, nextRuntime)
      return
    }
    if (projectChanged) {
      clearChatComposerDraft()
      setSelectedProjectPath(routeProject.path)
      setSelectedProjectEnvironmentId(routeProject.environmentId || '')
    }
    if (selectedBranch !== nextBranch) setSelectedBranch(nextBranch)
    if (selectedRuntime !== nextRuntime) setSelectedRuntime(nextRuntime)
  }, [
    beginNewChatForProject,
    branchParam,
    clearChatComposerDraft,
    cwdParam,
    envParam,
    newChatRequested,
    projectIdParam,
    realWorkspaceProjects,
    runtimeParam,
    selectedBranch,
    selectedSession,
    selectedSessionKey,
    selectedProjectEnvironmentId,
    selectedProjectPath,
    selectedRuntime,
    setSearchParams,
    showAttachmentStatus,
    workspaceContext.runtimeModes,
    workspaceContextLoadFailed,
    workspaceContextReady,
  ])

  const addProjectFromPath = async (selectedPath: string | null): Promise<boolean> => {
    const projectPath = sanitizeProjectPathInput(selectedPath || '')
    if (!projectPath) return false
    let project: ChatWorkspaceProject
    let backendProjects: ChatWorkspaceProject[] | null = null
    try {
      const result = await addProjectToBackend(projectPath)
      project = result.project
      backendProjects = result.projects
    } catch (error) {
      console.warn('Failed to persist selected project through backend:', error)
      if (!window.__TAURI_INTERNALS__) {
        setProjectDialogError(error instanceof Error ? error.message : 'Unable to add that project folder.')
        return false
      }
      try {
        project = await resolveProjectFromPath(projectPath)
      } catch (resolveError) {
        console.warn('Failed to resolve selected project folder:', resolveError)
        setProjectDialogError(resolveError instanceof Error ? resolveError.message : 'Unable to add that project folder.')
        return false
      }
    }
    setProjectDialogError(null)
    setWorkspaceContextLoadFailed(false)
    rememberProjectPickerDirectory(project.path)
    const replacingSavedSession = Boolean(selectedSessionKey && !newChatRequested)
    if (replacingSavedSession) {
      newChatIntentRef.current = true
    }
    const projectPathKey = normalizedProjectPath(project.path)
    const syncedBackendProjects = backendProjects && backendProjects.length > 0
      ? backendProjects
      : null
    if (syncedBackendProjects) {
      setAddedProjects((current) => {
        const next = pruneMigratedAddedProjects(current, syncedBackendProjects)
        saveAddedProjects(next)
        return next
      })
      setWorkspaceContext((current) => mergeWorkspaceProjects(current, syncedBackendProjects))
    } else {
      setAddedProjects((current) => {
        const next = current.some((candidate) => sameProjectRecord(candidate, project))
          ? current.map((candidate) => (sameProjectRecord(candidate, project) ? project : candidate))
          : [...current, project]
        saveAddedProjects(next)
        return next
      })
      setWorkspaceContext((current) => mergeWorkspaceProjects(current, [project]))
    }
    if (
      projectPathKey !== normalizedProjectPath(selectedProjectPath)
      || (project.environmentId || '') !== (selectedProjectEnvironmentId || '')
    ) {
      clearChatComposerDraft()
    }
    setSelectedProjectPath(project.path)
    setSelectedProjectEnvironmentId(project.environmentId || '')
    const routeBranch = branchParam?.trim()
    const routeBranchMatchesAddedProject = normalizedProjectPath(project.path) === normalizedProjectPath(selectedProjectPath)
    const nextBranch = routeBranchMatchesAddedProject && routeBranch && project.branches.includes(routeBranch)
      ? routeBranch
      : (project.currentBranch || project.branches[0] || 'main')
    if (replacingSavedSession) {
      beginNewChatForProject(project, nextBranch)
      return true
    }
    setSelectedBranch(nextBranch)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParamsIfReady(next, project, { branch: nextBranch, runtime: selectedRuntime })
      return next
    }, { replace: true })
    return true
  }

  const addProjectsFromPaths = async (selectedPaths: readonly string[]): Promise<boolean> => {
    const paths = normalizedProjectPickerPaths([...selectedPaths])
    if (paths.length === 0) return false

    let addedCount = 0
    let failedCount = 0
    for (const path of paths) {
      const added = await addProjectFromPath(path)
      if (added) {
        addedCount += 1
      } else {
        failedCount += 1
      }
    }
    if (failedCount > 0 && addedCount > 0) {
      showAttachmentStatus(
        `Added ${addedCount} project folder${addedCount === 1 ? '' : 's'}; ${failedCount} selected folder${failedCount === 1 ? '' : 's'} could not be added.`,
        5000,
      )
    }
    return addedCount > 0
  }

  const openProjectFolderPicker = async (preferredProjectPath?: string | null): Promise<string[] | null | undefined> => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: true,
        multiple: true,
        title: 'Add project',
        defaultPath: projectPickerDefaultPath({
          preferredProjectPath,
          selectedProjectPath,
          projects: workspaceContext.projects,
        }),
      })
      const selectedPaths = normalizedProjectPickerPaths(selected)
      if (selectedPaths?.length) rememberProjectPickerDirectory(selectedPaths[selectedPaths.length - 1])
      return selectedPaths
    } catch (error) {
      console.warn('Failed to open project picker:', error)
      return undefined
    }
  }

  const handleAddProject = async (suggestedPath?: unknown) => {
    if (projectDialogSubmittingRef.current) return
    const requestedPath = typeof suggestedPath === 'string'
      ? sanitizeProjectPathInput(suggestedPath)
      : ''
    const requestedPaths = requestedPath ? normalizedProjectPickerPaths(requestedPath) : []
    if (window.__TAURI_INTERNALS__) {
      projectDialogSubmittingRef.current = true
      setProjectDialogSubmitting(true)
      try {
        const selectedPaths = requestedPaths.length > 0
          ? requestedPaths
          : await openProjectFolderPicker()
        if (selectedPaths === undefined) {
          setProjectDialogMode('add')
          setProjectDialogTargetPath(null)
          setProjectDialogTargetEnvironmentId(null)
          setProjectDialogDraft(requestedPath)
          setProjectDialogError(null)
          return
        }
        if (!selectedPaths?.length) return
        const added = await addProjectsFromPaths(selectedPaths)
        if (!added) {
          setProjectDialogMode('add')
          setProjectDialogTargetPath(null)
          setProjectDialogTargetEnvironmentId(null)
          setProjectDialogDraft(selectedPaths[0] ?? '')
          setProjectDialogError('Unable to add the selected project folder. Check the path or choose another folder.')
        }
      } finally {
        projectDialogSubmittingRef.current = false
        setProjectDialogSubmitting(false)
      }
      return
    }

    setProjectDialogMode('add')
    setProjectDialogTargetPath(null)
    setProjectDialogTargetEnvironmentId(null)
    setProjectDialogDraft(requestedPath)
    setProjectDialogError(null)
    setProjectDialogSubmitting(false)
    projectDialogSubmittingRef.current = false
  }

  useEffect(() => {
    if (addProjectParam === null) return
    const requestedPath = addProjectParam.trim() && addProjectParam !== '1'
      ? addProjectParam
      : (cwdParam?.trim() || '')
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('addProject')
      return next
    }, { replace: true })
    void handleAddProject(requestedPath)
  }, [addProjectParam, cwdParam, handleAddProject, setSearchParams])

  const browseProjectFromDialog = async () => {
    if (!window.__TAURI_INTERNALS__ || projectDialogSubmittingRef.current) return
    projectDialogSubmittingRef.current = true
    setProjectDialogSubmitting(true)
    setProjectDialogError(null)
    try {
      const selectedPaths = await openProjectFolderPicker(projectDialogDraft)
      if (selectedPaths === undefined) {
        setProjectDialogError('Unable to open the folder picker. Enter a project path manually.')
        return
      }
      if (!selectedPaths?.length) return
      setProjectDialogDraft(selectedPaths[0])
      const added = await addProjectsFromPaths(selectedPaths)
      if (added) closeProjectDialog()
    } finally {
      projectDialogSubmittingRef.current = false
      setProjectDialogSubmitting(false)
    }
  }

  const handleAddProjectFromEnvironment = (suggestedPath?: string) => {
    setEnvironmentDialogOpen(false)
    void handleAddProject(suggestedPath)
  }

  const mirrorAddedProject = (project: ChatWorkspaceProject) => {
    setAddedProjects((current) => {
      const next = current.some((candidate) => sameProjectRecord(candidate, project))
        ? current.map((candidate) => (sameProjectRecord(candidate, project) ? project : candidate))
        : [...current, project]
      saveAddedProjects(next)
      return next
    })
  }

  const forgetAddedProject = (project: ChatWorkspaceProject) => {
    setAddedProjects((current) => {
      const next = current.filter((candidate) => !sameProjectRecord(candidate, project))
      saveAddedProjects(next)
      return next
    })
  }

  const persistProjectPatch = (
    project: ChatWorkspaceProject,
    patch: Partial<Pick<ChatWorkspaceProject, 'name' | 'machineLabel' | 'scripts' | 'groupingOverride'>>,
  ) => {
    const previousContext = workspaceContext
    const previousAddedProjects = loadAddedProjects()
    const optimisticProject = normalizeWorkspaceProject({ ...project, ...patch })
    setWorkspaceContext((current) => replaceWorkspaceProject(current, optimisticProject))
    mirrorAddedProject(optimisticProject)
    updateProjectInBackend(project, patch)
      .then(({ project: updatedProject, projects }) => {
        setWorkspaceContext((current) => replaceWorkspaceProject(current, updatedProject))
        setWorkspaceContext((current) => mergeWorkspaceProjects(current, projects))
        setAddedProjects((current) => {
          const next = pruneMigratedAddedProjects(current, projects)
          saveAddedProjects(next)
          return next
        })
      })
      .catch((error) => {
        console.warn('Failed to persist project update through backend:', error)
        setWorkspaceContext(previousContext)
        setAddedProjects(previousAddedProjects)
        saveAddedProjects(previousAddedProjects)
        showAttachmentStatus(`Project update failed. Restored ${project.name || 'the project'} in the chat workspace.`, 5000)
      })
  }

  const handleRenameProject = (path: string, environmentId?: string | null) => {
    const project = findWorkspaceProjectByPath(path, environmentId)
    if (!project) return
    setProjectDialogMode('rename')
    setProjectDialogTargetPath(project.path)
    setProjectDialogTargetEnvironmentId(project.environmentId || null)
    setProjectDialogDraft(project.name)
    setProjectDialogError(null)
    setProjectDialogSubmitting(false)
    projectDialogSubmittingRef.current = false
  }

  const closeProjectDialog = () => {
    projectDialogSubmittingRef.current = false
    setProjectDialogSubmitting(false)
    setProjectDialogMode(null)
    setProjectDialogTargetPath(null)
    setProjectDialogTargetEnvironmentId(null)
    setProjectDialogDraft('')
    setProjectDialogError(null)
  }

  const submitProjectDialog = () => {
    if (projectDialogSubmittingRef.current) return
    if (!projectDialogMode) return
    const value = projectDialogDraft.trim()
    if (projectDialogMode === 'add') {
      if (!value) return
      const projectPaths = normalizedProjectPickerPaths(value)
      if (projectPaths.length === 0) return
      projectDialogSubmittingRef.current = true
      setProjectDialogSubmitting(true)
      setProjectDialogError(null)
      void addProjectsFromPaths(projectPaths).then((added) => {
        if (added) closeProjectDialog()
      }).finally(() => {
        projectDialogSubmittingRef.current = false
        setProjectDialogSubmitting(false)
      })
      return
    }

    const project = projectDialogTargetPath ? findWorkspaceProjectByPath(projectDialogTargetPath, projectDialogTargetEnvironmentId) : null
    if (projectDialogMode === 'delete') {
      const fallbackProject = project ?? (
        projectDialogTargetPath
          ? unavailableProjectFromPath(
            projectDialogTargetPath,
            projectDialogTargetEnvironmentId,
            projectDialogDraft,
          )
          : null
      )
      if (!fallbackProject) {
        closeProjectDialog()
        return
      }
      closeProjectDialog()
      confirmRemoveProject(fallbackProject, { treatAsSelected: !project })
      return
    }

    if (!value) return
    if (!project || value === project.name) {
      closeProjectDialog()
      return
    }
    closeProjectDialog()
    persistProjectPatch(project, { name: value })
  }

  const handleProjectGroupingOverride = (path: string, value: string, environmentId?: string | null) => {
    const project = findWorkspaceProjectByPath(path, environmentId)
    if (!project) return
    const groupingOverride = value === 'repository' || value === 'repository-path' || value === 'separate'
      ? value
      : null
    persistProjectPatch(project, { groupingOverride })
  }

  const handleRemoveProject = (path: string, environmentId?: string | null) => {
    const project = findWorkspaceProjectByPath(path, environmentId)
    if (!project) return
    setProjectDialogMode('delete')
    setProjectDialogTargetPath(project.path)
    setProjectDialogTargetEnvironmentId(project.environmentId || null)
    setProjectDialogDraft(project.name)
    setProjectDialogError(null)
    setProjectDialogSubmitting(false)
    projectDialogSubmittingRef.current = false
  }

  const confirmRemoveProject = (
    project: ChatWorkspaceProject,
    options: { treatAsSelected?: boolean } = {},
  ) => {
    const previousContext = workspaceContext
    const previousAddedProjects = loadAddedProjects()
    const projectWasLocalFallback = previousAddedProjects.some((candidate) => sameProjectRecord(candidate, project))
    const previousSessionProjectRefs = sessionProjectRefs
    const previousScriptStore = projectScriptStore
    const previousPreferredScriptStore = loadProjectPreferredScriptStore()
    const projectWasSelected = options.treatAsSelected || (selectedProjectReady && sameProjectRecord(selectedProject, project))
    const previousBranch = selectedBranch
    const previousRuntime = selectedRuntime
    const nextContext = removeWorkspaceProject(workspaceContext, project)
    forgetAddedProject(project)
    setWorkspaceContext(nextContext)
    setProjectScriptStore((current) => {
      const next = pruneProjectScriptStoreForProject(current, project)
      if (Object.keys(next).length === Object.keys(current).length) return current
      saveProjectScriptStore(next)
      return next
    })
    saveProjectPreferredScriptStore(pruneProjectPreferredScriptStoreForProject(previousPreferredScriptStore, project))
    setSessionProjectRefs((current) => {
      const next = pruneSessionProjectRefsForProject(current, project)
      if (next === current || Object.keys(next).length === Object.keys(current).length) return current
      saveChatSessionProjectRefs(next)
      return next
    })
    if (projectWasSelected) {
      const currentRouteKey = (projectIdParam?.trim() || cwdParam?.trim())
        ? routeProjectResolutionKey(projectIdParam, cwdParam, envParam)
        : ''
      if (currentRouteKey) {
        routeProjectClearedKeysRef.current.add(currentRouteKey)
        routeProjectResolutionFailuresRef.current.add(currentRouteKey)
        if (routeProjectResolutionActiveKeyRef.current === currentRouteKey) {
          routeProjectResolutionActiveKeyRef.current = ''
        }
      }
      clearChatComposerDraft()
      setSelectedProjectPath('')
      setSelectedProjectEnvironmentId('')
      saveStoredValue(CHAT_SELECTED_PROJECT_PATH_KEY, '')
      saveStoredValue(CHAT_SELECTED_PROJECT_ENVIRONMENT_KEY, '')
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('projectId')
        next.delete('cwd')
        next.delete('env')
        next.delete('branch')
        next.delete('runtime')
        return next
      }, { replace: true })
    }
    removeProjectFromBackend(project)
      .then((storedProjects) => {
        setAddedProjects((current) => {
          const next = pruneMigratedAddedProjects(current, storedProjects)
          saveAddedProjects(next)
          return next
        })
        setWorkspaceContext((current) => mergeWorkspaceProjects(current, storedProjects))
      })
      .catch((error) => {
        if ((options.treatAsSelected || projectWasLocalFallback) && isWorkspaceProjectNotFoundError(error)) {
          showAttachmentStatus(`Removed stale project entry ${project.name || 'from the chat workspace'}.`, 5000)
          return
        }
        console.warn('Failed to remove project through backend:', error)
        setWorkspaceContext(previousContext)
        setAddedProjects(previousAddedProjects)
        saveAddedProjects(previousAddedProjects)
        setProjectScriptStore(previousScriptStore)
        saveProjectScriptStore(previousScriptStore)
        saveProjectPreferredScriptStore(previousPreferredScriptStore)
        setSessionProjectRefs(previousSessionProjectRefs)
        saveChatSessionProjectRefs(previousSessionProjectRefs)
        if (projectWasSelected) {
          const restoredRouteKey = (projectIdParam?.trim() || cwdParam?.trim())
            ? routeProjectResolutionKey(projectIdParam, cwdParam, envParam)
            : ''
          if (restoredRouteKey) {
            routeProjectClearedKeysRef.current.delete(restoredRouteKey)
            routeProjectResolutionFailuresRef.current.delete(restoredRouteKey)
          }
          setSelectedProjectPath(project.path)
          setSelectedProjectEnvironmentId(project.environmentId || '')
          setSelectedBranch(previousBranch)
          setSelectedRuntime(previousRuntime)
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            setProjectRouteParamsIfReady(next, project, {
              branch: previousBranch,
              runtime: previousRuntime,
            })
            return next
          }, { replace: true })
        }
        showAttachmentStatus(`Project removal failed. Restored ${project.name || 'the project'} in the chat workspace.`, 5000)
      })
  }

  const handleRemoveUnavailableSelectedProject = () => {
    const path = selectedProjectPath.trim()
    if (!path) return
    const project = unavailableProjectFromPath(path, selectedProjectEnvironmentId)
    setProjectDialogMode('delete')
    setProjectDialogTargetPath(project.path)
    setProjectDialogTargetEnvironmentId(project.environmentId || null)
    setProjectDialogDraft(project.name)
    setProjectDialogError(null)
    setProjectDialogSubmitting(false)
    projectDialogSubmittingRef.current = false
  }

  const handleRuntimeChange = (value: string) => {
    if (!workspaceContext.runtimeModes.includes(value)) return
    pendingRuntimeSelectionRef.current = value
    selectedRuntimeRef.current = value
    setSelectedRuntime(value)
    if (!selectedProjectReady) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParamsIfReady(next, selectedProject, {
        branch: pendingBranchSelectionRef.current || selectedBranchRef.current,
        runtime: value,
      })
      return next
    }, { replace: true })
  }

  const handleBranchChange = (value: string) => {
    pendingBranchSelectionRef.current = value
    selectedBranchRef.current = value
    setSelectedBranch(value)
    if (!selectedProjectReady) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParamsIfReady(next, selectedProject, {
        branch: value,
        runtime: pendingRuntimeSelectionRef.current || selectedRuntimeRef.current,
      })
      return next
    }, { replace: true })
  }

  const saveScriptsForSelectedProject = (updater: (scripts: ChatProjectScript[]) => ChatProjectScript[]) => {
    const keys = projectScriptWriteStorageKeys(selectedProject)
    const nextScriptsForBackend = updater(activeProjectScripts)
    const previousScriptStore = projectScriptStore
    const previousPreferredScriptStore = loadProjectPreferredScriptStore()
    const previousSelectedScriptId = selectedScriptId
    const previousContext = workspaceContext
    setProjectScriptStore((current) => {
      const next = { ...current }
      for (const key of keys) {
        next[key] = nextScriptsForBackend
      }
      saveProjectScriptStore(next)
      return next
    })
    const optimisticProject = normalizeWorkspaceProject({ ...selectedProject, scripts: nextScriptsForBackend })
    setWorkspaceContext((current) => replaceWorkspaceProject(current, optimisticProject))
    updateProjectInBackend(selectedProject, { scripts: nextScriptsForBackend })
      .then(({ project, projects }) => {
        setWorkspaceContext((current) => replaceWorkspaceProject(current, project))
        setWorkspaceContext((current) => mergeWorkspaceProjects(current, projects))
      })
      .catch((error) => {
        console.warn('Failed to persist project scripts through backend:', error)
        setProjectScriptStore(previousScriptStore)
        saveProjectScriptStore(previousScriptStore)
        saveProjectPreferredScriptStore(previousPreferredScriptStore)
        setSelectedScriptId(previousSelectedScriptId)
        setWorkspaceContext(previousContext)
        showAttachmentStatus(`Project action update failed. Restored actions for ${selectedProject.name || 'the selected project'}.`, 5000)
      })
  }

  const handleAddProjectScript = () => {
    setScriptDraft({ name: '', command: '', cwd: '', icon: 'play', keybinding: '', runOnWorktreeCreate: false })
    setScriptDialogMode('add')
  }

  const handleEditProjectScript = (script: ChatProjectScript) => {
    setScriptDraft({
      name: script.name,
      command: script.command,
      cwd: script.cwd || '',
      icon: script.icon || 'play',
      keybinding: script.keybinding || '',
      runOnWorktreeCreate: Boolean(script.runOnWorktreeCreate),
    })
    setScriptDialogMode('edit')
  }

  const handleDeleteProjectScript = (script: ChatProjectScript) => {
    const remainingScripts = activeProjectScripts.filter((candidate) => candidate.id !== script.id)
    saveScriptsForSelectedProject(() => remainingScripts)
    if (selectedScriptId === script.id) {
      const nextScript = remainingScripts.find((candidate) => !candidate.runOnWorktreeCreate)
        ?? remainingScripts[0]
        ?? null
      selectProjectScript(nextScript?.id ?? '')
    }
  }

  const saveProjectScriptDraft = () => {
    const name = scriptDraft.name.trim()
    const command = scriptDraft.command.trim()
    if (!name || !command) return
    const cwd = scriptDraft.cwd?.trim() || undefined
    const icon = typeof scriptDraft.icon === 'string' && scriptDraft.icon.trim()
      ? scriptDraft.icon.trim() as T3ProjectScriptIcon
      : 'play'
    const keybinding = scriptDraft.keybinding?.trim() || undefined

    if (scriptDialogMode === 'add') {
      const nextId = nextProjectScriptId(name, activeProjectScripts.map((script) => script.id))
      saveScriptsForSelectedProject((current) => [
        ...current,
        {
          id: nextId,
          name,
          command,
          cwd,
          icon,
          keybinding,
          runOnWorktreeCreate: scriptDraft.runOnWorktreeCreate,
        },
      ])
      selectProjectScript(nextId)
    } else if (scriptDialogMode === 'edit' && selectedProjectScript) {
      saveScriptsForSelectedProject((current) => (
        current.map((candidate) => (
          candidate.id === selectedProjectScript.id
            ? {
                ...candidate,
                name,
                command,
                cwd,
                icon,
                keybinding,
                runOnWorktreeCreate: scriptDraft.runOnWorktreeCreate,
              }
            : candidate
        ))
      ))
    }
    setScriptDialogMode(null)
  }

  useEffect(() => {
    if (!selectedSessionKey || !selectedSession) return
    if (!isRepairableSessionLabel(selectedSession.label)) return
    if (renameMutation.isPending) return
    const selectedScopeKey = sessionScopeKey(selectedSessionKey, selectedSession.environmentId ?? selectedSessionEnvironmentId)
    if (autoRenameAttemptedRef.current.has(selectedScopeKey)) return

    const title = deriveSessionTitle(messages)
    if (!title || title === selectedSession.label) return

    autoRenameAttemptedRef.current.add(selectedScopeKey)
    const environment = (selectedSession.environmentId ?? selectedSessionEnvironmentId)?.trim()
    renameMutation.mutate(environment
      ? { key: selectedSessionKey, label: title, environmentId: environment }
      : { key: selectedSessionKey, label: title })
  }, [messages, renameMutation, selectedSession, selectedSessionEnvironmentId, selectedSessionKey])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('textarea,input,select,[contenteditable="true"]')) return

      let deltaY = event.deltaY
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 32
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= scroller.clientHeight
      if (deltaY === 0) return

      event.preventDefault()
      event.stopImmediatePropagation()

      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      const step = Math.sign(deltaY) * Math.min(Math.abs(deltaY), 180)
      scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + step))
      setAtBottomRefOnly(max - scroller.scrollTop < 80)
    }

    document.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      document.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [scrollRef, setAtBottomRefOnly])

  const projectTerminalStatus: ProjectScriptStatusSnapshot | null = terminalStatus
    ? {
        ...terminalStatus,
        status: terminalStatus.error
          ? 'error'
          : terminalStatus.status === 'connecting'
            || terminalStatus.status === 'running'
            || terminalStatus.status === 'exited'
              ? terminalStatus.status
              : 'exited',
        cwd: terminalStatus.cwd ?? undefined,
        error: terminalStatus.error ?? null,
      }
    : null
  const projectDialogTargetProject = projectDialogTargetPath
    ? findWorkspaceProjectByPath(projectDialogTargetPath, projectDialogTargetEnvironmentId)
    : null
  const projectDialogEnvironmentLabel = projectEnvironmentDisplayLabel(projectDialogTargetProject)
    ?? (projectDialogTargetEnvironmentId
      ? visibleProjectEnvironmentLabel(projectDialogTargetEnvironmentId, projectDialogTargetEnvironmentId)
      : undefined)

  return (
    <div className="chat-shell" style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      overflow: 'hidden',
      overscrollBehavior: 'contain',
      margin: '-20px -28px',
    }}>
      <aside
        className="chat-sidebar-frame"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        style={{
          width: sidebarCollapsed ? 56 : 252,
          minWidth: sidebarCollapsed ? 56 : 232,
          maxWidth: sidebarCollapsed ? 56 : 280,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.22s var(--ease-spring), min-width 0.22s var(--ease-spring), max-width 0.22s var(--ease-spring)',
        }}
      >
        {sidebarCollapsed ? (
          <ChatSidebarCollapsed
            onExpand={() => setCollapsed(false)}
          />
        ) : (
          <ProjectSidebar
            sessions={sessions}
            sessionsAvailable={sessionsAvailable}
            sessionsLoading={sessionsLoading}
            selectedSessionKey={selectedSessionKey}
            selectedSessionEnvironmentId={selectedSessionEnvironmentId ?? selectedSession?.environmentId ?? threadEnvironmentParam}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onCollapse={() => setCollapsed(true)}
            onRenameSession={(key, label, environmentId) => {
              const environment = environmentId?.trim()
              renameMutation.mutate(environment ? { key, label, environmentId: environment } : { key, label })
            }}
            onDeleteSession={handleDeleteSession}
            onPinSession={(key, pinned, environmentId) => {
              const environment = environmentId?.trim()
              pinMutation.mutate(environment ? { key, pinned, environmentId: environment } : { key, pinned })
            }}
            onCompactSession={(key, environmentId) => compactMutation.mutate(sessionMutationTarget(key, environmentId))}
            compactingSessionKey={
              compactMutation.isPending
                ? typeof compactMutation.variables === 'string'
                  ? compactMutation.variables
                  : compactMutation.variables?.key
                    ? sessionScopeKey(compactMutation.variables.key, compactMutation.variables.environmentId)
                    : null
                : null
            }
            projects={realWorkspaceProjects}
            selectedPath={selectedProjectPath}
            selectedEnvironmentId={selectedProjectEnvironmentId}
            onSelectProject={handleProjectChange}
            onNewProjectChat={handleNewProjectChat}
            onAddProject={handleAddProject}
            addProjectPending={projectDialogSubmitting}
            onRenameProject={handleRenameProject}
            onProjectGroupingOverride={handleProjectGroupingOverride}
            onRemoveProject={handleRemoveProject}
          />
        )}
      </aside>

      <main className="chat-main" style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '20px 28px',
      }}
      onDrop={onDrop}
      onDragOver={event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}>
        {/* Header bar: title + model selector + connection status */}
        <div className="chat-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 12, gap: 16 }}>
          <div className="chat-page-title" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <h1 style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.2,
                fontWeight: 700,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {chatTitle}
              </h1>
            </div>
            <div style={{
              marginTop: 3,
              fontSize: 12,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {chatSubtitle}
            </div>
            {_demo && <DemoBadge />}
          </div>

          <div className="chat-page-header-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0, flexWrap: 'nowrap' }}>
            <ChatInput.Header
              model={model} setModel={setModel} models={visibleModels.length > 0 ? visibleModels : (modelsData?.models ?? [])}
              provider={provider} setProvider={setProvider} providers={providers}
              agentLabel={modelsData?.agentLabel}
              connected={connected} wsConnected={wsConnected}
              historyIsError={historyIsError} isDemo={_demo}
            />
            <ProjectScriptsControl
              preferredScriptId={selectedProjectScript?.id}
              scripts={activeProjectScripts.map(toT3ProjectScript)}
              projectReady={selectedProjectReady}
              projectName={selectedProjectReady
                ? selectedProject.name
                : selectedProjectPath.trim()
                  ? 'Selected folder unavailable'
                  : undefined}
              projectPath={selectedProjectReady ? selectedProjectRealPath : selectedProjectPath || undefined}
              projectEnvironmentLabel={selectedProjectReady
                ? projectEnvironmentDisplayLabel(selectedProject)
                : selectedProjectEnvironmentId || undefined}
              projectUnavailableLabel={selectedProjectPath.trim() ? 'Selected folder unavailable' : 'Select project'}
              onSelectScript={selectProjectScript}
              onOpenTerminal={() => openTerminal()}
              onRunScript={(script) => {
                const sourceScript = activeProjectScripts.find((candidate) => candidate.id === script.id)
                  ?? selectedProjectScript
                if (!sourceScript) return
                selectProjectScript(sourceScript.id)
                openTerminal(
                  sourceScript.command,
                  sourceScript.name,
                  resolveScriptCwd(selectedProject, sourceScript),
                )
              }}
              onAddScript={handleAddProjectScript}
              onEditScript={(script) => {
                const sourceScript = activeProjectScripts.find((candidate) => candidate.id === script.id)
                  ?? selectedProjectScript
                if (!sourceScript) return
                handleEditProjectScript(sourceScript)
              }}
              onDeleteScript={(script) => {
                const sourceScript = activeProjectScripts.find((candidate) => candidate.id === script.id)
                  ?? selectedProjectScript
                if (!sourceScript) return
                handleDeleteProjectScript(sourceScript)
              }}
              onRenameProject={selectedProjectReady
                ? () => handleRenameProject(selectedProject.path, selectedProject.environmentId)
                : undefined}
              onDeleteProject={selectedProjectReady
                ? () => handleRemoveProject(selectedProject.path, selectedProject.environmentId)
                : selectedProjectPath.trim()
                  ? handleRemoveUnavailableSelectedProject
                  : undefined}
              onAddProject={selectedProjectPath.trim()
                ? () => void handleAddProject(selectedProjectPath)
                : undefined}
              onClearProject={() => handleProjectChange('')}
              onChangeEnvironment={() => setEnvironmentDialogOpen(true)}
              onOpenReview={() => setActivePanel((current) => current === 'review' ? null : 'review')}
              onOpenInfo={() => setActivePanel((current) => current === 'info' ? null : 'info')}
              terminalStatus={projectTerminalStatus}
            />
          </div>
        </div>

        <ChatProjectScopeStrip
          projectReady={selectedProjectReady}
          projectName={selectedProjectReady ? selectedProject.name : null}
          projectPath={selectedProjectReady ? selectedProjectRealPath : selectedProjectPath}
          environmentLabel={selectedProjectReady
            ? projectEnvironmentDisplayLabel(selectedProject)
            : selectedProjectEnvironmentId}
          runtime={selectedRuntime}
          branch={selectedBranch}
          onAddProject={() => void handleAddProject(selectedProjectPath)}
          onManageProject={() => setEnvironmentDialogOpen(true)}
          onClearProject={() => handleProjectChange('')}
          onRemoveProject={selectedProjectReady
            ? () => handleRemoveProject(selectedProject.path, selectedProject.environmentId)
            : handleRemoveUnavailableSelectedProject}
        />

        {activePanel && (
          <ChatHeaderPanel
            panel={activePanel}
            project={selectedProject}
            projectPath={selectedProjectReady ? selectedProjectRealPath : selectedProjectPath}
            projectEnvironmentId={selectedProjectReady ? selectedProject.environmentId : selectedProjectEnvironmentId}
            session={selectedSession}
            runtime={selectedRuntime}
            branch={selectedBranch}
            projectReady={selectedProjectReady}
            onClose={() => setActivePanel(null)}
            onRunReview={runHermesReview}
          />
        )}

        {notConfigured && <NotConfiguredBanner />}

        {historyError && (
          <HistoryErrorBanner error={historyError} onRetry={retryHistoryLoad} />
        )}

        {/* Message thread */}
        <ChatThread
          messages={messages}
          optimistic={optimistic}
          isTyping={isTyping}
          mounted={mounted}
          atBottom={atBottom}
          systemMsg={systemMsg}
          lightbox={lightbox}
          setLightbox={setLightbox}
          setAtBottom={setAtBottom}
          setAtBottomRefOnly={setAtBottomRefOnly}
          scrollRef={scrollRef}
          bottomRef={bottomRef}
          optimisticImageCacheRef={optimisticImageCacheRef}
          optimisticContextFileCacheRef={optimisticContextFileCacheRef}
          onDrop={onDrop}
          retry={retry}
          onUseMessageAsPrompt={useMessageAsPrompt}
          onForkMessage={forkMessageAsNewChat}
          onRegenerateAssistant={regenerateAssistantFromPrompt}
          onContinueAssistant={continueAssistantResponse}
          transcriptContext={selectedProjectReady
            ? {
                projectName: selectedProject.name,
                projectPath: selectedProject.root || selectedProjectRealPath,
                environmentId: selectedProject.environmentId || undefined,
                runtime: selectedRuntime,
                branch: selectedBranch,
              }
            : null}
          emptyStateSlot={(
            <ChatProjectStartPanel
              projectReady={selectedProjectReady}
              projectName={selectedProjectReady ? selectedProject.name : null}
              projectPath={selectedProjectReady ? selectedProjectRealPath : selectedProjectPath}
              environmentLabel={selectedProjectReady
                ? projectEnvironmentDisplayLabel(selectedProject)
                : selectedProjectEnvironmentId}
              runtime={selectedRuntime}
              branch={selectedBranch}
              onAddProject={() => void handleAddProject(selectedProjectPath)}
              onManageProject={() => setEnvironmentDialogOpen(true)}
            />
          )}
        />

        {terminalOpen && (
          <Suspense fallback={null}>
            <ChatTerminalDrawer
              key={terminalKey}
              title={terminalTitle}
              initialCommand={terminalCommand}
              cwd={terminalCwd}
              processId={terminalProcessId}
              env={terminalEnv}
              onStatusChange={setTerminalStatus}
              onClose={() => setTerminalOpen(false)}
            />
          </Suspense>
        )}

        {/* Chat input at bottom */}
        <ChatInput
          input={input}
          setInput={setInput}
          images={images}
          setImages={setImages}
          imagesRef={imagesRef}
          contextFiles={contextFiles}
          setContextFiles={setContextFiles}
          contextFilesRef={contextFilesRef}
          pendingAttachmentReads={pendingAttachmentReads + nativeContextReads}
          attachmentReadsBlockSend={nativeContextReads > 0}
          pendingQueuedSend={pendingQueuedSend}
          onCancelQueuedSend={cancelQueuedSend}
          sending={sending}
          onSend={send}
          onStop={stop}
          onFileChange={handleFileChange}
          onBrowseImages={() => void attachNativeImagePaths()}
          onContextFileChange={handleContextFileChange}
          onBrowseContextFiles={() => void attachNativeContextPaths(false)}
          onBrowseContextFolder={() => void attachNativeContextPaths(true)}
          onDrop={onDrop}
          draftTimerRef={draftTimerRef}
          draftStorageKeys={draftStorageKeys}
          promptHistory={promptHistory}
          focusSignal={composerFocusSignal}
          providerLabel={activeProviderLabel}
          sendDisabledReason={sendDisabledReason}
          sendDisabledActionLabel={sendDisabledProjectActionLabel}
          onSendDisabledAction={handleSendDisabledProjectAction}
          contextBar={(
            <ChatComposerContextBar
              projectPath={selectedProjectPath}
              projectEnvironmentId={selectedProjectEnvironmentId}
              projects={realWorkspaceProjects}
              onProjectChange={handleProjectChange}
              runtime={selectedRuntime}
              runtimeModes={workspaceContext.runtimeModes}
              onRuntimeChange={handleRuntimeChange}
              branch={selectedBranch}
              branches={selectedProject.branches}
              onBranchChange={handleBranchChange}
              projectReady={selectedProjectReady}
              onAddProject={handleAddProject}
              onOpenEnvironment={() => setEnvironmentDialogOpen(true)}
              usageSlot={<HermesUsagePill />}
            />
          )}
        />

        {scriptDialogMode && (
          <ProjectScriptDialog
            mode={scriptDialogMode}
            draft={scriptDraft}
            editingScript={scriptDialogMode === 'edit' && selectedProjectScript ? toT3ProjectScript(selectedProjectScript) : null}
            onDraftChange={setScriptDraft}
            onCancel={() => setScriptDialogMode(null)}
            onSave={saveProjectScriptDraft}
            onDelete={(script) => {
              const sourceScript = activeProjectScripts.find((candidate) => candidate.id === script.id)
                ?? selectedProjectScript
              if (!sourceScript) return
              handleDeleteProjectScript(sourceScript)
              setScriptDialogMode(null)
            }}
          />
        )}

        {projectDialogMode && (
          <ProjectSidebarDialog
            mode={projectDialogMode}
            value={projectDialogDraft}
            projectPath={projectDialogTargetPath ?? undefined}
            projectEnvironmentLabel={projectDialogEnvironmentLabel}
            error={projectDialogError}
            submitting={projectDialogSubmitting}
            onChange={setProjectDialogDraft}
            onCancel={closeProjectDialog}
            onBrowse={projectDialogMode === 'add' && window.__TAURI_INTERNALS__ ? browseProjectFromDialog : undefined}
            onSubmit={submitProjectDialog}
          />
        )}

        {environmentDialogOpen && (
          <ChatEnvironmentDialog
            projectPath={selectedProjectPath}
            projectEnvironmentId={selectedProjectEnvironmentId}
            projects={realWorkspaceProjects}
            runtime={selectedRuntime}
            runtimeModes={workspaceContext.runtimeModes}
            branch={selectedBranch}
            branches={selectedProject.branches}
            onProjectChange={handleProjectChange}
            onRuntimeChange={handleRuntimeChange}
            onBranchChange={handleBranchChange}
            projectReady={selectedProjectReady}
            onAddProject={handleAddProjectFromEnvironment}
            onRemoveProject={(path, environmentId) => {
              setEnvironmentDialogOpen(false)
              if (selectedProjectReady) {
                handleRemoveProject(path, environmentId)
                return
              }
              handleRemoveUnavailableSelectedProject()
            }}
            onClose={() => setEnvironmentDialogOpen(false)}
          />
        )}

        <style>{`
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes fadeOutCheck { 0% { opacity: 1; } 100% { opacity: 0; } }
          .md-bubble p:last-child { margin-bottom: 0 !important; }
          @media (max-width: 960px) {
            .chat-page-header {
              align-items: flex-start !important;
              flex-direction: column !important;
              gap: 10px !important;
            }
            .chat-page-title,
            .chat-page-header-actions,
            .chat-top-actions-toolbar,
            .chat-local-context-toolbar,
            .chat-context-project-strip,
            .chat-context-primary,
            .chat-context-controls,
            .chat-context-actions {
              width: 100% !important;
            }
            .chat-context-project-strip {
              align-items: stretch !important;
              flex-direction: column !important;
            }
            .chat-context-primary,
            .chat-context-controls,
            .chat-context-actions {
              justify-content: flex-start !important;
              flex-wrap: wrap !important;
            }
            .chat-start-context-panel {
              padding: 14px !important;
            }
            .chat-context-select {
              flex: 1 1 156px !important;
            }
            .chat-context-select-control {
              width: 100% !important;
              max-width: none !important;
            }
          }
          @media (max-width: 680px) {
            .chat-shell {
              margin: -16px !important;
            }
            .chat-main {
              padding: 16px !important;
            }
            .chat-input-header-controls {
              flex-wrap: wrap !important;
              row-gap: 6px !important;
            }
            .chat-input-model-select,
            .chat-input-agent-label {
              max-width: 100% !important;
            }
            .chat-input-shell {
              border-radius: 14px !important;
              padding: 8px !important;
              align-items: center !important;
            }
            .chat-input-stop {
              width: 34px !important;
              height: 34px !important;
              padding: 0 !important;
              justify-content: center !important;
            }
            .chat-input-stop-label {
              display: none !important;
            }
            .chat-input-context {
              overflow-x: auto !important;
              padding-bottom: 2px !important;
            }
            .chat-terminal-drawer {
              height: 220px !important;
              min-height: 200px !important;
              border-radius: 10px !important;
            }
            .chat-terminal-header {
              height: auto !important;
              min-height: 34px !important;
              align-items: flex-start !important;
              padding: 7px 8px !important;
            }
            .chat-terminal-title {
              flex-wrap: wrap !important;
              row-gap: 4px !important;
            }
            .chat-terminal-cwd {
              flex-basis: 100% !important;
              max-width: 100% !important;
            }
            .chat-context-select {
              flex: 1 1 100% !important;
            }
            .chat-context-button {
              flex: 1 1 auto !important;
              justify-content: center !important;
            }
            .chat-context-project-strip {
              align-items: flex-start !important;
              flex-direction: column !important;
            }
            .chat-context-project-strip .chat-context-actions {
              width: 100% !important;
              justify-content: flex-start !important;
            }
            .chat-start-context-panel {
              width: 100% !important;
              padding: 12px !important;
            }
            .chat-start-context-actions > button {
              width: 100% !important;
              justify-content: center !important;
            }
            .hermes-usage-window-meters {
              display: none !important;
            }
          }
        `}</style>
      </main>

      <Suspense fallback={null}>
        <Lightbox data={lightbox} onClose={() => setLightbox(null)} />
      </Suspense>
    </div>
  )
}

function ChatSidebarCollapsed({
  onExpand,
}: {
  onExpand: () => void
}) {
  return (
    <div className="chat-sidebar-collapsed-panel" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '10px 8px',
      gap: 8,
      background: 'color-mix(in srgb, var(--bg-base) 94%, black)',
    }}>
      <ChatSidebarCollapsedButton label="Expand chat list" onClick={onExpand}>
        <CaretRight size={16} />
      </ChatSidebarCollapsedButton>
    </div>
  )
}

function ChatSidebarCollapsedButton({
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
      onClick={onClick}
      aria-label={label}
      title={label}
      className="hover-bg chat-sidebar-collapsed-button"
      style={{
        width: 36,
        height: 32,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
