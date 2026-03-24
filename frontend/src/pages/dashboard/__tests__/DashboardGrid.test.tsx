import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Track the last props passed to ResponsiveGridLayout
let capturedGridProps: Record<string, unknown> = {}

vi.mock('react-grid-layout', () => {
  const MockResponsiveGridLayout = React.forwardRef(function MockRGL(
    props: Record<string, unknown>,
    _ref: any,
  ) {
    capturedGridProps = props
    return (
      <div data-testid="rgl-container" data-draggable={String(props.isDraggable)} data-resizable={String(props.isResizable)}>
        {props.children as React.ReactNode}
      </div>
    )
  })
  return {
    ResponsiveGridLayout: MockResponsiveGridLayout,
    Responsive: MockResponsiveGridLayout,
    useContainerWidth: () => ({
      width: 1200,
      mounted: true,
      containerRef: { current: null },
    }),
  }
})

vi.mock('react-grid-layout/css/styles.css', () => ({}))
vi.mock('react-resizable/css/styles.css', () => ({}))

// Mock WidgetWrapper to render a simple div
vi.mock('@/components/dashboard/WidgetWrapper', () => ({
  WidgetWrapper: ({ widgetId, pluginId, isEditMode, size }: {
    widgetId: string; pluginId: string; isEditMode: boolean;
    config: Record<string, unknown>; size: { w: number; h: number }
  }) => (
    <div data-testid={`widget-${widgetId}`} data-plugin={pluginId} data-edit={String(isEditMode)} data-w={size.w} data-h={size.h}>
      Widget: {widgetId}
    </div>
  ),
}))

// Mock getWidget to return definitions
vi.mock('@/lib/widget-registry', () => ({
  getWidget: vi.fn((id: string) => ({
    id,
    name: `Widget ${id}`,
    description: 'test',
    icon: 'Test',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 4, h: 2 },
    component: () => Promise.resolve({ default: () => null }),
  })),
}))

// Mock EmptyState
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { icon: React.ElementType; title: string; description?: string }) => (
    <div data-testid="empty-state">
      <span data-testid="empty-title">{title}</span>
      {description && <span data-testid="empty-desc">{description}</span>}
    </div>
  ),
}))

// Mock dashboard store -- mutable so tests can change it
const mockPages = [
  {
    id: 'page-1',
    name: 'Home',
    sortOrder: 0,
    layouts: {
      lg: [
        { i: 'agent-status', x: 0, y: 0, w: 4, h: 2 },
        { i: 'heartbeat', x: 4, y: 0, w: 4, h: 2 },
        { i: 'network', x: 8, y: 0, w: 4, h: 2 },
      ],
      md: [
        { i: 'agent-status', x: 0, y: 0, w: 4, h: 2 },
        { i: 'heartbeat', x: 4, y: 0, w: 4, h: 2 },
        { i: 'network', x: 0, y: 2, w: 4, h: 2 },
      ],
      sm: [
        { i: 'agent-status', x: 0, y: 0, w: 4, h: 2 },
        { i: 'heartbeat', x: 0, y: 2, w: 4, h: 2 },
        { i: 'network', x: 0, y: 4, w: 4, h: 2 },
      ],
    },
    widgetConfigs: {
      'agent-status': { refreshInterval: 5000 },
      'heartbeat': {},
      'network': {},
    },
  },
]

let mockDashboardState = {
  pages: mockPages,
  activePageId: 'page-1',
  editMode: false,
  wobbleEnabled: true,
  dotIndicatorsEnabled: false,
  recycleBin: [],
  lastModified: '2026-03-20T00:00:00Z',
}

const mockUpdatePageLayouts = vi.fn()

vi.mock('@/lib/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardState,
  getDashboardState: () => mockDashboardState,
  updatePageLayouts: (...args: unknown[]) => mockUpdatePageLayouts(...args),
  removeWidget: vi.fn(),
  setEditMode: vi.fn(),
}))

