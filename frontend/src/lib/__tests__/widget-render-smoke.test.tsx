/**
 * Widget Render Smoke Test
 *
 * Iterates every entry in BUILTIN_WIDGETS and verifies that:
 *   1. The lazy component() factory resolves without import errors
 *   2. The resolved component renders without throwing (initial render with default props)
 *   3. No widget references deleted components (dangling registry entries)
 *
 * This is NOT a behavioral test -- it only verifies the render pipeline is intact
 * after dead code cleanup and refactoring.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BUILTIN_WIDGETS } from '../widget-registry'

// ---------------------------------------------------------------------------
// Global mocks -- must be hoisted before any widget imports
// ---------------------------------------------------------------------------

// Mock api module to prevent real HTTP calls
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve([])),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
    del: vi.fn(() => Promise.resolve({})),
  },
  API_BASE: 'http://127.0.0.1:3000',
  ApiError: class ApiError extends Error {
    status: number
    body: unknown
    service: string
    serviceLabel: string
    constructor(status: number, body: unknown) {
      super('mock error')
      this.status = status
      this.body = body
      this.service = 'Backend'
      this.serviceLabel = 'Service unavailable'
    }
  },
  serviceForPath: () => 'Backend',
  serviceErrorLabel: () => 'Service unavailable',
  setApiKey: vi.fn(),
  getApiKey: vi.fn(),
}))

// Mock error-reporter so reportError doesn't try to do anything
vi.mock('@/lib/error-reporter', () => ({
  reportError: vi.fn(),
}))

// Mock event-bus
vi.mock('@/lib/event-bus', () => ({
  emit: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}))

// Mock demo-data -- use importOriginal to get all exports, just force demo mode off
vi.mock('@/lib/demo-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/demo-data')>()
  return {
    ...actual,
    isDemoMode: () => false,
  }
})

// Mock useRealtimeSSE since EventSource doesn't exist in jsdom
vi.mock('@/lib/hooks/useRealtimeSSE', () => ({
  useRealtimeSSE: vi.fn(),
  useTableRealtime: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Test wrapper
// ---------------------------------------------------------------------------

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Stub EventSource for jsdom
// ---------------------------------------------------------------------------
beforeAll(() => {
  if (typeof globalThis.EventSource === 'undefined') {
    (globalThis as Record<string, unknown>).EventSource = class MockEventSource {
      static readonly CONNECTING = 0
      static readonly OPEN = 1
      static readonly CLOSED = 2
      readyState = 1
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      onopen: ((event: Event) => void) | null = null
      close() {
        this.readyState = 2
      }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Widget Render Smoke Tests', () => {
  it('all widget component() factories resolve without import errors', async () => {
    const results = await Promise.allSettled(
      BUILTIN_WIDGETS.map(w => w.component())
    )
    const failures = results
      .map((r, i) =>
        r.status === 'rejected'
          ? { id: BUILTIN_WIDGETS[i].id, reason: String(r.reason) }
          : null,
      )
      .filter(Boolean)
    expect(failures).toEqual([])
  })

  it('has no references to deleted components', () => {
    const deletedPatterns = ['VncPreview', 'ProjectTracker', 'TipTap', 'novnc']
    for (const widget of BUILTIN_WIDGETS) {
      const componentStr = widget.component.toString()
      for (const pattern of deletedPatterns) {
        expect(componentStr, `widget ${widget.id} references deleted "${pattern}"`).not.toContain(pattern)
      }
    }
  })

  // Dynamically generate a smoke-render test for every registered widget
  for (const widget of BUILTIN_WIDGETS) {
    it(`renders "${widget.id}" without throwing`, async () => {
      const mod = await widget.component()
      const Component = mod.default

      let container: HTMLElement
      await act(async () => {
        const result = render(
          <Component
            widgetId={widget.id}
            config={{}}
            isEditMode={false}
            size={widget.defaultSize}
          />,
          { wrapper: TestWrapper },
        )
        container = result.container
      })

      // Widget rendered something (not an empty container)
      expect(container!.firstChild).not.toBeNull()
    })
  }
})
