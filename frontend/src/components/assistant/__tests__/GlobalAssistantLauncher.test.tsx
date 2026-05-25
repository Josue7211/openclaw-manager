import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

const { mockApiGet, mockApiPost, mockHomeState, mockInvoke, mockTauriDragDrop } = vi.hoisted(() => ({
  mockApiGet: vi.fn(async (path: string) => (
    path === '/api/gateway/sessions'
      ? { sessions: [] }
      : { messages: [] }
  )),
  mockApiPost: vi.fn(async () => ({ reply: 'Built it.' })),
  mockHomeState: vi.fn(() => ({ pages: [], activePageId: null })),
  mockInvoke: vi.fn(),
  mockTauriDragDrop: {
    handler: undefined as undefined | ((event: { payload: { type: string; paths?: string[] } }) => void),
  },
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  invoke: mockInvoke,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn(async (handler: typeof mockTauriDragDrop.handler) => {
      mockTauriDragDrop.handler = handler
      return vi.fn()
    }),
  }),
}))

vi.mock('@/lib/openui', () => ({
  buildOpenUiLangSystemPrompt: () => 'openui prompt',
  extractFencedOpenUiLangFromResponse: (text: string) => text.includes('openui') ? 'card title "Hello"' : '',
  compileOpenUiLangWidgetSource: () => 'function GeneratedWidget() { return null }',
  OpenUiSnippet: ({ source }: { source: string }) => <div data-testid="openui-snippet">{source}</div>,
}))

vi.mock('@/lib/sidebar-config', () => ({
  commitSidebarConfigDraft: vi.fn(() => true),
  discardSidebarConfigDraft: vi.fn(() => true),
  getSidebarConfig: () => ({ categories: [], customNames: {}, customModules: [] }),
  moveItemToCategory: vi.fn(),
  redoSidebarConfigDraft: vi.fn(() => false),
  renameCategory: vi.fn(),
  renameItem: vi.fn(),
  startSidebarConfigDraft: vi.fn(),
  undoSidebarConfigDraft: vi.fn(() => false),
}))

vi.mock('@/lib/theme-store', () => ({
  commitThemeDraft: vi.fn(() => true),
  discardThemeDraft: vi.fn(() => true),
  redoThemeDraft: vi.fn(() => false),
  setCategoryOverride: vi.fn(),
  setPageOverride: vi.fn(),
  startThemeDraft: vi.fn(),
  undoThemeDraft: vi.fn(() => false),
}))

vi.mock('@/lib/dashboard-store', () => ({
  addWidgetToPage: vi.fn(),
  commitDashboardDraft: vi.fn(() => true),
  discardDashboardDraft: vi.fn(() => true),
  getDashboardState: () => ({ pages: [], activePageId: null }),
  redoDashboardDraft: vi.fn(() => false),
  replaceDashboardDraftWidgetPlugin: vi.fn(() => true),
  startDashboardDraft: vi.fn(),
  undoDashboardDraft: vi.fn(() => false),
}))

vi.mock('@/lib/home-store', () => ({
  addHomeWidgetToPage: vi.fn(),
  commitHomeDraft: vi.fn(() => true),
  discardHomeDraft: vi.fn(() => true),
  getHomeState: mockHomeState,
  redoHomeDraft: vi.fn(() => false),
  replaceHomeDraftWidgetPlugin: vi.fn(() => true),
  startHomeDraft: vi.fn(),
  undoHomeDraft: vi.fn(() => false),
}))

vi.mock('@/lib/generated-module-store', () => ({
  saveGeneratedModule: vi.fn(async () => ({ id: 'generated-1', name: 'Generated', defaultSize: { w: 4, h: 3 } })),
}))

vi.mock('@/lib/widget-registry', () => ({
  BUILTIN_WIDGETS: [
    {
      id: 'calendar',
      name: 'Calendar',
      description: 'Today events',
      category: 'productivity',
      defaultSize: { w: 2, h: 2 },
      configSchema: { fields: [] },
    },
  ],
  registerWidget: vi.fn(),
}))

