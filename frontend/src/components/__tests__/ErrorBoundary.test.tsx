import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '../ErrorBoundary'

// Suppress React error boundary console noise during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Top-level failure')
  return <p>All good</p>
}

describe('ErrorBoundary (top-level)', () => {
  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Everything works</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Everything works')).toBeInTheDocument()
  })

  it('shows "Something went wrong" heading when a child throws', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('displays the error message from the thrown error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Top-level failure')).toBeInTheDocument()
  })

  it('shows a "Reload" button on error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow />
      </ErrorBoundary>,
    )
    const reloadButton = screen.getByText('Reload')
    expect(reloadButton).toBeInTheDocument()
    expect(reloadButton.tagName).toBe('BUTTON')
  })

  it('Reload button calls window.location.reload', () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByText('Reload'))
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('does not show error UI when children render successfully', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.queryByText('Reload')).not.toBeInTheDocument()
  })
})
