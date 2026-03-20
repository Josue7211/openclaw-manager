import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before the dynamic import
// ---------------------------------------------------------------------------

// Mock DashboardGrid
vi.mock('../DashboardGrid', () => ({
  DashboardGrid: ({ pageId, editMode, wobbleEnabled }: {
    pageId: string; editMode: boolean; wobbleEnabled: boolean
  }) => (
    <div data-testid="dashboard-grid" data-page-id={pageId} data-edit={String(editMode)} data-wobble={String(wobbleEnabled)}>
      Grid
    </div>
  ),
}))

// Mock DashboardEditBar
vi.mock('@/components/dashboard/DashboardEditBar', () => ({
  DashboardEditBar: ({ editMode, onOpenPicker }: {
    editMode: boolean; onOpenPicker: () => void
  }) => (
    <div data-testid="dashboard-edit-bar" data-edit={String(editMode)}>
      <button data-testid="open-picker-btn" onClick={onOpenPicker}>Add Widget</button>
    </div>
  ),
  useLongPress: () => ({}),
}))

// Mock DashboardTabs
vi.mock('@/components/dashboard/DashboardTabs', () => ({
  DashboardTabs: ({ pages, activePageId, editMode, dotIndicatorsEnabled }: {
    pages: Array<{ id: string; name: string }>; activePageId: string;
    editMode: boolean; dotIndicatorsEnabled: boolean
  }) => (
    <div data-testid="dashboard-tabs" data-active={activePageId} data-edit={String(editMode)} data-dots={String(dotIndicatorsEnabled)}>
      {pages.map(p => <span key={p.id}>{p.name}</span>)}
    </div>
  ),
}))

// Mock DashboardHeader
vi.mock('../DashboardHeader', () => ({
  DashboardHeader: () => <div data-testid="dashboard-header">Header</div>,
}))

// Mock WidgetPicker (lazy-loaded)
vi.mock('@/components/dashboard/WidgetPicker', () => ({
  WidgetPicker: ({ open, onClose, pageId, placedWidgetIds }: {
    open: boolean; onClose: () => void; pageId: string; placedWidgetIds: string[]
  }) => {
    if (!open) return null
    return (
      <div data-testid="widget-picker" data-page-id={pageId}>
        <span data-testid="placed-count">{placedWidgetIds.length}</span>
        <button data-testid="close-picker-btn" onClick={onClose}>Close</button>
      </div>
    )
  },
}))

// Mock RecycleBin (lazy-loaded)
vi.mock('@/components/dashboard/RecycleBin', () => ({
  RecycleBin: ({ items, visible }: {
    items: unknown[]; visible: boolean
  }) => {
    if (!visible) return null
    return (
      <div data-testid="recycle-bin">
        <span data-testid="recycle-count">{items.length}</span>
      </div>
    )
  },
}))

// Mock IdeaDetailPanel
vi.mock('../IdeaDetailPanel', () => ({
  IdeaDetailPanel: ({ onClose }: { idea: unknown; onClose: () => void; onIdeaAction: unknown }) => (
    <div data-testid="idea-panel">
      <button data-testid="close-idea" onClick={onClose}>Close</button>
    </div>
  ),
}))

// Mock BackendErrorBanner
vi.mock('@/components/BackendErrorBanner', () => ({
  BackendErrorBanner: ({ label }: { label: string }) => (
    <div data-testid="backend-error" data-label={label}>Error: {label}</div>
  ),
}))

// Mock modules
vi.mock('@/lib/modules', () => ({
  getEnabledModules: () => ['dashboard', 'agents', 'missions'],
}))

// Mock dashboard defaults
const mockGenerateDefaultLayout = vi.fn(() => ({
  widgets: ['agent-status', 'heartbeat'],
  layouts: {
    lg: [
      { i: 'agent-status', x: 0, y: 0, w: 4, h: 2 },
      { i: 'heartbeat', x: 4, y: 0, w: 4, h: 2 },
    ],
  },
}))

vi.mock('@/lib/dashboard-defaults', () => ({
  generateDefaultLayout: (...args: unknown[]) => mockGenerateDefaultLayout(...args),
}))

