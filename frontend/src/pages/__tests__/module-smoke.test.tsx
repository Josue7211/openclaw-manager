/**
 * Smoke test: verifies every sidebar module in APP_MODULES can be dynamically
 * imported and rendered without triggering an error boundary.
 *
 * Purpose: catch broken imports, missing dependencies, or render crashes
 * introduced by dead code removal in phases 58-68.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { Suspense } from 'react'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/ui/Toast'
import { APP_MODULES } from '@/lib/modules'

/* ─── Mocks ──────────────────────────────────────────────────────────────── */

// api module — most pages use api.get/post
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn((path?: string) => {
      if (path === '/api/homelab') {
        return Promise.resolve({
          proxmox: { nodes: [], vms: [], source: 'api' },
          opnsense: {
            status: 'offline',
            cpu: 0,
            mem_used: 0,
            mem_total: 1,
            uptime: 0,
            wan_in: '0 B/s',
            wan_out: '0 B/s',
            source: 'api',
          },
          live: { proxmox: false, opnsense: false },
          mock: false,
        })
      }
      return Promise.resolve({})
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
    del: vi.fn(() => Promise.resolve({})),
  },
  API_BASE: 'http://127.0.0.1:5000',
  API_BASE_CHANGED_EVENT: 'backend-api-base-changed',
  CONFIGURED_BACKEND_BASE_CHANGED_EVENT: 'configured-backend-base-changed',
  ApiError: class ApiError extends Error {
    status: number
    constructor(msg: string, status = 500) {
      super(msg)
      this.status = status
    }
  },
  setApiKey: vi.fn(),
  setApiBase: vi.fn(),
  setConfiguredBackendBase: vi.fn(),
  getApiKey: vi.fn(() => undefined),
  getLocalApiKey: vi.fn(() => undefined),
  getConfiguredBackendBase: vi.fn(() => 'http://127.0.0.1:5000'),
}))

// Supabase client
vi.mock('@/lib/supabase/client', () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            then: (fn: (v: unknown) => unknown) => fn({ data: [], error: null }),
          })),
          order: vi.fn(() => ({
            then: (fn: (v: unknown) => unknown) => fn({ data: [], error: null }),
          })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          then: (fn: (v: unknown) => unknown) => fn({ data: [], error: null }),
        })),
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
        delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
        upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

// Tauri APIs — not available in test/browser environment
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    listen: vi.fn(() => Promise.resolve(() => {})),
    onFocusChanged: vi.fn(() => Promise.resolve(() => {})),
    onThemeChanged: vi.fn(() => Promise.resolve(() => {})),
    theme: vi.fn(() => Promise.resolve('dark')),
    setDecorations: vi.fn(() => Promise.resolve()),
  })),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}))

// Demo data — use importOriginal to preserve all exports (DEMO_TODOS, DEMO_OPNSENSE, etc.)
vi.mock('@/lib/demo-data', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/demo-data')>()
  return {
    ...actual,
    isDemoMode: vi.fn(() => false),
  }
})

// Chat socket
vi.mock('@/lib/hooks/useChatSocket', () => ({
  useChatSocket: vi.fn(() => ({
    connected: false,
    usingFallback: false,
    messages: [],
    send: vi.fn(),
    reconnect: vi.fn(),
  })),
  setChatSocketApiKey: vi.fn(),
}))

// SSE hooks for messages
vi.mock('@/hooks/messages', () => ({
  useConversationList: vi.fn(() => ({
    conversations: [],
    setConversations: vi.fn(),
    contactLookup: {},
    setContactLookup: vi.fn(),
    loading: false,
    error: null,
    setError: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    serviceFilter: 'all',
    setServiceFilter: vi.fn(),
    showJunk: false,
    setShowJunk: vi.fn(),
    loadingMoreConvs: false,
    convListRef: { current: null },
    filteredConversations: [],
    fetchConversations: vi.fn(),
    handleConvListScroll: vi.fn(),
    mutedConvs: new Set(),
    setMutedConvs: vi.fn(),
    pinnedConvs: new Set(),
    setPinnedConvs: vi.fn(),
  })),
  useMessageCompose: vi.fn(() => ({
    sending: false,
    send: vi.fn(),
  })),
  useMessagesSSE: vi.fn(() => ({
    messages: [],
    loading: false,
  })),
  cleanPayloadText: vi.fn((t: string) => t),
}))

