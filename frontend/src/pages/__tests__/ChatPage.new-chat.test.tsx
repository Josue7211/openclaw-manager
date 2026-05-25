import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

const {
  mockApiGet,
  mockApiPost,
  mockApiPatch,
  mockApiDel,
  mockClipboardWrite,
  mockUseChatState,
  mockUseCodexLbUsage,
  mockUseGatewaySessions,
  mockTauriInvoke,
  mockDialogOpen,
  mockRenameMutate,
  mockDeleteMutate,
  mockPinMutate,
  mockCompactMutate,
  mockClawcontrolScripts,
} = vi.hoisted(() => ({
  mockClawcontrolScripts: [
    { id: 'tauri-dev', name: 'Tauri dev', command: 'cargo tauri dev', cwd: 'src-tauri' },
    { id: 'frontend-dev', name: 'Frontend dev', command: 'npm run dev', cwd: 'frontend' },
    { id: 'typecheck', name: 'Typecheck', command: 'npm run typecheck', cwd: 'frontend' },
    { id: 'test-chat', name: 'Chat tests', command: 'npm run test', cwd: 'frontend' },
    { id: 'lint-chat', name: 'Chat lint', command: 'npm run lint', cwd: 'frontend' },
  ],
  mockApiGet: vi.fn(async () => ({
    projects: [{
      name: 'clawctrl',
      path: '/Volumes/T7/projects/clawctrl',
      branches: ['main'],
      currentBranch: 'main',
      scripts: [
        { id: 'tauri-dev', name: 'Tauri dev', command: 'cargo tauri dev', cwd: 'src-tauri' },
        { id: 'frontend-dev', name: 'Frontend dev', command: 'npm run dev', cwd: 'frontend' },
        { id: 'typecheck', name: 'Typecheck', command: 'npm run typecheck', cwd: 'frontend' },
        { id: 'test-chat', name: 'Chat tests', command: 'npm run test', cwd: 'frontend' },
        { id: 'lint-chat', name: 'Chat lint', command: 'npm run lint', cwd: 'frontend' },
      ],
    }],
    runtimeModes: ['Work locally'],
  })),
  mockApiPost: vi.fn(async (_path: string, body?: { path?: string }) => {
    const projectPath = body?.path || '/Users/josue/NewProject'
    const name = projectPath.split('/').filter(Boolean).at(-1) || 'NewProject'
    return {
      project: {
        id: projectPath,
        environmentId: 'local',
        name,
        path: projectPath,
        root: projectPath,
        branches: ['main'],
        currentBranch: 'main',
      },
      projects: [],
    }
  }),
  mockApiPatch: vi.fn(async (_path: string, body?: { id?: string; path?: string; name?: string; scripts?: unknown[]; groupingOverride?: string | null }) => {
    const projectPath = body?.path || '/Volumes/T7/projects/clawctrl'
    const name = body?.name || projectPath.split('/').filter(Boolean).at(-1) || 'clawctrl'
    return {
      project: {
        id: body?.id || projectPath,
        environmentId: 'local',
        name,
        path: projectPath,
        root: projectPath,
        branches: ['main'],
        currentBranch: 'main',
        scripts: body?.scripts,
        groupingOverride: body?.groupingOverride,
      },
      projects: [],
    }
  }),
  mockApiDel: vi.fn(async () => []),
  mockClipboardWrite: vi.fn(async () => undefined),
  mockUseChatState: vi.fn(),
  mockUseCodexLbUsage: vi.fn(),
  mockUseGatewaySessions: vi.fn(),
  mockTauriInvoke: vi.fn(),
  mockDialogOpen: vi.fn(),
  mockRenameMutate: vi.fn(),
  mockDeleteMutate: vi.fn(),
  mockPinMutate: vi.fn(),
  mockCompactMutate: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    patch: mockApiPatch,
    del: mockApiDel,
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockTauriInvoke(...args),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockDialogOpen(...args),
}))

vi.mock('@/hooks/sessions/useGatewaySessions', () => ({
  useGatewaySessions: (...args: unknown[]) => mockUseGatewaySessions(...args),
}))

vi.mock('@/hooks/sessions/useSessionMutations', () => ({
  useSessionMutations: () => ({
    renameMutation: {
      isPending: false,
      mutate: mockRenameMutate,
    },
    deleteMutation: {
      mutate: mockDeleteMutate,
    },
    pinMutation: {
      mutate: mockPinMutate,
    },
    compactMutation: {
      isPending: false,
      variables: null,
      mutate: mockCompactMutate,
    },
  }),
}))

vi.mock('../chat/useChatState', () => ({
  useChatState: mockUseChatState,
}))

vi.mock('@/hooks/useHermesUsage', () => ({
  useHermesUsage: () => mockUseCodexLbUsage(),
}))

vi.mock('../chat/ChatThread', () => ({
  default: ({
    messages = [],
    onUseMessageAsPrompt,
    onForkMessage,
    onRegenerateAssistant,
    onContinueAssistant,
    emptyStateSlot,
  }: {
    messages?: Array<{
      id: string
      role: string
      text: string
      images?: string[]
      contextFiles?: Array<{ id: string; name: string; path?: string; content: string }>
    }>
    onUseMessageAsPrompt?: (message: {
      id: string
      role: string
      text: string
      images?: string[]
      contextFiles?: Array<{ id: string; name: string; path?: string; content: string }>
    }) => void
    onForkMessage?: (message: {
      id: string
      role: string
      text: string
      images?: string[]
      contextFiles?: Array<{ id: string; name: string; path?: string; content: string }>
    }) => void
    onRegenerateAssistant?: (
      assistantMessage: { id: string; role: string; text: string },
      previousUserMessage: {
        id: string
        role: string
        text: string
        images?: string[]
        contextFiles?: Array<{ id: string; name: string; path?: string; content: string }>
      } | null,
    ) => void
    onContinueAssistant?: (message: { id: string; role: string; text: string }) => void
    emptyStateSlot?: React.ReactNode
  }) => (
    <div data-testid="chat-thread">
      {messages.length === 0 ? emptyStateSlot : null}
      {messages
        .map((message, index) => {
          if (message.role === 'user') {
            return (
              <React.Fragment key={message.id}>
                <button
                  type="button"
                  onClick={() => onUseMessageAsPrompt?.(message)}
                >
                  Use {message.id} as prompt
                </button>
                <button
                  type="button"
                  onClick={() => onForkMessage?.(message)}
                >
                  Fork {message.id}
                </button>
              </React.Fragment>
            )
          }
          if (message.role === 'assistant') {
            const previousUserMessage = [...messages.slice(0, index)].reverse().find((candidate) => candidate.role === 'user') ?? null
            return (
              <React.Fragment key={message.id}>
                <button type="button" onClick={() => onRegenerateAssistant?.(message, previousUserMessage)}>
                  Regenerate {message.id}
                </button>
                <button type="button" onClick={() => onContinueAssistant?.(message)}>
                  Continue {message.id}
                </button>
              </React.Fragment>
            )
          }
          return null
        })}
    </div>
  ),
}))

vi.mock('../chat/ChatInput', () => ({
  default: Object.assign(
    ({
      contextBar,
      onSend,
      onBrowseImages,
      onBrowseContextFiles,
      onBrowseContextFolder,
      promptHistory,
      input,
      setInput,
      focusSignal,
      providerLabel,
      sendDisabledReason,
      sendDisabledActionLabel,
      onSendDisabledAction,
    }: {
      contextBar?: React.ReactNode
      onSend?: () => void
      onBrowseImages?: () => void
      onBrowseContextFiles?: () => void
      onBrowseContextFolder?: () => void
      input?: string
      setInput?: (value: string) => void
      focusSignal?: number
      promptHistory?: Array<{
        text: string
        images?: string[]
        contextFiles?: Array<{ name: string; path?: string; size?: number }>
      }>
      providerLabel?: string
      sendDisabledReason?: string | null
      sendDisabledActionLabel?: string
      onSendDisabledAction?: () => void
    }) => {
      const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
      React.useEffect(() => {
        if (!focusSignal) return
        textareaRef.current?.focus()
      }, [focusSignal])

      return (
        <div
          data-testid="chat-input"
          data-provider-label={providerLabel ?? ''}
          data-send-disabled-reason={sendDisabledReason ?? ''}
          data-send-disabled-action-label={sendDisabledActionLabel ?? ''}
          data-prompt-history={JSON.stringify(promptHistory ?? [])}
          data-focus-signal={focusSignal ?? 0}
        >
          <textarea
            ref={textareaRef}
            aria-label="Chat message"
            value={input ?? ''}
            onChange={(event) => setInput?.(event.target.value)}
          />
          <button type="button" onClick={onSend} disabled={Boolean(sendDisabledReason)}>Mock send</button>
          {onSendDisabledAction && sendDisabledActionLabel && (
            <button type="button" onClick={onSendDisabledAction} aria-label="Mock send disabled action">
              {sendDisabledActionLabel}
            </button>
          )}
          {onBrowseImages && <button type="button" onClick={onBrowseImages}>Mock browse images</button>}
          {onBrowseContextFiles && <button type="button" onClick={onBrowseContextFiles}>Mock browse context files</button>}
          {onBrowseContextFolder && <button type="button" onClick={onBrowseContextFolder}>Mock browse context folder</button>}
          {contextBar}
        </div>
      )
    },
    { Header: () => <div data-testid="chat-input-header" /> },
  ),
}))

vi.mock('../chat/ChatTerminalDrawer', () => ({
  default: function MockChatTerminalDrawer({
    title,
    initialCommand,
    cwd,
    processId,
    env,
    onStatusChange,
  }: {
    title?: string
    initialCommand?: string
    cwd?: string
    processId?: string
    env?: Record<string, string>
    onStatusChange?: (status: {
      title: string
      status: string
      displayText: string
      cwd: string | null
      processId: string | null
      error: string | null
    }) => void
  }) {
    React.useEffect(() => {
      onStatusChange?.({
        title: title || 'Terminal',
        status: 'running',
        displayText: 'running',
        cwd: cwd || null,
        processId: processId || 'test-terminal',
        error: null,
      })
    }, [cwd, onStatusChange, processId, title])

    return (
      <div data-testid="chat-terminal-drawer">
        <span>{title}</span>
        <code>{initialCommand}</code>
        <small>{cwd}</small>
        <var>{processId}</var>
        <output>{JSON.stringify(env ?? {})}</output>
      </div>
    )
  },
}))

vi.mock('../chat/NotConfiguredBanner', () => ({
  NotConfiguredBanner: () => <div data-testid="not-configured" />,
}))

vi.mock('../chat/HistoryErrorBanner', () => ({
  HistoryErrorBanner: () => <div data-testid="history-error" />,
}))

vi.mock('../sessions/SessionList', () => ({
  SessionList: ({
    selectedId,
    headerAction,
    onNewSession,
    onSelect,
  }: {
    selectedId: string | null
    headerAction?: React.ReactNode
    onNewSession?: () => void
    onSelect?: (key: string) => void
  }) => (
    <div data-testid="session-list" data-selected-id={selectedId ?? ''}>
      {headerAction}
      <button type="button" onClick={() => onSelect?.('existing-session')}>Mock select existing chat</button>
      <button type="button" onClick={onNewSession}>Mock new chat</button>
    </div>
  ),
}))

vi.mock('@/components/Lightbox', () => ({
  default: () => null,
}))

vi.mock('@/components/DemoModeBanner', () => ({
  DemoBadge: () => null,
}))

import ChatPage from '../Chat'
import { CHAT_IMAGE_LIMIT, LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS } from '../chat/constants'
import { optimisticAttachmentCacheKey } from '../chat/optimisticAttachmentCache'
import { CHAT_PROJECT_PICKER_LAST_DIR_KEY } from '@/chat/t3-adapters/projectWorkspace'

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output>
}

function NavigateButton({ label, to }: { label: string; to: string }) {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(to)}>{label}</button>
}

function searchParamsFromLocation() {
  const value = screen.getByLabelText('Current location').textContent || ''
  return new URLSearchParams(value.split('?')[1] || '')
}

function persistClawcontrolProjectSelection() {
  localStorage.setItem('chat-selected-project-path', '/Volumes/T7/projects/clawctrl')
  localStorage.setItem('chat-selected-project-environment', 'local')
  localStorage.setItem('chat-selected-runtime', 'Work locally')
  localStorage.setItem('chat-selected-branch', 'main')
}

function chatStateStub() {
  return {
    _demo: false,
    messages: [],
    input: '',
    setInput: vi.fn(),
    images: [],
    setImages: vi.fn(),
    imagesRef: { current: [] },
    contextFiles: [],
    setContextFiles: vi.fn(),
    contextFilesRef: { current: [] },
    sending: false,
    connected: true,
    mounted: true,
    lightbox: null,
    setLightbox: vi.fn(),
    atBottom: true,
    setAtBottom: vi.fn(),
    setAtBottomRefOnly: vi.fn(),
    optimistic: [],
    isTyping: false,
    systemMsg: null,
    notConfigured: false,
    historyError: null,
    model: 'openai/gpt-5.5',
    setModel: vi.fn(),
    provider: 'hermes',
    setProvider: vi.fn(),
    providers: [
      { id: 'hermes', name: 'Hermes', description: 'Hermes Agent backed chat', local: false, modelBacked: true },
      { id: 'codex-cli', name: 'Codex CLI', description: 'Installed CLI', local: true, modelBacked: false },
    ],
    modelsData: { models: [] },
    visibleModels: [],
    wsConnected: true,
    historyIsError: false,
    bottomRef: { current: null },
    scrollRef: { current: null },
    optimisticImageCacheRef: { current: new Map() },
    optimisticContextFileCacheRef: { current: new Map() },
    draftTimerRef: { current: null },
    draftStorageKeys: LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS,
    send: vi.fn(),
    sendMessage: vi.fn(() => true),
    stop: vi.fn(),
    retry: vi.fn(),
    retryHistoryLoad: vi.fn(),
    handleFileChange: vi.fn(),
    handleContextFileChange: vi.fn(),
    appendContextFileAttachments: vi.fn(),
    showAttachmentStatus: vi.fn(),
    onDrop: vi.fn(),
  }
}

