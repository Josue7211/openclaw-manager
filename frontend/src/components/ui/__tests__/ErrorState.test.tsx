import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorState } from '../ErrorState'

describe('ErrorState', () => {
  it('renders heading "Something went wrong"', () => {
    render(<ErrorState />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders custom message when provided', () => {
    render(<ErrorState message="Custom error message" />)
    expect(screen.getByText('Custom error message')).toBeInTheDocument()
  })

  it('has role="alert"', () => {
    render(<ErrorState />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('has aria-live="assertive"', () => {
    render(<ErrorState />)
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
  })

  it('renders "Try Again" button that calls onRetry', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<ErrorState onRetry={handler} />)
    const btn = screen.getByRole('button', { name: 'Try Again' })
    await user.click(btn)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('renders "Reload Page" button', () => {
    render(<ErrorState />)
    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeInTheDocument()
  })

  it('both buttons are <button> elements', () => {
    render(<ErrorState onRetry={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    for (const btn of buttons) {
      expect(btn.tagName).toBe('BUTTON')
    }
  })
})
