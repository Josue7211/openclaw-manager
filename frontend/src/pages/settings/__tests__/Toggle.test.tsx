import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Toggle from '../Toggle'

describe('Toggle component', () => {
  describe('rendering', () => {
    it('renders a button element', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test toggle" />)
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })

    it('renders as a button tag, not a div', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test toggle" />)
      const el = screen.getByRole('switch')
      expect(el.tagName).toBe('BUTTON')
    })
  })

  describe('accessibility', () => {
    it('has role="switch"', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test toggle" />)
      expect(screen.getByRole('switch')).toBeDefined()
    })

    it('has aria-checked="false" when off', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test toggle" />)
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    })

    it('has aria-checked="true" when on', () => {
      render(<Toggle on={true} onToggle={() => {}} label="Test toggle" />)
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    })

    it('has aria-label when label prop is provided', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Enable notifications" />)
      expect(screen.getByRole('switch')).toHaveAttribute('aria-label', 'Enable notifications')
    })

    it('has no aria-label when label prop is omitted', () => {
      render(<Toggle on={false} onToggle={() => {}} />)
      const toggle = screen.getByRole('switch')
      // aria-label attribute exists but is undefined
      expect(toggle.getAttribute('aria-label')).toBeNull()
    })
  })

  describe('interaction', () => {
    it('calls onToggle with true when clicked while off', () => {
      const onToggle = vi.fn()
      render(<Toggle on={false} onToggle={onToggle} label="Test" />)
      fireEvent.click(screen.getByRole('switch'))
      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('calls onToggle with false when clicked while on', () => {
      const onToggle = vi.fn()
      render(<Toggle on={true} onToggle={onToggle} label="Test" />)
      fireEvent.click(screen.getByRole('switch'))
      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith(false)
    })

    it('does not call onToggle before click', () => {
      const onToggle = vi.fn()
      render(<Toggle on={false} onToggle={onToggle} label="Test" />)
      expect(onToggle).not.toHaveBeenCalled()
    })
  })

  describe('visual state', () => {
    it('uses accent background when on', () => {
      render(<Toggle on={true} onToggle={() => {}} label="Test" />)
      const toggle = screen.getByRole('switch')
      expect(toggle.style.background).toBe('var(--accent)')
    })

    it('uses muted background when off', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test" />)
      const toggle = screen.getByRole('switch')
      expect(toggle.style.background).toBe('var(--bg-white-15)')
    })

    it('has a knob (span child) element', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test" />)
      const toggle = screen.getByRole('switch')
      const knob = toggle.querySelector('span')
      expect(knob).not.toBeNull()
    })

    it('positions knob left when off', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test" />)
      const knob = screen.getByRole('switch').querySelector('span')!
      expect(knob.style.left).toBe('2px')
    })

    it('positions knob right when on', () => {
      render(<Toggle on={true} onToggle={() => {}} label="Test" />)
      const knob = screen.getByRole('switch').querySelector('span')!
      expect(knob.style.left).toBe('22px')
    })

    it('has fixed dimensions', () => {
      render(<Toggle on={false} onToggle={() => {}} label="Test" />)
      const toggle = screen.getByRole('switch')
      expect(toggle.style.width).toBe('44px')
      expect(toggle.style.height).toBe('24px')
    })
  })
})
