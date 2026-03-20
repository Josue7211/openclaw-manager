import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecycleBin } from '@/components/dashboard/RecycleBin'
import { WidgetConfigPanel } from '@/components/dashboard/WidgetConfigPanel'

/* ── Mock dashboard-store ──────────────────────────────────────────────── */

const mockRestoreWidget = vi.fn()
const mockClearRecycleBin = vi.fn()
const mockUpdateWidgetConfig = vi.fn()

vi.mock('@/lib/dashboard-store', () => ({
  restoreWidget: (...args: unknown[]) => mockRestoreWidget(...args),
  clearRecycleBin: (...args: unknown[]) => mockClearRecycleBin(...args),
  updateWidgetConfig: (...args: unknown[]) => mockUpdateWidgetConfig(...args),
}))

/* ── Mock widget-registry ──────────────────────────────────────────────── */

vi.mock('@/lib/widget-registry', () => ({
  getWidget: (id: string) => {
    if (id === 'agent-status') {
      return {
        id: 'agent-status',
        name: 'Agent Status',
        icon: 'Robot',
        configSchema: {
          fields: [
            { key: 'pollInterval', label: 'Poll Interval', type: 'slider', default: 10000, min: 1000, max: 60000 },
            { key: 'showDetails', label: 'Show Details', type: 'toggle', default: true },
            { key: 'displayMode', label: 'Display Mode', type: 'select', default: 'compact', options: [{ label: 'Compact', value: 'compact' }, { label: 'Full', value: 'full' }] },
          ],
        },
      }
    }
    if (id === 'heartbeat') {
      return {
        id: 'heartbeat',
        name: 'Heartbeat',
        icon: 'Heartbeat',
        // No configSchema
      }
    }
    return undefined
  },
}))

/* ── Helpers ───────────────────────────────────────────────────────────── */

const mockRecycleBinItems = [
  {
    widgetId: 'agent-status-abc12345',
    pluginId: 'agent-status',
    removedAt: '2026-03-20T10:00:00.000Z',
    previousPosition: { i: 'agent-status-abc12345', x: 0, y: 0, w: 1, h: 2 },
    previousPageId: 'page-1',
  },
  {
    widgetId: 'heartbeat-def67890',
    pluginId: 'heartbeat',
    removedAt: '2026-03-20T10:05:00.000Z',
    previousPosition: { i: 'heartbeat-def67890', x: 1, y: 0, w: 1, h: 2 },
    previousPageId: 'page-1',
  },
]

/* ── RecycleBin ────────────────────────────────────────────────────────── */

describe('RecycleBin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <RecycleBin items={mockRecycleBinItems} visible={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders in collapsed state with item count', () => {
    render(<RecycleBin items={mockRecycleBinItems} visible={true} />)
    expect(screen.getByText(/recycle bin/i)).toBeInTheDocument()
    expect(screen.getByText(/2/)).toBeInTheDocument()
  })

  it('clicking expands to show widget thumbnails', () => {
    render(<RecycleBin items={mockRecycleBinItems} visible={true} />)
    // Click the collapsed bar to expand
    const toggleBtn = screen.getByRole('button', { name: /expand recycle bin/i })
    fireEvent.click(toggleBtn)
    // Should now show widget names in thumbnails
    expect(screen.getByText('Agent Status')).toBeInTheDocument()
    expect(screen.getByText('Heartbeat')).toBeInTheDocument()
  })

  it('double-clicking a thumbnail calls restoreWidget with correct index', () => {
    render(<RecycleBin items={mockRecycleBinItems} visible={true} />)
    // Expand first
    fireEvent.click(screen.getByRole('button', { name: /expand recycle bin/i }))
    // Double-click the first thumbnail
    const firstThumb = screen.getByText('Agent Status').closest('button')!
    fireEvent.doubleClick(firstThumb)
    expect(mockRestoreWidget).toHaveBeenCalledWith(0)
  })

  it('Clear All button shows confirmation dialog', () => {
    render(<RecycleBin items={mockRecycleBinItems} visible={true} />)
    fireEvent.click(screen.getByRole('button', { name: /expand recycle bin/i }))
    fireEvent.click(screen.getByText('Clear All'))
    // Should show confirmation
    expect(screen.getByText(/can't be restored/i)).toBeInTheDocument()
  })

  it('confirming clear calls clearRecycleBin()', () => {
    render(<RecycleBin items={mockRecycleBinItems} visible={true} />)
    fireEvent.click(screen.getByRole('button', { name: /expand recycle bin/i }))
    fireEvent.click(screen.getByText('Clear All'))
    fireEvent.click(screen.getByText('Clear All Widgets'))
    expect(mockClearRecycleBin).toHaveBeenCalledOnce()
  })

  it('canceling clear does not call clearRecycleBin', () => {
    render(<RecycleBin items={mockRecycleBinItems} visible={true} />)
    fireEvent.click(screen.getByRole('button', { name: /expand recycle bin/i }))
    fireEvent.click(screen.getByText('Clear All'))
    fireEvent.click(screen.getByText('Keep Widgets'))
    expect(mockClearRecycleBin).not.toHaveBeenCalled()
  })

  it('shows empty state when items array is empty', () => {
    render(<RecycleBin items={[]} visible={true} />)
    fireEvent.click(screen.getByRole('button', { name: /expand recycle bin/i }))
    expect(screen.getByText(/no removed widgets/i)).toBeInTheDocument()
  })
})

