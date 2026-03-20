import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React, { Suspense } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWidget = vi.fn(({ widgetId, config, isEditMode, size }) => (
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

    let resolveWidget: (value: { default: React.ComponentType<any> }) => void
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
            resolveWidget = resolve
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
        />,
      )
    })

    await screen.findByTestId('mock-widget')

    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
    expect(article).toHaveAttribute('aria-label', 'Test Widget')
  })
})
