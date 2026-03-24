import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWidget = vi.fn(({ widgetId, config: _config, isEditMode, size }) => (
  <div data-testid="mock-widget">
    <span data-testid="widget-id">{widgetId}</span>
    <span data-testid="edit-mode">{String(isEditMode)}</span>
    <span data-testid="size-w">{size.w}</span>
    <span data-testid="size-h">{size.h}</span>
  </div>
))

vi.mock('@/lib/widget-registry', () => ({
  getWidget: vi.fn((id: string) => {
    if (id === 'test-widget') {
      return {
        id: 'test-widget',
        name: 'Test Widget',
        description: 'A test widget',
        icon: 'TestIcon',
        category: 'monitoring',
        tier: 'builtin',
        defaultSize: { w: 4, h: 2 },
        component: () => Promise.resolve({ default: mockWidget }),
      }
    }
    if (id === 'crash-widget') {
      return {
        id: 'crash-widget',
        name: 'Crash Widget',
        description: 'A crashing widget',
        icon: 'CrashIcon',
        category: 'monitoring',
        tier: 'builtin',
        defaultSize: { w: 4, h: 2 },
        component: () => Promise.resolve({
          default: () => { throw new Error('Widget exploded') },
        }),
      }
    }
    return undefined
  }),
}))

vi.mock('@/components/dashboard/WidgetConfigPanel', () => {
  const MockPanel = ({ onClose }: { onClose: () => void }) => (
    <div data-testid="config-panel">
      <button onClick={onClose}>Close Config</button>
    </div>
  )
  MockPanel.displayName = 'MockWidgetConfigPanel'
  return { WidgetConfigPanel: MockPanel }
})

// Mock error-reporter to avoid side effects
vi.mock('@/lib/error-reporter', () => ({
  reportError: vi.fn(),
}))

// Mock fetch used in PageErrorBoundary componentDidCatch
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()))

