import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// vi.hoisted runs before vi.mock hoisting
const { mockGet, stableSubscribe, stableSidebarConfig, stableEnabledModules } = vi.hoisted(() => {
  const _noop = () => {}
  const _sidebarConfig = { categories: [], customNames: {}, deletedItems: [], panelTitles: {} }
  const _enabledModules: string[] = []
  return {
    mockGet: vi.fn(),
    stableSubscribe: () => _noop,
    stableSidebarConfig: _sidebarConfig,
    stableEnabledModules: _enabledModules,
  }
})

// Mock api module
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('@/lib/module-proposal-store', () => ({
  listModuleProposals: vi.fn(() => Promise.resolve([])),
}))

// Mock generated-module-store
vi.mock('@/lib/generated-module-store', () => ({
  toggleGeneratedModule: vi.fn(() => Promise.resolve({ module: {} })),
  deleteGeneratedModule: vi.fn(() => Promise.resolve()),
  rollbackGeneratedModule: vi.fn(() => Promise.resolve({ module: {} })),
  getGeneratedModuleVersions: vi.fn(() => Promise.resolve([])),
}))

// Mock sidebar-config (needed by SettingsModules)
vi.mock('@/lib/sidebar-config', () => ({
  getSidebarConfig: () => stableSidebarConfig,
  setSidebarConfig: vi.fn(),
  resetSidebarConfig: vi.fn(),
  subscribeSidebarConfig: stableSubscribe,
  renameItem: vi.fn(),
  renameCategory: vi.fn(),
  moveItem: vi.fn(),
  createCustomModule: vi.fn(),
  deleteCustomModule: vi.fn(),
  softDeleteItem: vi.fn(),
  restoreItem: vi.fn(),
  permanentlyDelete: vi.fn(),
  emptyRecycleBin: vi.fn(),
}))

// Mock modules
vi.mock('@/lib/modules', () => ({
  APP_MODULES: [],
  getEnabledModules: () => stableEnabledModules,
  setEnabledModules: vi.fn(),
  subscribeModules: stableSubscribe,
}))

// Mock nav-items
vi.mock('@/lib/nav-items', () => ({
  navItemsByHref: new Map(),
}))

// Mock sidebar-settings
vi.mock('@/lib/sidebar-settings', () => ({
  getSidebarHeaderVisible: () => true,
  setSidebarHeaderVisible: vi.fn(),
  getSidebarDefaultWidth: () => 260,
  setSidebarDefaultWidth: vi.fn(),
  getSidebarTitleLayout: () => 'left',
  setSidebarTitleLayout: vi.fn(),
  getSidebarTitleText: () => 'ClawControl',
  setSidebarTitleText: vi.fn(),
  getSidebarSearchVisible: () => true,
  setSidebarSearchVisible: vi.fn(),
  getSidebarLogoVisible: () => true,
  setSidebarLogoVisible: vi.fn(),
  getSidebarTitleSize: () => 'md',
  setSidebarTitleSize: vi.fn(),
  subscribeSidebarSettings: stableSubscribe,
}))

// Mock titlebar-settings
vi.mock('@/lib/titlebar-settings', () => ({
  getTitleBarVisible: () => true,
  setTitleBarVisible: vi.fn(),
  getTitleBarAutoHide: () => false,
  setTitleBarAutoHide: vi.fn(),
  subscribeTitleBarSettings: stableSubscribe,
}))

// Mock ResizablePanel
vi.mock('@/components/ResizablePanel', () => ({
  ResizablePanel: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid={`panel-${title}`}>{title}{children}</div>
  ),
}))

// Mock ContextMenu
vi.mock('@/components/ContextMenu', () => ({
  ContextMenu: () => null,
}))

import SettingsModules from '../SettingsModules'
import { listModuleProposals } from '@/lib/module-proposal-store'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