// Agents hook
vi.mock('@/hooks/useAgents', () => ({
  useAgents: vi.fn(() => ({
    agents: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    startAgent: vi.fn(),
    stopAgent: vi.fn(),
    restartAgent: vi.fn(),
    createAgent: vi.fn(),
    deleteAgent: vi.fn(),
    updateAgent: vi.fn(),
  })),
}))

// Crons hook
vi.mock('@/hooks/useCrons', () => ({
  useCrons: vi.fn(() => ({
    crons: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    createCron: vi.fn(),
    updateCron: vi.fn(),
    deleteCron: vi.fn(),
    toggleCron: vi.fn(),
  })),
}))

// Error reporter
vi.mock('@/lib/error-reporter', () => ({
  reportError: vi.fn(),
}))

// Vault (notes)
vi.mock('@/lib/vault', () => ({
  applyNoteSuggestion: vi.fn(() => Promise.resolve(null)),
  approveVaultCollaborationPairing: vi.fn(() => Promise.resolve(null)),
  createVaultCollaborationHttpTransport: vi.fn(() => ({
    getCrdtState: vi.fn(() => Promise.resolve(null)),
    list: vi.fn(() => Promise.resolve([])),
    publish: vi.fn(() => Promise.resolve(null)),
    saveCrdtState: vi.fn(() => Promise.resolve(null)),
  })),
  createNoteComment: vi.fn(() => Promise.resolve(null)),
  createNoteCommentReply: vi.fn(() => Promise.resolve(null)),
  createNoteSuggestion: vi.fn(() => Promise.resolve(null)),
  createNoteVersionCheckpoint: vi.fn(() => Promise.resolve(null)),
  discardLocalDraft: vi.fn(),
  exportEncryptedVault: vi.fn(() => Promise.resolve({ path: '/tmp/vault.zip' })),
  getNoteComments: vi.fn(() => Promise.resolve([])),
  getNoteRevision: vi.fn(() => Promise.resolve(null)),
  getNoteRevisions: vi.fn(() => Promise.resolve([])),
  getNoteSuggestions: vi.fn(() => Promise.resolve([])),
  getRecoverableDrafts: vi.fn(() => []),
  getVaultAuditEvents: vi.fn(() => Promise.resolve([])),
  getVaultCollaborationCrdtState: vi.fn(() => Promise.resolve(null)),
  getVaultCollaborationPairings: vi.fn(() => Promise.resolve([])),
  getVaultStatus: vi.fn(() =>
    Promise.resolve({
      canonical_store: 'local_sqlite',
      remote_required: false,
      notes: 0,
      folders: 0,
      attachments: 0,
      revisions: 0,
      comments: 0,
      suggestions: 0,
      last_checkpoint_at: null,
      last_sync_at: null,
    }),
  ),
  getVaultSyncLedger: vi.fn(() =>
    Promise.resolve({
      pending_saves: [],
      sync_states: [],
    }),
  ),
  importEncryptedVault: vi.fn(() => Promise.resolve(null)),
  labelNoteRevision: vi.fn(() => Promise.resolve(null)),
  linkFirstPlainMention: vi.fn((content: string) => content),
  listVaultCollaborationEvents: vi.fn(() => Promise.resolve([])),
  noteIdFromTitle: vi.fn((title: string) => title.toLowerCase().replaceAll(' ', '-')),
  normalizeFolderPath: vi.fn((path: string | null | undefined) => path?.trim() ?? null),
  publishVaultCollaborationEvent: vi.fn(() => Promise.resolve(null)),
  rejectNoteSuggestion: vi.fn(() => Promise.resolve(null)),
  revokeVaultCollaborationPairing: vi.fn(() => Promise.resolve(null)),
  resolveNoteComment: vi.fn(() => Promise.resolve(null)),
  restoreLocalDraft: vi.fn(() => null),
  restoreNoteRevision: vi.fn(() => Promise.resolve(null)),
  rewriteWikilinkPath: vi.fn((content: string) => content),
  rewriteWikilinks: vi.fn((content: string) => content),
  saveVaultCollaborationCrdtState: vi.fn(() => Promise.resolve(null)),
  saveLocalDraft: vi.fn(),
  searchVaultNotes: vi.fn(() => Promise.resolve([])),
  uploadAttachment: vi.fn(() => Promise.resolve(null)),
  vault: {
    listNotes: vi.fn(() => Promise.resolve([])),
    getNote: vi.fn(() => Promise.resolve(null)),
    createNote: vi.fn(() => Promise.resolve(null)),
    updateNote: vi.fn(() => Promise.resolve(null)),
    deleteNote: vi.fn(() => Promise.resolve(null)),
  },
}))