/* ── WidgetConfigPanel ─────────────────────────────────────────────────── */

describe('WidgetConfigPanel', () => {
  const anchorRef = { current: document.createElement('div') }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock getBoundingClientRect for positioning
    anchorRef.current.getBoundingClientRect = () => ({
      top: 100,
      left: 200,
      bottom: 132,
      right: 232,
      width: 32,
      height: 32,
      x: 200,
      y: 100,
      toJSON: () => {},
    })
  })

  function renderConfig(config: Record<string, unknown> = {}) {
    return render(
      <WidgetConfigPanel
        widgetId="agent-status-abc12345"
        pluginId="agent-status"
        pageId="page-1"
        config={config}
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
        onClose={vi.fn()}
      />,
    )
  }

  it('renders config fields from widget configSchema', () => {
    renderConfig()
    expect(screen.getByText('Poll Interval')).toBeInTheDocument()
    expect(screen.getByText('Show Details')).toBeInTheDocument()
    expect(screen.getByText('Display Mode')).toBeInTheDocument()
  })

  it('"Show title header" universal toggle is always present', () => {
    renderConfig()
    expect(screen.getByText('Show title header')).toBeInTheDocument()
  })

  it('toggle field renders a switch with correct checked state', () => {
    renderConfig({ showDetails: false })
    const toggle = screen.getByRole('switch', { name: 'Show Details' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('slider field renders range input with min/max', () => {
    renderConfig({ pollInterval: 10000 })
    const slider = screen.getByRole('slider', { name: 'Poll Interval' })
    expect(slider).toHaveAttribute('min', '1000')
    expect(slider).toHaveAttribute('max', '60000')
  })

  it('select field renders dropdown with options', () => {
    renderConfig({ displayMode: 'compact' })
    const select = screen.getByRole('combobox', { name: 'Display Mode' })
    expect(select).toBeInTheDocument()
    // Check options
    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(2)
  })

  it('changing a toggle value calls updateWidgetConfig', () => {
    renderConfig({ showDetails: true })
    const toggle = screen.getByRole('switch', { name: 'Show Details' })
    fireEvent.click(toggle)
    expect(mockUpdateWidgetConfig).toHaveBeenCalledWith(
      'page-1',
      'agent-status-abc12345',
      expect.objectContaining({ showDetails: false }),
    )
  })

  it('changing a slider value calls updateWidgetConfig', () => {
    renderConfig({ pollInterval: 10000 })
    const slider = screen.getByRole('slider', { name: 'Poll Interval' })
    fireEvent.change(slider, { target: { value: '30000' } })
    expect(mockUpdateWidgetConfig).toHaveBeenCalledWith(
      'page-1',
      'agent-status-abc12345',
      expect.objectContaining({ pollInterval: 30000 }),
    )
  })

  it('"Reset to default" button resets all config to schema defaults', () => {
    renderConfig({ pollInterval: 30000, showDetails: false, displayMode: 'full' })
    fireEvent.click(screen.getByText('Reset to default'))
    expect(mockUpdateWidgetConfig).toHaveBeenCalledWith(
      'page-1',
      'agent-status-abc12345',
      expect.objectContaining({
        pollInterval: 10000,
        showDetails: true,
        displayMode: 'compact',
      }),
    )
  })

  it('Escape key closes the panel', () => {
    const onClose = vi.fn()
    render(
      <WidgetConfigPanel
        widgetId="agent-status-abc12345"
        pluginId="agent-status"
        pageId="page-1"
        config={{}}
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders "Widget Settings" heading', () => {
    renderConfig()
    expect(screen.getByText('Widget Settings')).toBeInTheDocument()
  })

  it('renders for widgets without configSchema (only universal toggle)', () => {
    render(
      <WidgetConfigPanel
        widgetId="heartbeat-def67890"
        pluginId="heartbeat"
        pageId="page-1"
        config={{}}
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Show title header')).toBeInTheDocument()
    expect(screen.queryByText('Poll Interval')).not.toBeInTheDocument()
  })
})
