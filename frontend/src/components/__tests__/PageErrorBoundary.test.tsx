import { Component } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PageErrorBoundary from '../PageErrorBoundary'

// Suppress React error boundary console noise during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Mock error-reporter to avoid side effects
vi.mock('@/lib/error-reporter', () => ({
  reportError: vi.fn(),
}))

// Mock fetch used in componentDidCatch
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()))

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Boom')
  return <p>All good</p>
}

/**
 * Class component that throws on render until `shouldThrow` is set to false.
 * Using a class component avoids React 19 concurrent rendering recovery
 * issues that affect functional components throwing during render.
 */
class ThrowingClassChild extends Component<Record<string, never>, { recovered: boolean }> {
  static shouldThrow = true

  state = { recovered: false }

  render() {
    if (ThrowingClassChild.shouldThrow) {
      throw new Error('Class render failure')
    }
    return <p>Recovered</p>
  }
}

describe('PageErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <PageErrorBoundary>
        <p>Safe content</p>
      </PageErrorBoundary>,
    )
    expect(screen.getByText('Safe content')).toBeInTheDocument()
  })

  it('shows error card when a child throws', () => {
    render(
      <PageErrorBoundary>
        <ProblemChild shouldThrow />
      </PageErrorBoundary>,
    )
    expect(screen.getByText('This page crashed')).toBeInTheDocument()
    expect(screen.getByText('Boom')).toBeInTheDocument()
  })

  it('has role="alert" on the error container', () => {
    render(
      <PageErrorBoundary>
        <ProblemChild shouldThrow />
      </PageErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('"Try again" button resets error state and re-renders children', () => {
    // Start in throwing mode
    ThrowingClassChild.shouldThrow = true

    render(
      <PageErrorBoundary>
        <ThrowingClassChild />
      </PageErrorBoundary>,
    )

    // Error state is shown
    expect(screen.getByText('This page crashed')).toBeInTheDocument()
    expect(screen.getByText('Class render failure')).toBeInTheDocument()

    // Stop throwing before clicking "Try again"
    ThrowingClassChild.shouldThrow = false

    // Click "Try again" — clears error state, children re-render
    fireEvent.click(screen.getByText('Try again'))

    // After reset, child renders successfully
    expect(screen.getByText('Recovered')).toBeInTheDocument()
    expect(screen.queryByText('This page crashed')).not.toBeInTheDocument()
  })

  it('displays the error message from the thrown error', () => {
    function CustomError() {
      throw new Error('Custom failure message')
    }

    render(
      <PageErrorBoundary>
        <CustomError />
      </PageErrorBoundary>,
    )
    expect(screen.getByText('Custom failure message')).toBeInTheDocument()
  })

  it('shows a "Reload page" button alongside "Try again"', () => {
    render(
      <PageErrorBoundary>
        <ProblemChild shouldThrow />
      </PageErrorBoundary>,
    )
    expect(screen.getByText('Try again')).toBeInTheDocument()
    expect(screen.getByText('Reload page')).toBeInTheDocument()
  })
})