describe('ChatPage new chat intent', () => {
  beforeEach(() => {
    localStorage.clear()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    vi.clearAllMocks()
    mockApiGet.mockReset()
    mockApiPost.mockReset()
    mockApiPatch.mockReset()
    mockApiDel.mockReset()
    mockTauriInvoke.mockReset()
    mockDialogOpen.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockClipboardWrite },
      configurable: true,
    })
    mockApiGet.mockResolvedValue({
      projects: [{
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
        scripts: mockClawcontrolScripts,
      }],
      runtimeModes: ['Work locally'],
    })
    mockApiPost.mockImplementation(async (_path: string, body?: { path?: string }) => {
      const projectPath = body?.path || '/Users/josue/NewProject'
      const name = projectPath.split('/').filter(Boolean).at(-1) || 'NewProject'
      return {
        project: {
          id: projectPath,
          environmentId: 'local',
          name,
          path: projectPath,
          root: projectPath,
          branches: ['main'],
          currentBranch: 'main',
        },
        projects: [],
      }
    })
    mockApiPatch.mockImplementation(async (_path: string, body?: { id?: string; path?: string; name?: string; scripts?: unknown[]; groupingOverride?: string | null }) => {
      const projectPath = body?.path || '/Volumes/T7/projects/clawctrl'
      const name = body?.name || projectPath.split('/').filter(Boolean).at(-1) || 'clawctrl'
      return {
        project: {
          id: body?.id || projectPath,
          environmentId: 'local',
          name,
          path: projectPath,
          root: projectPath,
          branches: ['main'],
          currentBranch: 'main',
          scripts: body?.scripts,
          groupingOverride: body?.groupingOverride,
        },
        projects: [],
      }
    })
    mockApiDel.mockResolvedValue([])
    mockUseChatState.mockImplementation(() => chatStateStub())
    mockUseCodexLbUsage.mockReturnValue({
      rawUsage: { total_tokens: 40000 },
      usage: {
        raw: { total_tokens: 40000 },
        totalTokens: 40000,
        used: 40,
        limit: 100,
        remaining: 60,
        percent: 40,
        totalCost: 1.25,
        accounts: [
          { id: 'personal', label: 'personal', used: 10, remaining: 90, percent: 10, windows: [] },
        ],
        windows: [
          { id: 'fiveHour', label: '5h', used: 40, limit: 100, remaining: 60, percent: 40 },
          { id: 'weekly', label: 'Week', used: 50, limit: 100, remaining: 50, percent: 50 },
        ],
      },
      loading: false,
      fetching: false,
      error: null,
      lastUpdatedAt: 1779062400000,
      fromCache: false,
      refetch: vi.fn(),
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        { key: 'existing-session', label: 'Existing chat', messageCount: 3 },
      ],
      available: true,
      isLoading: false,
    })
    mockDialogOpen.mockResolvedValue(null)
  })

  it('honors ?new=1 by clearing the selected existing chat', async () => {
    localStorage.setItem('chat-selected-session-key', 'existing-session')
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        context: expect.objectContaining({
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          branch: 'main',
          runtime: 'Work locally',
        }),
        onSessionKey: expect.any(Function),
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('requests composer focus and primes slash commands from the transcript shortcut', async () => {
    const state = chatStateStub()
    state.input = ''
    state.setInput = vi.fn()
    mockUseChatState.mockReturnValue(state)

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await screen.findByTestId('chat-input')
    const shortcutTarget = document.createElement('button')
    shortcutTarget.type = 'button'
    document.body.appendChild(shortcutTarget)
    shortcutTarget.focus()

    fireEvent.keyDown(window, { key: '/' })

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-focus-signal', '1')
      expect(state.setInput).toHaveBeenCalledWith('/')
      expect(sessionStorage.getItem('chat-draft')).toBe('/')
    })
  })

  it('starts a scoped new chat from the app-level command shortcut', async () => {
    localStorage.setItem('chat-selected-session-key', 'existing-session')
    sessionStorage.setItem('chat-draft', 'old prompt')

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.any(Object)))

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })

    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('session')).toBeNull()
      expect(params.get('threadId')).toBeNull()
      expect(screen.getByTestId('session-list')).toHaveAttribute('data-selected-id', '')
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
  })

  it('honors ?session= by opening the requested saved chat', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
        context: expect.objectContaining({
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          branch: 'main',
          runtime: 'Work locally',
        }),
        onSessionKey: expect.any(Function),
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBe('existing-session')
  })

  it('does not expose project terminal actions or fake cwd when workspace context is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveTextContent('Select a project')
    })
    expect(screen.getByLabelText('Runtime')).toBeDisabled()
    expect(screen.getByLabelText('Branch')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Run Tauri dev' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select a project before opening terminal' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select a project before reviewing changes' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Select project Select a project' })).not.toBeInTheDocument()
    expect(screen.getByText('Add a project folder to scope chats and Hermes Agent.')).toBeInTheDocument()
    expect(within(screen.getByTestId('chat-input')).getByRole('button', { name: 'Add project folder' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Session info' }))
    const info = screen.getByRole('region', { name: 'Session info' })
    expect(info).toHaveTextContent('No project selected')
    expect(info).toHaveTextContent('Unscoped chat')
    expect(info).not.toHaveTextContent('Select a project')
    expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
      context: expect.objectContaining({
        project: undefined,
        projectRoot: undefined,
        workingDir: undefined,
      }),
    }))
    expect(showAttachmentStatus).toHaveBeenCalledWith(
      'Workspace folders could not be loaded. You can still chat unscoped or add a project manually.',
      5000,
    )
    warnSpy.mockRestore()
  })

  it('opens project folder entry from the composer when workspace context is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await screen.findByTestId('chat-input')
    const composerAddProject = within(screen.getByTestId('chat-input')).getByRole('button', { name: 'Add project folder' })
    fireEvent.click(composerAddProject)

    expect(await screen.findByRole('dialog', { name: 'Add project' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Project folder path' })).toBeInTheDocument()
    warnSpy.mockRestore()
  })

  it('shows project scope in the empty chat start panel before the first message', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const panel = await screen.findByRole('region', { name: 'Chat start context' })
    expect(panel).toHaveTextContent('Unscoped chat')
    expect(panel).toHaveTextContent('Add a project folder to unlock Hermes Agent workspace chat')
    expect(within(panel).getByRole('button', { name: 'Add project folder' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Manage project context' })).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: 'Add project folder' }))
    expect(await screen.findByRole('dialog', { name: 'Add project' })).toBeInTheDocument()
  })

  it('keeps the current project scope visible above the chat thread', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const strip = await screen.findByRole('region', { name: 'Current project scope' })
    expect(strip).toHaveTextContent('Project: clawctrl')
    expect(strip).toHaveTextContent('/Volumes/T7/projects/clawctrl')
    expect(strip).toHaveTextContent('Work locally')
    expect(strip).toHaveTextContent('main')
    expect(within(strip).getByRole('button', { name: 'Change project' })).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    fireEvent.click(within(strip).getByRole('button', { name: 'Remove project' }))
    expect(await screen.findByRole('dialog', { name: 'Remove project' })).toBeInTheDocument()
  })

  it('opens project folder entry from the app-level route intent', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?addProject=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('dialog', { name: 'Add project' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Project folder path' })).toBeInTheDocument()
    await waitFor(() => {
      expect(searchParamsFromLocation().get('addProject')).toBeNull()
    })
  })

  it('prefills project folder from an app-level route path intent', async () => {
    const routePath = encodeURIComponent('file:///Users/josue/My%20Project')

    render(
      <MemoryRouter initialEntries={[`/chat?addProject=${routePath}`]}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(dialog).getByRole('textbox', { name: 'Project folder path' })).toHaveValue('/Users/josue/My Project')
    await waitFor(() => {
      expect(searchParamsFromLocation().get('addProject')).toBeNull()
    })
  })

  it('prefills project folder from add-project route cwd intent', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?addProject=1&cwd=/tmp/stale-project']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(dialog).getByRole('textbox', { name: 'Project folder path' })).toHaveValue('/tmp/stale-project')
    await waitFor(() => {
      expect(searchParamsFromLocation().get('addProject')).toBeNull()
    })
  })

  it('opens project folder entry from environment settings without stacking dialogs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Select project' }))
    const environmentDialog = await screen.findByRole('dialog', { name: 'Environment settings' })
    fireEvent.click(within(environmentDialog).getByRole('button', { name: 'Add project folder' }))

    expect(await screen.findByRole('dialog', { name: 'Add project' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Environment settings' })).not.toBeInTheDocument()
    warnSpy.mockRestore()
  })

  it('prefills stale environment folder when adding the selected unavailable project', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Selected folder unavailable' }))
    const environmentDialog = await screen.findByRole('dialog', { name: 'Environment settings' })
    expect(within(environmentDialog).getByRole('status', { name: 'Selected project unavailable' })).toHaveTextContent('/tmp/stale')

    fireEvent.click(within(environmentDialog).getByRole('button', { name: 'Add selected project folder' }))

    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(addDialog).getByRole('textbox', { name: 'Project folder path' })).toHaveValue('/tmp/stale')
    expect(screen.queryByRole('dialog', { name: 'Environment settings' })).not.toBeInTheDocument()
    warnSpy.mockRestore()
  })

  it('removes a stale selected folder from environment settings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))
    mockApiDel.mockRejectedValueOnce(new Error('workspace project not found'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Selected folder unavailable' }))
    const environmentDialog = await screen.findByRole('dialog', { name: 'Environment settings' })
    fireEvent.click(within(environmentDialog).getByRole('button', { name: 'Remove selected folder' }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        path: '/tmp/stale',
        environmentId: 'local',
      }))
      expect(screen.queryByRole('dialog', { name: 'Environment settings' })).not.toBeInTheDocument()
      expect(searchParamsFromLocation().get('cwd')).toBeNull()
    })
    expect(showAttachmentStatus).toHaveBeenCalledWith('Removed stale project entry stale.', 5000)
    warnSpy.mockRestore()
  })

  it('prefills stale composer folder when adding the selected unavailable project', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const composerAddProject = within(await screen.findByTestId('chat-input')).getByRole('button', { name: 'Add selected folder' })
    fireEvent.click(composerAddProject)

    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(addDialog).getByRole('textbox', { name: 'Project folder path' })).toHaveValue('/tmp/stale')
    warnSpy.mockRestore()
  })

  it('clears a stale composer folder without opening environment settings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(within(await screen.findByTestId('chat-input')).getByRole('button', { name: 'Clear selected folder' }))

    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
      expect(screen.getByLabelText('Project')).toHaveValue('')
    })
    expect(screen.queryByRole('dialog', { name: 'Environment settings' })).not.toBeInTheDocument()
    warnSpy.mockRestore()
  })

  it('removes a stale selected folder from the project scope strip', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))
    mockApiDel.mockRejectedValueOnce(new Error('workspace project not found'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    const strip = await screen.findByRole('region', { name: 'Current project scope' })
    fireEvent.click(within(strip).getByRole('button', { name: 'Remove selected folder' }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        path: '/tmp/stale',
        environmentId: 'local',
      }))
      expect(searchParamsFromLocation().get('cwd')).toBeNull()
    })
    expect(showAttachmentStatus).toHaveBeenCalledWith('Removed stale project entry stale.', 5000)
    warnSpy.mockRestore()
  })

  it('recovers a stale selected folder from the header action menu', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))
    mockApiPost.mockRejectedValueOnce(new Error('project folder does not exist or cannot be read'))
    mockApiDel.mockRejectedValueOnce(new Error('workspace project not found'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('Selected folder unavailable')
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('/tmp/stale')
    expect(screen.queryByRole('menuitem', { name: /Remove project/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove selected folder' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add selected folder' }))

    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(addDialog).getByRole('textbox', { name: 'Project folder path' })).toHaveValue('/tmp/stale')
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove selected folder' }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        path: '/tmp/stale',
        environmentId: 'local',
      }))
      const params = searchParamsFromLocation()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
    })
    expect(showAttachmentStatus).toHaveBeenCalledWith('Removed stale project entry stale.', 5000)
    warnSpy.mockRestore()
  })

  it('uses the stale selected folder for send-disabled recovery', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      provider: 'codex-cli',
      input: 'run tests',
    })

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const chatInput = await screen.findByTestId('chat-input')
    expect(chatInput).toHaveAttribute(
      'data-send-disabled-reason',
      'Hermes Agent cannot use the selected folder because it is unavailable. Add it again or clear it before sending.',
    )
    expect(chatInput).toHaveAttribute('data-send-disabled-action-label', 'Add selected folder')
    fireEvent.click(within(chatInput).getByRole('button', { name: 'Mock send disabled action' }))

    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(addDialog).getByRole('textbox', { name: 'Project folder path' })).toHaveValue('/tmp/stale')
    warnSpy.mockRestore()
  })

  it('shows unavailable selected folder details in session info', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&env=harness-vm&branch=old&runtime=old']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Session info' }))
    const info = screen.getByRole('region', { name: 'Session info' })
    expect(info).toHaveTextContent('Selected folder unavailable')
    expect(info).toHaveTextContent('/tmp/stale')
    expect(info).toHaveTextContent('Hermes Agent VM')
    expect(info).not.toHaveTextContent('harness-vm')
    expect(info).not.toHaveTextContent('Unscoped chat')
    warnSpy.mockRestore()
  })

  it('preserves route branch when adding the stale selected folder', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockUseGatewaySessions.mockReturnValue({
      sessions: [],
      available: true,
      isLoading: false,
    })
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))
    mockApiPost.mockResolvedValueOnce({
      project: {
        id: 'local:stale:stable',
        environmentId: 'local',
        name: 'stale',
        path: '/tmp/stale',
        root: '/tmp/stale',
        branches: ['main', 'old'],
        currentBranch: 'main',
      },
      projects: [],
    })

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=Work+locally']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    const composerAddProject = within(await screen.findByTestId('chat-input')).getByRole('button', { name: 'Add selected folder' })
    fireEvent.click(composerAddProject)
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'stale',
          workingDir: '/tmp/stale',
          branch: 'old',
          runtime: 'Work locally',
        }),
      }))
      expect(screen.getByLabelText('Project')).toHaveValue('/tmp/stale')
      expect(screen.getByLabelText('Branch')).toHaveValue('old')
    })
    const params = searchParamsFromLocation()
    expect(params.get('cwd')).toBe('/tmp/stale')
    expect(params.get('branch')).toBe('old')
    expect(params.get('runtime')).toBe('Work locally')
    warnSpy.mockRestore()
  })

  it('requires a selected project before sending to a direct local provider', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const send = vi.fn()
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute(
        'data-send-disabled-reason',
        'Hermes Agent needs a project folder. Select or add a project before sending.',
      )
    })
    expect(screen.getByRole('button', { name: 'Mock send' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))
    expect(send).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('blocks Hermes sends while the selected project folder is unavailable', async () => {
    const send = vi.fn()
    localStorage.setItem('chat-selected-project-path', '/tmp/stale-project')
    mockApiGet.mockReturnValue(new Promise(() => undefined))
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'hermes',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute(
        'data-send-disabled-reason',
        'Hermes Agent cannot use the selected folder because it is unavailable. Add it again or clear it before sending.',
      )
    })
    expect(screen.getByRole('button', { name: 'Mock send' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))
    expect(send).not.toHaveBeenCalled()
  })

  it('surfaces native image picker read failures in the chat status', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockDialogOpen.mockResolvedValueOnce(['/tmp/broken.png'])
    mockTauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'read_chat_image_data_urls') throw new Error('read failed')
      return []
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Mock browse images' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('read_chat_image_data_urls', {
        paths: ['/tmp/broken.png'],
      })
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Image attachment failed to load. Check the selected files and try again.',
        4500,
      )
    })
    warnSpy.mockRestore()
  })

  it('dedupes sanitized native image picker path variants before reading images', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const setImages = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      imagesRef: { current: [] },
      setImages,
    })
    mockDialogOpen.mockResolvedValueOnce([
      'file:///Users/josue/Pictures/cat%20one.png',
      '/Users/josue/Pictures/cat\\ one.png',
      ' "/Users/josue/Pictures/dog.png" ',
      'file:///Users/josue/Pictures/dog.png',
      '   ',
    ])
    mockTauriInvoke.mockImplementation(async () => ['data:image/png;base64,cat'])

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Mock browse images' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('read_chat_image_data_urls', {
        paths: [
          '/Users/josue/Pictures/cat one.png',
          '/Users/josue/Pictures/dog.png',
        ],
      })
    })
    expect(setImages).toHaveBeenCalledWith(['data:image/png;base64,cat'])
  })

  it('surfaces the image limit when native image picks exceed remaining slots', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const selectedImages = Array.from({ length: CHAT_IMAGE_LIMIT + 1 }, (_, index) => (
      `data:image/png;base64,selected-${index}`
    ))
    const setImages = vi.fn()
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      imagesRef: { current: [] },
      setImages,
      showAttachmentStatus,
    })
    mockDialogOpen.mockResolvedValueOnce(selectedImages.map((_, index) => `/tmp/image-${index}.png`))
    mockTauriInvoke.mockImplementation(async () => selectedImages)

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Mock browse images' }))

    await waitFor(() => {
      expect(setImages).toHaveBeenLastCalledWith(selectedImages.slice(0, CHAT_IMAGE_LIMIT))
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        `You can attach up to ${CHAT_IMAGE_LIMIT} images at once.`,
      )
    })
  })

  it('surfaces empty native image selections that contain no supported images', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const showAttachmentStatus = vi.fn()
    const setImages = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      imagesRef: { current: [] },
      setImages,
      showAttachmentStatus,
    })
    mockDialogOpen.mockResolvedValueOnce(['/tmp/notes.txt'])
    mockTauriInvoke.mockImplementation(async () => [])

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const browseImages = await screen.findByRole('button', { name: 'Mock browse images' })
    setImages.mockClear()
    fireEvent.click(browseImages)

    await waitFor(() => {
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'No supported images were attached. Select PNG, JPG, GIF, or WebP files.',
      )
    })
    expect(setImages).not.toHaveBeenCalled()
  })

  it('dedupes sanitized native context picker path variants before reading context files', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const appendContextFileAttachments = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      appendContextFileAttachments,
    })
    const attachment = {
      id: 'readme',
      name: 'README.md',
      path: '/Users/josue/My Project/README.md',
      content: '# Readme',
      size: 8,
    }
    mockDialogOpen.mockResolvedValueOnce([
      '/Users/josue/My\\ Project/README.md',
      'file:///Users/josue/My%20Project/README.md',
      '`/Users/josue/My Project/package.json`',
      'file:///Users/josue/My%20Project/package.json',
    ])
    mockTauriInvoke.mockImplementation(async () => [attachment])

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Mock browse context files' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('read_chat_context_files', {
        paths: [
          '/Users/josue/My Project/README.md',
          '/Users/josue/My Project/package.json',
        ],
      })
    })
    expect(appendContextFileAttachments).toHaveBeenCalledWith([attachment])
  })

  it('surfaces empty native folder context selections', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const appendContextFileAttachments = vi.fn()
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      appendContextFileAttachments,
      showAttachmentStatus,
    })
    mockDialogOpen.mockResolvedValueOnce('/tmp/empty-project')
    mockTauriInvoke.mockImplementation(async () => [])

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Mock browse context folder' }))

    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenCalledWith(expect.objectContaining({
        directory: true,
        multiple: true,
        title: 'Attach folder context',
      }))
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'No supported text files were found in that folder.',
      )
    })
    expect(appendContextFileAttachments).not.toHaveBeenCalled()
  })

  it('opens native attachment pickers from the selected project folder', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    mockTauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            id: 'local-agent-shell',
            environmentId: 'local',
            name: 'AgentShell',
            path: '/Users/josue/AgentShell',
            root: '/Users/josue/AgentShell',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })
    mockDialogOpen.mockResolvedValue(null)

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Select project AgentShell' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mock browse images' }))
    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenNthCalledWith(1, expect.objectContaining({
        directory: false,
        multiple: true,
        title: 'Attach image',
        defaultPath: '/Users/josue/AgentShell',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mock browse context files' }))
    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenNthCalledWith(2, expect.objectContaining({
        directory: false,
        multiple: true,
        title: 'Attach file context',
        defaultPath: '/Users/josue/AgentShell',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mock browse context folder' }))
    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenNthCalledWith(3, expect.objectContaining({
        directory: true,
        multiple: true,
        title: 'Attach folder context',
        defaultPath: '/Users/josue/AgentShell',
      }))
    })
  })

  it('does not auto-select the first project in a multi-project workspace', async () => {
    const send = vi.fn()
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'local:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
      ],
      runtimeModes: ['Work locally'],
    })
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select project clawctrl' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
      expect(screen.getByRole('button', { name: 'Select a project before opening terminal' })).toBeDisabled()
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(searchParamsFromLocation().get('cwd')).toBeNull()
    expect(localStorage.getItem('chat-selected-project-path')).toBe('')
  })

  it('does not auto-select the only stored project without an explicit selection', async () => {
    const send = vi.fn()
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
      ],
      runtimeModes: ['Work locally'],
    })
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select project clawctrl' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
      expect(screen.getByRole('button', { name: 'Select a project before opening terminal' })).toBeDisabled()
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(searchParamsFromLocation().get('cwd')).toBeNull()
    expect(localStorage.getItem('chat-selected-project-path')).toBe('')
  })

  it('does not treat a route env qualifier as a project selection', async () => {
    const send = vi.fn()
    localStorage.setItem('chat-selected-project-path', '/Volumes/T7/projects/clawctrl')
    localStorage.setItem('chat-selected-project-environment', 'local')
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&env=local']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Select a project before opening terminal' })).toBeDisabled()
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-send-disabled-reason',
      'Hermes Agent needs a project folder. Select or add a project before sending.',
    )
    await waitFor(() => {
      expect(searchParamsFromLocation().get('env')).toBeNull()
      expect(localStorage.getItem('chat-selected-project-path')).toBe('')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))
    expect(send).not.toHaveBeenCalled()
  })

  it('does not treat a fallback project as selected while stored route state is stale', async () => {
    const send = vi.fn()
    localStorage.setItem('chat-selected-project-path', '/tmp/stale-project')
    localStorage.setItem('chat-added-projects', JSON.stringify([{
      id: 'local:agentshell',
      environmentId: 'local',
      name: 'AgentShell',
      path: '/Users/josue/AgentShell',
      root: '/Users/josue/AgentShell',
      branches: ['main'],
      currentBranch: 'main',
    }]))
    mockApiGet.mockReturnValue(new Promise(() => undefined))
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute(
        'data-send-disabled-reason',
        'Hermes Agent cannot use the selected folder because it is unavailable. Add it again or clear it before sending.',
      )
    })
    expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
      context: expect.objectContaining({
        project: undefined,
        projectRoot: undefined,
        workingDir: undefined,
      }),
    }))
    expect(screen.getByRole('button', { name: 'Mock send' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))
    expect(send).not.toHaveBeenCalled()
  })

  it('surfaces unavailable project selections instead of silently ignoring them', async () => {
    const showAttachmentStatus = vi.fn()
    const missingPath = '/Volumes/T7/projects/missing-project'
    localStorage.setItem('chat-selected-project-path', '/Volumes/T7/projects/clawctrl')
    localStorage.setItem('chat-selected-project-environment', 'local')
    mockApiPost.mockRejectedValue(new Error('missing project'))
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })

    render(
      <MemoryRouter initialEntries={[`/chat?cwd=${encodeURIComponent(missingPath)}`]}>
        <LocationProbe />
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Project folder is no longer available. Add it again or select another project.',
        5000,
      )
    })
    expect(screen.getByLabelText('Project')).toHaveValue(missingPath)
    expect(screen.getByRole('option', { name: 'Unavailable - .../projects/missing-project' })).toBeDisabled()
    expect(searchParamsFromLocation().get('cwd')).toBe(missingPath)
  })

  it('clears a stale stored project path instead of silently selecting the first loaded project', async () => {
    const send = vi.fn()
    localStorage.setItem('chat-selected-project-path', '/tmp/stale-project')
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          projectRoot: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-send-disabled-reason',
      'Hermes Agent needs a project folder. Select or add a project before sending.',
    )
    await waitFor(() => {
      expect(localStorage.getItem('chat-selected-project-path')).toBe('')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))
    expect(send).not.toHaveBeenCalled()
  })

  it('honors a saved unscoped project selection instead of selecting the first loaded project', async () => {
    const send = vi.fn()
    localStorage.setItem('chat-selected-project-path', '')
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          projectRoot: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(screen.getByLabelText('Project')).toHaveValue('')
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-send-disabled-reason',
      'Hermes Agent needs a project folder. Select or add a project before sending.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))
    expect(send).not.toHaveBeenCalled()
  })

  it('canonicalizes a stored project path that differs only by trailing slash', async () => {
    localStorage.setItem('chat-selected-project-path', '/Volumes/T7/projects/clawctrl/')

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawctrl')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
        }),
      }))
      expect(localStorage.getItem('chat-selected-project-path')).toBe('/Volumes/T7/projects/clawctrl')
    })
  })

  it('prefers the local environment for legacy path-only project selection when same-path roots exist', async () => {
    localStorage.setItem('chat-selected-project-path', '/Users/josue/AgentShell')
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'remote-agent-shell',
          environmentId: 'harness-vm',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          root: '/Users/josue/AgentShell',
          branches: ['main', 'remote-work'],
          currentBranch: 'remote-work',
          machineLabel: 'Harness VM',
        },
        {
          id: 'local-agent-shell',
          environmentId: 'local',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          root: '/Users/josue/AgentShell',
          branches: ['main', 'local-work'],
          currentBranch: 'local-work',
          machineLabel: 'Local Mac',
        },
      ],
      runtimeModes: ['Work locally', 'Harness VM'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          projectId: 'local-agent-shell',
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'local',
          branch: 'local-work',
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('projectId')).toBe('local-agent-shell')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('local')
      expect(localStorage.getItem('chat-selected-project-environment')).toBe('local')
    })
  })

  it('allows clearing project scope from the composer project selector', async () => {
    const send = vi.fn()
    persistClawcontrolProjectSelection()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'run tests',
      provider: 'codex-cli',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveValue('/Volumes/T7/projects/clawctrl')
    })

    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '' } })

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          projectRoot: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-send-disabled-reason',
      'Hermes Agent needs a project folder. Select or add a project before sending.',
    )
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('projectId')).toBeNull()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
      expect(localStorage.getItem('chat-selected-project-path')).toBe('')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps sidebar New chat unscoped after stale project selection is cleared', async () => {
    localStorage.setItem('chat-selected-project-path', '/tmp/stale-project')

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('projectId')).toBeNull()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
    })
    expect(localStorage.getItem('chat-selected-project-path')).toBe('')
  })

  it('allows Hermes to send without a selected project', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const send = vi.fn()
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      input: 'unscoped question',
      provider: 'hermes',
      send,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-send-disabled-reason', '')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }))

    expect(send).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('keeps newly created chats unscoped when no real project is selected', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
        onSessionKey: expect.any(Function),
      }))
    })

    const options = mockUseChatState.mock.calls.at(-1)?.[1]
    act(() => {
      options.onSessionKey('unscoped-created-session')
    })

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('unscoped-created-session', expect.objectContaining({
        blank: false,
        newChat: false,
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBe('unscoped-created-session')
    expect(localStorage.getItem('chat-session-project-refs')).toBeNull()
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('session')).toBe('unscoped-created-session')
      expect(params.get('threadId')).toBe('unscoped-created-session')
      expect(params.get('environmentId')).toBe('local')
      expect(params.get('projectId')).toBeNull()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
    })
    warnSpy.mockRestore()
  })

  it('does not keep stale workspace route params when starting a new chat without a project', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockApiGet.mockRejectedValueOnce(new Error('workspace unavailable'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=/tmp/stale&branch=old&runtime=old']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveTextContent('Unavailable - /tmp/stale')
    })

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('projectId')).toBeNull()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
    })
    warnSpy.mockRestore()
  })

  it('honors T3 thread route params by opening the requested chat', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?environmentId=local&threadId=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBe('existing-session')
  })

  it('uses the T3 route environment when thread ids collide across environments', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'desktop:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'shared-thread',
          label: 'Local shared thread',
          messageCount: 2,
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
        {
          key: 'shared-thread',
          label: 'Desktop shared thread',
          messageCount: 4,
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
          branch: 'feature/agent-shell',
          runtime: 'Remote harness',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?environmentId=desktop&threadId=shared-thread']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Desktop shared thread' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('feature/agent-shell')
      expect((screen.getByLabelText('Runtime') as HTMLSelectElement).value).toBe('Remote harness')
      expect(mockUseChatState).toHaveBeenLastCalledWith('shared-thread', expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('threadId')).toBe('shared-thread')
      expect(params.get('environmentId')).toBe('desktop')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('desktop')
    })
  })

  it('does not fall back to a same-key thread from another route environment', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
      ],
      runtimeModes: ['Work locally'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'shared-thread',
          label: 'Local shared thread',
          messageCount: 2,
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?environmentId=desktop&threadId=shared-thread']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New chat' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Local shared thread' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Project')).toHaveValue('')
      expect(mockUseChatState).toHaveBeenLastCalledWith('shared-thread', expect.objectContaining({
        sessionEnvironmentId: 'desktop',
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
          environmentId: undefined,
          branch: undefined,
          runtime: undefined,
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('threadId')).toBe('shared-thread')
      expect(params.get('environmentId')).toBe('desktop')
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
    })
  })

  it('uses the stored selected-session environment when reopening colliding thread ids', async () => {
    localStorage.setItem('chat-selected-session-key', 'shared-thread')
    localStorage.setItem('chat-selected-session-environment', 'desktop')
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'desktop:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'shared-thread',
          label: 'Local shared thread',
          messageCount: 2,
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
        {
          key: 'shared-thread',
          label: 'Desktop shared thread',
          messageCount: 4,
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
          branch: 'feature/agent-shell',
          runtime: 'Remote harness',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Desktop shared thread' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect(mockUseChatState).toHaveBeenLastCalledWith('shared-thread', expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('threadId')).toBe('shared-thread')
      expect(params.get('environmentId')).toBe('desktop')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('desktop')
    })
  })

  it('keeps sidebar selection environment-scoped when clicking colliding thread ids', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'desktop:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'shared-thread',
          label: 'Local shared thread',
          messageCount: 2,
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
        {
          key: 'shared-thread',
          label: 'Desktop shared thread',
          messageCount: 4,
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
          branch: 'feature/agent-shell',
          runtime: 'Remote harness',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(searchParamsFromLocation().get('new')).toBeNull()
    })
    await screen.findByRole('button', { name: 'Select project AgentShell' })
    fireEvent.click(await screen.findByRole('option', { name: 'Desktop shared thread, 4 messages' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Desktop shared thread' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect(mockUseChatState).toHaveBeenLastCalledWith('shared-thread', expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('threadId')).toBe('shared-thread')
      expect(params.get('environmentId')).toBe('desktop')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('desktop')
    })
  })

  it('selects an existing chat from the sidebar and persists URL state', async () => {
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'existing-session',
          label: 'Existing chat',
          messageCount: 3,
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
      }))
    })

    fireEvent.click(screen.getByRole('option', { name: /Existing chat, 3 messages/ }))

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBe('existing-session')
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('session')).toBe('existing-session')
      expect(params.get('threadId')).toBe('existing-session')
      expect(params.get('environmentId')).toBe('local')
      expect(params.get('cwd')).toBe('/Volumes/T7/projects/clawctrl')
    })
  })

  it('clears project scope when selecting an unscoped Recent chat from a project route', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawctrl:stable',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'project-chat',
          label: 'Project-owned chat',
          messageCount: 3,
          projectId: 'local:clawctrl:stable',
          workingDir: '/Volumes/T7/projects/clawctrl',
          project: 'clawctrl',
          environmentId: 'local',
        },
        {
          key: 'loose-chat',
          label: 'Loose scratch chat',
          messageCount: 1,
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&projectId=local%3Aclawctrl%3Astable&cwd=%2FVolumes%2FT7%2Fprojects%2Fclawctrl&env=local&branch=main&runtime=Work+locally']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawctrl')
      expect(screen.getByLabelText('Projects')).toContainElement(
        screen.getByRole('option', { name: /Project-owned chat, 3 messages/ }),
      )
      expect(screen.getByLabelText('Recent')).toContainElement(
        screen.getByRole('option', { name: /Loose scratch chat, 1 message/ }),
      )
    })

    fireEvent.click(within(screen.getByLabelText('Recent')).getByRole('option', { name: /Loose scratch chat, 1 message/ }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
      expect(mockUseChatState).toHaveBeenLastCalledWith('loose-chat', expect.objectContaining({
        blank: false,
        newChat: false,
        context: expect.objectContaining({
          project: undefined,
          projectRoot: undefined,
          workingDir: undefined,
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('session')).toBe('loose-chat')
      expect(params.get('threadId')).toBe('loose-chat')
      expect(params.get('projectId')).toBeNull()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
    })
  })

  it('keeps rename compact and delete actions on unified sidebar chat rows', async () => {
    localStorage.setItem('chat-session-project-refs', JSON.stringify({
      'existing-session': {
        projectId: 'local:clawctrl:stable',
        workingDir: '/Volumes/T7/projects/clawctrl',
      },
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-list')).toHaveAttribute('data-selected-id', 'existing-session')
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    expect(screen.getByRole('menu', { name: 'Actions for Existing chat' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Actions for Existing chat' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename chat Existing chat' }))
    const renameInput = screen.getByRole('textbox', { name: 'Rename Existing chat' })
    fireEvent.change(renameInput, { target: { value: 'Renamed chat' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compact chat Existing chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy thread id for Existing chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete chat Existing chat' }))

    await waitFor(() => {
      expect(mockRenameMutate).toHaveBeenCalledWith({ key: 'existing-session', label: 'Renamed chat' })
      expect(mockCompactMutate).toHaveBeenCalledWith('existing-session')
      expect(mockDeleteMutate).toHaveBeenCalledWith('existing-session', expect.objectContaining({
        onError: expect.any(Function),
      }))
      expect(mockClipboardWrite).toHaveBeenCalledWith('existing-session')
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
    expect(localStorage.getItem('chat-session-project-refs')).toBeNull()
  })

  it('restores selected chat and project refs when chat deletion fails', async () => {
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    localStorage.setItem('chat-session-project-refs', JSON.stringify({
      'existing-session': {
        projectId: 'local:clawctrl:stable',
        project: 'clawctrl',
        projectRoot: '/Volumes/T7/projects/clawctrl',
        workingDir: '/Volumes/T7/projects/clawctrl',
        environmentId: 'local',
      },
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session&threadId=existing-session&environmentId=local&cwd=%2FVolumes%2FT7%2Fprojects%2Fclawctrl&projectId=local%3Aclawctrl%3Astable&env=local&branch=main&runtime=Work+locally']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-list')).toHaveAttribute('data-selected-id', 'existing-session')
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete chat Existing chat' }))

    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledWith({
        key: 'existing-session',
        environmentId: 'local',
      }, expect.objectContaining({
        onError: expect.any(Function),
      }))
      expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
      expect(localStorage.getItem('chat-session-project-refs')).toBeNull()
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('new')).toBeNull()
      expect(params.get('session')).toBeNull()
      expect(params.get('threadId')).toBeNull()
      expect(params.get('environmentId')).toBeNull()
      expect(params.get('cwd')).toBe('/Volumes/T7/projects/clawctrl')
    })

    const deleteOptions = mockDeleteMutate.mock.calls.at(-1)?.[1] as { onError?: () => void } | undefined
    act(() => {
      deleteOptions?.onError?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('session-list')).toHaveAttribute('data-selected-id', 'existing-session')
      expect(localStorage.getItem('chat-selected-session-key')).toBe('existing-session')
      expect(JSON.parse(localStorage.getItem('chat-session-project-refs') || '{}')).toHaveProperty('existing-session')
      expect(searchParamsFromLocation().get('session')).toBe('existing-session')
      expect(searchParamsFromLocation().get('cwd')).toBe('/Volumes/T7/projects/clawctrl')
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Chat deletion failed. Restored Existing chat.',
        5000,
      )
    })
  })

  it('promotes a newly created saved chat into session URL state', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        sessionEnvironmentId: 'local',
        context: expect.objectContaining({
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
        }),
        onSessionKey: expect.any(Function),
      }))
    })

    const options = mockUseChatState.mock.calls.at(-1)?.[1]
    act(() => {
      options.onSessionKey('created-session')
    })

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('created-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBe('created-session')
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('session')).toBe('created-session')
      expect(params.get('cwd')).toBe('/Volumes/T7/projects/clawctrl')
    })
  })

  it('preserves returned environment scope when promoting a newly created chat', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'desktop-agent-shell',
        name: 'AgentShell',
        path: '/Users/josue/AgentShell',
        root: '/Users/josue/AgentShell',
        environmentId: 'desktop',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        onSessionKey: expect.any(Function),
      }))
    })

    const options = mockUseChatState.mock.calls.at(-1)?.[1]
    act(() => {
      options.onSessionKey('created-desktop-session', { environmentId: 'desktop' })
    })

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('created-desktop-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })

    const refs = JSON.parse(localStorage.getItem('chat-session-project-refs') || '{}')
    expect(refs).toHaveProperty('desktop:created-desktop-session')
    expect(refs['desktop:created-desktop-session']).toEqual(expect.objectContaining({
      project: 'AgentShell',
      workingDir: '/Users/josue/AgentShell',
      environmentId: 'desktop',
    }))
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('session')).toBe('created-desktop-session')
      expect(params.get('threadId')).toBe('created-desktop-session')
      expect(params.get('environmentId')).toBe('desktop')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('desktop')
    })
  })

  it('keeps sidebar New chat blank instead of reselecting the saved session', async () => {
    localStorage.setItem('chat-selected-session-key', 'existing-session')

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
      }))
    })
    expect(screen.getByTestId('session-list')).toHaveAttribute('data-selected-id', '')
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('starts a fresh project-scoped chat when changing project from a saved chat', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'desktop:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'existing-session',
          label: 'Existing chat',
          messageCount: 3,
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session&threadId=existing-session&environmentId=local']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawctrl')
    })

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: '/Users/josue/AgentShell' },
    })

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
          branch: 'feature/agent-shell',
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('new')).toBeNull()
      expect(params.get('session')).toBeNull()
      expect(params.get('threadId')).toBeNull()
      expect(params.get('environmentId')).toBeNull()
      expect(params.get('projectId')).toBe('desktop:agent-shell:stable')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('desktop')
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('starts a fresh project-scoped chat when adding a project from a saved chat', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session&threadId=existing-session&environmentId=local']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawctrl')
    })

    const sidebar = screen.getByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.change(within(addDialog).getByRole('textbox', { name: 'Project folder path' }), {
      target: { value: '/Users/josue/NewProject' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        path: '/Users/josue/NewProject',
      })
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        context: expect.objectContaining({
          project: 'NewProject',
          workingDir: '/Users/josue/NewProject',
          environmentId: 'local',
          branch: 'main',
        }),
      }))
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/NewProject')
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('new')).toBeNull()
      expect(params.get('session')).toBeNull()
      expect(params.get('threadId')).toBeNull()
      expect(params.get('environmentId')).toBeNull()
      expect(params.get('cwd')).toBe('/Users/josue/NewProject')
      expect(params.get('env')).toBe('local')
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('starts a fresh unscoped chat when clearing project from a saved chat', async () => {
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'existing-session',
          label: 'Existing chat',
          messageCount: 3,
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
          environmentId: 'local',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session&threadId=existing-session&environmentId=local']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawctrl')
    })

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: '' },
    })

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
          environmentId: undefined,
          branch: undefined,
          runtime: undefined,
        }),
      }))
      expect(screen.getByLabelText('Project')).toHaveValue('')
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('new')).toBeNull()
      expect(params.get('session')).toBeNull()
      expect(params.get('threadId')).toBeNull()
      expect(params.get('environmentId')).toBeNull()
      expect(params.get('projectId')).toBeNull()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('env')).toBeNull()
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('restores a previous user message into the composer as a reusable prompt', async () => {
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: [] as string[] }
    const contextFiles = [{
      id: 'ctx-reuse',
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    }]
    const contextFilesRef = { current: [] as typeof contextFiles }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [{
        id: 'user-reuse',
        role: 'user',
        text: 'reuse this prompt',
        timestamp: '2026-05-21T12:00:00.000Z',
        images: ['data:image/png;base64,reuse'],
        contextFiles,
      }],
      setInput,
      imagesRef,
      setImages,
      contextFilesRef,
      setContextFiles,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Use user-reuse as prompt' }))

    expect(setInput).toHaveBeenCalledWith('reuse this prompt')
    expect(setImages).toHaveBeenCalledWith(['data:image/png;base64,reuse'])
    expect(imagesRef.current).toEqual(['data:image/png;base64,reuse'])
    expect(setContextFiles).toHaveBeenCalledWith(contextFiles)
    expect(contextFilesRef.current).toEqual(contextFiles)
    expect(sessionStorage.getItem('chat-draft')).toBe('reuse this prompt')
    expect(JSON.parse(sessionStorage.getItem('chat-draft-images') || '[]')).toEqual(['data:image/png;base64,reuse'])
    expect(JSON.parse(sessionStorage.getItem('chat-draft-context-files') || '[]')).toEqual(contextFiles)
  })

  it('forks a previous user message into a fresh editable chat draft', async () => {
    localStorage.setItem('chat-selected-session-key', 'existing-session')
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: [] as string[] }
    const contextFiles = [{
      id: 'ctx-fork-page',
      name: 'ForkPage.tsx',
      path: 'frontend/src/pages/ForkPage.tsx',
      content: 'export default function ForkPage() {}',
    }]
    const contextFilesRef = { current: [] as typeof contextFiles }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [{
        id: 'user-fork-page',
        role: 'user',
        text: 'fork this prompt',
        timestamp: '2026-05-21T12:00:00.000Z',
        images: ['data:image/png;base64,fork-page'],
        contextFiles,
      }],
      setInput,
      imagesRef,
      setImages,
      contextFilesRef,
      setContextFiles,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Fork user-fork-page' }))

    expect(setInput).toHaveBeenCalledWith('fork this prompt')
    expect(setImages).toHaveBeenCalledWith(['data:image/png;base64,fork-page'])
    expect(imagesRef.current).toEqual(['data:image/png;base64,fork-page'])
    expect(setContextFiles).toHaveBeenCalledWith(contextFiles)
    expect(contextFilesRef.current).toEqual(contextFiles)
    expect(sessionStorage.getItem('chat-draft')).toBe('fork this prompt')
    expect(JSON.parse(sessionStorage.getItem('chat-draft-images') || '[]')).toEqual(['data:image/png;base64,fork-page'])
    expect(JSON.parse(sessionStorage.getItem('chat-draft-context-files') || '[]')).toEqual(contextFiles)
    await waitFor(() => {
      expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
      expect(searchParamsFromLocation().get('session')).toBeNull()
    })
  })

  it('keeps same-text prompt history entries when their images differ', async () => {
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [
        {
          id: 'older-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:00:00.000Z',
          images: ['data:image/png;base64,one'],
        },
        {
          id: 'newer-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:01:00.000Z',
          images: ['data:image/png;base64,two'],
        },
      ],
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const chatInput = await screen.findByTestId('chat-input')
    const promptHistory = JSON.parse(chatInput.getAttribute('data-prompt-history') || '[]')

    expect(promptHistory).toMatchObject([
      {
        text: 'compare screenshot',
        images: ['data:image/png;base64,two'],
      },
      {
        text: 'compare screenshot',
        images: ['data:image/png;base64,one'],
      },
    ])
  })

  it('hydrates repeated same-text prompt history from sequenced optimistic attachment cache', async () => {
    const optimisticImageCacheRef = {
      current: new Map([
        [optimisticAttachmentCacheKey('compare screenshot', 1), ['data:image/png;base64,one']],
        [optimisticAttachmentCacheKey('compare screenshot', 2), ['data:image/png;base64,two']],
        ['compare screenshot', ['data:image/png;base64,two']],
      ]),
    }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [
        {
          id: 'older-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
        {
          id: 'newer-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:01:00.000Z',
        },
      ],
      optimisticImageCacheRef,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const chatInput = await screen.findByTestId('chat-input')
    const promptHistory = JSON.parse(chatInput.getAttribute('data-prompt-history') || '[]')

    expect(promptHistory).toMatchObject([
      {
        text: 'compare screenshot',
        images: ['data:image/png;base64,two'],
      },
      {
        text: 'compare screenshot',
        images: ['data:image/png;base64,one'],
      },
    ])
  })

  it('does not put latest same-text attachment on an earlier unattached prompt history entry', async () => {
    const optimisticImageCacheRef = {
      current: new Map([
        [optimisticAttachmentCacheKey('compare screenshot', 2), ['data:image/png;base64,two']],
        ['compare screenshot', ['data:image/png;base64,two']],
      ]),
    }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [
        {
          id: 'plain-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
        {
          id: 'attached-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:01:00.000Z',
        },
      ],
      optimisticImageCacheRef,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const chatInput = await screen.findByTestId('chat-input')
    const promptHistory = JSON.parse(chatInput.getAttribute('data-prompt-history') || '[]')

    expect(promptHistory).toMatchObject([
      {
        text: 'compare screenshot',
        images: ['data:image/png;base64,two'],
      },
      {
        text: 'compare screenshot',
        images: [],
      },
    ])
  })

  it('aligns prompt history attachment fallback to the latest same-text history messages', async () => {
    const optimisticImageCacheRef = {
      current: new Map([
        [optimisticAttachmentCacheKey('compare screenshot', 1), ['data:image/png;base64,one']],
        [optimisticAttachmentCacheKey('compare screenshot', 2), ['data:image/png;base64,two']],
        ['compare screenshot', ['data:image/png;base64,two']],
      ]),
    }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [
        {
          id: 'old-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-20T12:00:00.000Z',
        },
        {
          id: 'recent-history-screenshot-one',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
        {
          id: 'recent-history-screenshot-two',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:01:00.000Z',
        },
      ],
      optimisticImageCacheRef,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const chatInput = await screen.findByTestId('chat-input')
    const promptHistory = JSON.parse(chatInput.getAttribute('data-prompt-history') || '[]')

    expect(promptHistory).toMatchObject([
      {
        text: 'compare screenshot',
        images: ['data:image/png;base64,two'],
      },
      {
        text: 'compare screenshot',
        images: ['data:image/png;base64,one'],
      },
      {
        text: 'compare screenshot',
        images: [],
      },
    ])
  })

  it('reuses a previous prompt even when composer draft storage is unavailable', async () => {
    sessionStorage.clear()
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: [] as string[] }
    const contextFiles = [{
      id: 'ctx-storage-failure',
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    }]
    const contextFilesRef = { current: [] as typeof contextFiles }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [{
        id: 'user-storage-failure',
        role: 'user',
        text: 'reuse despite storage failure',
        timestamp: '2026-05-21T12:00:00.000Z',
        images: ['data:image/png;base64,reuse'],
        contextFiles,
      }],
      setInput,
      imagesRef,
      setImages,
      contextFilesRef,
      setContextFiles,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })

    sessionStorage.setItem('chat-draft', 'stale prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(['data:image/png;base64,stale']))
    sessionStorage.setItem('chat-draft-context-files', JSON.stringify([{
      id: 'stale',
      name: 'stale.ts',
      content: 'stale',
    }]))
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Use user-storage-failure as prompt' }))
    } finally {
      setItemSpy.mockRestore()
    }

    expect(setInput).toHaveBeenCalledWith('reuse despite storage failure')
    expect(setImages).toHaveBeenCalledWith(['data:image/png;base64,reuse'])
    expect(imagesRef.current).toEqual(['data:image/png;base64,reuse'])
    expect(setContextFiles).toHaveBeenCalledWith(contextFiles)
    expect(contextFilesRef.current).toEqual(contextFiles)
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-context-files')).toBeNull()
  })

  it('sends the previous user prompt when regenerating an assistant response', async () => {
    sessionStorage.clear()
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const sendMessage = vi.fn(() => true)
    const imagesRef = { current: [] as string[] }
    const contextFiles = [{
      id: 'ctx-regenerate',
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    }]
    const contextFilesRef = { current: [] as typeof contextFiles }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [
        {
          id: 'user-regenerate',
          role: 'user',
          text: 'try this again',
          timestamp: '2026-05-21T12:00:00.000Z',
          images: ['data:image/png;base64,regen'],
          contextFiles,
        },
        {
          id: 'assistant-regenerate',
          role: 'assistant',
          text: 'First attempt',
          timestamp: '2026-05-21T12:00:01.000Z',
        },
      ],
      setInput,
      imagesRef,
      setImages,
      contextFilesRef,
      setContextFiles,
      sendMessage,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate assistant-regenerate' }))

    expect(sendMessage).toHaveBeenCalledWith('try this again', ['data:image/png;base64,regen'], contextFiles)
    expect(setInput).not.toHaveBeenCalled()
    expect(setImages).not.toHaveBeenCalled()
    expect(imagesRef.current).toEqual([])
    expect(setContextFiles).not.toHaveBeenCalled()
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-context-files')).toBeNull()
  })

  it('sends a continuation prompt from assistant response actions without clearing the composer draft', async () => {
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const sendMessage = vi.fn(() => true)
    const imagesRef = { current: ['data:image/png;base64,old'] }
    const contextFilesRef = {
      current: [{
        id: 'ctx-old',
        name: 'Old.tsx',
        path: 'frontend/src/pages/Old.tsx',
        content: 'old',
      }],
    }
    sessionStorage.setItem('chat-draft-images', JSON.stringify(imagesRef.current))
    sessionStorage.setItem('chat-draft-context-files', JSON.stringify(contextFilesRef.current))
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      messages: [{
        id: 'assistant-continue',
        role: 'assistant',
        text: 'Long response so far',
        timestamp: '2026-05-21T12:00:01.000Z',
      }],
      setInput,
      imagesRef,
      setImages,
      contextFilesRef,
      setContextFiles,
      sendMessage,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Continue assistant-continue' }))

    expect(sendMessage).toHaveBeenCalledWith('Continue from your last response.')
    expect(setInput).not.toHaveBeenCalled()
    expect(setImages).not.toHaveBeenCalled()
    expect(imagesRef.current).toEqual(['data:image/png;base64,old'])
    expect(setContextFiles).not.toHaveBeenCalled()
    expect(contextFilesRef.current).toEqual([{
      id: 'ctx-old',
      name: 'Old.tsx',
      path: 'frontend/src/pages/Old.tsx',
      content: 'old',
    }])
    expect(JSON.parse(sessionStorage.getItem('chat-draft-images') || '[]')).toEqual(['data:image/png;base64,old'])
    expect(JSON.parse(sessionStorage.getItem('chat-draft-context-files') || '[]')).toEqual(contextFilesRef.current)
  })

  it('clears context-file composer drafts when starting a new chat', async () => {
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: ['data:image/png;base64,old'] }
    const contextFilesRef = {
      current: [{
        id: 'ctx-1',
        name: 'old.ts',
        content: 'export const old = true',
      }],
    }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      setInput,
      setImages,
      imagesRef,
      contextFiles: contextFilesRef.current,
      setContextFiles,
      contextFilesRef,
    }))
    sessionStorage.setItem('chat-draft', 'old prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(imagesRef.current))
    sessionStorage.setItem('chat-draft-context-files', JSON.stringify(contextFilesRef.current))

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    expect(setInput).toHaveBeenCalledWith('')
    expect(setImages).toHaveBeenCalledWith([])
    expect(setContextFiles).toHaveBeenCalledWith([])
    expect(imagesRef.current).toEqual([])
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-context-files')).toBeNull()
  })

  it('clears stale composer drafts for route-driven new chat intent', async () => {
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: ['data:image/png;base64,old'] }
    const contextFilesRef = {
      current: [{
        id: 'ctx-route',
        name: 'route-old.ts',
        content: 'export const stale = true',
      }],
    }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      setInput,
      setImages,
      imagesRef,
      contextFiles: contextFilesRef.current,
      setContextFiles,
      contextFilesRef,
    }))
    sessionStorage.setItem('chat-draft', 'old route prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(imagesRef.current))
    sessionStorage.setItem('chat-draft-context-files', JSON.stringify(contextFilesRef.current))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
      }))
    })

    await waitFor(() => {
      expect(setInput).toHaveBeenCalledWith('')
      expect(setImages).toHaveBeenCalledWith([])
      expect(setContextFiles).toHaveBeenCalledWith([])
      expect(imagesRef.current).toEqual([])
      expect(contextFilesRef.current).toEqual([])
      expect(sessionStorage.getItem('chat-draft')).toBeNull()
      expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
      expect(sessionStorage.getItem('chat-draft-context-files')).toBeNull()
    })
  })

  it('clears stale composer drafts when selecting a saved chat', async () => {
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: ['data:image/png;base64,selected-old'] }
    const contextFilesRef = {
      current: [{
        id: 'ctx-select',
        name: 'select-old.ts',
        content: 'export const selected = true',
      }],
    }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      setInput,
      setImages,
      imagesRef,
      contextFiles: contextFilesRef.current,
      setContextFiles,
      contextFilesRef,
    }))
    sessionStorage.setItem('chat-draft', 'old selected prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(imagesRef.current))
    sessionStorage.setItem('chat-draft-context-files', JSON.stringify(contextFilesRef.current))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        blank: true,
        newChat: true,
      }))
    })

    fireEvent.click(screen.getByRole('option', { name: /Existing chat, 3 messages/ }))

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        blank: false,
        newChat: false,
      }))
    })
    expect(setInput).toHaveBeenCalledWith('')
    expect(setImages).toHaveBeenCalledWith([])
    expect(setContextFiles).toHaveBeenCalledWith([])
    expect(imagesRef.current).toEqual([])
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-context-files')).toBeNull()
  })

  it('fully collapses the chat sidebar to a single expand control', () => {
    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('session-list')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse chat list' }))

    expect(screen.queryByTestId('session-list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument()
    const collapsedPanel = screen.getByRole('button', { name: 'Expand chat list' }).closest('.chat-sidebar-collapsed-panel')
    expect(collapsedPanel).not.toBeNull()
    expect(within(collapsedPanel as HTMLElement).queryByRole('button', { name: 'Add project' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand chat list' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand chat list' }))

    expect(screen.getByTestId('session-list')).toBeInTheDocument()
  })

  it('keeps command and terminal actions in the top header', async () => {
    persistClawcontrolProjectSelection()
    const sendMessage = vi.fn(() => true)
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      sendMessage,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const toolbar = screen.getByTestId('chat-top-actions-toolbar')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Open terminal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Session info' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    expect(screen.getByRole('region', { name: 'Diff review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run Hermes review' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run Hermes review' }))
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Review the current project for correctness'))
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Working directory: /Volumes/T7/projects/clawctrl'))
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Project root: /Volumes/T7/projects/clawctrl'))
    expect(screen.queryByTestId('chat-terminal-drawer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Session info' }))
    expect(screen.getByRole('region', { name: 'Session info' })).toHaveTextContent('/Volumes/T7/projects/clawctrl')

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('menu', { name: 'Project action menu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add action' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit selected action' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Change environment' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change environment' }))
    expect(screen.getByRole('dialog', { name: 'Environment settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close environment settings' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Project action menu' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('menu', { name: 'Project action menu' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu', { name: 'Project action menu' })).not.toBeInTheDocument()
    expect(toolbar.compareDocumentPosition(screen.getByTestId('chat-thread')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(toolbar.compareDocumentPosition(screen.getByTestId('chat-input')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('persists a clean Hermes review draft when immediate send cannot run', async () => {
    persistClawcontrolProjectSelection()
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: ['data:image/png;base64,stale'] }
    const contextFilesRef = {
      current: [{ id: 'old-file', name: 'old.ts', content: 'stale context' }],
    }
    const sendMessage = vi.fn(() => false)
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      setInput,
      images: imagesRef.current,
      setImages,
      imagesRef,
      contextFiles: contextFilesRef.current,
      setContextFiles,
      contextFilesRef,
      sendMessage,
    }))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run Hermes review' }))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    const prompt = setInput.mock.calls.at(-1)?.[0] as string
    expect(prompt).toContain('Review the current project for correctness')
    expect(prompt).toContain('Working directory: /Volumes/T7/projects/clawctrl')
    expect(setImages).toHaveBeenCalledWith([])
    expect(setContextFiles).toHaveBeenCalledWith([])
    expect(imagesRef.current).toEqual([])
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem('chat-draft')).toBe(prompt)
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-context-files')).toBeNull()
  })

  it('shows an always-on Hermes Agent usage meter in the bottom context bar', () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Hermes Agent usage' })).toBeInTheDocument()
    expect(screen.getByText('5h')).toBeInTheDocument()
    expect(screen.getByText('Week')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('opens Hermes Agent usage details without waiting for a refresh', () => {
    mockUseCodexLbUsage.mockReturnValue({
      rawUsage: undefined,
      usage: {
        raw: { total_tokens: 40000 },
        totalTokens: 40000,
        used: 40,
        limit: 100,
        remaining: 60,
        percent: 40,
        totalCost: 1.25,
        accounts: [
          { id: 'personal', label: 'personal', used: 10, remaining: 90, percent: 10, windows: [] },
        ],
        windows: [
          { id: 'fiveHour', label: '5h', used: 40, limit: 100, remaining: 60, percent: 40 },
        ],
      },
      loading: false,
      fetching: true,
      error: null,
      lastUpdatedAt: 1779062400000,
      fromCache: true,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hermes Agent usage' }))
    expect(screen.getByRole('dialog', { name: 'Hermes Agent usage details' })).toBeInTheDocument()
    expect(screen.getByText(/refreshing · updated/)).toBeInTheDocument()
    expect(screen.getByText('personal')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('exposes the expected project scripts in the adjacent action menu', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    for (const label of ['Tauri dev', 'Frontend dev', 'Typecheck', 'Chat tests', 'Chat lint']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
  })

  it('uses scripts from backend-owned project records when available', async () => {
    persistClawcontrolProjectSelection()

    localStorage.setItem('chat-project-scripts', JSON.stringify({
      '/Volumes/T7/projects/clawctrl': [
        { id: 'legacy', name: 'Legacy stale action', command: 'npm run old' },
      ],
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: '/Volumes/T7/projects/clawctrl',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
        scripts: [
          { id: 'tauri-dev', name: 'Tauri dev', command: 'cargo tauri dev', cwd: 'src-tauri' },
          { id: 'storybook', name: 'Storybook', command: 'npm run storybook' },
        ],
      }],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Run Legacy stale action' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('menuitem', { name: 'Tauri dev' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Storybook' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Legacy stale action' })).not.toBeInTheDocument()
  })

  it('prunes legacy added-project records once backend workspace context owns them', async () => {
    localStorage.setItem('chat-added-projects', JSON.stringify([{
      id: 'local:agent-shell:legacy',
      environmentId: 'local',
      name: 'AgentShell legacy',
      path: '/Users/josue/AgentShell',
      root: '/Users/josue/AgentShell',
      branches: ['main'],
      currentBranch: 'main',
    }]))
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:agent-shell:stable',
        environmentId: 'local',
        name: 'AgentShell',
        path: '/Users/josue/AgentShell',
        root: '/Users/josue/AgentShell',
        branches: ['main', 'codex/workspace'],
        currentBranch: 'codex/workspace',
        repositoryIdentity: {
          canonicalKey: 'github.com/josue/agent-shell',
          displayName: 'josue/agent-shell',
          rootPath: '/Users/josue/AgentShell',
        },
      }],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select project josue/agent-shell' })).toBeInTheDocument()
      expect(localStorage.getItem('chat-added-projects')).toBe('[]')
    })
  })

  it('adds and edits project-scoped scripts from the top action bar', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add action' }))

    const addDialog = await screen.findByRole('dialog', { name: 'Add Action' })
    fireEvent.change(within(addDialog).getByPlaceholderText('Test'), {
      target: { value: 'Storybook' },
    })
    fireEvent.change(within(addDialog).getByPlaceholderText('npm run test'), {
      target: { value: 'npm run storybook' },
    })
    fireEvent.change(within(addDialog).getByLabelText('Working directory'), {
      target: { value: 'frontend' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Save action' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Storybook' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit selected action' }))

    const editDialog = await screen.findByRole('dialog', { name: 'Edit Action' })
    fireEvent.change(within(editDialog).getByDisplayValue('Storybook'), {
      target: { value: 'Storybook dev' },
    })
    fireEvent.change(within(editDialog).getByDisplayValue('npm run storybook'), {
      target: { value: 'npm run storybook -- --host 0.0.0.0' },
    })
    fireEvent.change(within(editDialog).getByDisplayValue('frontend'), {
      target: { value: 'frontend/src' },
    })
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Storybook dev' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run Storybook dev' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('Storybook dev')
    expect(drawer).toHaveTextContent('npm run storybook -- --host 0.0.0.0')
    expect(drawer).toHaveTextContent('/Volumes/T7/projects/clawctrl/frontend/src')
    expect(drawer).toHaveTextContent('CLAWCTRL_PROJECT_PATH')
    expect(drawer).toHaveTextContent('CLAWCTRL_RUNTIME')
    expect(drawer).toHaveTextContent('CLAWCTRL_BRANCH')
    expect(drawer).toHaveTextContent('CHAT_TERMINAL_CWD')
    expect(drawer).toHaveTextContent('AGENT_TERMINAL_CWD')
    expect(drawer).toHaveTextContent('HERMES_AGENT_TERMINAL_CWD')
    const persisted = JSON.parse(localStorage.getItem('chat-project-scripts') || '{}') as Record<string, Array<{ name: string; command: string }>>
    const savedScripts = persisted['/Volumes/T7/projects/clawctrl'] ?? []
    expect(savedScripts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Storybook dev',
        command: 'npm run storybook -- --host 0.0.0.0',
        cwd: 'frontend/src',
      }),
    ]))
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        path: '/Volumes/T7/projects/clawctrl',
        scripts: expect.arrayContaining([
          expect.objectContaining({
            name: 'Storybook dev',
            command: 'npm run storybook -- --host 0.0.0.0',
            cwd: 'frontend/src',
          }),
        ]),
      }))
    })
  })

  it('remembers the preferred project action per project instead of globally', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local-claw',
          environmentId: 'local',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          root: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          scripts: mockClawcontrolScripts,
        },
        {
          id: 'agent-shell',
          environmentId: 'local',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          root: '/Users/josue/AgentShell',
          branches: ['main'],
          currentBranch: 'main',
          scripts: [
            { id: 'dev', name: 'Agent dev', command: 'npm run dev' },
            { id: 'test', name: 'Agent tests', command: 'npm test' },
          ],
        },
      ],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&cwd=%2FVolumes%2FT7%2Fprojects%2Fclawctrl']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chat tests' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Chat tests' })).toBeInTheDocument()
      expect(localStorage.getItem('chat-project-preferred-scripts')).toContain('test')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select project AgentShell' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Agent dev' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select project clawctrl' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Chat tests' })).toBeInTheDocument()
    })
  })

  it('rolls project script changes back when backend persistence fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    persistClawcontrolProjectSelection()
    mockApiPatch.mockRejectedValueOnce(new Error('script save failed'))
    localStorage.setItem('chat-project-preferred-scripts', JSON.stringify({
      '/Volumes/T7/projects/clawctrl': 'tauri-dev',
    }))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add action' }))

    const addDialog = await screen.findByRole('dialog', { name: 'Add Action' })
    fireEvent.change(within(addDialog).getByPlaceholderText('Test'), {
      target: { value: 'Storybook' },
    })
    fireEvent.change(within(addDialog).getByPlaceholderText('npm run test'), {
      target: { value: 'npm run storybook' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Save action' }))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        path: '/Volumes/T7/projects/clawctrl',
        scripts: expect.arrayContaining([
          expect.objectContaining({ name: 'Storybook', command: 'npm run storybook' }),
        ]),
      }))
      expect(screen.queryByRole('button', { name: 'Run Storybook' })).not.toBeInTheDocument()
    })
    expect(localStorage.getItem('chat-project-scripts')).not.toContain('Storybook')
    expect(localStorage.getItem('chat-project-preferred-scripts')).not.toContain('storybook')
    expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    warnSpy.mockRestore()
  })

  it('keeps folder runtime and branch with the bottom composer', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const toolbar = screen.getByTestId('chat-local-context-toolbar')
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveTextContent('clawctrl')
    })
    expect(screen.getByLabelText('Runtime')).toHaveTextContent('Work locally')
    expect(screen.getByLabelText('Branch')).toHaveTextContent('main')
    expect(screen.getByTestId('chat-input')).toContainElement(toolbar)
  })

  it('runs the primary project script inside the selected project terminal', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveTextContent('clawctrl')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run Tauri dev' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('Tauri dev')
    expect(drawer).toHaveTextContent('cargo tauri dev')
    expect(drawer).toHaveTextContent('/Volumes/T7/projects/clawctrl/src-tauri')
    expect(drawer).toHaveTextContent('chat-local-volumes-t7-projects-clawctrl-1')
    expect(drawer).toHaveTextContent('"CHAT_TERMINAL_CWD":"/Volumes/T7/projects/clawctrl/src-tauri"')
    expect(drawer).toHaveTextContent('"AGENT_TERMINAL_CWD":"/Volumes/T7/projects/clawctrl/src-tauri"')
    expect(drawer).toHaveTextContent('"HERMES_AGENT_PROJECT_PATH":"/Volumes/T7/projects/clawctrl"')
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Terminal status' })).toHaveTextContent('Tauri dev: running')
    })
  })

  it('does not spawn another terminal when the same project script is clicked again', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveTextContent('clawctrl')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run Tauri dev' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('chat-local-volumes-t7-projects-clawctrl-1')

    fireEvent.click(screen.getByRole('button', { name: 'Run Tauri dev' }))

    expect(screen.getByTestId('chat-terminal-drawer')).toHaveTextContent('chat-local-volumes-t7-projects-clawctrl-1')
    expect(screen.getByTestId('chat-terminal-drawer')).not.toHaveTextContent('chat-local-volumes-t7-projects-clawctrl-2')
  })

  it('blocks a second project script while a terminal is already running', async () => {
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveTextContent('clawctrl')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run Tauri dev' }))

    await screen.findByTestId('chat-terminal-drawer')
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Terminal status' })).toHaveTextContent('Tauri dev: running')
    })

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Frontend dev' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run Frontend dev' }))

    expect(screen.getByTestId('chat-terminal-drawer')).toHaveTextContent('cargo tauri dev')
    expect(screen.getByTestId('chat-terminal-drawer')).not.toHaveTextContent('npm run dev')
    expect(screen.getByRole('status', { name: 'Terminal status' })).toHaveTextContent('Tauri dev: already running')
  })

  it('loads browser workspace context from the local chat API fallback', async () => {
    localStorage.setItem('chat-selected-project-path', '/Users/josue/AgentShell')
    localStorage.setItem('chat-selected-runtime', 'Work locally')
    localStorage.setItem('chat-selected-branch', 'codex/chat-parity')
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'codex/chat-parity'],
          currentBranch: 'codex/chat-parity',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/chat/workspace-context')
      expect(screen.getByLabelText('Project')).toHaveTextContent('AgentShell')
      expect(screen.getByLabelText('Runtime')).toHaveTextContent('Work locally')
      expect(screen.getByLabelText('Branch')).toHaveTextContent('codex/chat-parity')
    })

    expect(screen.getByRole('button', { name: 'Add action' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('Terminal')
    expect(drawer).toHaveTextContent('/Users/josue/AgentShell')
    expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
      context: expect.objectContaining({
        project: 'AgentShell',
        workingDir: '/Users/josue/AgentShell',
        branch: 'codex/chat-parity',
        runtime: 'Work locally',
      }),
    }))
  })

  it('updates branch, send context, and command cwd when the selected project changes', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          environmentId: 'local',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main', 'codex/chat-parity'],
          currentBranch: 'main',
          scripts: mockClawcontrolScripts,
        },
        {
          id: 'local:agent-shell:stable',
          environmentId: 'desktop',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          scripts: [
            { id: 'typecheck', name: 'Typecheck', command: 'npm run typecheck', cwd: 'frontend' },
          ],
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
    })

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: '/Users/josue/AgentShell' },
    })

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('feature/agent-shell')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          branch: 'feature/agent-shell',
          runtime: 'Work locally',
        }),
      }))
    })
    expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/AgentShell')
    expect(searchParamsFromLocation().get('projectId')).toBe('local:agent-shell:stable')
    expect(searchParamsFromLocation().get('env')).toBe('desktop')

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Typecheck' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run Typecheck' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('Typecheck')
    expect(drawer).toHaveTextContent('npm run typecheck')
    expect(drawer).toHaveTextContent('/Users/josue/AgentShell/frontend')
    expect(drawer).toHaveTextContent('chat-desktop-local-agent-shell-stable-1')
    expect(drawer).toHaveTextContent('"CHAT_TERMINAL_CWD":"/Users/josue/AgentShell/frontend"')
    expect(drawer).toHaveTextContent('"AGENT_PROJECT_PATH":"/Users/josue/AgentShell"')
    expect(drawer).toHaveTextContent('"HERMES_AGENT_TERMINAL_CWD":"/Users/josue/AgentShell/frontend"')
    expect(mockUseGatewaySessions).toHaveBeenCalledWith(expect.objectContaining({
      cwd: ['/Users/josue/AgentShell', '/Volumes/T7/projects/clawctrl'],
      projectIds: ['local:clawctrl:stable', 'local:agent-shell:stable'],
      includeUnscoped: true,
    }))
  })

  it('clears stale composer drafts when the selected project changes', async () => {
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const imagesRef = { current: ['data:image/png;base64,project-old'] }
    const contextFilesRef = {
      current: [{
        id: 'ctx-project',
        name: 'project-old.ts',
        content: 'export const project = true',
      }],
    }
    mockUseChatState.mockImplementation(() => ({
      ...chatStateStub(),
      setInput,
      setImages,
      imagesRef,
      contextFiles: contextFilesRef.current,
      setContextFiles,
      contextFilesRef,
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          environmentId: 'local',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
        },
        {
          id: 'local:agent-shell:stable',
          environmentId: 'desktop',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
        },
      ],
      runtimeModes: ['Work locally'],
    })
    sessionStorage.setItem('chat-draft', 'old project prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(imagesRef.current))
    sessionStorage.setItem('chat-draft-context-files', JSON.stringify(contextFilesRef.current))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
    })

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: '/Users/josue/AgentShell' },
    })

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
    })
    expect(setInput).toHaveBeenCalledWith('')
    expect(setImages).toHaveBeenCalledWith([])
    expect(setContextFiles).toHaveBeenCalledWith([])
    expect(imagesRef.current).toEqual([])
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-context-files')).toBeNull()
  })

  it('hydrates selected project from workspace route params', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'local:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&cwd=%2FUsers%2Fjosue%2FAgentShell&env=desktop&branch=main&runtime=Remote+harness']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('main')
      expect((screen.getByLabelText('Runtime') as HTMLSelectElement).value).toBe('Remote harness')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          branch: 'main',
          runtime: 'Remote harness',
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('projectId')).toBe('local:agent-shell:stable')
      expect(params.get('env')).toBe('desktop')
      expect(params.get('branch')).toBe('main')
      expect(params.get('runtime')).toBe('Remote harness')
    })
  })

  it('does not hydrate a stale route environment into a same-path project from another environment', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&cwd=%2FUsers%2Fjosue%2FAgentShell&env=missing-vm&branch=main&runtime=Remote+harness']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveTextContent('Unavailable - missing-vm / .../josue/AgentShell')
      expect(screen.getByLabelText('Runtime')).toBeDisabled()
      expect(screen.getByLabelText('Branch')).toBeDisabled()
      expect(screen.queryByRole('option', { name: 'feature/agent-shell' })).not.toBeInTheDocument()
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
          runtime: undefined,
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('cwd')).toBeNull()
      expect(params.get('projectId')).toBeNull()
      expect(params.get('env')).toBeNull()
      expect(params.get('branch')).toBeNull()
      expect(params.get('runtime')).toBeNull()
    })
  })

  it('hydrates selected project from stable project route id without requiring cwd', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'local:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&projectId=local%3Aagent-shell%3Astable&branch=main&runtime=Remote+harness']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('main')
      expect((screen.getByLabelText('Runtime') as HTMLSelectElement).value).toBe('Remote harness')
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('projectId')).toBe('local:agent-shell:stable')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('desktop')
    })
  })

  it('moves workspace route identity when selecting a project-scoped chat', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'local:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'agent-chat',
          label: 'AgentShell fix',
          messageCount: 4,
          workingDir: '/Users/josue/AgentShell',
          project: 'AgentShell',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await screen.findByRole('button', { name: 'Select project AgentShell' })
    fireEvent.click(screen.getByRole('option', { name: /AgentShell fix, 4 messages/ }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('feature/agent-shell')
    })
    const params = searchParamsFromLocation()
    expect(params.get('session')).toBe('agent-chat')
    expect(params.get('projectId')).toBe('local:agent-shell:stable')
    expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
    expect(params.get('env')).toBe('desktop')
    expect(params.get('branch')).toBe('feature/agent-shell')
    expect(params.get('runtime')).toBe('Work locally')
  })

  it('restores project branch and runtime when opening a saved chat from stored T3 refs', async () => {
    localStorage.setItem('chat-session-project-refs', JSON.stringify({
      'existing-session': {
        projectId: 'local:agent-shell:stable',
        project: 'AgentShell',
        projectRoot: '/Users/josue/AgentShell',
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'desktop',
        branch: 'main',
        runtime: 'Remote harness',
      },
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'local:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?session=existing-session']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('main')
      expect((screen.getByLabelText('Runtime') as HTMLSelectElement).value).toBe('Remote harness')
      expect(mockUseChatState).toHaveBeenLastCalledWith('existing-session', expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          branch: 'main',
          runtime: 'Remote harness',
        }),
      }))
    })
    await waitFor(() => {
      const params = searchParamsFromLocation()
      expect(params.get('session')).toBe('existing-session')
      expect(params.get('threadId')).toBe('existing-session')
      expect(params.get('environmentId')).toBe('desktop')
      expect(params.get('projectId')).toBe('local:agent-shell:stable')
      expect(params.get('cwd')).toBe('/Users/josue/AgentShell')
      expect(params.get('env')).toBe('desktop')
      expect(params.get('branch')).toBe('main')
      expect(params.get('runtime')).toBe('Remote harness')
    })
  })

  it('renders nested project groups in the sidebar for multiple roots or machines', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'T7',
        },
        {
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          machineLabel: 'JosuesDesktop',
        },
        {
          name: 'memd',
          path: '/Users/josue/memd',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'JosuesDesktop',
        },
      ],
      runtimeModes: ['Work locally'],
    })
    localStorage.setItem('chat-session-project-refs', JSON.stringify({
      agentThread: {
        projectId: 'agent-shell',
        workingDir: '/Users/josue/AgentShell',
      },
      clawThread: {
        projectId: 'local-claw',
        workingDir: '/Volumes/T7/projects/clawctrl',
      },
    }))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Projects')).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'T7' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'JosuesDesktop' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project memd' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select project memd' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/memd')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'memd',
          workingDir: '/Users/josue/memd',
          branch: 'main',
        }),
      }))
    })
  })

  it('groups matching repository projects across machines with selectable roots', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local-claw',
          environmentId: 'local',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          root: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'T7',
          repositoryIdentity: {
            canonicalKey: 'github.com/josue/clawctrl',
            displayName: 'josue/clawctrl',
            name: 'clawctrl',
            rootPath: '/Volumes/T7/projects/clawctrl',
          },
        },
        {
          id: 'remote-claw',
          environmentId: 'desktop',
          name: 'clawctrl',
          path: '/Users/josue/projects/clawctrl',
          root: '/Users/josue/projects/clawctrl',
          branches: ['main', 'desktop-branch'],
          currentBranch: 'desktop-branch',
          machineLabel: 'JosuesDesktop',
          repositoryIdentity: {
            canonicalKey: 'github.com/josue/clawctrl',
            displayName: 'josue/clawctrl',
            name: 'clawctrl',
            rootPath: '/Users/josue/projects/clawctrl',
          },
        },
      ],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Repositories' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Project view options' })).toBeInTheDocument()
      expect(screen.queryByRole('menu', { name: 'Project view options' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project josue/clawctrl' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select josue/clawctrl root T7' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select josue/clawctrl root JosuesDesktop' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Project view options' }))
    expect(screen.getByRole('menu', { name: 'Project view options' })).toBeInTheDocument()
    expect(screen.getByLabelText('Project grouping')).toHaveValue('repository')
    expect(screen.getByLabelText('Project sort')).toHaveValue('name')

    fireEvent.change(screen.getByLabelText('Project sort'), { target: { value: 'recent' } })
    expect(localStorage.getItem('chat-project-sort-order')).toBe('recent')

    fireEvent.click(screen.getByRole('button', { name: 'New chat in josue/clawctrl root JosuesDesktop' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/projects/clawctrl')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('desktop-branch')
      expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/projects/clawctrl')
      expect(searchParamsFromLocation().get('env')).toBe('desktop')
      expect(searchParamsFromLocation().get('session')).toBeNull()
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'clawctrl',
          workingDir: '/Users/josue/projects/clawctrl',
          branch: 'desktop-branch',
        }),
      }))
    })

    fireEvent.change(screen.getByLabelText('Project grouping'), { target: { value: 'separate' } })

    await waitFor(() => {
      expect(localStorage.getItem('chat-project-grouping-mode')).toBe('separate')
      expect(screen.queryByRole('group', { name: 'Repositories' })).not.toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'T7' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'JosuesDesktop' })).toBeInTheDocument()
    })
  })

  it('keeps project row actions backend-backed for rename grouping and remove', async () => {
    localStorage.setItem('chat-added-projects', JSON.stringify([{
      id: 'legacy-tool-local',
      environmentId: 'local',
      name: 'LegacyTool local',
      path: '/Users/josue/LegacyTool',
      root: '/Users/josue/LegacyTool',
      branches: ['main'],
      currentBranch: 'main',
      machineLabel: 'Local Mac',
    }]))
    localStorage.setItem('chat-session-project-refs', JSON.stringify({
      agentThread: {
        projectId: 'agent-shell',
        workingDir: '/Users/josue/AgentShell',
      },
      clawThread: {
        projectId: 'local-claw',
        workingDir: '/Volumes/T7/projects/clawctrl',
      },
    }))
    localStorage.setItem('chat-project-scripts', JSON.stringify({
      'agent-shell': [{ id: 'agent-dev', name: 'Agent dev', command: 'npm run dev' }],
      '/Users/josue/AgentShell/': [{ id: 'agent-test', name: 'Agent test', command: 'npm test' }],
      '/Volumes/T7/projects/clawctrl': [{ id: 'claw-dev', name: 'Claw dev', command: 'npm run dev' }],
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local-claw',
          environmentId: 'local',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          root: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'T7',
          repositoryIdentity: {
            canonicalKey: 'github.com/josue/clawctrl',
            displayName: 'josue/clawctrl',
            name: 'clawctrl',
            rootPath: '/Volumes/T7/projects/clawctrl',
          },
        },
        {
          id: 'agent-shell',
          environmentId: 'local',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          root: '/Users/josue/AgentShell',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'Local Mac',
        },
      ],
      runtimeModes: ['Work locally'],
    })
    mockApiDel.mockResolvedValueOnce([
      {
        id: 'local-claw',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
        machineLabel: 'T7',
      },
      {
        id: 'legacy-tool-backend',
        environmentId: 'local',
        name: 'LegacyTool',
        path: '/Users/josue/LegacyTool',
        root: '/Users/josue/LegacyTool',
        branches: ['main', 'backend-owned'],
        currentBranch: 'backend-owned',
        machineLabel: 'Local Mac',
      },
    ])

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /More actions for project (josue\/clawctrl|clawctrl)/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'More actions for project AgentShell' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawctrl|clawctrl)/ }))
    expect(screen.getByRole('menu', { name: /Actions for project (josue\/clawctrl|clawctrl)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat in project AgentShell' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: /Actions for project (josue\/clawctrl|clawctrl)/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawctrl|clawctrl)/ }))

    fireEvent.change(screen.getByLabelText(/Grouping for project (josue\/clawctrl|clawctrl)/), { target: { value: 'separate' } })
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local-claw',
        path: '/Volumes/T7/projects/clawctrl',
        groupingOverride: 'separate',
      }))
    })
    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawctrl|clawctrl)/ }))
    fireEvent.change(screen.getByLabelText(/Grouping for project (josue\/clawctrl|clawctrl)/), { target: { value: '' } })
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local-claw',
        path: '/Volumes/T7/projects/clawctrl',
        groupingOverride: null,
      }))
    })

    fireEvent.click(screen.getByRole('menuitem', { name: /Copy path for project (josue\/clawctrl|clawctrl)/ }))
    await waitFor(() => {
      expect(mockClipboardWrite).toHaveBeenCalledWith('/Volumes/T7/projects/clawctrl')
    })

    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawctrl|clawctrl)/ }))
    expect(screen.getByRole('menuitem', { name: /Copied path for project (josue\/clawctrl|clawctrl)/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename project (josue\/clawctrl|clawctrl)/ }))
    const renameDialog = await screen.findByRole('dialog', { name: 'Rename project' })
    fireEvent.change(within(renameDialog).getByRole('textbox', { name: 'Project title' }), {
      target: { value: 'Claw Workspace' },
    })
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local-claw',
        path: '/Volumes/T7/projects/clawctrl',
        name: 'Claw Workspace',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select project Claw Workspace' }))
    await waitFor(() => {
      expect(searchParamsFromLocation().get('cwd')).toBe('/Volumes/T7/projects/clawctrl')
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for project AgentShell' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project AgentShell' }))
    const removeDialog = await screen.findByRole('dialog', { name: 'Remove project' })
    expect(mockApiDel).not.toHaveBeenCalled()
    fireEvent.click(within(removeDialog).getByRole('button', { name: /^Remove project / }))
    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'agent-shell',
        path: '/Users/josue/AgentShell',
        environmentId: 'local',
      }))
      expect(screen.queryByRole('button', { name: 'Select project AgentShell' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project LegacyTool' })).toBeInTheDocument()
    })
    expect(localStorage.getItem('chat-added-projects')).toBe('[]')
    const refs = JSON.parse(localStorage.getItem('chat-session-project-refs') || '{}')
    expect(refs).not.toHaveProperty('agentThread')
    expect(refs).toHaveProperty('clawThread')
    const scripts = JSON.parse(localStorage.getItem('chat-project-scripts') || '{}')
    expect(scripts).not.toHaveProperty('agent-shell')
    expect(scripts).not.toHaveProperty('/Users/josue/AgentShell/')
    expect(scripts).toHaveProperty('/Volumes/T7/projects/clawctrl')
    expect(searchParamsFromLocation().get('cwd')).toBe('/Volumes/T7/projects/clawctrl')
  })

  it('rolls project rename back when backend persistence fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiPatch.mockRejectedValueOnce(new Error('rename failed'))
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'agent-shell',
        environmentId: 'local',
        name: 'AgentShell',
        path: '/Users/josue/AgentShell',
        root: '/Users/josue/AgentShell',
        branches: ['main'],
        currentBranch: 'main',
        machineLabel: 'Local Mac',
      }],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'More actions for project AgentShell' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for project AgentShell' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename project AgentShell' }))
    const renameDialog = await screen.findByRole('dialog', { name: 'Rename project' })
    fireEvent.change(within(renameDialog).getByRole('textbox', { name: 'Project title' }), {
      target: { value: 'Broken Rename' },
    })
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'agent-shell',
        path: '/Users/josue/AgentShell',
        name: 'Broken Rename',
      }))
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Select project Broken Rename' })).not.toBeInTheDocument()
    })
    expect(localStorage.getItem('chat-added-projects')).toBe('[]')
    expect(showAttachmentStatus).toHaveBeenCalledWith(
      'Project update failed. Restored AgentShell in the chat workspace.',
      5000,
    )
    warnSpy.mockRestore()
  })

  it('clears project selection when the selected project is removed from the header action menu', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local-claw',
          environmentId: 'local',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          root: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'T7',
        },
        {
          id: 'agent-shell',
          environmentId: 'local',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          root: '/Users/josue/AgentShell',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'Local Mac',
        },
      ],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&cwd=%2FVolumes%2FT7%2Fprojects%2Fclawctrl&branch=main&runtime=Work+locally']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'clawctrl',
          workingDir: '/Volumes/T7/projects/clawctrl',
        }),
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    expect(screen.getByRole('group', { name: 'Current project' })).toHaveTextContent('clawctrl')
    expect(screen.getByRole('menuitem', { name: 'Rename project clawctrl' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project clawctrl' }))
    const removeDialog = await screen.findByRole('dialog', { name: 'Remove project' })
    expect(mockApiDel).not.toHaveBeenCalled()
    fireEvent.click(within(removeDialog).getByRole('button', { name: /^Remove project / }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local-claw',
        path: '/Volumes/T7/projects/clawctrl',
        environmentId: 'local',
      }))
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
        }),
      }))
    })
    expect(localStorage.getItem('chat-selected-project-path')).toBe('')
    const params = searchParamsFromLocation()
    expect(params.get('cwd')).toBeNull()
    expect(params.get('projectId')).toBeNull()
    expect(params.get('branch')).toBeNull()
    expect(params.get('runtime')).toBeNull()
  })

  it('confirms before removing an unavailable selected folder from the header action menu', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [],
      runtimeModes: ['Work locally'],
    })
    mockApiDel.mockResolvedValueOnce([])

    render(
      <MemoryRouter initialEntries={['/chat?new=1&cwd=%2FUsers%2Fjosue%2FMissingProject&env=harness-vm']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await screen.findAllByText('Selected folder unavailable')

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove selected folder' }))

    const removeDialog = await screen.findByRole('dialog', { name: 'Remove project' })
    expect(removeDialog).toHaveTextContent('/Users/josue/MissingProject')
    expect(removeDialog).toHaveTextContent('Hermes Agent VM')
    expect(mockApiDel).not.toHaveBeenCalled()

    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove project MissingProject' }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        path: '/Users/josue/MissingProject',
        environmentId: 'harness-vm',
      }))
    })
    const params = searchParamsFromLocation()
    expect(params.get('cwd')).toBeNull()
    expect(params.get('env')).toBeNull()
    expect(localStorage.getItem('chat-selected-project-path')).toBe('')
  })

  it('removes only the targeted environment when same-path projects exist', async () => {
    const localProject = {
      id: 'local-agent-shell',
      environmentId: 'local',
      name: 'AgentShell',
      path: '/Users/josue/AgentShell',
      root: '/Users/josue/AgentShell',
      branches: ['main'],
      currentBranch: 'main',
      machineLabel: 'Local Mac',
    }
    const remoteProject = {
      ...localProject,
      id: 'remote-agent-shell',
      environmentId: 'harness-vm',
      machineLabel: 'Harness VM',
    }
    localStorage.setItem('chat-added-projects', JSON.stringify([localProject]))
    localStorage.setItem('chat-project-scripts', JSON.stringify({
      'local-agent-shell': [{ id: 'local-dev', name: 'Local dev', command: 'npm run dev' }],
      'env:local:path:/users/josue/agentshell': [{ id: 'local-dev', name: 'Local dev', command: 'npm run dev' }],
      'remote-agent-shell': [{ id: 'remote-dev', name: 'Remote dev', command: 'pnpm dev' }],
      'env:harness-vm:path:/users/josue/agentshell': [{ id: 'remote-dev', name: 'Remote dev', command: 'pnpm dev' }],
      '/Users/josue/AgentShell': [{ id: 'legacy-dev', name: 'Legacy dev', command: 'npm run dev' }],
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [remoteProject],
      runtimeModes: ['Work locally', 'Harness VM'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const remoteGroup = await screen.findByRole('group', { name: 'Hermes Agent VM' })
    fireEvent.click(within(remoteGroup).getByRole('button', { name: 'More actions for project AgentShell' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project AgentShell' }))
    const removeDialog = await screen.findByRole('dialog', { name: 'Remove project' })
    fireEvent.click(within(removeDialog).getByRole('button', { name: /^Remove project / }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'remote-agent-shell',
        path: '/Users/josue/AgentShell',
        environmentId: 'harness-vm',
      }))
      expect(screen.queryByRole('group', { name: 'Hermes Agent VM' })).not.toBeInTheDocument()
      expect(within(screen.getByRole('group', { name: 'Local Mac' })).getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
    })

    expect(JSON.parse(localStorage.getItem('chat-added-projects') || '[]')).toEqual([
      expect.objectContaining({ id: 'local-agent-shell', environmentId: 'local' }),
    ])
    const scripts = JSON.parse(localStorage.getItem('chat-project-scripts') || '{}')
    expect(scripts).toHaveProperty('local-agent-shell')
    expect(scripts).toHaveProperty('env:local:path:/users/josue/agentshell')
    expect(scripts).toHaveProperty('/Users/josue/AgentShell')
    expect(scripts).not.toHaveProperty('remote-agent-shell')
    expect(scripts).not.toHaveProperty('env:harness-vm:path:/users/josue/agentshell')
  })

  it('removes local fallback project entries when the backend store no longer has them', async () => {
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiDel.mockRejectedValueOnce(new Error('workspace project not found'))
    localStorage.setItem('chat-added-projects', JSON.stringify([{
      id: 'local-agent-shell',
      environmentId: 'local',
      name: 'AgentShell',
      path: '/Users/josue/AgentShell',
      root: '/Users/josue/AgentShell',
      branches: ['main'],
      currentBranch: 'main',
      machineLabel: 'Local Mac',
    }]))
    mockApiGet.mockResolvedValueOnce({
      projects: [],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for project AgentShell' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project AgentShell' }))
    const removeDialog = await screen.findByRole('dialog', { name: 'Remove project' })
    fireEvent.click(within(removeDialog).getByRole('button', { name: /^Remove project / }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local-agent-shell',
        path: '/Users/josue/AgentShell',
        environmentId: 'local',
      }))
      expect(screen.queryByRole('button', { name: 'Select project AgentShell' })).not.toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('chat-added-projects') || '[]')).toEqual([])
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Removed stale project entry AgentShell.',
        5000,
      )
    })
  })

  it('rolls project removal back when backend deletion fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiDel.mockRejectedValueOnce(new Error('delete failed'))
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local-claw',
          environmentId: 'local',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          root: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'T7',
        },
        {
          id: 'agent-shell',
          environmentId: 'local',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          root: '/Users/josue/AgentShell',
          branches: ['main', 'codex/remove-rollback'],
          currentBranch: 'codex/remove-rollback',
          machineLabel: 'Local Mac',
        },
      ],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1&cwd=%2FUsers%2Fjosue%2FAgentShell&branch=codex%2Fremove-rollback&runtime=Work+locally']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for project AgentShell' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project AgentShell' }))
    const removeDialog = await screen.findByRole('dialog', { name: 'Remove project' })
    expect(mockApiDel).not.toHaveBeenCalled()
    fireEvent.click(within(removeDialog).getByRole('button', { name: /^Remove project / }))

    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'agent-shell',
        path: '/Users/josue/AgentShell',
        environmentId: 'local',
      }))
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          branch: 'codex/remove-rollback',
        }),
      }))
    })
    await waitFor(() => {
      expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/AgentShell')
      expect(localStorage.getItem('chat-selected-project-path')).toBe('/Users/josue/AgentShell')
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Project removal failed. Restored AgentShell in the chat workspace.',
        5000,
      )
    })
    warnSpy.mockRestore()
  })

  it('uses Projects as the primary sidebar navigator and keeps scoped chats out of flat recents', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawctrl:stable',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'project-chat',
          label: 'Weather dashboard page',
          messageCount: 69,
          projectId: 'local:clawctrl:stable',
          workingDir: '/tmp/path-that-would-not-match-by-cwd',
          project: 'clawctrl',
        },
        {
          key: 'wrong-project-id',
          label: 'Wrong stable identity',
          messageCount: 2,
          projectId: 'local:other:stable',
          workingDir: '/Volumes/T7/projects/clawctrl',
          project: 'clawctrl',
        },
        {
          key: 'loose-chat',
          label: 'Loose scratch chat',
          messageCount: 1,
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const projectsSection = await screen.findByLabelText('Projects')
    const recentSection = screen.getByLabelText('Recent')

    expect(projectsSection.compareDocumentPosition(recentSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const projectRows = screen.getAllByRole('option', { name: /Weather dashboard page, 69 messages/ })
    expect(projectRows).toHaveLength(1)
    expect(projectsSection).toContainElement(projectRows[0])

    const looseRows = screen.getAllByRole('option', { name: /Loose scratch chat, 1 message/ })
    expect(looseRows).toHaveLength(1)
    expect(recentSection).toContainElement(looseRows[0])

    const conflictingProjectRows = screen.getAllByRole('option', { name: /Wrong stable identity, 2 messages/ })
    expect(conflictingProjectRows).toHaveLength(1)
    expect(recentSection).toContainElement(conflictingProjectRows[0])
  })

  it('hides Recent when every chat belongs under a project', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawctrl:stable',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'project-chat',
          label: 'Project-owned chat',
          messageCount: 3,
          projectId: 'local:clawctrl:stable',
          workingDir: '/tmp/wrong-cwd',
          project: 'clawctrl',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const projectsSection = await screen.findByLabelText('Projects')
    expect(projectsSection).toContainElement(screen.getByRole('option', { name: /Project-owned chat, 3 messages/ }))
    expect(screen.queryByLabelText('Recent')).not.toBeInTheDocument()
  })

  it('keeps newly created project chats under their project using stored T3 thread refs', async () => {
    localStorage.setItem('chat-session-project-refs', JSON.stringify({
      'new-hermes-session': {
        projectId: 'local:clawctrl:stable',
        project: 'clawctrl',
        projectRoot: '/Volumes/T7/projects/clawctrl',
        workingDir: '/Volumes/T7/projects/clawctrl',
        environmentId: 'local',
      },
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawctrl:stable',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'new-hermes-session',
          label: 'New Hermes project chat',
          messageCount: 2,
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const projectsSection = await screen.findByLabelText('Projects')
    expect(projectsSection).toContainElement(screen.getByRole('option', { name: /New Hermes project chat, 2 messages/ }))
    expect(screen.queryByLabelText('Recent')).not.toBeInTheDocument()
  })

  it('does not float pinned project-owned chats outside their project', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawctrl:stable',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    mockUseGatewaySessions.mockReturnValue({
      sessions: [
        {
          key: 'pinned-project-chat',
          label: 'Pinned project chat',
          messageCount: 4,
          pinned: true,
          projectId: 'local:clawctrl:stable',
          workingDir: '/Volumes/T7/projects/clawctrl',
          project: 'clawctrl',
        },
      ],
      available: true,
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const projectsSection = await screen.findByLabelText('Projects')
    expect(projectsSection).toContainElement(screen.getByRole('option', { name: /Pinned project chat, 4 messages/ }))
    expect(screen.queryByLabelText('Pinned')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Recent')).not.toBeInTheDocument()
  })

  it('keeps sidebar actions focused on chat and projects instead of copied product links', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    const sidebar = screen.getByTestId('session-list')
    expect(within(sidebar).getByRole('button', { name: 'Add project' })).toBeInTheDocument()
    expect(screen.queryByText('Plugins')).not.toBeInTheDocument()
    expect(screen.queryByText('Codex mobile')).not.toBeInTheDocument()

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.change(within(addDialog).getByRole('textbox', { name: 'Project folder path' }), {
      target: { value: '/Users/josue/NewProject' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        path: '/Users/josue/NewProject',
      })
      expect(screen.getByRole('button', { name: 'Select project NewProject' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/NewProject')
    })
  })

  it('does not create a fake project when typed folder validation fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    persistClawcontrolProjectSelection()
    mockApiPost.mockRejectedValueOnce(new Error('project folder does not exist or cannot be read'))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.change(within(addDialog).getByRole('textbox', { name: 'Project folder path' }), {
      target: { value: '/Users/josue/MissingProject' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(within(addDialog).getByRole('alert')).toHaveTextContent('project folder does not exist')
    })
    expect(screen.queryByRole('button', { name: 'Select project MissingProject' })).not.toBeInTheDocument()
    expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawctrl')
    expect(JSON.parse(localStorage.getItem('chat-added-projects') || '[]')).toEqual([])
    expect(searchParamsFromLocation().get('cwd')).toBe('/Volumes/T7/projects/clawctrl')
    warnSpy.mockRestore()
  })

  it('sanitizes pasted file-url project paths from the typed add dialog', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.change(within(addDialog).getByRole('textbox', { name: 'Project folder path' }), {
      target: { value: ' "file:///Users/josue/My%20Project/" ' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        path: '/Users/josue/My Project/',
      })
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/My Project')
      expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/My Project')
      expect(localStorage.getItem(CHAT_PROJECT_PICKER_LAST_DIR_KEY)).toBe('/Users/josue')
    })
  })

  it('adds multiple pasted project folder paths from the typed add dialog', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.change(within(addDialog).getByRole('textbox', { name: 'Project folder path' }), {
      target: { value: ' "file:///Users/josue/App%20One/" \n/Users/josue/AppTwo' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        path: '/Users/josue/App One/',
      })
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        path: '/Users/josue/AppTwo',
      })
      expect(screen.getByRole('button', { name: 'Select project App One' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project AppTwo' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AppTwo')
      expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/AppTwo')
      expect(screen.queryByRole('dialog', { name: 'Add project' })).not.toBeInTheDocument()
    })
  })

  it('prevents duplicate typed project submissions while validation is pending', async () => {
    let resolveAddProject: ((value: unknown) => void) | null = null
    mockApiPost.mockImplementationOnce((_path: string, body?: { path?: string }) => new Promise((resolve) => {
      resolveAddProject = resolve
      const projectPath = body?.path || '/Users/josue/NewProject'
      const name = projectPath.split('/').filter(Boolean).at(-1) || 'NewProject'
      resolveAddProject = () => resolve({
        project: {
          id: projectPath,
          environmentId: 'local',
          name,
          path: projectPath,
          root: projectPath,
          branches: ['main'],
          currentBranch: 'main',
        },
        projects: [],
      })
    }))

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.change(within(addDialog).getByRole('textbox', { name: 'Project folder path' }), {
      target: { value: '/Users/josue/NewProject' },
    })

    const addButton = within(addDialog).getByRole('button', { name: 'Add project' })
    fireEvent.click(addButton)
    fireEvent.click(addButton)

    expect(mockApiPost).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(within(addDialog).getByRole('button', { name: 'Adding...' })).toBeDisabled()
      expect(within(addDialog).getByRole('textbox', { name: 'Project folder path' })).toBeDisabled()
    })

    await act(async () => {
      resolveAddProject?.({})
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add project' })).not.toBeInTheDocument()
    })
  })

  it('opens settings shortcuts for settings usage providers and Hermes Agent', () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }))
    expect(screen.getByRole('menu', { name: 'Settings shortcuts' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Usage remaining' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Providers' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Hermes Agent' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Usage remaining' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=usage')

    fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Providers' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=providers')

    fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hermes Agent' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=hermes-agent')
  })

  it('uses the native folder picker and selects the backend-persisted git-aware project in Tauri', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    const promptSpy = vi.spyOn(window, 'prompt')
    mockDialogOpen.mockResolvedValue('/Users/josue/NewProject')
    const nativeProject = {
      id: '/Users/josue/NewProject',
      environmentId: 'local',
      name: 'new-project',
      path: '/Users/josue/NewProject',
      root: '/Users/josue/NewProject',
      branches: ['main', 'codex/add-project'],
      currentBranch: 'codex/add-project',
      machineLabel: 'JosuesDesktop',
      repositoryIdentity: {
        canonicalKey: 'github.com/josue/new-project',
        displayName: 'josue/new-project',
        name: 'new-project',
        rootPath: '/Users/josue/NewProject',
      },
    }
    mockTauriInvoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawctrl',
            path: '/Volumes/T7/projects/clawctrl',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      if (command === 'add_chat_workspace_project') {
        expect(args).toEqual({ path: '/Users/josue/NewProject' })
        return {
          project: nativeProject,
          projects: [nativeProject],
        }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add project' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenCalledWith(expect.objectContaining({
        directory: true,
        defaultPath: '/Volumes/T7/projects',
        multiple: true,
        title: 'Add project',
      }))
      expect(mockTauriInvoke).toHaveBeenCalledWith('add_chat_workspace_project', {
        path: '/Users/josue/NewProject',
      })
      expect(promptSpy).not.toHaveBeenCalled()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/NewProject')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('codex/add-project')
      expect(screen.getByRole('button', { name: 'Select project josue/new-project' })).toBeInTheDocument()
    })

    expect(JSON.parse(localStorage.getItem('chat-added-projects') || '[]')).toEqual([])
    promptSpy.mockRestore()
  })

  it('adds every folder returned by the native project picker', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    mockDialogOpen.mockResolvedValue(['/Users/josue/AgentShell', '/Users/josue/memd'])
    mockTauriInvoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawctrl',
            path: '/Volumes/T7/projects/clawctrl',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      if (command === 'add_chat_workspace_project') {
        const projectPath = args?.path || '/Users/josue/NewProject'
        const name = projectPath.split('/').filter(Boolean).at(-1) || 'NewProject'
        const project = {
          id: projectPath,
          environmentId: 'local',
          name,
          path: projectPath,
          root: projectPath,
          branches: ['main'],
          currentBranch: 'main',
        }
        return { project, projects: [project] }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('add_chat_workspace_project', {
        path: '/Users/josue/AgentShell',
      })
      expect(mockTauriInvoke).toHaveBeenCalledWith('add_chat_workspace_project', {
        path: '/Users/josue/memd',
      })
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project memd' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/memd')
    })
    expect(localStorage.getItem('chat-project-picker-last-dir')).toBe('/Users/josue')
  })

  it('dedupes sanitized native project picker path variants before persisting', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    mockDialogOpen.mockResolvedValue([
      ' "file:///Users/josue/AgentShell/" ',
      '/Users/josue/AgentShell',
      String.raw`/Users/josue/memd`,
    ])
    mockTauriInvoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawctrl',
            path: '/Volumes/T7/projects/clawctrl',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      if (command === 'add_chat_workspace_project') {
        const projectPath = args?.path?.replace(/\/+$/g, '') || '/Users/josue/NewProject'
        const name = projectPath.split('/').filter(Boolean).at(-1) || 'NewProject'
        const project = {
          id: projectPath,
          environmentId: 'local',
          name,
          path: projectPath,
          root: projectPath,
          branches: ['main'],
          currentBranch: 'main',
        }
        return { project, projects: [project] }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      const addedProjectCalls = mockTauriInvoke.mock.calls.filter(([command]) => command === 'add_chat_workspace_project')
      expect(addedProjectCalls).toHaveLength(2)
      expect(addedProjectCalls).toEqual(expect.arrayContaining([
        ['add_chat_workspace_project', { path: '/Users/josue/AgentShell/' }],
        ['add_chat_workspace_project', { path: '/Users/josue/memd' }],
      ]))
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project memd' })).toBeInTheDocument()
    })
  })

  it('continues native multi-project adds after one selected folder fails', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockDialogOpen.mockResolvedValue(['/Users/josue/MissingProject', '/Users/josue/memd'])
    mockTauriInvoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawctrl',
            path: '/Volumes/T7/projects/clawctrl',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      if (command === 'add_chat_workspace_project') {
        const projectPath = args?.path || '/Users/josue/NewProject'
        if (projectPath.includes('MissingProject')) {
          throw new Error('project folder does not exist or cannot be read')
        }
        const name = projectPath.split('/').filter(Boolean).at(-1) || 'NewProject'
        const project = {
          id: projectPath,
          environmentId: 'local',
          name,
          path: projectPath,
          root: projectPath,
          branches: ['main'],
          currentBranch: 'main',
        }
        return { project, projects: [project] }
      }
      if (command === 'get_chat_project_for_path' && args?.path?.includes('MissingProject')) {
        throw new Error('project folder does not exist or cannot be read')
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('add_chat_workspace_project', {
        path: '/Users/josue/MissingProject',
      })
      expect(mockTauriInvoke).toHaveBeenCalledWith('add_chat_workspace_project', {
        path: '/Users/josue/memd',
      })
      expect(screen.queryByRole('button', { name: 'Select project MissingProject' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select project memd' })).toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/memd')
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Added 1 project folder; 1 selected folder could not be added.',
        5000,
      )
    })
    warnSpy.mockRestore()
  })

  it('opens the typed add-project dialog when every native selected folder fails', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockDialogOpen.mockResolvedValue(' "file:///Users/josue/MissingProject" ')
    mockTauriInvoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawctrl',
            path: '/Volumes/T7/projects/clawctrl',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      if (command === 'add_chat_workspace_project' && args?.path === '/Users/josue/MissingProject') {
        throw new Error('project folder does not exist or cannot be read')
      }
      if (command === 'get_chat_project_for_path' && args?.path === '/Users/josue/MissingProject') {
        throw new Error('project folder does not exist or cannot be read')
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))

    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(addDialog).getByRole('textbox', { name: 'Project folder path' })).toHaveValue('/Users/josue/MissingProject')
    expect(within(addDialog).getByRole('alert')).toHaveTextContent('Unable to add the selected project folder')
    expect(screen.queryByRole('button', { name: 'Select project MissingProject' })).not.toBeInTheDocument()
    warnSpy.mockRestore()
  })

  it('canonicalizes legacy added project path variants when Tauri falls back to local resolution', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    localStorage.setItem('chat-added-projects', JSON.stringify([{
      id: 'legacy-new-project',
      environmentId: 'local',
      name: 'NewProject legacy',
      path: '/Users/josue/NewProject/',
      root: '/Users/josue/NewProject/',
      branches: ['main'],
      currentBranch: 'main',
    }]))
    mockDialogOpen.mockResolvedValue('/Users/josue/NewProject/')
    mockTauriInvoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'get_chat_workspace_context') {
        return { projects: [], runtimeModes: ['Work locally'] }
      }
      if (command === 'add_chat_workspace_project') {
        throw new Error('local backend unavailable')
      }
      if (command === 'get_chat_project_for_path') {
        expect(args?.path).toBe('/Users/josue/NewProject/')
        return {
          id: 'local:new-project:stable',
          environmentId: 'local',
          name: 'NewProject',
          path: '/Users/josue/NewProject',
          root: '/Users/josue/NewProject',
          branches: ['main', 'codex/canonical'],
          currentBranch: 'codex/canonical',
        }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/NewProject')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('codex/canonical')
    })
    expect(JSON.parse(localStorage.getItem('chat-added-projects') || '[]')).toEqual([expect.objectContaining({
      id: 'local:new-project:stable',
      path: '/Users/josue/NewProject',
      currentBranch: 'codex/canonical',
    })])
    warnSpy.mockRestore()
  })

  it('prevents duplicate native folder picker launches while one is pending', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    let resolvePicker: ((value: string | null) => void) | null = null
    mockDialogOpen.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePicker = resolve
    }))
    mockTauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawctrl',
            path: '/Volumes/T7/projects/clawctrl',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    const addProject = within(sidebar).getByRole('button', { name: 'Add project' })
    fireEvent.click(addProject)
    fireEvent.click(addProject)

    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenCalledTimes(1)
      expect(addProject).toBeDisabled()
    })

    await act(async () => {
      resolvePicker?.(null)
    })
  })

  it('falls back to the typed project dialog when the native folder picker is unavailable', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    const promptSpy = vi.spyOn(window, 'prompt')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockDialogOpen.mockRejectedValue(new Error('dialog plugin unavailable'))
    mockTauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawctrl',
            path: '/Volumes/T7/projects/clawctrl',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add project' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add project' }))

    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    expect(within(addDialog).getByRole('textbox', { name: 'Project folder path' })).toBeInTheDocument()
    expect(within(addDialog).getByPlaceholderText('/path/to/project')).toBeInTheDocument()
    expect(within(addDialog).getByRole('button', { name: 'Choose folder' })).toBeInTheDocument()
    expect(promptSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
    promptSpy.mockRestore()
  })

  it('can retry the native folder picker from the typed project dialog', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockDialogOpen
      .mockRejectedValueOnce(new Error('dialog plugin unavailable'))
      .mockResolvedValueOnce('/Users/josue/RetryProject')
    mockTauriInvoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'get_chat_workspace_context') {
        return { projects: [], runtimeModes: ['Work locally'] }
      }
      if (command === 'add_chat_workspace_project') {
        const projectPath = args?.path || '/Users/josue/RetryProject'
        const project = {
          id: projectPath,
          environmentId: 'local',
          name: 'RetryProject',
          path: projectPath,
          root: projectPath,
          branches: ['main'],
          currentBranch: 'main',
        }
        return { project, projects: [project] }
      }
      throw new Error(`Unexpected invoke: ${command}`)
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const sidebar = await screen.findByTestId('session-list')
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add project' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add project' })
    fireEvent.change(within(addDialog).getByRole('textbox', { name: 'Project folder path' }), {
      target: { value: '/Users/josue/RetryProject' },
    })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Choose folder' }))

    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenLastCalledWith(expect.objectContaining({
        defaultPath: '/Users/josue',
      }))
      expect(mockTauriInvoke).toHaveBeenCalledWith('add_chat_workspace_project', {
        path: '/Users/josue/RetryProject',
      })
      expect(screen.queryByRole('dialog', { name: 'Add project' })).not.toBeInTheDocument()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/RetryProject')
    })
    warnSpy.mockRestore()
  })

  it('rehydrates synced project records after workspace preferences arrive', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Select project AgentShell' })).not.toBeInTheDocument()
    })

    localStorage.setItem('chat-added-projects', JSON.stringify([{
      id: 'local:agent-shell:stable123',
      environmentId: 'local',
      name: 'AgentShell',
      path: '/Users/josue/AgentShell',
      root: '/Users/josue/AgentShell',
      branches: ['main', 'codex/workspace'],
      currentBranch: 'codex/workspace',
      machineLabel: 'Laptop',
      repositoryIdentity: {
        canonicalKey: 'github.com/josue/agent-shell',
        displayName: 'josue/agent-shell',
        rootPath: '/Users/josue/AgentShell',
      },
    }]))
    localStorage.setItem('chat-project-scripts', JSON.stringify({
      '/Users/josue/AgentShell': [{ id: 'dev', name: 'Dev', command: 'npm run dev' }],
    }))

    act(() => {
      window.dispatchEvent(new CustomEvent('clawctrl:chat-workspace-preferences-changed'))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select project josue/agent-shell' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select project josue/agent-shell' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect(screen.getByRole('button', { name: 'Run Dev' })).toBeInTheDocument()
    })
  })

  it('mirrors edited project scripts across stable id and legacy path keys', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawctrl:stable123',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    localStorage.setItem('chat-project-scripts', JSON.stringify({
      '/Volumes/T7/projects/clawctrl': [{ id: 'dev', name: 'Dev', command: 'npm run dev' }],
    }))
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Dev' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit selected action' }))

    const editDialog = await screen.findByRole('dialog', { name: 'Edit Action' })
    fireEvent.change(within(editDialog).getByDisplayValue('Dev'), {
      target: { value: 'Dev watch' },
    })
    fireEvent.change(within(editDialog).getByDisplayValue('npm run dev'), {
      target: { value: 'npm run dev -- --watch' },
    })
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Dev watch' })).toBeInTheDocument()
    })
    const persisted = JSON.parse(localStorage.getItem('chat-project-scripts') || '{}') as Record<string, Array<{ id: string; name: string; command: string }>>
    expect(persisted['local:clawctrl:stable123']).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dev', name: 'Dev watch' }),
    ]))
    expect(persisted['/Volumes/T7/projects/clawctrl']).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dev', name: 'Dev watch' }),
    ]))
  })

  it('rolls project script edits back with visible status when backend persistence fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const showAttachmentStatus = vi.fn()
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiPatch.mockRejectedValueOnce(new Error('script update failed'))
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawctrl:stable123',
        environmentId: 'local',
        name: 'clawctrl',
        path: '/Volumes/T7/projects/clawctrl',
        root: '/Volumes/T7/projects/clawctrl',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    localStorage.setItem('chat-project-scripts', JSON.stringify({
      '/Volumes/T7/projects/clawctrl': [{ id: 'dev', name: 'Dev', command: 'npm run dev' }],
    }))
    persistClawcontrolProjectSelection()

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Dev' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit selected action' }))

    const editDialog = await screen.findByRole('dialog', { name: 'Edit Action' })
    fireEvent.change(within(editDialog).getByDisplayValue('Dev'), {
      target: { value: 'Dev watch' },
    })
    fireEvent.change(within(editDialog).getByDisplayValue('npm run dev'), {
      target: { value: 'npm run dev -- --watch' },
    })
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local:clawctrl:stable123',
        path: '/Volumes/T7/projects/clawctrl',
        scripts: [expect.objectContaining({ id: 'dev', name: 'Dev watch' })],
      }))
      expect(screen.getByRole('button', { name: 'Run Dev' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Run Dev watch' })).not.toBeInTheDocument()
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Project action update failed. Restored actions for clawctrl.',
        5000,
      )
    })
    const persisted = JSON.parse(localStorage.getItem('chat-project-scripts') || '{}') as Record<string, Array<{ id: string; name: string }>>
    expect(persisted['/Volumes/T7/projects/clawctrl']).toEqual([
      expect.objectContaining({ id: 'dev', name: 'Dev' }),
    ])
    warnSpy.mockRestore()
  })

  it('restores persisted project runtime and branch workspace selection', async () => {
    localStorage.setItem('chat-selected-project-path', '/Users/josue/AgentShell')
    localStorage.setItem('chat-selected-runtime', 'Remote harness')
    localStorage.setItem('chat-selected-branch', 'feature/agent-shell')
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main'],
          currentBranch: 'main',
        },
        {
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'main',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Runtime') as HTMLSelectElement).value).toBe('Remote harness')
      expect(screen.getByRole('option', { name: 'Hermes Agent remote' })).toHaveValue('Remote harness')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('feature/agent-shell')
      expect(screen.getByRole('button', { name: 'Select project AgentShell' })).toHaveAttribute('aria-current', 'true')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          branch: 'feature/agent-shell',
          runtime: 'Remote harness',
        }),
      }))
    })
  })

  it('persists project runtime and branch changes from the workspace controls', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main', 'codex/chat-parity'],
          currentBranch: 'main',
        },
        {
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select project AgentShell' }))
    fireEvent.change(screen.getByLabelText('Runtime'), {
      target: { value: 'Remote harness' },
    })
    fireEvent.change(screen.getByLabelText('Branch'), {
      target: { value: 'main' },
    })

    await waitFor(() => {
      expect(localStorage.getItem('chat-selected-project-path')).toBe('/Users/josue/AgentShell')
      expect(localStorage.getItem('chat-selected-runtime')).toBe('Remote harness')
      expect(localStorage.getItem('chat-selected-branch')).toBe('main')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          branch: 'main',
          runtime: 'Remote harness',
        }),
      }))
    })
    expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/AgentShell')
    expect(searchParamsFromLocation().get('branch')).toBe('main')
    expect(searchParamsFromLocation().get('runtime')).toBe('Remote harness')
  })

  it('updates project context when mounted chat receives explicit project route params', async () => {
    mockUseGatewaySessions.mockReturnValue({
      sessions: [],
      available: true,
      isLoading: false,
    })
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawctrl:stable',
          name: 'clawctrl',
          path: '/Volumes/T7/projects/clawctrl',
          branches: ['main', 'codex/chat-parity'],
          currentBranch: 'main',
          environmentId: 'local',
        },
        {
          id: 'desktop:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'main',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <NavigateButton
          label="Go to AgentShell route"
          to="/chat?cwd=%2FUsers%2Fjosue%2FAgentShell&env=desktop&branch=feature%2Fagent-shell&runtime=Remote+harness"
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
      expect(searchParamsFromLocation().get('new')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go to AgentShell route' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
      expect((screen.getByLabelText('Runtime') as HTMLSelectElement).value).toBe('Remote harness')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('feature/agent-shell')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'AgentShell',
          workingDir: '/Users/josue/AgentShell',
          environmentId: 'desktop',
          branch: 'feature/agent-shell',
          runtime: 'Remote harness',
        }),
      }))
    })
    expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/AgentShell')
    expect(searchParamsFromLocation().get('env')).toBe('desktop')
  })

  it('adds a valid explicit route cwd when mounted chat navigates to a folder outside the current workspace list', async () => {
    mockUseGatewaySessions.mockReturnValue({
      sessions: [],
      available: true,
      isLoading: false,
    })
    mockApiGet.mockResolvedValueOnce({
      projects: [],
      runtimeModes: ['Work locally'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <React.StrictMode>
          <ChatPage />
        </React.StrictMode>
        <NavigateButton
          label="Go to new project route"
          to="/chat?cwd=%2FUsers%2Fjosue%2FNewProject&env=local&branch=main&runtime=Work+locally"
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go to new project route' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        path: '/Users/josue/NewProject',
      })
      expect(mockApiPost).toHaveBeenCalledTimes(1)
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/NewProject')
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'NewProject',
          workingDir: '/Users/josue/NewProject',
          environmentId: 'local',
          branch: 'main',
        }),
      }))
    })
    expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/NewProject')
    expect(searchParamsFromLocation().get('env')).toBe('local')
  })

  it('preserves mounted project context recovery when explicit route project becomes unavailable', async () => {
    const showAttachmentStatus = vi.fn()
    mockUseGatewaySessions.mockReturnValue({
      sessions: [],
      available: true,
      isLoading: false,
    })
    mockUseChatState.mockReturnValue({
      ...chatStateStub(),
      showAttachmentStatus,
    })
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'desktop:agent-shell:stable',
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main', 'feature/agent-shell'],
          currentBranch: 'feature/agent-shell',
          environmentId: 'desktop',
        },
      ],
      runtimeModes: ['Work locally', 'Remote harness'],
    })
    mockApiPost.mockRejectedValueOnce(new Error('missing project'))

    render(
      <MemoryRouter initialEntries={['/chat?cwd=%2FUsers%2Fjosue%2FAgentShell&env=desktop&branch=feature%2Fagent-shell&runtime=Remote+harness']}>
        <ChatPage />
        <NavigateButton
          label="Go to missing project route"
          to="/chat?cwd=%2FUsers%2Fjosue%2FMissingProject&env=desktop&branch=main&runtime=Remote+harness"
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/AgentShell')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go to missing project route' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe(JSON.stringify(['desktop', '/Users/josue/MissingProject']))
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: undefined,
          workingDir: undefined,
          environmentId: undefined,
          branch: undefined,
          runtime: undefined,
        }),
      }))
      expect(showAttachmentStatus).toHaveBeenCalledWith(
        'Project folder is no longer available. Add it again or select another project.',
        5000,
      )
    })
    const params = searchParamsFromLocation()
    expect(params.get('cwd')).toBe('/Users/josue/MissingProject')
    expect(params.get('projectId')).toBeNull()
    expect(params.get('env')).toBe('desktop')
    expect(params.get('branch')).toBe('main')
    expect(params.get('runtime')).toBe('Remote harness')
  })
})