// Mutable dashboard state
let mockDashState = {
  pages: [{
    id: 'home',
    name: 'Home',
    sortOrder: 0,
    layouts: {
      lg: [
        { i: 'agent-status', x: 0, y: 0, w: 4, h: 2 },
        { i: 'heartbeat', x: 4, y: 0, w: 4, h: 2 },
      ],
    },
    widgetConfigs: {},
  }],
  activePageId: 'home',
  editMode: false,
  wobbleEnabled: true,
  dotIndicatorsEnabled: false,
  recycleBin: [],
  lastModified: '2026-03-20T00:00:00Z',
}

const mockSetDashboardState = vi.fn()

vi.mock('@/lib/dashboard-store', () => ({
  useDashboardStore: () => mockDashState,
  getDashboardState: () => mockDashState,
  setDashboardState: (...args: unknown[]) => mockSetDashboardState(...args),
  setEditMode: vi.fn(),
  removeWidget: vi.fn(),
  updatePageLayouts: vi.fn(),
}))

// Mock useDashboardData
const mockDashboardData = {
  _demo: false,
  mounted: true,
  backendError: null as string | null,
  status: null,
  heartbeat: null,
  sessions: [],
  subagents: null,
  agentsData: null,
  activeSubagents: [],
  subagentsError: false,
  missions: [],
  memory: [],
  pendingIdeas: [],
  lastRefreshMs: Date.now(),
  panelIdea: null as null | { id: string },
  setPanelIdea: vi.fn(),
  sortedAgents: [],
  fastTick: vi.fn(),
  slowTick: vi.fn(),
  handleIdeaAction: vi.fn(),
  updateMissionStatus: vi.fn(),
  deleteMission: vi.fn(),
}

vi.mock('../useDashboardData', () => ({
  useDashboardData: () => mockDashboardData,
}))

// Suppress console noise
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGenerateDefaultLayout.mockClear()
  mockSetDashboardState.mockClear()
  mockDashboardData.backendError = null
  mockDashboardData.panelIdea = null
})

