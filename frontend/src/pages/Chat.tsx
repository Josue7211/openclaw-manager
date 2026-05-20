



import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DemoBadge } from '@/components/DemoModeBanner'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { useSessionMutations } from '@/hooks/sessions/useSessionMutations'
import {
  CaretRight,
  Play,
} from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import type { ChatTerminalStatusSnapshot } from './chat/ChatTerminalDrawer'

const Lightbox = lazy(() => import('@/components/Lightbox'))
const ChatTerminalDrawer = lazy(() => import('./chat/ChatTerminalDrawer'))

import ChatThread from './chat/ChatThread'
import ChatInput from './chat/ChatInput'
import CodexLbUsagePill from './chat/CodexLbUsagePill'
import { NotConfiguredBanner } from './chat/NotConfiguredBanner'
import { HistoryErrorBanner } from './chat/HistoryErrorBanner'
import { useChatState } from './chat/useChatState'
import {
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
} from '@/vendor/t3/project/ProjectContextControls'
import {
  attachChatSessionProjectRefs,
  findProjectForSession,
  loadChatSessionProjectRefs,
  projectRefFromProject,
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
  loadProjectScriptStore,
  mergeWorkspaceProjects,
  normalizeWorkspaceContext,
  normalizeWorkspaceProject,
  projectScriptStorageKeys,
  pruneMigratedAddedProjects,
  removeProjectFromBackend,
  removeWorkspaceProject,
  replaceWorkspaceProject,
  resolveProjectFromPath,
  resolveScriptCwd,
  saveProjectScriptStore,
  saveAddedProjects,
  scriptsForProject,
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
  projectGroupLabel,
  setProjectRouteParams,
  workspaceSessionRoots,
} from '@/chat/t3-adapters/projectSidebar'

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const newChatParam = searchParams.get('new')
  const routeSessionKey = resolveChatThreadRouteSessionKey(searchParams)
  const sessionParam = routeSessionKey
  const projectIdParam = searchParams.get('projectId')
  const cwdParam = searchParams.get('cwd')
  const envParam = searchParams.get('env')
  const branchParam = searchParams.get('branch')
  const runtimeParam = searchParams.get('runtime')
  const initialNewChat = newChatParam === '1'
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(() => (
    initialNewChat ? null : (routeSessionKey || loadSelectedChatSessionKey())
  ))
  const [newChatRequested, setNewChatRequested] = useState(initialNewChat)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [, setAddedProjects] = useState<ChatWorkspaceProject[]>(loadAddedProjects)
  const [workspaceContext, setWorkspaceContext] = useState<ChatWorkspaceContext>(() => (
    mergeWorkspaceProjects(FALLBACK_WORKSPACE_CONTEXT, loadAddedProjects())
  ))
  const [workspaceContextReady, setWorkspaceContextReady] = useState(false)
  const [selectedProjectPath, setSelectedProjectPath] = useState(() => cwdParam?.trim() || loadStoredValue(CHAT_SELECTED_PROJECT_PATH_KEY, FALLBACK_PROJECT.path))
  const [selectedRuntime, setSelectedRuntime] = useState(() => runtimeParam?.trim() || loadStoredValue(CHAT_SELECTED_RUNTIME_KEY, FALLBACK_WORKSPACE_CONTEXT.runtimeModes[0]))
  const [selectedBranch, setSelectedBranch] = useState(() => branchParam?.trim() || loadStoredValue(CHAT_SELECTED_BRANCH_KEY, FALLBACK_PROJECT.currentBranch || FALLBACK_PROJECT.branches[0]))
  const [projectScriptStore, setProjectScriptStore] = useState<Record<string, ChatProjectScript[]>>(loadProjectScriptStore)
  const [selectedScriptId, setSelectedScriptId] = useState(DEFAULT_CHAT_PROJECT_SCRIPTS[0].id)
  const [scriptDialogMode, setScriptDialogMode] = useState<'add' | 'edit' | null>(null)
  const [scriptDraft, setScriptDraft] = useState<ProjectScriptDialogDraft>({
    name: '',
    command: '',
    icon: 'play',
    runOnWorktreeCreate: false,
  })
  const [projectDialogMode, setProjectDialogMode] = useState<ProjectSidebarDialogMode | null>(null)
  const [projectDialogDraft, setProjectDialogDraft] = useState('')
  const [projectDialogTargetPath, setProjectDialogTargetPath] = useState<string | null>(null)
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
  const [sessionProjectRefs, setSessionProjectRefs] = useState<Record<string, ChatSessionProjectRef>>(loadChatSessionProjectRefs)
  const terminalLaunchCounterRef = useRef(0)
  const { sessions: rawSessions, available: sessionsAvailable, isLoading: sessionsLoading } = useGatewaySessions({
    cwd: workspaceSessionRoots(workspaceContext.projects),
    projectIds: workspaceContext.projects
      .map((project) => project.id?.trim())
      .filter((projectId): projectId is string => Boolean(projectId)),
    includeUnscoped: true,
  })
  const sessions = useMemo(
    () => attachChatSessionProjectRefs(rawSessions, sessionProjectRefs),
    [rawSessions, sessionProjectRefs],
  )
  const { renameMutation, deleteMutation, compactMutation } = useSessionMutations()
  const newChatIntentRef = useRef(initialNewChat)
  const autoRenameAttemptedRef = useRef<Set<string>>(new Set())
  const branchProjectPathRef = useRef(selectedProjectPath)
  const selectedSession = sessions.find((session) => session.key === selectedSessionKey) ?? null
  const selectedProject = workspaceContext.projects.find((project) => project.path === selectedProjectPath)
    ?? workspaceContext.projects[0]
    ?? FALLBACK_PROJECT
  const selectedProjectAvailable = workspaceContext.projects.some((project) => project.path === selectedProjectPath)
  const activeProjectScripts = scriptsForProject(projectScriptStore, selectedProject)
  const selectedProjectScript = activeProjectScripts.find((script) => script.id === selectedScriptId)
    ?? primaryProjectScript(activeProjectScripts)
    ?? activeProjectScripts[0]
    ?? DEFAULT_CHAT_PROJECT_SCRIPTS[0]
  const chatTitle = String(selectedSession?.label || 'New chat')
  const chatSubtitle = selectedSession
    ? `${selectedSession.messageCount || 0} messages`
    : 'Choose a chat or send a new message'

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
        const routeProject = findProjectByRouteIdentity(next.projects, projectIdParam, cwdParam, envParam)
        const first = next.projects[0] ?? FALLBACK_PROJECT
        const effectiveProject = routeProject
          ?? next.projects.find((project) => project.path === selectedProjectPath)
          ?? first
        setWorkspaceContext(next)
        setSelectedProjectPath((current) => (
          routeProject?.path
          ?? (next.projects.some((project) => project.path === current) ? current : first.path)
        ))
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
        console.warn('Failed to load chat workspace context:', err)
        setWorkspaceContextReady(true)
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
    const projectChanged = branchProjectPathRef.current !== selectedProject.path
    branchProjectPathRef.current = selectedProject.path
    setSelectedBranch((current) => {
      const fallbackBranch = selectedProject.currentBranch || selectedProject.branches[0] || 'main'
      if (projectChanged) return fallbackBranch
      return selectedProject.branches.includes(current) ? current : fallbackBranch
    })
  }, [selectedProject, selectedProjectAvailable])

  useEffect(() => {
    if (!workspaceContextReady) return
    if (!selectedProjectAvailable) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedSessionKey) {
        applyChatThreadRouteParams(next, {
          sessionKey: selectedSessionKey,
          session: selectedSession,
          fallbackEnvironmentId: selectedProject.environmentId,
        })
      }
      setProjectRouteParams(next, selectedProject, { branch: selectedBranch, runtime: selectedRuntime })
      return next
    }, { replace: true })
  }, [selectedBranch, selectedProject, selectedProjectAvailable, selectedRuntime, selectedSession, selectedSessionKey, setSearchParams, workspaceContextReady])

  useEffect(() => {
    if (newChatParam !== '1') return
    newChatIntentRef.current = true
    setSelectedSessionKey(null)
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
    saveSelectedChatSessionKey(nextKey)
  }, [sessionParam])

  useEffect(() => {
    if (newChatIntentRef.current) return
    if (newChatRequested) return
    if (sessions.length === 0) return
    if (selectedSessionKey) return

    const nextKey = sessions[0]?.key as string | undefined
    if (nextKey) {
      setSelectedSessionKey(nextKey)
      saveSelectedChatSessionKey(nextKey)
    }
  }, [newChatRequested, selectedSessionKey, sessions])

  const handleSelectSession = (key: string) => {
    const session = sessions.find((candidate) => candidate.key === key)
    const sessionProject = findProjectForSession(workspaceContext.projects, session)
    const nextBranch = sessionProject?.currentBranch || sessionProject?.branches[0] || selectedBranch
    if (sessionProject) {
      setSelectedProjectPath(sessionProject.path)
      setSelectedBranch(nextBranch)
    }
    newChatIntentRef.current = false
    setNewChatRequested(false)
    setSelectedSessionKey(key)
    saveSelectedChatSessionKey(key)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      applyChatThreadRouteParams(next, {
        sessionKey: key,
        session,
        fallbackEnvironmentId: sessionProject?.environmentId ?? selectedProject.environmentId,
      })
      setProjectRouteParams(next, sessionProject ?? selectedProject, { branch: nextBranch, runtime: selectedRuntime })
      return next
    }, { replace: true })
  }

  const setCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    saveSidebarCollapsed(collapsed)
  }

  useEffect(() => {
    saveStoredValue(CHAT_SELECTED_PROJECT_PATH_KEY, selectedProjectPath)
  }, [selectedProjectPath])

  useEffect(() => {
    saveStoredValue(CHAT_SELECTED_RUNTIME_KEY, selectedRuntime)
  }, [selectedRuntime])

  useEffect(() => {
    saveStoredValue(CHAT_SELECTED_BRANCH_KEY, selectedBranch)
  }, [selectedBranch])

  useEffect(() => {
    if (activeProjectScripts.some((script) => script.id === selectedScriptId)) return
    const fallbackScript = primaryProjectScript(activeProjectScripts)
      ?? activeProjectScripts[0]
      ?? DEFAULT_CHAT_PROJECT_SCRIPTS[0]
    setSelectedScriptId(fallbackScript.id)
  }, [activeProjectScripts, selectedScriptId])

  const {
    _demo,
    messages,
    input, setInput,
    images, setImages, imagesRef,
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
    draftTimerRef,
    send,
    stop,
    retry,
    retryHistoryLoad,
    handleFileChange,
    onDrop,
  } = useChatState(selectedSessionKey, {
    blank: newChatRequested && !selectedSessionKey,
    newChat: newChatRequested && !selectedSessionKey,
    context: {
      projectId: selectedProject.id || undefined,
      project: selectedProject.name,
      projectRoot: selectedProject.root || undefined,
      workingDir: selectedProject.path,
      environmentId: selectedProject.environmentId || undefined,
      branch: selectedBranch,
      runtime: selectedRuntime,
    },
    onSessionKey: (key) => {
      setSessionProjectRefs((current) => {
        const next = {
          ...current,
          [key]: projectRefFromProject(selectedProject, {
            branch: selectedBranch,
            runtime: selectedRuntime,
          }),
        }
        saveChatSessionProjectRefs(next)
        return next
      })
      newChatIntentRef.current = false
      setNewChatRequested(false)
      setSelectedSessionKey(key)
      saveSelectedChatSessionKey(key)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        next.set('session', key)
        setProjectRouteParams(next, selectedProject, { branch: selectedBranch, runtime: selectedRuntime })
        return next
      }, { replace: true })
    },
  })
  const activeProviderLabel = providers.find((candidate) => candidate.id === provider)?.name ?? 'Hermes'

  const beginNewChatForProject = (project: ChatWorkspaceProject, branch?: string) => {
    const nextBranch = branch || project.currentBranch || project.branches[0] || 'main'
    newChatIntentRef.current = true
    setNewChatRequested(true)
    setSelectedSessionKey(null)
    setSelectedProjectPath(project.path)
    setSelectedBranch(nextBranch)
    saveSelectedChatSessionKey(null)
    setInput('')
    setImages([])
    imagesRef.current = []
    sessionStorage.removeItem('chat-draft')
    sessionStorage.removeItem('chat-draft-images')
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('session')
      next.set('new', '1')
      setProjectRouteParams(next, project, { branch: nextBranch, runtime: selectedRuntime })
      return next
    }, { replace: true })
  }

  const handleNewChat = () => {
    beginNewChatForProject(selectedProject, selectedBranch)
  }

  const handleNewProjectChat = (path: string) => {
    const project = workspaceContext.projects.find((candidate) => candidate.path === path) ?? selectedProject
    beginNewChatForProject(project)
  }

  const handleDeleteSession = (key: string) => {
    deleteMutation.mutate(key)
    if (selectedSessionKey !== key && sessionParam !== key) return

    newChatIntentRef.current = true
    setNewChatRequested(true)
    setSelectedSessionKey(null)
    saveSelectedChatSessionKey(null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParams(next, selectedProject, { branch: selectedBranch, runtime: selectedRuntime })
      next.delete('session')
      next.set('new', '1')
      return next
    }, { replace: true })
  }

  const openTerminal = (command?: string, title = 'Terminal', cwd = selectedProject.path) => {
    terminalLaunchCounterRef.current += 1
    const processId = `chat-${terminalProcessScope(selectedProject, selectedSessionKey)}-${terminalLaunchCounterRef.current}`
    setTerminalCommand(command?.trim() || undefined)
    setTerminalCwd(cwd)
    setTerminalProcessId(processId)
    setTerminalEnv({
      CLAWCONTROL_PROJECT_ID: selectedProject.id || '',
      CLAWCONTROL_PROJECT_PATH: selectedProject.path,
      CLAWCONTROL_PROJECT_NAME: selectedProject.name,
      CLAWCONTROL_ENVIRONMENT_ID: selectedProject.environmentId || '',
      CLAWCONTROL_RUNTIME: selectedRuntime,
      CLAWCONTROL_BRANCH: selectedBranch,
    })
    setTerminalTitle(title)
    setTerminalStatus({
      title,
      status: 'starting',
      displayText: 'starting',
      cwd,
      processId,
      error: null,
    })
    setTerminalOpen(true)
    setTerminalKey((value) => value + 1)
  }

  const handleProjectChange = (path: string) => {
    setSelectedProjectPath(path)
    const nextProject = workspaceContext.projects.find((project) => project.path === path)
    if (!nextProject) return
    const nextBranch = nextProject.currentBranch || nextProject.branches[0] || 'main'
    setSelectedBranch(nextBranch)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParams(next, nextProject, { branch: nextBranch, runtime: selectedRuntime })
      return next
    }, { replace: true })
  }

  const addProjectFromPath = async (selectedPath: string | null) => {
    if (!selectedPath) return
    let project: ChatWorkspaceProject
    try {
      project = await addProjectToBackend(selectedPath)
    } catch (error) {
      console.warn('Failed to persist selected project through backend:', error)
      project = await resolveProjectFromPath(selectedPath)
    }
    setAddedProjects((current) => {
      if (current.some((candidate) => candidate.path === project.path)) return current
      const next = [...current, project]
      saveAddedProjects(next)
      return next
    })
    setWorkspaceContext((current) => mergeWorkspaceProjects(current, [project]))
    setSelectedProjectPath(project.path)
    const nextBranch = project.currentBranch || project.branches[0] || 'main'
    setSelectedBranch(nextBranch)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParams(next, project, { branch: nextBranch, runtime: selectedRuntime })
      return next
    }, { replace: true })
  }

  const handleAddProject = async () => {
    if (window.__TAURI_INTERNALS__) {
      let selectedPath: string | null = null
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Add project',
        })
        selectedPath = Array.isArray(selected) ? selected[0] ?? null : selected
      } catch (error) {
        console.warn('Failed to open project picker:', error)
      }
      await addProjectFromPath(selectedPath)
      return
    }

    setProjectDialogMode('add')
    setProjectDialogTargetPath(null)
    setProjectDialogDraft('')
  }

  const mirrorAddedProject = (project: ChatWorkspaceProject) => {
    setAddedProjects((current) => {
      const next = current.some((candidate) => candidate.path === project.path)
        ? current.map((candidate) => (candidate.path === project.path ? project : candidate))
        : [...current, project]
      saveAddedProjects(next)
      return next
    })
  }

  const forgetAddedProject = (path: string) => {
    setAddedProjects((current) => {
      const next = current.filter((candidate) => candidate.path !== path)
      saveAddedProjects(next)
      return next
    })
  }

  const persistProjectPatch = (
    project: ChatWorkspaceProject,
    patch: Partial<Pick<ChatWorkspaceProject, 'name' | 'machineLabel' | 'scripts' | 'groupingOverride'>>,
  ) => {
    const optimisticProject = normalizeWorkspaceProject({ ...project, ...patch })
    setWorkspaceContext((current) => replaceWorkspaceProject(current, optimisticProject))
    mirrorAddedProject(optimisticProject)
    updateProjectInBackend(project, patch)
      .then((updatedProject) => {
        setWorkspaceContext((current) => replaceWorkspaceProject(current, updatedProject))
        mirrorAddedProject(updatedProject)
      })
      .catch((error) => {
        console.warn('Failed to persist project update through backend:', error)
      })
  }

  const handleRenameProject = (path: string) => {
    const project = workspaceContext.projects.find((candidate) => candidate.path === path)
    if (!project) return
    setProjectDialogMode('rename')
    setProjectDialogTargetPath(project.path)
    setProjectDialogDraft(project.name)
  }

  const closeProjectDialog = () => {
    setProjectDialogMode(null)
    setProjectDialogTargetPath(null)
    setProjectDialogDraft('')
  }

  const submitProjectDialog = () => {
    const value = projectDialogDraft.trim()
    if (!value || !projectDialogMode) return
    if (projectDialogMode === 'add') {
      closeProjectDialog()
      void addProjectFromPath(value)
      return
    }

    const project = workspaceContext.projects.find((candidate) => candidate.path === projectDialogTargetPath)
    if (!project || value === project.name) {
      closeProjectDialog()
      return
    }
    closeProjectDialog()
    persistProjectPatch(project, { name: value })
  }

  const handleProjectGroupingOverride = (path: string, value: string) => {
    const project = workspaceContext.projects.find((candidate) => candidate.path === path)
    if (!project) return
    const groupingOverride = value === 'repository' || value === 'repository-path' || value === 'separate'
      ? value
      : null
    persistProjectPatch(project, { groupingOverride })
  }

  const handleRemoveProject = (path: string) => {
    const project = workspaceContext.projects.find((candidate) => candidate.path === path)
    if (!project) return
    const nextContext = removeWorkspaceProject(workspaceContext, project.path)
    forgetAddedProject(project.path)
    setWorkspaceContext(nextContext)
    if (selectedProjectPath === project.path) {
      const nextProject = nextContext.projects[0] ?? FALLBACK_PROJECT
      const nextBranch = nextProject.currentBranch || nextProject.branches[0] || 'main'
      setSelectedProjectPath(nextProject.path)
      setSelectedBranch(nextBranch)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        setProjectRouteParams(next, nextProject, { branch: nextBranch, runtime: selectedRuntime })
        return next
      }, { replace: true })
    }
    removeProjectFromBackend(project)
      .then((storedProjects) => {
        setWorkspaceContext((current) => {
          const storedPaths = new Set(storedProjects.map((candidate) => candidate.path))
          return {
            ...current,
            projects: current.projects.map((candidate) => (
              storedPaths.has(candidate.path)
                ? storedProjects.find((stored) => stored.path === candidate.path) ?? candidate
                : candidate
            )),
          }
        })
      })
      .catch((error) => {
        console.warn('Failed to remove project through backend:', error)
      })
  }

  const handleRuntimeChange = (value: string) => {
    setSelectedRuntime(value)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParams(next, selectedProject, { branch: selectedBranch, runtime: value })
      return next
    }, { replace: true })
  }

  const handleBranchChange = (value: string) => {
    setSelectedBranch(value)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setProjectRouteParams(next, selectedProject, { branch: value, runtime: selectedRuntime })
      return next
    }, { replace: true })
  }

  const saveScriptsForSelectedProject = (updater: (scripts: ChatProjectScript[]) => ChatProjectScript[]) => {
    const keys = projectScriptStorageKeys(selectedProject)
    const nextScriptsForBackend = updater(activeProjectScripts)
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
      .then((project) => {
        setWorkspaceContext((current) => replaceWorkspaceProject(current, project))
      })
      .catch((error) => {
        console.warn('Failed to persist project scripts through backend:', error)
      })
  }

  const handleAddProjectScript = () => {
    setScriptDraft({ name: '', command: '', icon: 'play', runOnWorktreeCreate: false })
    setScriptDialogMode('add')
  }

  const handleEditProjectScript = (script: ChatProjectScript) => {
    setScriptDraft({
      name: script.name,
      command: script.command,
      icon: script.icon || 'play',
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
      setSelectedScriptId(nextScript?.id ?? '')
    }
  }

  const saveProjectScriptDraft = () => {
    const name = scriptDraft.name.trim()
    const command = scriptDraft.command.trim()
    if (!name || !command) return
    const icon = typeof scriptDraft.icon === 'string' && scriptDraft.icon.trim()
      ? scriptDraft.icon.trim() as T3ProjectScriptIcon
      : 'play'

    if (scriptDialogMode === 'add') {
      const nextId = nextProjectScriptId(name, activeProjectScripts.map((script) => script.id))
      saveScriptsForSelectedProject((current) => [
        ...current,
        {
          id: nextId,
          name,
          command,
          icon,
          runOnWorktreeCreate: scriptDraft.runOnWorktreeCreate,
        },
      ])
      setSelectedScriptId(nextId)
    } else if (scriptDialogMode === 'edit') {
      saveScriptsForSelectedProject((current) => (
        current.map((candidate) => (
          candidate.id === selectedProjectScript.id
            ? {
                ...candidate,
                name,
                command,
                icon,
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
    if (autoRenameAttemptedRef.current.has(selectedSessionKey)) return

    const title = deriveSessionTitle(messages)
    if (!title || title === selectedSession.label) return

    autoRenameAttemptedRef.current.add(selectedSessionKey)
    renameMutation.mutate({ key: selectedSessionKey, label: title })
  }, [messages, renameMutation, selectedSession, selectedSessionKey])

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

  return (
    <div className="chat-shell" style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      overflow: 'hidden',
      overscrollBehavior: 'contain',
      margin: '-20px -28px',
    }}>
      <aside style={{
        width: sidebarCollapsed ? 56 : 252,
        minWidth: sidebarCollapsed ? 56 : 232,
        maxWidth: sidebarCollapsed ? 56 : 280,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.18s var(--ease-spring), min-width 0.18s var(--ease-spring)',
      }}>
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
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onCollapse={() => setCollapsed(true)}
            onRenameSession={(key, label) => renameMutation.mutate({ key, label })}
            onDeleteSession={handleDeleteSession}
            onCompactSession={(key) => compactMutation.mutate(key)}
            compactingSessionKey={
              compactMutation.isPending && typeof compactMutation.variables === 'string'
                ? compactMutation.variables
                : null
            }
            projects={workspaceContext.projects}
            selectedPath={selectedProjectPath}
            onSelectProject={handleProjectChange}
            onNewProjectChat={handleNewProjectChat}
            onAddProject={handleAddProject}
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
              preferredScriptId={selectedProjectScript.id}
              scripts={activeProjectScripts.map(toT3ProjectScript)}
              onSelectScript={setSelectedScriptId}
              onOpenTerminal={() => openTerminal()}
              onRunScript={(script) => {
                const sourceScript = activeProjectScripts.find((candidate) => candidate.id === script.id)
                  ?? selectedProjectScript
                setSelectedScriptId(sourceScript.id)
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
                handleEditProjectScript(sourceScript)
              }}
              onDeleteScript={(script) => {
                const sourceScript = activeProjectScripts.find((candidate) => candidate.id === script.id)
                  ?? selectedProjectScript
                handleDeleteProjectScript(sourceScript)
              }}
              onChangeEnvironment={() => setEnvironmentDialogOpen(true)}
              onOpenReview={() => setActivePanel((current) => current === 'review' ? null : 'review')}
              onOpenInfo={() => setActivePanel((current) => current === 'info' ? null : 'info')}
              terminalStatus={projectTerminalStatus}
            />
          </div>
        </div>

        {activePanel && (
          <ChatHeaderPanel
            panel={activePanel}
            project={selectedProject}
            session={selectedSession}
            runtime={selectedRuntime}
            branch={selectedBranch}
            onClose={() => setActivePanel(null)}
            onRunReview={() => openTerminal(
              'codex exec review --sandbox read-only --skip-git-repo-check',
              'Codex review',
              selectedProject.path,
            )}
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
          onDrop={onDrop}
          retry={retry}
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
          sending={sending}
          onSend={send}
          onStop={stop}
          onFileChange={handleFileChange}
          onDrop={onDrop}
          draftTimerRef={draftTimerRef}
          providerLabel={activeProviderLabel}
          contextBar={(
            <ChatComposerContextBar
              projectPath={selectedProjectPath}
              projects={workspaceContext.projects}
              onProjectChange={handleProjectChange}
              runtime={selectedRuntime}
              runtimeModes={workspaceContext.runtimeModes}
              onRuntimeChange={handleRuntimeChange}
              branch={selectedBranch}
              branches={selectedProject.branches}
              onBranchChange={handleBranchChange}
              usageSlot={<CodexLbUsagePill />}
            />
          )}
        />

        {scriptDialogMode && (
          <ProjectScriptDialog
            mode={scriptDialogMode}
            draft={scriptDraft}
            editingScript={scriptDialogMode === 'edit' ? toT3ProjectScript(selectedProjectScript) : null}
            onDraftChange={setScriptDraft}
            onCancel={() => setScriptDialogMode(null)}
            onSave={saveProjectScriptDraft}
            onDelete={(script) => {
              const sourceScript = activeProjectScripts.find((candidate) => candidate.id === script.id)
                ?? selectedProjectScript
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
            onChange={setProjectDialogDraft}
            onCancel={closeProjectDialog}
            onSubmit={submitProjectDialog}
          />
        )}

        {environmentDialogOpen && (
          <ChatEnvironmentDialog
            projectPath={selectedProjectPath}
            projects={workspaceContext.projects}
            runtime={selectedRuntime}
            runtimeModes={workspaceContext.runtimeModes}
            branch={selectedBranch}
            branches={selectedProject.branches}
            onProjectChange={handleProjectChange}
            onRuntimeChange={handleRuntimeChange}
            onBranchChange={handleBranchChange}
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
            .chat-context-primary,
            .chat-context-actions {
              width: 100% !important;
            }
            .chat-context-primary,
            .chat-context-actions {
              justify-content: flex-start !important;
              flex-wrap: wrap !important;
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
            .codex-lb-window-meters {
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
    <div style={{
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
      className="hover-bg"
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