// Suppress React error boundary console noise during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WidgetWrapper', () => {
  let WidgetWrapper: React.ComponentType<{
    widgetId: string
    pluginId: string
    config: Record<string, unknown>
    isEditMode: boolean
    size: { w: number; h: number }
    pageId: string
    onRemove?: () => void
  }>

  beforeEach(async () => {
    // Dynamic import to ensure mocks are registered first
    const mod = await import('@/components/dashboard/WidgetWrapper')
    WidgetWrapper = mod.WidgetWrapper
  })

  it('renders the correct widget component based on widgetId lookup from registry', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-1"
          pluginId="test-widget"
          config={{}}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    expect(await screen.findByTestId('mock-widget')).toBeInTheDocument()
  })

  it('shows loading skeleton while widget component is lazy-loading (Suspense fallback)', async () => {
    // Create a widget that never resolves to test the Suspense fallback
    const { getWidget } = await import('@/lib/widget-registry')
    const getWidgetMock = getWidget as unknown as ReturnType<typeof vi.fn>
    const originalImpl = getWidgetMock.getMockImplementation()!

    let _resolveWidget: (value: { default: React.ComponentType<any> }) => void
    getWidgetMock.mockImplementation((id: string) => {
      if (id === 'slow-widget') {
        return {
          id: 'slow-widget',
          name: 'Slow Widget',
          description: 'A slow widget',
          icon: 'SlowIcon',
          category: 'monitoring',
          tier: 'builtin',
          defaultSize: { w: 4, h: 2 },
          component: () => new Promise<{ default: React.ComponentType<any> }>(resolve => {
            _resolveWidget = resolve
          }),
        }
      }
      return originalImpl(id)
    })

    // Need to re-import to clear the lazy cache
    vi.resetModules()
    // Re-mock after reset
    vi.doMock('@/lib/widget-registry', () => ({
      getWidget: getWidgetMock,
    }))
    vi.doMock('@/lib/error-reporter', () => ({
      reportError: vi.fn(),
    }))
    vi.doMock('@/components/dashboard/WidgetConfigPanel', () => ({
      WidgetConfigPanel: vi.fn(() => null),
    }))
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()))

    const freshMod = await import('@/components/dashboard/WidgetWrapper')
    const FreshWidgetWrapper = freshMod.WidgetWrapper

    await act(async () => {
      render(
        <FreshWidgetWrapper
          widgetId="instance-slow"
          pluginId="slow-widget"
          config={{}}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    // The skeleton should be visible while the widget hasn't resolved
    expect(document.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('shows error state when widget component throws', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-crash"
          pluginId="crash-widget"
          config={{}}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    // Wait for lazy-load + error boundary
    expect(await screen.findByText('This page crashed')).toBeInTheDocument()
  })

  it('returns null gracefully when widgetId is not found in registry', async () => {
    const { container } = render(
      <WidgetWrapper
        widgetId="instance-unknown"
        pluginId="nonexistent-widget"
        config={{}}
        isEditMode={false}
        size={{ w: 4, h: 2 }}
        pageId="page-1"
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('passes widgetId, config, isEditMode, and size props to the rendered widget', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-props"
          pluginId="test-widget"
          config={{ color: 'red' }}
          isEditMode={true}
          size={{ w: 8, h: 3 }}
          pageId="page-1"
        />,
      )
    })

    expect(await screen.findByTestId('widget-id')).toHaveTextContent('instance-props')
    expect(screen.getByTestId('edit-mode')).toHaveTextContent('true')
    expect(screen.getByTestId('size-w')).toHaveTextContent('8')
    expect(screen.getByTestId('size-h')).toHaveTextContent('3')
  })

  it('widget has role="article" and aria-label matching widget name', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-aria"
          pluginId="test-widget"
          config={{}}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
    expect(article).toHaveAttribute('aria-label', 'Test Widget')
  })

  // -----------------------------------------------------------------------
  // Edit-mode chrome tests
  // -----------------------------------------------------------------------

  it('shows remove X button in edit mode when onRemove is provided', async () => {
    const onRemove = vi.fn()

    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-edit"
          pluginId="test-widget"
          config={{}}
          isEditMode={true}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
          onRemove={onRemove}
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    const removeBtn = screen.getByLabelText('Remove widget')
    expect(removeBtn).toBeInTheDocument()
    expect(removeBtn.tagName).toBe('BUTTON')
    expect(removeBtn).toHaveClass('widget-remove-btn')

    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('does NOT show remove X button when not in edit mode', async () => {
    const onRemove = vi.fn()

    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-no-edit"
          pluginId="test-widget"
          config={{}}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
          onRemove={onRemove}
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    expect(screen.queryByLabelText('Remove widget')).not.toBeInTheDocument()
  })

  it('renders gear icon button for widget settings', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-gear"
          pluginId="test-widget"
          config={{}}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    const gearBtn = screen.getByLabelText('Widget settings')
    expect(gearBtn).toBeInTheDocument()
    expect(gearBtn.tagName).toBe('BUTTON')
    expect(gearBtn).toHaveClass('widget-gear-btn')
  })

  it('opens WidgetConfigPanel when gear icon is clicked', async () => {
    // Fresh import to avoid module caching from prior tests (slow-widget test resets modules)
    vi.resetModules()
    vi.doMock('@/lib/widget-registry', () => ({
      getWidget: vi.fn((id: string) => {
        if (id === 'test-widget') {
          return {
            id: 'test-widget',
            name: 'Test Widget',
            description: 'A test widget',
            icon: 'TestIcon',
            category: 'monitoring',
            tier: 'builtin',
            defaultSize: { w: 4, h: 2 },
            component: () => Promise.resolve({ default: mockWidget }),
          }
        }
        return undefined
      }),
    }))
    vi.doMock('@/components/dashboard/WidgetConfigPanel', () => {
      const Panel = ({ onClose }: { onClose: () => void }) => (
        <div data-testid="config-panel">
          <button onClick={onClose}>Close Config</button>
        </div>
      )
      return { WidgetConfigPanel: Panel }
    })
    vi.doMock('@/lib/error-reporter', () => ({
      reportError: vi.fn(),
    }))
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()))

    const freshMod = await import('@/components/dashboard/WidgetWrapper')
    const FreshWrapper = freshMod.WidgetWrapper

    await act(async () => {
      render(
        <FreshWrapper
          widgetId="instance-config"
          pluginId="test-widget"
          config={{}}
          isEditMode={true}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    expect(screen.queryByTestId('config-panel')).not.toBeInTheDocument()

    // Click the gear button
    await act(async () => {
      screen.getByLabelText('Widget settings').click()
    })

    // Config panel should now be visible
    expect(screen.queryByTestId('config-panel')).toBeInTheDocument()
  })

  it('shows optional title header when config.showTitle is true', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-title"
          pluginId="test-widget"
          config={{ showTitle: true }}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    const title = document.querySelector('.widget-title-header')
    expect(title).toBeInTheDocument()
    expect(title!.textContent).toBe('Test Widget')
  })

  it('hides title header when config.showTitle is false', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-no-title"
          pluginId="test-widget"
          config={{ showTitle: false }}
          isEditMode={false}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    expect(document.querySelector('.widget-title-header')).not.toBeInTheDocument()
  })

  it('sets data-editing attribute in edit mode', async () => {
    await act(async () => {
      render(
        <WidgetWrapper
          widgetId="instance-data-editing"
          pluginId="test-widget"
          config={{}}
          isEditMode={true}
          size={{ w: 4, h: 2 }}
          pageId="page-1"
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    const card = document.querySelector('.widget-card')
    expect(card).toHaveAttribute('data-editing', 'true')
  })
})
