import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { WidgetPicker } from '@/components/dashboard/WidgetPicker'
import { WidgetPickerCard } from '@/components/dashboard/WidgetPickerCard'

/* ── Mock widget-registry ──────────────────────────────────────────────── */

const mockWidgetsByCategory: Record<string, any[]> = {
  monitoring: [
    {
      id: 'agent-status',
      name: 'Agent Status',
      description: 'Live status of the primary AI agent',
      icon: 'Robot',
      category: 'monitoring',
      tier: 'builtin',
      defaultSize: { w: 1, h: 2 },
      minSize: { w: 1, h: 2 },
    },
    {
      id: 'heartbeat',
      name: 'Heartbeat',
      description: 'Agent health check and task queue',
      icon: 'Heartbeat',
      category: 'monitoring',
      tier: 'builtin',
      defaultSize: { w: 1, h: 2 },
      minSize: { w: 1, h: 2 },
    },
  ],
  productivity: [
    {
      id: 'missions',
      name: 'Missions',
      description: 'Active and recent agent missions',
      icon: 'Rocket',
      category: 'productivity',
      tier: 'builtin',
      defaultSize: { w: 2, h: 3 },
      minSize: { w: 2, h: 2 },
    },
  ],
  ai: [
    {
      id: 'agents',
      name: 'Agents',
      description: 'All registered agents and their states',
      icon: 'UsersThree',
      category: 'ai',
      tier: 'builtin',
      defaultSize: { w: 2, h: 3 },
      minSize: { w: 2, h: 2 },
    },
  ],
}

const mockBundles = [
  {
    id: 'agent-monitor',
    name: 'Agent Monitor',
    description: 'Agent status and live processes',
    widgetIds: ['agent-status', 'agents'],
  },
]

vi.mock('@/lib/widget-registry', () => ({
  getWidgetsByCategory: () => mockWidgetsByCategory,
  getWidgetBundles: () => mockBundles,
  getWidget: (id: string) => {
    for (const widgets of Object.values(mockWidgetsByCategory)) {
      const found = widgets.find((w: any) => w.id === id)
      if (found) return found
    }
    return undefined
  },
}))

/* ── Mock dashboard-store ──────────────────────────────────────────────── */

const mockAddWidgetToPage = vi.fn()

vi.mock('@/lib/dashboard-store', () => ({
  addWidgetToPage: (...args: unknown[]) => mockAddWidgetToPage(...args),
}))

/* ── Mock hooks ────────────────────────────────────────────────────────── */

vi.mock('@/lib/hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

vi.mock('@/lib/hooks/useEscapeKey', () => ({
  useEscapeKey: (cb: () => void, enabled?: boolean) => {
    // Simulate escape key handling in tests
  },
}))

/* ── Helpers ───────────────────────────────────────────────────────────── */

function renderPicker(
  props: Partial<React.ComponentProps<typeof WidgetPicker>> = {},
) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    pageId: 'page-1',
    placedWidgetIds: [] as string[],
  }
  return render(<WidgetPicker {...defaults} {...props} />)
}

/* ── WidgetPicker ──────────────────────────────────────────────────────── */