// Notes hook
vi.mock('@/hooks/notes/useVault', () => ({
  useVault: vi.fn(() => ({
    notes: [],
    folders: [],
    loading: false,
    syncing: false,
    error: null,
    refresh: vi.fn(),
    createNote: vi.fn(),
    createFolder: vi.fn(),
    updateNote: vi.fn(),
    moveNote: vi.fn(),
    deleteNote: vi.fn(),
    trashNote: vi.fn(),
    trashFolder: vi.fn(),
    restoreTrashedNote: vi.fn(),
    restoreTrashedFolder: vi.fn(),
    emptyTrash: vi.fn(),
    deleteFolder: vi.fn(),
  })),
}))

// Realtime SSE hook
vi.mock('@/lib/hooks/useRealtimeSSE', () => ({
  useTableRealtime: vi.fn(),
  useRealtimeSSE: vi.fn(),
}))

// Gateway SSE hook (singleton EventSource — not available in jsdom)
vi.mock('@/lib/hooks/useGatewaySSE', () => ({
  useGatewaySSE: vi.fn(),
}))

// Gateway sessions hook (Sessions page)
vi.mock('@/hooks/sessions/useGatewaySessions', () => ({
  useGatewaySessions: vi.fn(() => ({
    sessions: [],
    available: false,
    isLoading: false,
    source: 'none',
  })),
}))

// Session output hook (uses xterm — not available in jsdom)
vi.mock('@/hooks/sessions/useSessionOutput', () => ({
  useSessionOutput: vi.fn(() => ({
    connected: false,
    error: null,
  })),
}))

// Session history hook
vi.mock('@/hooks/sessions/useSessionHistory', () => ({
  useSessionHistory: vi.fn(() => ({
    messages: [],
    isLoading: false,
    error: null,
  })),
}))

// Gateway status hook (used by GatewayStatusDot)
vi.mock('@/hooks/sessions/useGatewayStatus', () => ({
  useGatewayStatus: vi.fn(() => ({
    status: 'disconnected',
    isLoading: false,
  })),
}))

// Approvals hook
vi.mock('@/hooks/useApprovals', () => ({
  useApprovals: vi.fn(() => ({
    approvals: [],
    pendingCount: 0,
    isLoading: false,
    approve: vi.fn(),
    reject: vi.fn(),
    isApproving: false,
    isRejecting: false,
  })),
}))

// Unread store (used by useApprovals)
vi.mock('@/lib/unread-store', () => ({
  setUnreadCount: vi.fn(),
  getUnreadCount: vi.fn(() => 0),
  subscribeUnreadCount: vi.fn(() => () => {}),
}))

// NotificationCenter (addNotification used by SessionsPage)
vi.mock('@/components/NotificationCenter', () => ({
  addNotification: vi.fn(),
  default: () => null,
}))

// Harness models hook (used by ModelSelector in sessions)
vi.mock('@/hooks/useHarnessModels', () => ({
  useHarnessModels: vi.fn(() => ({
    models: [],
    isLoading: false,
    error: null,
  })),
}))

