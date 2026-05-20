import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

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
  mockCompactMutate,
} = vi.hoisted(() => ({
  mockApiGet: vi.fn(async () => ({
    projects: [{
      name: 'clawcontrol',
      path: '/Volumes/T7/projects/clawcontrol',
      branches: ['main'],
      currentBranch: 'main',
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
    const projectPath = body?.path || '/Volumes/T7/projects/clawcontrol'
    const name = body?.name || projectPath.split('/').filter(Boolean).at(-1) || 'clawcontrol'
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

vi.mock('@/hooks/useCodexLbUsage', () => ({
  useCodexLbUsage: () => mockUseCodexLbUsage(),
}))

vi.mock('../chat/ChatThread', () => ({
  default: () => <div data-testid="chat-thread" />,
}))

vi.mock('../chat/ChatInput', () => ({
  default: Object.assign(
    ({ contextBar }: { contextBar?: React.ReactNode }) => (
      <div data-testid="chat-input">
        {contextBar}
      </div>
    ),
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

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output>
}

function searchParamsFromLocation() {
  const value = screen.getByLabelText('Current location').textContent || ''
  return new URLSearchParams(value.split('?')[1] || '')
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
      { id: 'hermes', name: 'Hermes', description: 'Codex LB backed chat', local: false, modelBacked: true },
      { id: 'codex-cli', name: 'Codex CLI', description: 'Installed CLI', local: true, modelBacked: false },
    ],
    modelsData: { models: [] },
    visibleModels: [],
    wsConnected: true,
    historyIsError: false,
    bottomRef: { current: null },
    scrollRef: { current: null },
    optimisticImageCacheRef: { current: new Map() },
    draftTimerRef: { current: null },
    send: vi.fn(),
    stop: vi.fn(),
    retry: vi.fn(),
    retryHistoryLoad: vi.fn(),
    handleFileChange: vi.fn(),
    onDrop: vi.fn(),
  }
}

describe('ChatPage new chat intent', () => {
  beforeEach(() => {
    localStorage.clear()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockClipboardWrite },
      configurable: true,
    })
    mockApiGet.mockResolvedValue({
      projects: [{
        name: 'clawcontrol',
        path: '/Volumes/T7/projects/clawcontrol',
        branches: ['main'],
        currentBranch: 'main',
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
      const projectPath = body?.path || '/Volumes/T7/projects/clawcontrol'
      const name = body?.name || projectPath.split('/').filter(Boolean).at(-1) || 'clawcontrol'
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
          project: 'clawcontrol',
          workingDir: '/Volumes/T7/projects/clawcontrol',
          branch: 'main',
          runtime: 'Work locally',
        }),
        onSessionKey: expect.any(Function),
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('honors ?session= by opening the requested saved chat', async () => {
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
          project: 'clawcontrol',
          workingDir: '/Volumes/T7/projects/clawcontrol',
          branch: 'main',
          runtime: 'Work locally',
        }),
        onSessionKey: expect.any(Function),
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBe('existing-session')
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

  it('selects an existing chat from the sidebar and persists URL state', async () => {
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
      expect(params.get('cwd')).toBe('/Volumes/T7/projects/clawcontrol')
    })
  })

  it('keeps rename compact and delete actions on unified sidebar chat rows', async () => {
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename Existing chat' }))
    const renameInput = screen.getByRole('textbox', { name: 'Rename Existing chat' })
    fireEvent.change(renameInput, { target: { value: 'Renamed chat' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compact Existing chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy thread id for Existing chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Existing chat' }))

    await waitFor(() => {
      expect(mockRenameMutate).toHaveBeenCalledWith({ key: 'existing-session', label: 'Renamed chat' })
      expect(mockCompactMutate).toHaveBeenCalledWith('existing-session')
      expect(mockDeleteMutate).toHaveBeenCalledWith('existing-session')
      expect(mockClipboardWrite).toHaveBeenCalledWith('existing-session')
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('promotes a newly created saved chat into session URL state', async () => {
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
      expect(params.get('cwd')).toBe('/Volumes/T7/projects/clawcontrol')
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
    expect(screen.queryByRole('button', { name: 'Add project' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand chat list' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand chat list' }))

    expect(screen.getByTestId('session-list')).toBeInTheDocument()
  })

  it('keeps command and terminal actions in the top header', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const toolbar = screen.getByTestId('chat-top-actions-toolbar')
    expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open terminal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Session info' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    expect(screen.getByRole('region', { name: 'Diff review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run Codex review' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run Codex review' }))
    const reviewDrawer = await screen.findByTestId('chat-terminal-drawer')
    expect(reviewDrawer).toHaveTextContent('Codex review')
    expect(reviewDrawer).toHaveTextContent('codex exec review --sandbox read-only --skip-git-repo-check')

    fireEvent.click(screen.getByRole('button', { name: 'Session info' }))
    expect(screen.getByRole('region', { name: 'Session info' })).toHaveTextContent('/Volumes/T7/projects/clawcontrol')

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

  it('shows an always-on Codex LB usage meter in the bottom context bar', () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Codex LB usage' })).toBeInTheDocument()
    expect(screen.getByText('5h')).toBeInTheDocument()
    expect(screen.getByText('Week')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('opens Codex LB usage details without waiting for a refresh', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Codex LB usage' }))
    expect(screen.getByRole('dialog', { name: 'Codex LB usage details' })).toBeInTheDocument()
    expect(screen.getByText(/refreshing · updated/)).toBeInTheDocument()
    expect(screen.getByText('personal')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('exposes the expected project scripts in the adjacent action menu', () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Run Tauri dev' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }))
    for (const label of ['Tauri dev', 'Frontend dev', 'Typecheck', 'Chat tests', 'Chat lint']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
  })

  it('uses scripts from backend-owned project records when available', async () => {
    localStorage.setItem('chat-project-scripts', JSON.stringify({
      '/Volumes/T7/projects/clawcontrol': [
        { id: 'legacy', name: 'Legacy stale action', command: 'npm run old' },
      ],
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: '/Volumes/T7/projects/clawcontrol',
        environmentId: 'local',
        name: 'clawcontrol',
        path: '/Volumes/T7/projects/clawcontrol',
        root: '/Volumes/T7/projects/clawcontrol',
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
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

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
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Storybook dev' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run Storybook dev' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('Storybook dev')
    expect(drawer).toHaveTextContent('npm run storybook -- --host 0.0.0.0')
    expect(drawer).toHaveTextContent('/Volumes/T7/projects/clawcontrol')
    expect(drawer).toHaveTextContent('CLAWCONTROL_PROJECT_PATH')
    expect(drawer).toHaveTextContent('CLAWCONTROL_RUNTIME')
    expect(drawer).toHaveTextContent('CLAWCONTROL_BRANCH')
    const persisted = JSON.parse(localStorage.getItem('chat-project-scripts') || '{}') as Record<string, Array<{ name: string; command: string }>>
    const savedScripts = persisted['/Volumes/T7/projects/clawcontrol'] ?? []
    expect(savedScripts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Storybook dev',
        command: 'npm run storybook -- --host 0.0.0.0',
      }),
    ]))
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        path: '/Volumes/T7/projects/clawcontrol',
        scripts: expect.arrayContaining([
          expect.objectContaining({
            name: 'Storybook dev',
            command: 'npm run storybook -- --host 0.0.0.0',
          }),
        ]),
      }))
    })
  })

  it('keeps folder runtime and branch with the bottom composer', () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    const toolbar = screen.getByTestId('chat-local-context-toolbar')
    expect(screen.getByLabelText('Project')).toHaveTextContent('clawcontrol')
    expect(screen.getByLabelText('Runtime')).toHaveTextContent('Work locally')
    expect(screen.getByLabelText('Branch')).toHaveTextContent('main')
    expect(screen.getByTestId('chat-input')).toContainElement(toolbar)
  })

  it('runs the primary project script inside the selected project terminal', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run Tauri dev' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('Tauri dev')
    expect(drawer).toHaveTextContent('cargo tauri dev')
    expect(drawer).toHaveTextContent('/Volumes/T7/projects/clawcontrol/src-tauri')
    expect(drawer).toHaveTextContent('chat-volumes-t7-projects-clawcontrol-1')
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Terminal status' })).toHaveTextContent('Tauri dev: running')
    })
  })

  it('loads browser workspace context from the local chat API fallback', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Run Tauri dev' }))

    const drawer = await screen.findByTestId('chat-terminal-drawer')
    expect(drawer).toHaveTextContent('cargo tauri dev')
    expect(drawer).toHaveTextContent('/Users/josue/AgentShell/src-tauri')
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
          id: 'local:clawcontrol:stable',
          environmentId: 'local',
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
          branches: ['main', 'codex/chat-parity'],
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
      runtimeModes: ['Work locally', 'Remote harness'],
    })

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawcontrol')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('main')
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
    expect(drawer).toHaveTextContent('chat-local-agent-shell-stable-1')
    expect(mockUseGatewaySessions).toHaveBeenCalledWith(expect.objectContaining({
      cwd: ['/Users/josue/AgentShell', '/Volumes/T7/projects/clawcontrol'],
      projectIds: ['local:clawcontrol:stable', 'local:agent-shell:stable'],
      includeUnscoped: true,
    }))
  })

  it('hydrates selected project from workspace route params', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawcontrol:stable',
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
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

  it('hydrates selected project from stable project route id without requiring cwd', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local:clawcontrol:stable',
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
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
          id: 'local:clawcontrol:stable',
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
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

  it('renders nested project groups in the sidebar for multiple roots or machines', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
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
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
          root: '/Volumes/T7/projects/clawcontrol',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'T7',
          repositoryIdentity: {
            canonicalKey: 'github.com/josue/clawcontrol',
            displayName: 'josue/clawcontrol',
            name: 'clawcontrol',
            rootPath: '/Volumes/T7/projects/clawcontrol',
          },
        },
        {
          id: 'remote-claw',
          environmentId: 'desktop',
          name: 'clawcontrol',
          path: '/Users/josue/projects/clawcontrol',
          root: '/Users/josue/projects/clawcontrol',
          branches: ['main', 'desktop-branch'],
          currentBranch: 'desktop-branch',
          machineLabel: 'JosuesDesktop',
          repositoryIdentity: {
            canonicalKey: 'github.com/josue/clawcontrol',
            displayName: 'josue/clawcontrol',
            name: 'clawcontrol',
            rootPath: '/Users/josue/projects/clawcontrol',
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
      expect(screen.getByRole('button', { name: 'Select project josue/clawcontrol' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select josue/clawcontrol root T7' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Select josue/clawcontrol root JosuesDesktop' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Project view options' }))
    expect(screen.getByRole('menu', { name: 'Project view options' })).toBeInTheDocument()
    expect(screen.getByLabelText('Project grouping')).toHaveValue('repository')
    expect(screen.getByLabelText('Project sort')).toHaveValue('name')

    fireEvent.change(screen.getByLabelText('Project sort'), { target: { value: 'recent' } })
    expect(localStorage.getItem('chat-project-sort-order')).toBe('recent')

    fireEvent.click(screen.getByRole('button', { name: 'New chat in josue/clawcontrol root JosuesDesktop' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/projects/clawcontrol')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('desktop-branch')
      expect(searchParamsFromLocation().get('cwd')).toBe('/Users/josue/projects/clawcontrol')
      expect(searchParamsFromLocation().get('env')).toBe('desktop')
      expect(searchParamsFromLocation().get('session')).toBeNull()
      expect(mockUseChatState).toHaveBeenLastCalledWith(null, expect.objectContaining({
        context: expect.objectContaining({
          project: 'clawcontrol',
          workingDir: '/Users/josue/projects/clawcontrol',
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
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          id: 'local-claw',
          environmentId: 'local',
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
          root: '/Volumes/T7/projects/clawcontrol',
          branches: ['main'],
          currentBranch: 'main',
          machineLabel: 'T7',
          repositoryIdentity: {
            canonicalKey: 'github.com/josue/clawcontrol',
            displayName: 'josue/clawcontrol',
            name: 'clawcontrol',
            rootPath: '/Volumes/T7/projects/clawcontrol',
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

    render(
      <MemoryRouter initialEntries={['/chat?new=1']}>
        <ChatPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /More actions for project (josue\/clawcontrol|clawcontrol)/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'More actions for project AgentShell' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawcontrol|clawcontrol)/ }))
    expect(screen.getByRole('menu', { name: /Actions for project (josue\/clawcontrol|clawcontrol)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat in project AgentShell' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: /Actions for project (josue\/clawcontrol|clawcontrol)/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawcontrol|clawcontrol)/ }))

    fireEvent.change(screen.getByLabelText(/Grouping for project (josue\/clawcontrol|clawcontrol)/), { target: { value: 'separate' } })
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local-claw',
        path: '/Volumes/T7/projects/clawcontrol',
        groupingOverride: 'separate',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawcontrol|clawcontrol)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy path for project (josue\/clawcontrol|clawcontrol)/ }))
    await waitFor(() => {
      expect(mockClipboardWrite).toHaveBeenCalledWith('/Volumes/T7/projects/clawcontrol')
    })

    fireEvent.click(screen.getByRole('button', { name: /More actions for project (josue\/clawcontrol|clawcontrol)/ }))
    expect(screen.getByRole('menuitem', { name: /Copied path for project (josue\/clawcontrol|clawcontrol)/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename project (josue\/clawcontrol|clawcontrol)/ }))
    const renameDialog = await screen.findByRole('dialog', { name: 'Rename project' })
    fireEvent.change(within(renameDialog).getByRole('textbox', { name: 'Project title' }), {
      target: { value: 'Claw Workspace' },
    })
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/chat/workspace-projects', expect.objectContaining({
        id: 'local-claw',
        path: '/Volumes/T7/projects/clawcontrol',
        name: 'Claw Workspace',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for project AgentShell' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove project AgentShell' }))
    await waitFor(() => {
      expect(mockApiDel).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        id: 'agent-shell',
        path: '/Users/josue/AgentShell',
      })
      expect(screen.queryByRole('button', { name: 'Select project AgentShell' })).not.toBeInTheDocument()
    })
    expect(searchParamsFromLocation().get('cwd')).toBe('/Volumes/T7/projects/clawcontrol')
  })

  it('uses Projects as the primary sidebar navigator and keeps scoped chats out of flat recents', async () => {
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawcontrol:stable',
        environmentId: 'local',
        name: 'clawcontrol',
        path: '/Volumes/T7/projects/clawcontrol',
        root: '/Volumes/T7/projects/clawcontrol',
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
          projectId: 'local:clawcontrol:stable',
          workingDir: '/tmp/path-that-would-not-match-by-cwd',
          project: 'clawcontrol',
        },
        {
          key: 'wrong-project-id',
          label: 'Wrong stable identity',
          messageCount: 2,
          projectId: 'local:other:stable',
          workingDir: '/Volumes/T7/projects/clawcontrol',
          project: 'clawcontrol',
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
        id: 'local:clawcontrol:stable',
        environmentId: 'local',
        name: 'clawcontrol',
        path: '/Volumes/T7/projects/clawcontrol',
        root: '/Volumes/T7/projects/clawcontrol',
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
          projectId: 'local:clawcontrol:stable',
          workingDir: '/tmp/wrong-cwd',
          project: 'clawcontrol',
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
        projectId: 'local:clawcontrol:stable',
        project: 'clawcontrol',
        projectRoot: '/Volumes/T7/projects/clawcontrol',
        workingDir: '/Volumes/T7/projects/clawcontrol',
        environmentId: 'local',
      },
    }))
    mockApiGet.mockResolvedValueOnce({
      projects: [{
        id: 'local:clawcontrol:stable',
        environmentId: 'local',
        name: 'clawcontrol',
        path: '/Volumes/T7/projects/clawcontrol',
        root: '/Volumes/T7/projects/clawcontrol',
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
        id: 'local:clawcontrol:stable',
        environmentId: 'local',
        name: 'clawcontrol',
        path: '/Volumes/T7/projects/clawcontrol',
        root: '/Volumes/T7/projects/clawcontrol',
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
          projectId: 'local:clawcontrol:stable',
          workingDir: '/Volumes/T7/projects/clawcontrol',
          project: 'clawcontrol',
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
    expect(screen.getByRole('button', { name: 'Add project' })).toBeInTheDocument()
    expect(screen.queryByText('Plugins')).not.toBeInTheDocument()
    expect(screen.queryByText('Codex mobile')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add project' }))
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

  it('opens settings shortcuts for settings usage providers and Codex LB', () => {
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
    expect(screen.getByRole('menuitem', { name: 'Codex LB' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Usage remaining' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=usage')

    fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Providers' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=providers')

    fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Codex LB' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=codex-lb')
  })

  it('uses the native folder picker and persists the git-aware project through the backend in Tauri', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    const promptSpy = vi.spyOn(window, 'prompt')
    mockDialogOpen.mockResolvedValue('/Users/josue/NewProject')
    mockApiPost.mockImplementation(async (path: string, body?: unknown) => {
      expect(path).toBe('/api/chat/workspace-projects')
      expect(body).toEqual({ path: '/Users/josue/NewProject' })
      return {
        project: {
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
        },
        projects: [],
      }
    })
    mockTauriInvoke.mockImplementation(async (command: string, _args?: unknown) => {
      if (command === 'get_chat_workspace_context') {
        return {
          projects: [{
            name: 'clawcontrol',
            path: '/Volumes/T7/projects/clawcontrol',
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

    await waitFor(() => {
      expect(mockDialogOpen).toHaveBeenCalledWith(expect.objectContaining({
        directory: true,
        multiple: false,
        title: 'Add project',
      }))
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/workspace-projects', {
        path: '/Users/josue/NewProject',
      })
      expect(promptSpy).not.toHaveBeenCalled()
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Users/josue/NewProject')
      expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('codex/add-project')
      expect(screen.getByRole('button', { name: 'Select project josue/new-project' })).toBeInTheDocument()
    })

    const persisted = JSON.parse(localStorage.getItem('chat-added-projects') || '[]') as Array<{ repositoryIdentity?: { canonicalKey?: string } }>
    expect(persisted[0]?.repositoryIdentity?.canonicalKey).toBe('github.com/josue/new-project')
    promptSpy.mockRestore()
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
      window.dispatchEvent(new CustomEvent('clawcontrol:chat-workspace-preferences-changed'))
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
        id: 'local:clawcontrol:stable123',
        environmentId: 'local',
        name: 'clawcontrol',
        path: '/Volumes/T7/projects/clawcontrol',
        root: '/Volumes/T7/projects/clawcontrol',
        branches: ['main'],
        currentBranch: 'main',
      }],
      runtimeModes: ['Work locally'],
    })
    localStorage.setItem('chat-project-scripts', JSON.stringify({
      '/Volumes/T7/projects/clawcontrol': [{ id: 'dev', name: 'Dev', command: 'npm run dev' }],
    }))

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
    expect(persisted['local:clawcontrol:stable123']).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dev', name: 'Dev watch' }),
    ]))
    expect(persisted['/Volumes/T7/projects/clawcontrol']).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dev', name: 'Dev watch' }),
    ]))
  })

  it('restores persisted project runtime and branch workspace selection', async () => {
    localStorage.setItem('chat-selected-project-path', '/Users/josue/AgentShell')
    localStorage.setItem('chat-selected-runtime', 'Remote harness')
    localStorage.setItem('chat-selected-branch', 'feature/agent-shell')
    mockApiGet.mockResolvedValueOnce({
      projects: [
        {
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
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
          name: 'clawcontrol',
          path: '/Volumes/T7/projects/clawcontrol',
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
      expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('/Volumes/T7/projects/clawcontrol')
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
})