afterEach(() => {
  vi.restoreAllMocks()
  // Reset mutable state
  mockDashState = {
    pages: [{
      id: 'home',
      name: 'Home',
      sortOrder: 0,
      layouts: {
        lg: [
          { i: 'agent-status', x: 0, y: 0, w: 4, h: 2 },
          { i: 'heartbeat', x: 4, y: 0, w: 4, h: 2 },
        ],
      },
      widgetConfigs: {},
    }],
    activePageId: 'home',
    editMode: false,
    wobbleEnabled: true,
    dotIndicatorsEnabled: false,
    recycleBin: [],
    lastModified: '2026-03-20T00:00:00Z',
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard Integration', () => {
  let Dashboard: React.ComponentType

  beforeEach(async () => {
    const mod = await import('../../Dashboard')
    Dashboard = mod.default
  })

  it('renders all sub-components: header, edit bar, tabs, grid', async () => {
    await act(async () => {
      render(<Dashboard />)
    })

    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-edit-bar')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-grid')).toBeInTheDocument()
  })

  it('passes correct page props to DashboardGrid', async () => {
    await act(async () => {
      render(<Dashboard />)
    })

    const grid = screen.getByTestId('dashboard-grid')
    expect(grid.dataset.pageId).toBe('home')
    expect(grid.dataset.edit).toBe('false')
    expect(grid.dataset.wobble).toBe('true')
  })

  it('passes dashboard state props to DashboardTabs', async () => {
    await act(async () => {
      render(<Dashboard />)
    })

    const tabs = screen.getByTestId('dashboard-tabs')
    expect(tabs.dataset.active).toBe('home')
    expect(tabs.dataset.edit).toBe('false')
    expect(tabs.dataset.dots).toBe('false')
  })

  it('shows BackendErrorBanner when backendError exists', async () => {
    mockDashboardData.backendError = 'Connection failed'

    await act(async () => {
      render(<Dashboard />)
    })

    expect(screen.getByTestId('backend-error')).toBeInTheDocument()
    expect(screen.getByTestId('backend-error').dataset.label).toBe('Connection failed')
  })

  it('does not show BackendErrorBanner when no error', async () => {
    await act(async () => {
      render(<Dashboard />)
    })

    expect(screen.queryByTestId('backend-error')).not.toBeInTheDocument()
  })

  it('opens WidgetPicker when edit bar "Add Widget" button is clicked', async () => {
    mockDashState = { ...mockDashState, editMode: true }

    await act(async () => {
      render(<Dashboard />)
    })

    // Picker should NOT be visible initially
    expect(screen.queryByTestId('widget-picker')).not.toBeInTheDocument()

    // Click the add widget button
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-picker-btn'))
    })

    // Picker should now be visible
    await waitFor(() => {
      expect(screen.getByTestId('widget-picker')).toBeInTheDocument()
    })
  })

  it('closes WidgetPicker when close button is clicked', async () => {
    mockDashState = { ...mockDashState, editMode: true }

    await act(async () => {
      render(<Dashboard />)
    })

    // Open picker
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-picker-btn'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('widget-picker')).toBeInTheDocument()
    })

    // Close picker
    await act(async () => {
      fireEvent.click(screen.getByTestId('close-picker-btn'))
    })

    await waitFor(() => {
      expect(screen.queryByTestId('widget-picker')).not.toBeInTheDocument()
    })
  })

  it('shows RecycleBin when editMode is true', async () => {
    mockDashState = { ...mockDashState, editMode: true }

    await act(async () => {
      render(<Dashboard />)
    })

    await waitFor(() => {
      expect(screen.getByTestId('recycle-bin')).toBeInTheDocument()
    })
  })

  it('hides RecycleBin when editMode is false', async () => {
    mockDashState = { ...mockDashState, editMode: false }

    await act(async () => {
      render(<Dashboard />)
    })

    expect(screen.queryByTestId('recycle-bin')).not.toBeInTheDocument()
  })

  it('shows floating FAB only in edit mode', async () => {
    mockDashState = { ...mockDashState, editMode: false }

    const { rerender } = await act(async () => {
      return render(<Dashboard />)
    })

    expect(screen.queryByLabelText('Add widget')).not.toBeInTheDocument()

    // Switch to edit mode
    mockDashState = { ...mockDashState, editMode: true }

    await act(async () => {
      rerender(<Dashboard />)
    })

    expect(screen.getByLabelText('Add widget')).toBeInTheDocument()
    expect(screen.getByLabelText('Add widget')).toHaveClass('dashboard-fab')
  })

  it('triggers first-use default layout when active page has empty layouts', async () => {
    mockDashState = {
      ...mockDashState,
      pages: [{
        id: 'empty-page',
        name: 'New Page',
        sortOrder: 0,
        layouts: {},
        widgetConfigs: {},
      }],
      activePageId: 'empty-page',
    }

    await act(async () => {
      render(<Dashboard />)
    })

    expect(mockGenerateDefaultLayout).toHaveBeenCalled()
    expect(mockSetDashboardState).toHaveBeenCalled()
  })

  it('does NOT trigger default layout when page already has layouts', async () => {
    // Default mockDashState already has layouts
    await act(async () => {
      render(<Dashboard />)
    })

    expect(mockGenerateDefaultLayout).not.toHaveBeenCalled()
    expect(mockSetDashboardState).not.toHaveBeenCalled()
  })

  it('passes placed widget IDs to WidgetPicker', async () => {
    mockDashState = { ...mockDashState, editMode: true }

    await act(async () => {
      render(<Dashboard />)
    })

    // Open picker
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-picker-btn'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('placed-count')).toHaveTextContent('2')
    })
  })

  it('exports DashboardDataContext and useDashboardDataContext', async () => {
    const mod = await import('../../Dashboard')
    expect(mod.DashboardDataContext).toBeDefined()
    expect(mod.useDashboardDataContext).toBeDefined()
    expect(typeof mod.useDashboardDataContext).toBe('function')
  })
})
