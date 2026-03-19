import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState } from '../EmptyState'

function MockIcon(props: Record<string, unknown>) {
  return <svg data-testid="mock-icon" {...props} />
}

describe('EmptyState', () => {
  it('renders title text', () => {
    render(<EmptyState icon={MockIcon} title="No messages yet" />)
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <EmptyState
        icon={MockIcon}
        title="No items"
        description="Your items will appear here."
      />,
    )
    expect(screen.getByText('Your items will appear here.')).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    const { container } = render(
      <EmptyState icon={MockIcon} title="No items" />,
    )
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBe(0)
  })

  it('renders action button when action prop provided', () => {
    const handler = vi.fn()
    render(
      <EmptyState
        icon={MockIcon}
        title="No items"
        action={{ label: 'Create Item', onClick: handler }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Create Item' })).toBeInTheDocument()
  })

  it('calls action.onClick when action button clicked', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(
      <EmptyState
        icon={MockIcon}
        title="No items"
        action={{ label: 'Add', onClick: handler }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('has role="status"', () => {
    render(<EmptyState icon={MockIcon} title="Empty" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('action button is a <button> element', () => {
    render(
      <EmptyState
        icon={MockIcon}
        title="Empty"
        action={{ label: 'Do it', onClick: vi.fn() }}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Do it' })
    expect(btn.tagName).toBe('BUTTON')
  })
})
