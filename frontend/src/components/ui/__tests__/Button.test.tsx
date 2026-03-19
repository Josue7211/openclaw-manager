import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../Button'

describe('Button', () => {
  it('renders with variant="primary" and has background matching accent color', () => {
    render(<Button variant="primary">Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.style.background).toBe('var(--accent)')
  })

  it('renders with variant="secondary" and has border', () => {
    render(<Button variant="secondary">Cancel</Button>)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn.style.border).toBe('1px solid var(--border)')
  })

  it('renders with variant="ghost" and has transparent background', () => {
    render(<Button variant="ghost">More</Button>)
    const btn = screen.getByRole('button', { name: 'More' })
    expect(btn.style.background).toBe('transparent')
  })

  it('renders with variant="danger" and has red background', () => {
    render(<Button variant="danger">Delete</Button>)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn.style.background).toBe('var(--red-500)')
  })

  it('renders as disabled with opacity 0.5 and cursor not-allowed', () => {
    render(<Button disabled>Disabled</Button>)
    const btn = screen.getByRole('button', { name: 'Disabled' })
    expect(btn).toBeDisabled()
    expect(btn.style.opacity).toBe('0.5')
    expect(btn.style.cursor).toBe('not-allowed')
  })

  it('renders children text content', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick handler when clicked', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<Button onClick={handler}>Click</Button>)
    await user.click(screen.getByRole('button', { name: 'Click' }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('renders as a <button> element (not div)', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button', { name: 'Test' })
    expect(btn.tagName).toBe('BUTTON')
  })

  it('has type="button" by default (not submit)', () => {
    render(<Button>Default</Button>)
    const btn = screen.getByRole('button', { name: 'Default' })
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('accepts and applies className prop', () => {
    render(<Button className="custom-class">Styled</Button>)
    const btn = screen.getByRole('button', { name: 'Styled' })
    expect(btn.classList.contains('custom-class')).toBe(true)
  })
})