// Dashboard store — use importOriginal to keep all exports, override stateful hooks
vi.mock('@/lib/dashboard-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/dashboard-store')>()
  const defaultPage = { id: 'default', name: 'Main', layouts: {}, order: 0 }
  const defaultState = {
    pages: [defaultPage],
    activePageId: 'default',
    editMode: false,
    wobbleEnabled: true,
    dotIndicatorsEnabled: true,
    recycleBin: [],
    lastModified: new Date().toISOString(),
  }
  return {
    ...actual,
    useDashboardStore: vi.fn(() => defaultState),
    getDashboardState: vi.fn(() => defaultState),
  }
})

// Dashboard defaults
vi.mock('@/lib/dashboard-defaults', () => ({
  generateDefaultLayout: vi.fn(() => []),
}))

vi.mock('@/pages/dashboard/useDashboardData', () => ({
  useDashboardData: vi.fn(() => ({
    _demo: false,
    backendError: false,
    subagentsError: null,
    lastRefreshMs: 0,
    panelIdea: null,
    setPanelIdea: vi.fn(),
    fastTick: vi.fn(),
    slowTick: vi.fn(),
    handleIdeaAction: vi.fn(),
  })),
}))

vi.mock('@/pages/dashboard/DashboardGrid', () => ({
  DashboardGrid: () => <div data-testid="dashboard-grid" />,
}))

vi.mock('@/pages/dashboard/DashboardHeader', () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}))

vi.mock('@/components/dashboard/DashboardEditBar', () => ({
  DashboardEditBar: () => <div data-testid="dashboard-edit-bar" />,
  useLongPress: () => ({}),
}))

vi.mock('@/pages/dashboard/IdeaDetailPanel', () => ({
  IdeaDetailPanel: () => null,
}))

vi.mock('@/components/dashboard/WidgetPicker', () => ({
  WidgetPicker: () => null,
}))

vi.mock('@/components/dashboard/RecycleBin', () => ({
  RecycleBin: () => null,
}))

vi.mock('@/pages/Dashboard', () => ({
  default: () => <div data-testid="dashboard-page" />,
}))

vi.mock('../Dashboard', () => ({
  default: () => <div data-testid="dashboard-page" />,
}))

// Generated module store
vi.mock('@/lib/generated-module-store', () => ({
  exposePrimitivesAPI: vi.fn(),
  loadGeneratedModules: vi.fn(),
  useGeneratedModules: vi.fn(() => []),
  saveGeneratedModule: vi.fn(),
  toggleGeneratedModule: vi.fn(() => Promise.resolve({ module: {} })),
  deleteGeneratedModule: vi.fn(() => Promise.resolve()),
  rollbackGeneratedModule: vi.fn(() => Promise.resolve({ module: {} })),
  getGeneratedModuleVersions: vi.fn(() => Promise.resolve([])),
}))

// Command palette
vi.mock('@/components/CommandPalette', () => ({
  setRecentConversations: vi.fn(),
  default: () => null,
}))

// Preferences sync
vi.mock('@/lib/preferences-sync', () => ({
  CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT: 'clawctrl:chat-workspace-preferences-changed',
  syncPreferences: vi.fn(),
  loadRemotePreferences: vi.fn(() => Promise.resolve()),
}))

// Page title hook
vi.mock('@/lib/hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(() => ''),
}))

// Read overrides for messages
vi.mock('@/hooks/messages/readOverrides', () => ({
  getReadOverrides: vi.fn(() => ({})),
  setReadOverride: vi.fn(),
  clearReadOverride: vi.fn(),
}))

// Widget registry
vi.mock('@/lib/widget-registry', () => ({
  widgetRegistry: {
    getAll: vi.fn(() => []),
    get: vi.fn(() => null),
    register: vi.fn(),
    getByCategory: vi.fn(() => []),
    getCategories: vi.fn(() => []),
  },
}))

// Stub fetch globally for any components that use raw fetch
vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    }),
  ),
)

// Stub jsdom-missing APIs
// scrollIntoView is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn()
Element.prototype.scrollTo = vi.fn()