const mockModule = {
  id: 'test-1',
  userId: 'user-1',
  name: 'Weather Widget',
  description: 'Shows current weather conditions',
  icon: 'CloudSun',
  source: 'function GeneratedWidget() { return null }',
  configSchema: { fields: [] },
  defaultSize: { w: 3, h: 2 },
  version: 2,
  enabled: true,
  createdAt: '2026-03-20T00:00:00Z',
  updatedAt: '2026-03-20T00:00:00Z',
  deletedAt: null,
}

describe('GeneratedModulesSection in SettingsModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Generated Modules" section header', async () => {
    mockGet.mockResolvedValue({ modules: [mockModule] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Generated Modules')).toBeInTheDocument()
    })
  })

  it('renders module card with name and version badge', async () => {
    mockGet.mockResolvedValue({ modules: [mockModule] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Weather Widget')).toBeInTheDocument()
    })
    expect(screen.getByText('v2')).toBeInTheDocument()
  })

  it('renders enable/disable toggle for module', async () => {
    mockGet.mockResolvedValue({ modules: [mockModule] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByLabelText('Toggle Weather Widget')).toBeInTheDocument()
    })
    const toggle = screen.getByLabelText('Toggle Weather Widget')
    expect(toggle).toHaveAttribute('role', 'switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('hides generated modules section when no modules exist', async () => {
    mockGet.mockResolvedValue({ modules: [] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    // Component returns null when modules array is empty, so section should not appear
    await waitFor(() => {
      expect(screen.queryByText('Generated Modules')).not.toBeInTheDocument()
    })
  })

  it('renders delete button with trash icon', async () => {
    mockGet.mockResolvedValue({ modules: [mockModule] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByLabelText('Delete module')).toBeInTheDocument()
    })
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('renders history button', async () => {
    mockGet.mockResolvedValue({ modules: [mockModule] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByLabelText('Version history')).toBeInTheDocument()
    })
    expect(screen.getByText('History')).toBeInTheDocument()
  })

  it('renders module description', async () => {
    mockGet.mockResolvedValue({ modules: [mockModule] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Shows current weather conditions')).toBeInTheDocument()
    })
  })

  it('filters out soft-deleted modules', async () => {
    const deletedModule = { ...mockModule, id: 'del-1', name: 'Deleted Module', deletedAt: '2026-03-20T01:00:00Z' }
    mockGet.mockResolvedValue({ modules: [mockModule, deletedModule] })
    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Weather Widget')).toBeInTheDocument()
    })
    expect(screen.queryByText('Deleted Module')).not.toBeInTheDocument()
  })
})

describe('ModuleProposalsSection in SettingsModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Module Proposals" section header when proposals exist', async () => {
    mockGet.mockResolvedValue({ modules: [] })
    vi.mocked(listModuleProposals).mockResolvedValue([
      {
        id: 'proposal-1',
        userId: 'user-1',
        title: 'Mission Snapshot',
        description: 'Compact mission summary widget.',
        userIntent: 'Show today mission health.',
        targetType: 'widget',
        installTarget: 'dashboard',
        category: 'missions',
        status: 'draft',
        proposal: {
          id: 'proposal-1',
          version: 1,
          title: 'Mission Snapshot',
          description: 'Compact mission summary widget.',
          userIntent: 'Show today mission health.',
          targetType: 'widget',
          installTarget: 'dashboard',
          category: 'missions',
          capabilities: ['read.missions'],
          dataRequirements: [],
          actions: [],
          layout: { w: 3, h: 2 },
          tree: { primitive: 'StatCard', props: {} },
          createdAt: '2026-04-10T00:00:00Z',
        },
        createdAt: '2026-04-10T00:00:00Z',
        updatedAt: '2026-04-10T00:00:00Z',
      },
    ])

    render(<SettingsModules />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Module Proposals')).toBeInTheDocument()
      expect(screen.getByText('Mission Snapshot')).toBeInTheDocument()
      expect(screen.getByText('draft')).toBeInTheDocument()
    })
  })
})