// Suppress console noise
beforeEach(() => {
  capturedGridProps = {}
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockUpdatePageLayouts.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  // Reset state
  mockDashboardState = {
    pages: mockPages,
    activePageId: 'page-1',
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

describe('DashboardGrid', () => {
  let DashboardGrid: React.ComponentType<{
    pageId: string
    editMode: boolean
    wobbleEnabled: boolean
  }>

  beforeEach(async () => {
    const mod = await import('../DashboardGrid')
    DashboardGrid = mod.DashboardGrid
  })

  it('renders ResponsiveGridLayout from react-grid-layout', () => {
    render(<DashboardGrid pageId="page-1" editMode={false} wobbleEnabled={false} />)
    expect(screen.getByTestId('rgl-container')).toBeInTheDocument()
  })

  it('renders WidgetWrapper for each widget in the active page', () => {
    render(<DashboardGrid pageId="page-1" editMode={false} wobbleEnabled={false} />)
    expect(screen.getByTestId('widget-agent-status')).toBeInTheDocument()
    expect(screen.getByTestId('widget-heartbeat')).toBeInTheDocument()
    expect(screen.getByTestId('widget-network')).toBeInTheDocument()
  })

  it('drag/resize disabled when editMode is false', () => {
    render(<DashboardGrid pageId="page-1" editMode={false} wobbleEnabled={false} />)
    const container = screen.getByTestId('rgl-container')
    expect(container.dataset.draggable).toBe('false')
    expect(container.dataset.resizable).toBe('false')
  })

  it('drag/resize enabled when editMode is true', () => {
    render(<DashboardGrid pageId="page-1" editMode={true} wobbleEnabled={false} />)
    const container = screen.getByTestId('rgl-container')
    expect(container.dataset.draggable).toBe('true')
    expect(container.dataset.resizable).toBe('true')
  })

  it('passes correct breakpoints and columns', () => {
    render(<DashboardGrid pageId="page-1" editMode={false} wobbleEnabled={false} />)
    expect(capturedGridProps.breakpoints).toEqual({ xl: 1400, lg: 900, md: 600, sm: 0 })
    expect(capturedGridProps.cols).toEqual({ xl: 12, lg: 12, md: 8, sm: 4 })
  })

  it('empty page shows EmptyState with "No widgets yet"', () => {
    mockDashboardState = {
      ...mockDashboardState,
      pages: [{
        id: 'empty-page',
        name: 'Empty',
        sortOrder: 0,
        layouts: {},
        widgetConfigs: {},
      }],
      activePageId: 'empty-page',
    }

    render(<DashboardGrid pageId="empty-page" editMode={false} wobbleEnabled={false} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByTestId('empty-title')).toHaveTextContent('No widgets yet')
  })

  it('passes correct WidgetProps to each WidgetWrapper', () => {
    render(<DashboardGrid pageId="page-1" editMode={true} wobbleEnabled={false} />)

    const agentWidget = screen.getByTestId('widget-agent-status')
    expect(agentWidget.dataset.plugin).toBe('agent-status')
    expect(agentWidget.dataset.edit).toBe('true')
    expect(agentWidget.dataset.w).toBe('4')
    expect(agentWidget.dataset.h).toBe('2')
  })

  it('onLayoutChange callback calls updatePageLayouts', async () => {
    vi.useFakeTimers()

    render(<DashboardGrid pageId="page-1" editMode={true} wobbleEnabled={false} />)

    // Simulate onLayoutChange being called
    const onLayoutChange = capturedGridProps.onLayoutChange as (layout: unknown, allLayouts: unknown) => void
    expect(onLayoutChange).toBeDefined()

    const newLayouts = {
      lg: [{ i: 'agent-status', x: 0, y: 0, w: 4, h: 2 }],
    }
    act(() => {
      onLayoutChange([{ i: 'agent-status', x: 0, y: 0, w: 4, h: 2 }], newLayouts)
    })

    // Should be debounced -- not called immediately
    expect(mockUpdatePageLayouts).not.toHaveBeenCalled()

    // Advance past debounce timeout
    act(() => {
      vi.advanceTimersByTime(350)
    })

    expect(mockUpdatePageLayouts).toHaveBeenCalledWith('page-1', newLayouts)

    vi.useRealTimers()
  })

  it('has dashboard-grid-lines overlay when editMode is true', () => {
    const { container } = render(<DashboardGrid pageId="page-1" editMode={true} wobbleEnabled={false} />)
    const gridLines = container.querySelector('.dashboard-grid-lines')
    expect(gridLines).toBeInTheDocument()
    expect(gridLines?.classList.contains('visible')).toBe(true)
  })

  it('no dashboard-grid-lines overlay when editMode is false', () => {
    const { container } = render(<DashboardGrid pageId="page-1" editMode={false} wobbleEnabled={false} />)
    const gridLines = container.querySelector('.dashboard-grid-lines.visible')
    expect(gridLines).not.toBeInTheDocument()
  })

  it('uses compactType="vertical"', () => {
    render(<DashboardGrid pageId="page-1" editMode={false} wobbleEnabled={false} />)
    expect(capturedGridProps.compactType).toBe('vertical')
  })

  it('uses rowHeight of 80', () => {
    render(<DashboardGrid pageId="page-1" editMode={false} wobbleEnabled={false} />)
    expect(capturedGridProps.rowHeight).toBe(80)
  })
})