// ResizeObserver is not available in jsdom
vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

/* ─── Route-to-import mapping (mirrors main.tsx) ──────────────────────── */

const MODULE_PAGE_MAP: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  '/messages': () => import('../Messages'),
  '/chat': () => import('../Chat'),
  '/todos': () => import('../Todos'),
  '/calendar': () => import('../Calendar'),
  '/reminders': () => import('../Reminders'),
  '/email': () => import('../Email'),
  '/jobs': () => import('../JobHunter'),
  '/growth-ops': () => import('../GrowthOps'),
  '/training': () => import('../Training'),
  '/training/clients': () => import('../Training'),
  '/training/calendar': () => import('../Training'),
  '/training/forms': () => import('../Training'),
  '/pomodoro': () => import('../Pomodoro'),
  '/homelab': () => import('../homelab/HomeLabOverview'),
  '/homelab/proxmox': () => import('../homelab/ProxmoxModule'),
  '/homelab/portainer': () => import('../homelab/PortainerModule'),
  '/homelab/network': () => import('../homelab/NetworkModule'),
  '/homelab/storage': () => import('../homelab/StorageBackupsModule'),
  '/homelab/power': () => import('../homelab/PowerHardwareModule'),
  '/homelab/services': () => import('../homelab/ServicesModule'),
  '/homelab/activity': () => import('../homelab/ActivitySettingsModule'),
  '/media': () => import('../MediaRadar'),
  '/dashboard': () => import('../Dashboard'),
  '/missions': () => import('../Missions'),
  '/harness': () => import('../Harness'),
  '/memory': () => import('../Memory'),
  '/pipeline': () => import('../Pipeline'),
  '/knowledge': () => import('../KnowledgeBase'),
  '/notes': () => import('../notes/Notes'),
  '/sessions': () => import('../sessions/SessionsPage'),
  '/remote': () => import('../remote/RemotePage'),
  '/approvals': () => import('../approvals/ApprovalsPage'),
  '/activity': () => import('../activity/ActivityPage'),
}

/* ─── Test wrapper ────────────────────────────────────────────────────── */

function TestWrapper({ children, route }: { children: React.ReactNode; route: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <ErrorBoundary>
            <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
          </ErrorBoundary>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

/* ─── Tests ───────────────────────────────────────────────────────────── */

// Suppress console.error/warn noise from React error boundaries during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Sidebar module smoke tests', () => {
  it('APP_MODULES has at least 16 modules', () => {
    expect(APP_MODULES.length).toBeGreaterThanOrEqual(16)
  })

  it('every module has a page import mapping', () => {
    const mappedRoutes = Object.keys(MODULE_PAGE_MAP)
    for (const mod of APP_MODULES) {
      expect(mappedRoutes, `Module "${mod.id}" (route: ${mod.route}) has no entry in MODULE_PAGE_MAP`).toContain(
        mod.route,
      )
    }
  })

  describe.each(APP_MODULES.map(m => [m.id, m.route]))('module "%s"', (_id, route) => {
    it('page resolves without import error', async () => {
      const importFn = MODULE_PAGE_MAP[route]
      expect(importFn, `No import mapping for route ${route}`).toBeDefined()

      const mod = await importFn()
      expect(mod).toBeDefined()
      expect(mod.default).toBeDefined()
      expect(typeof mod.default).toBe('function')
    })

    it('renders without error boundary', async () => {
      const importFn = MODULE_PAGE_MAP[route]
      const mod = await importFn()
      const Page = mod.default

      await act(async () => {
        render(
          <TestWrapper route={route}>
            <Page />
          </TestWrapper>,
        )
      })

      // ErrorBoundary shows "Something went wrong"
      // PageErrorBoundary shows "This page crashed"
      const boundary = screen.queryByText('Something went wrong')?.parentElement
      if (boundary) {
        throw new Error(boundary.textContent || 'Module rendered ErrorBoundary')
      }
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      expect(screen.queryByText('This page crashed')).not.toBeInTheDocument()
    })
  })
})