vi.mock('@/lib/ui-customization-store', () => ({
  commitUiCustomizationDraft: vi.fn(() => true),
  discardUiCustomizationDraft: vi.fn(() => true),
  previewUiStyleRule: vi.fn(rule => rule),
  redoUiCustomizationDraft: vi.fn(() => false),
  undoUiCustomizationDraft: vi.fn(() => false),
}))

vi.mock('@/components/MarkdownBubble', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

import GlobalAssistantLauncher from '../GlobalAssistantLauncher'
import { previewUiStyleRule } from '@/lib/ui-customization-store'
import { renameItem, startSidebarConfigDraft } from '@/lib/sidebar-config'
import { setPageOverride, startThemeDraft } from '@/lib/theme-store'

function renderLauncher() {
  return render(
    <MemoryRouter>
      <GlobalAssistantLauncher collapsed={true} />
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

describe('GlobalAssistantLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? { sessions: [] }
        : { messages: [] }
    ))
    mockApiPost.mockResolvedValue({ reply: 'Built it.' })
    mockHomeState.mockReturnValue({ pages: [], activePageId: null })
    mockInvoke.mockResolvedValue('data:image/png;base64,native-drop')
    mockTauriDragDrop.handler = undefined
  })

  it('opens the global assistant drawer from the sidebar launcher', () => {
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))

    expect(screen.getByRole('dialog', { name: /AI Chat assistant/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Assistant message')).toBeInTheDocument()
    expect(screen.getByText('Tell the assistant what to build, change, capture, or explain.')).toBeInTheDocument()
    expect(screen.queryByText(/OpenUI built in/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/OpenUI renders/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'OpenUI' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Select assistant chat')).toBeInTheDocument()
  })

  it('anchors the assistant as a right-side drawer', () => {
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))

    expect(screen.getByRole('dialog', { name: /AI Chat assistant/i })).toHaveStyle({
      position: 'fixed',
      right: '0px',
      bottom: '0px',
    })
    expect(screen.queryByRole('button', { name: 'Minimize assistant' })).not.toBeInTheDocument()
  })

  it('opens the full chat as a new chat request when no sidebar session is selected', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <GlobalAssistantLauncher collapsed={true} />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.click(screen.getByRole('button', { name: 'Open full chat' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/chat?new=1')
    expect(screen.queryByRole('dialog', { name: /AI Chat assistant/i })).not.toBeInTheDocument()
  })

  it('does not auto-open the last remembered chat when the sidebar drawer opens', async () => {
    localStorage.setItem('chat-selected-session-key', 'weather-chat')
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? { sessions: [{ key: 'weather-chat', label: 'Weather', messageCount: 4, lastActivity: new Date().toISOString(), agentKey: 'main' }] }
        : { messages: [] }
    ))
    render(
      <MemoryRouter initialEntries={['/']}>
        <GlobalAssistantLauncher collapsed={true} />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))

    const picker = await screen.findByLabelText('Select assistant chat') as HTMLSelectElement
    expect(picker.value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Open full chat' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/chat?new=1')
    expect(localStorage.getItem('chat-selected-session-key')).toBeNull()
  })

  it('opens the selected sidebar session in full chat', async () => {
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? { sessions: [{ key: 'chat-42', label: 'Sidebar chat', messageCount: 2, lastActivity: new Date().toISOString(), agentKey: 'main' }] }
        : { messages: [] }
    ))
    render(
      <MemoryRouter initialEntries={['/']}>
        <GlobalAssistantLauncher collapsed={true} />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(await screen.findByLabelText('Select assistant chat'), { target: { value: JSON.stringify(['', 'chat-42']) } })
    fireEvent.click(screen.getByRole('button', { name: 'Open full chat' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/chat?session=chat-42')
    expect(localStorage.getItem('chat-selected-session-key')).toBe('chat-42')
  })

  it('opens environment-scoped sidebar sessions in full chat', async () => {
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? {
            sessions: [
              { key: 'shared-thread', label: 'Local chat', messageCount: 2, lastActivity: new Date().toISOString(), agentKey: 'main', environmentId: 'local' },
              { key: 'shared-thread', label: 'Desktop chat', messageCount: 4, lastActivity: new Date().toISOString(), agentKey: 'main', environmentId: 'desktop' },
            ],
          }
        : { messages: [] }
    ))
    render(
      <MemoryRouter initialEntries={['/']}>
        <GlobalAssistantLauncher collapsed={true} />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(await screen.findByLabelText('Select assistant chat'), { target: { value: JSON.stringify(['desktop', 'shared-thread']) } })
    fireEvent.click(screen.getByRole('button', { name: 'Open full chat' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/chat?session=shared-thread&threadId=shared-thread&environmentId=desktop')
    expect(localStorage.getItem('chat-selected-session-key')).toBe('shared-thread')
    expect(localStorage.getItem('chat-selected-session-environment')).toBe('desktop')
  })

  it('sends ordinary sidebar messages to Hermes chat with the selected saved session key', async () => {
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? { sessions: [{ key: 'chat-42', label: 'Sidebar chat', messageCount: 2, lastActivity: new Date().toISOString(), agentKey: 'main' }] }
        : { messages: [] }
    ))
    mockApiPost.mockResolvedValueOnce({ reply: 'Continuing chat.', sessionKey: 'chat-42' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(await screen.findByLabelText('Select assistant chat'), { target: { value: JSON.stringify(['', 'chat-42']) } })
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'continue this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        sessionKey: 'chat-42',
        text: 'continue this',
        liveContext: expect.stringContaining('calendar: loaded'),
      }))
    })
  })

  it('sends ordinary sidebar messages with the selected saved session environment', async () => {
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? {
            sessions: [
              { key: 'shared-thread', label: 'Local chat', messageCount: 2, lastActivity: new Date().toISOString(), agentKey: 'main', environmentId: 'local' },
              { key: 'shared-thread', label: 'Desktop chat', messageCount: 4, lastActivity: new Date().toISOString(), agentKey: 'main', environmentId: 'desktop' },
            ],
          }
        : { messages: [] }
    ))
    mockApiPost.mockResolvedValueOnce({ reply: 'Continuing desktop chat.', sessionKey: 'shared-thread', environmentId: 'desktop' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(await screen.findByLabelText('Select assistant chat'), { target: { value: JSON.stringify(['desktop', 'shared-thread']) } })
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'continue desktop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/gateway/sessions/shared-thread/history?limit=500&environmentId=desktop')
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        sessionKey: 'shared-thread',
        environmentId: 'desktop',
        text: 'continue desktop',
      }))
    })
    expect(localStorage.getItem('chat-selected-session-key')).toBe('shared-thread')
    expect(localStorage.getItem('chat-selected-session-environment')).toBe('desktop')
  })

  it('sends ordinary sidebar messages with the selected workspace project context', async () => {
    localStorage.setItem('chat-selected-project-path', '/Users/josue/AgentShell')
    localStorage.setItem('chat-selected-branch', 'codex/drawer-context')
    localStorage.setItem('chat-selected-runtime', 'Work locally')
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [
            {
              id: 'local:clawcontrol',
              name: 'clawcontrol',
              path: '/Volumes/T7/projects/clawcontrol',
              root: '/Volumes/T7/projects/clawcontrol',
              environmentId: 'local',
              branches: ['main'],
              currentBranch: 'main',
            },
            {
              id: 'local:agent-shell',
              name: 'AgentShell',
              path: '/Users/josue/AgentShell',
              root: '/Users/josue/AgentShell',
              environmentId: 'local',
              branches: ['main', 'codex/drawer-context'],
              currentBranch: 'codex/drawer-context',
            },
          ],
          runtimeModes: ['Work locally'],
        }
      }
      if (path === '/api/gateway/sessions') return { sessions: [] }
      return { messages: [] }
    })
    mockApiPost.mockResolvedValueOnce({ reply: 'Using AgentShell.', sessionKey: 'chat-agent-shell' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'continue this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        text: 'continue this',
        projectId: 'local:agent-shell',
        project: 'AgentShell',
        projectRoot: '/Users/josue/AgentShell',
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'local',
        branch: 'codex/drawer-context',
        runtime: 'Work locally',
      }))
    })
  })

  it('resolves the selected workspace project by path and environment', async () => {
    localStorage.setItem('chat-selected-project-path', '/Users/josue/AgentShell/')
    localStorage.setItem('chat-selected-project-environment', 'desktop')
    localStorage.setItem('chat-selected-runtime', 'Work locally')
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [
            {
              id: 'local:agent-shell',
              name: 'AgentShell local',
              path: '/Users/josue/AgentShell',
              root: '/Users/josue/AgentShell',
              environmentId: 'local',
              branches: ['main'],
              currentBranch: 'main',
            },
            {
              id: 'desktop:agent-shell',
              name: 'AgentShell desktop',
              path: '/Users/josue/AgentShell',
              root: '/Users/josue/AgentShell',
              environmentId: 'desktop',
              branches: ['main', 'codex/desktop'],
              currentBranch: 'codex/desktop',
            },
          ],
          runtimeModes: ['Work locally'],
        }
      }
      if (path === '/api/gateway/sessions') return { sessions: [] }
      return { messages: [] }
    })
    mockApiPost.mockResolvedValueOnce({ reply: 'Using desktop AgentShell.', sessionKey: 'chat-desktop-agent-shell' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'continue this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        text: 'continue this',
        projectId: 'desktop:agent-shell',
        project: 'AgentShell desktop',
        projectRoot: '/Users/josue/AgentShell',
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'desktop',
        branch: 'codex/desktop',
        runtime: 'Work locally',
      }))
    })
  })

  it('treats a greeting as normal Hermes chat instead of OpenUI build mode', async () => {
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? { sessions: [] }
        : {
            messages: [
              { id: 'stored-user', role: 'user', text: 'hello', timestamp: new Date().toISOString() },
              { id: 'stored-assistant', role: 'assistant', text: 'Hello from Hermes.', timestamp: new Date().toISOString() },
            ],
          }
    ))
    mockApiPost.mockResolvedValueOnce({ reply: 'Hello from Hermes.', sessionKey: 'hello-chat' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        text: 'hello',
        newChat: true,
      }))
    })
    expect(mockApiPost).not.toHaveBeenCalledWith('/api/chat/openui', expect.any(Object))
    expect(await screen.findByText('Hello from Hermes.')).toBeInTheDocument()
    expect(screen.getAllByText('Hello from Hermes.')).toHaveLength(1)
  })

  it('treats generic UI concept questions as normal Hermes chat', async () => {
    mockApiPost.mockResolvedValueOnce({ reply: 'A widget is a small reusable UI surface.' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'what is a widget?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        text: 'what is a widget?',
        newChat: true,
      }))
    })
    expect(mockApiPost).not.toHaveBeenCalledWith('/api/chat/openui', expect.any(Object))
    expect(await screen.findByText('A widget is a small reusable UI surface.')).toBeInTheDocument()
  })

  it('does not leak the previous saved session when switching back to new chat before sending', async () => {
    mockApiGet.mockImplementation(async (path: string) => (
      path === '/api/gateway/sessions'
        ? { sessions: [{ key: 'weather-chat', label: 'Weather dashboard page', messageCount: 63, lastActivity: new Date().toISOString(), agentKey: 'main' }] }
        : { messages: [] }
    ))
    mockApiPost.mockResolvedValueOnce({ reply: 'Started new chat.', sessionKey: 'fresh-card-chat' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    const picker = await screen.findByLabelText('Select assistant chat')
    fireEvent.change(picker, { target: { value: JSON.stringify(['', 'weather-chat']) } })
    fireEvent.change(picker, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'make a card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/openui', expect.objectContaining({
        newChat: true,
      }))
    })
    const request = mockApiPost.mock.calls.find(call => call[0] === '/api/chat/openui')?.[1] as { sessionKey?: string }
    expect(request.sessionKey).toBeUndefined()
    expect(localStorage.getItem('chat-selected-session-key')).toBe('fresh-card-chat')
  })

  it('keeps workspace environment when builder mode creates a saved session', async () => {
    localStorage.setItem('chat-selected-project-path', '/Users/josue/AgentShell')
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [{
            id: 'remote:agent-shell',
            name: 'AgentShell',
            path: '/Users/josue/AgentShell',
            root: '/Users/josue/AgentShell',
            environmentId: 'desktop',
            branches: ['main'],
            currentBranch: 'main',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      if (path === '/api/gateway/sessions') return { sessions: [] }
      return { messages: [] }
    })
    mockApiPost.mockResolvedValueOnce({ reply: 'Started builder chat.', sessionKey: 'builder-agent-shell' })
    const sessionsChanged = vi.fn()
    window.addEventListener('clawcontrol:chat-sessions-changed', sessionsChanged)
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'make a card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/openui', expect.objectContaining({
        environmentId: 'desktop',
        newChat: true,
      }))
      expect(localStorage.getItem('chat-selected-session-key')).toBe('builder-agent-shell')
      expect(localStorage.getItem('chat-selected-session-environment')).toBe('desktop')
    })
    expect((sessionsChanged.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      sessionKey: 'builder-agent-shell',
      environmentId: 'desktop',
    })
    window.removeEventListener('clawcontrol:chat-sessions-changed', sessionsChanged)
  })

  it('selects a newly-created saved session after a sidebar send', async () => {
    mockApiPost.mockResolvedValueOnce({ reply: 'Started saved chat.', sessionKey: 'new-sidebar-chat' })
    const sessionsChanged = vi.fn()
    window.addEventListener('clawcontrol:chat-sessions-changed', sessionsChanged)
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'start from sidebar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(localStorage.getItem('chat-selected-session-key')).toBe('new-sidebar-chat')
      expect(sessionsChanged).toHaveBeenCalled()
    })
    expect((sessionsChanged.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      sessionKey: 'new-sidebar-chat',
    })
    window.removeEventListener('clawcontrol:chat-sessions-changed', sessionsChanged)
  })

  it('sends one unified assistant request and renders OpenUI inline', async () => {
    mockApiPost.mockResolvedValueOnce({ reply: 'Here is the UI.\n```openui\ncard title "Hello"\n```' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'make a card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/openui', expect.any(Object))
    })

    expect(await screen.findByTestId('openui-snippet')).toHaveTextContent('card title "Hello"')
  })

  it('does not queue app actions for ordinary UI generation prompts', async () => {
    mockApiPost.mockResolvedValueOnce({
      reply: 'Here is the UI.\n```openui\ncard title "Hello"\n```\n```json\n{"actions":[{"type":"dashboard.add_widget","summary":"Add widget"}]}\n```',
    })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'make a focus card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    expect(await screen.findByTestId('openui-snippet')).toHaveTextContent('card title "Hello"')
    expect(screen.queryByText(/Queued app actions/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/```openui/i)).not.toBeInTheDocument()
  })

  it('asks before duplicating an existing built-in widget', async () => {
    mockHomeState.mockReturnValue({
      activePageId: 'home-page',
      pages: [{
        id: 'home-page',
        name: 'Home',
        layouts: { lg: [{ i: 'calendar-home', x: 0, y: 0, w: 4, h: 3 }] },
        widgetConfigs: { 'calendar-home': { _pluginId: 'calendar' } },
      }],
    })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'add a calendar widget' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    expect(await screen.findByText(/You already have a Calendar widget on Home/i)).toBeInTheDocument()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('offers an edit/refine control for unsaved widget drafts', async () => {
    mockHomeState.mockReturnValue({
      activePageId: 'home-page',
      pages: [{
        id: 'home-page',
        name: 'Home',
        layouts: {},
        widgetConfigs: {},
      }],
    })
    mockApiPost.mockResolvedValueOnce({ reply: 'Here is the UI.\n```openui\ncard title "Hello"\n```' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'make a dashboard card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    expect(await screen.findByText(/Unsaved UI preview/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    expect(screen.getByLabelText('Assistant message')).toHaveValue('Refine this preview: ')
  })

  it('previews selected UI style actions without queuing them', async () => {
    mockApiPost.mockResolvedValueOnce({
      reply: 'Previewing the style.\n```json\n{"actions":[{"type":"ui.style_override","summary":"Make target tighter","payload":{"selector":"[data-testid=\\"target\\"]","styles":{"padding":"6px","border-radius":"8px"}}}]}\n```',
    })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'make this smaller' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(previewUiStyleRule).toHaveBeenCalledWith(expect.objectContaining({
        selector: '[data-testid="target"]',
        styles: expect.objectContaining({ padding: '6px' }),
      }))
    })
    expect(await screen.findByText(/Unsaved UI preview/i)).toBeInTheDocument()
    expect(screen.queryByText(/Queued app actions/i)).not.toBeInTheDocument()
  })

  it('captures selected UI target context and sends it to OpenUI', async () => {
    mockApiPost.mockResolvedValueOnce({ reply: 'Updated.' })
    render(
      <MemoryRouter initialEntries={['/todos']}>
        <div>
          <button data-testid="target" aria-label="Focus panel" style={{ padding: 12 }}>
            Focus panel
          </button>
          <GlobalAssistantLauncher collapsed={true} />
        </div>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.click(screen.getByRole('button', { name: 'Select UI element' }))
    fireEvent.click(screen.getByTestId('target'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'make this tighter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/openui', expect.objectContaining({
        text: expect.stringContaining('"selectedTarget"'),
      }))
    })
    const request = mockApiPost.mock.calls.find(call => call[0] === '/api/chat/openui')?.[1] as { text: string }
    expect(request.text).toContain('data-testid')
    expect(request.text).toContain('target')
    expect(request.text).toContain('"computedStyle"')
    expect(request.text).toContain('"attributes"')
  })

  it('grounds builder requests in the active module and visible page data', async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions') return { sessions: [] }
      if (path === '/api/calendar') {
        return {
          source: 'local-macos-calendar',
          events: [{
            title: 'Dominos interview',
            start: '2026-05-16T19:00:00Z',
            end: '2026-05-16T19:30:00Z',
            calendar: 'Interviews',
          }],
        }
      }
      if (path === '/api/todos') return { todos: [] }
      if (path === '/api/reminders') return { reminders: [] }
      if (path === '/api/missions') return { missions: [] }
      if (path.startsWith('/api/email')) return { emails: [] }
      if (path.startsWith('/api/messages')) return { conversations: [] }
      return { messages: [] }
    })
    mockApiPost.mockResolvedValueOnce({ reply: 'Grounded preview.' })
    render(
      <MemoryRouter initialEntries={['/calendar']}>
        <main id="main-content">
          <h1>Calendar</h1>
          <section>
            <h2>Today</h2>
            <p>3:00 PM Dominos interview</p>
          </section>
          <GlobalAssistantLauncher collapsed={true} />
        </main>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), {
      target: { value: 'make an upcoming interviews card using my actual appointments' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/openui', expect.objectContaining({
        text: expect.stringContaining('Dominos interview'),
      }))
    })
    const request = mockApiPost.mock.calls.find(call => call[0] === '/api/chat/openui')?.[1] as { text: string }
    expect(request.text).toContain('"activeModule":"calendar"')
    expect(request.text).toContain('3:00 PM')
    expect(request.text).toContain('"liveAppContext"')
    expect(request.text).toContain('calendar: loaded; source=local-macos-calendar')
    expect(request.text).toContain('Never invent names')
  })

  it('imports screenshots dropped anywhere in the sidebar and sends selected target context', async () => {
    class FileReaderMock {
      onload: ((event: { target: { result: string } }) => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        this.onload?.({ target: { result: 'data:image/png;base64,sidebar-shot' } })
      }
    }
    vi.stubGlobal('FileReader', FileReaderMock)
    mockApiPost.mockResolvedValueOnce({ reply: 'Updated from screenshot.' })

    render(
      <MemoryRouter initialEntries={['/todos']}>
        <div>
          <button data-testid="target" aria-label="Focus panel" style={{ padding: 12 }}>
            Focus panel
          </button>
          <GlobalAssistantLauncher collapsed={true} />
        </div>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.click(screen.getByRole('button', { name: 'Select UI element' }))
    fireEvent.click(screen.getByTestId('target'))

    const file = new File(['fake-image'], 'screenshot.png', { type: 'image/png' })
    const sidebarDropzone = screen.getByTestId('assistant-sidebar-dropzone')
    fireEvent.dragEnter(sidebarDropzone, {
      dataTransfer: {
        items: [{ kind: 'file', type: 'image/png' }],
        files: [file],
        dropEffect: 'copy',
      },
    })
    expect(screen.getByText('Drop screenshot here')).toBeInTheDocument()

    fireEvent.drop(sidebarDropzone, {
      dataTransfer: {
        items: [{ kind: 'file', type: 'image/png' }],
        files: [file],
        dropEffect: 'copy',
      },
    })

    expect(await screen.findByAltText('Attached preview')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'use this screenshot and selection' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/openui', expect.objectContaining({
        images: ['data:image/png;base64,sidebar-shot'],
        text: expect.stringContaining('"selectedTarget"'),
      }))
    })
  })

  it('imports native Tauri screenshot drops into the sidebar assistant', async () => {
    mockApiPost.mockResolvedValueOnce({ reply: 'Updated from native drop.' })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))

    await waitFor(() => {
      expect(mockTauriDragDrop.handler).toBeTypeOf('function')
    })

    mockTauriDragDrop.handler?.({
      payload: {
        type: 'drop',
        paths: ['/Users/josue/Desktop/Screenshot 2026-05-16 at 4.00.24 PM.png'],
      },
    })

    expect(await screen.findByAltText('Attached preview')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'use this screenshot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('read_dropped_image_data_url', {
        path: '/Users/josue/Desktop/Screenshot 2026-05-16 at 4.00.24 PM.png',
      })
      expect(mockApiPost).toHaveBeenCalledWith('/api/chat/openui', expect.objectContaining({
        imagePaths: ['/Users/josue/Desktop/Screenshot 2026-05-16 at 4.00.24 PM.png'],
      }))
    })
  })

  it('previews sidebar actions as unsaved drafts without queueing them', async () => {
    mockApiPost.mockResolvedValueOnce({
      reply: 'Previewing sidebar.\n```json\n{"actions":[{"type":"sidebar.rename_item","summary":"Rename Todos","target":"/todos","payload":{"href":"/todos","name":"Focus"}}]}\n```',
    })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'rename todos in the sidebar to Focus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(startSidebarConfigDraft).toHaveBeenCalled()
      expect(renameItem).toHaveBeenCalledWith('/todos', 'Focus')
    })
    expect(await screen.findByText(/Unsaved UI preview/i)).toBeInTheDocument()
    expect(screen.queryByText(/Queued app actions/i)).not.toBeInTheDocument()
  })

  it('previews theme actions as unsaved drafts without queueing them', async () => {
    mockApiPost.mockResolvedValueOnce({
      reply: 'Previewing theme.\n```json\n{"actions":[{"type":"theme.set_page_override","summary":"Set page theme","target":"/todos","payload":{"route":"/todos","themeId":"dracula"}}]}\n```',
    })
    renderLauncher()

    fireEvent.click(screen.getByTestId('global-ai-chat-launcher'))
    fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'set this page theme to dracula' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send assistant message' }))

    await waitFor(() => {
      expect(startThemeDraft).toHaveBeenCalled()
      expect(setPageOverride).toHaveBeenCalledWith('/todos', 'dracula')
    })
    expect(await screen.findByText(/Unsaved UI preview/i)).toBeInTheDocument()
    expect(screen.queryByText(/Queued app actions/i)).not.toBeInTheDocument()
  })
})
