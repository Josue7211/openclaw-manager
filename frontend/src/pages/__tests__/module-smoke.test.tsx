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
import { APP_MODULES } from '@/lib/modules'

/* ─── Mocks ──────────────────────────────────────────────────────────────── */

// api module — most pages use api.get/post
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({})),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
    del: vi.fn(() => Promise.resolve({})),
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(msg: string, status = 500) {
      super(msg)
      this.status = status
    }
  },
  setApiKey: vi.fn(),
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
vi.mock('@/lib/demo-data', async (importOriginal) => {
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
    loading: false,
    error: null,
    refresh: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  })),
}))

// Realtime SSE hook
vi.mock('@/lib/hooks/useRealtimeSSE', () => ({
  useTableRealtime: vi.fn(),
  useRealtimeSSE: vi.fn(),
}))

// Dashboard store — use importOriginal to keep all exports, override stateful hooks
vi.mock('@/lib/dashboard-store', async (importOriginal) => {
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

// Bjorn store
vi.mock('@/lib/bjorn-store', () => ({
  exposePrimitivesAPI: vi.fn(),
  loadBjornModules: vi.fn(),
  useBjornModules: vi.fn(() => []),
}))

// Command palette
vi.mock('@/components/CommandPalette', () => ({
  setRecentConversations: vi.fn(),
  default: () => null,
}))

// Preferences sync
vi.mock('@/lib/preferences-sync', () => ({
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
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve(''),
})))

// Stub jsdom-missing APIs
// scrollIntoView is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn()

// ResizeObserver is not available in jsdom
vi.stubGlobal('ResizeObserver', class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
})

/* ─── Route-to-import mapping (mirrors main.tsx) ──────────────────────── */

const MODULE_PAGE_MAP: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  '/messages': () => import('../Messages'),
  '/chat': () => import('../Chat'),
  '/todos': () => import('../Todos'),
  '/calendar': () => import('../Calendar'),
  '/reminders': () => import('../Reminders'),
  '/email': () => import('../Email'),
  '/pomodoro': () => import('../Pomodoro'),
  '/homelab': () => import('../HomeLab'),
  '/media': () => import('../MediaRadar'),
  '/dashboard': () => import('../Dashboard'),
  '/missions': () => import('../Missions'),
  '/openclaw': () => import('../OpenClaw'),
  '/memory': () => import('../Memory'),
  '/pipeline': () => import('../Pipeline'),
  '/knowledge': () => import('../KnowledgeBase'),
  '/notes': () => import('../notes/Notes'),
}

/* ─── Test wrapper ────────────────────────────────────────────────────── */

function TestWrapper({ children, route }: { children: React.ReactNode; route: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <ErrorBoundary>
          <Suspense fallback={<div>Loading...</div>}>
            {children}
          </Suspense>
        </ErrorBoundary>
      </MemoryRouter>
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
      expect(
        mappedRoutes,
        `Module "${mod.id}" (route: ${mod.route}) has no entry in MODULE_PAGE_MAP`,
      ).toContain(mod.route)
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
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      expect(screen.queryByText('This page crashed')).not.toBeInTheDocument()
    })
  })
})