describe('WidgetPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when open is false', () => {
    const { container } = renderPicker({ open: false })
    expect(container.firstChild).toBeNull()
  })

  it('renders category headings when open', () => {
    renderPicker()
    expect(screen.getByText('Monitoring')).toBeInTheDocument()
    expect(screen.getByText('Productivity')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })

  it('renders widgets within their categories', () => {
    renderPicker()
    expect(screen.getByText('Agent Status')).toBeInTheDocument()
    expect(screen.getByText('Heartbeat')).toBeInTheDocument()
    expect(screen.getByText('Missions')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders bundles section', () => {
    renderPicker()
    expect(screen.getByText('Bundles')).toBeInTheDocument()
    expect(screen.getByText('Agent Monitor')).toBeInTheDocument()
  })

  it('search input filters widgets by name and description (case-insensitive)', () => {
    renderPicker()
    const input = screen.getByPlaceholderText('Search widgets...')
    fireEvent.change(input, { target: { value: 'missions' } })
    expect(screen.getByText('Missions')).toBeInTheDocument()
    expect(screen.queryByText('Agent Status')).not.toBeInTheDocument()
    expect(screen.queryByText('Heartbeat')).not.toBeInTheDocument()
    expect(screen.queryByText('Agents')).not.toBeInTheDocument()
  })

  it('search with no matches shows empty state', () => {
    renderPicker()
    const input = screen.getByPlaceholderText('Search widgets...')
    fireEvent.change(input, { target: { value: 'zzzznothing' } })
    expect(screen.getByText('No matching widgets')).toBeInTheDocument()
  })

  it('clicking Add Widget on a card calls addWidgetToPage', () => {
    renderPicker()
    const addButtons = screen.getAllByText('Add')
    // Click the first "Add" button (Agent Status)
    fireEvent.click(addButtons[0])
    expect(mockAddWidgetToPage).toHaveBeenCalledTimes(1)
    expect(mockAddWidgetToPage).toHaveBeenCalledWith(
      'page-1',
      'agent-status',
      expect.objectContaining({
        w: 1,
        h: 2,
        x: 0,
        y: Infinity,
      }),
    )
  })

  it('clicking Add Bundle adds all widgets in the bundle', () => {
    renderPicker()
    const addBundleBtn = screen.getByRole('button', { name: /add bundle/i })
    fireEvent.click(addBundleBtn)
    // Bundle has 2 widgets: agent-status, agents
    expect(mockAddWidgetToPage).toHaveBeenCalledTimes(2)
  })

  it('panel has role="dialog" and aria-modal="true"', () => {
    renderPicker()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('close button closes the panel', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    fireEvent.click(screen.getByLabelText('Close widget picker'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('backdrop click closes the panel', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    const backdrop = screen.getByTestId('widget-picker-backdrop')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('already-placed widgets show "Added" state', () => {
    renderPicker({ placedWidgetIds: ['agent-status'] })
    // The Agent Status card should show "Added" text
    expect(screen.getByText('Added')).toBeInTheDocument()
  })
})

/* ── WidgetPickerCard ──────────────────────────────────────────────────── */

describe('WidgetPickerCard', () => {
  const widget = {
    id: 'agent-status',
    name: 'Agent Status',
    description: 'Live status of the primary AI agent',
    icon: 'Robot',
    category: 'monitoring' as const,
    tier: 'builtin' as const,
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => Promise.resolve({ default: () => null }),
  }

  it('renders widget name and description', () => {
    render(
      <WidgetPickerCard
        widget={widget}
        onAdd={vi.fn()}
        isAlreadyPlaced={false}
      />,
    )
    expect(screen.getByText('Agent Status')).toBeInTheDocument()
    expect(
      screen.getByText('Live status of the primary AI agent'),
    ).toBeInTheDocument()
  })

  it('renders size preset pills (S/M/L/XL)', () => {
    render(
      <WidgetPickerCard
        widget={widget}
        onAdd={vi.fn()}
        isAlreadyPlaced={false}
      />,
    )
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('L')).toBeInTheDocument()
    expect(screen.getByText('XL')).toBeInTheDocument()
  })

  it('default size preset matches widget defaultSize', () => {
    render(
      <WidgetPickerCard
        widget={widget}
        onAdd={vi.fn()}
        isAlreadyPlaced={false}
      />,
    )
    // Agent Status defaultSize is {w:1, h:2} which maps to S preset
    const sPill = screen.getByText('S')
    expect(sPill).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking a size preset selects it', () => {
    render(
      <WidgetPickerCard
        widget={widget}
        onAdd={vi.fn()}
        isAlreadyPlaced={false}
      />,
    )
    const mPill = screen.getByText('M')
    fireEvent.click(mPill)
    expect(mPill).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('S')).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking Add calls onAdd with selected size', () => {
    const onAdd = vi.fn()
    render(
      <WidgetPickerCard widget={widget} onAdd={onAdd} isAlreadyPlaced={false} />,
    )
    // Default is S (1x2)
    fireEvent.click(screen.getByText('Add'))
    expect(onAdd).toHaveBeenCalledWith({ w: 1, h: 2 })
  })

  it('clicking a different preset and then Add passes correct size', () => {
    const onAdd = vi.fn()
    render(
      <WidgetPickerCard widget={widget} onAdd={onAdd} isAlreadyPlaced={false} />,
    )
    fireEvent.click(screen.getByText('L'))
    fireEvent.click(screen.getByText('Add'))
    expect(onAdd).toHaveBeenCalledWith({ w: 2, h: 3 })
  })

  it('shows "Added" with disabled button when isAlreadyPlaced', () => {
    render(
      <WidgetPickerCard
        widget={widget}
        onAdd={vi.fn()}
        isAlreadyPlaced={true}
      />,
    )
    expect(screen.getByText('Added')).toBeInTheDocument()
    const btn = screen.getByText('Added').closest('button')
    expect(btn).toBeDisabled()
  })

  it('does not call onAdd when isAlreadyPlaced', () => {
    const onAdd = vi.fn()
    render(
      <WidgetPickerCard widget={widget} onAdd={onAdd} isAlreadyPlaced={true} />,
    )
    const btn = screen.getByText('Added').closest('button')!
    fireEvent.click(btn)
    expect(onAdd).not.toHaveBeenCalled()
  })
})
