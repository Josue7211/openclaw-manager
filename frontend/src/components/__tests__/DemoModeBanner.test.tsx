import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

import { DemoModeBanner, DemoBadge } from '../DemoModeBanner'

describe('DemoModeBanner', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  describe('rendering', () => {
    it('renders the banner text', () => {
      render(<DemoModeBanner />)
      expect(
        screen.getByText(/Demo Mode — showing sample data, no backend required/),
      ).toBeInTheDocument()
    })

    it('has role="status"', () => {
      render(<DemoModeBanner />)
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('renders the "Set up now" button', () => {
      render(<DemoModeBanner />)
      expect(screen.getByText('Set up now')).toBeInTheDocument()
    })

    it('renders an expand/collapse button', () => {
      render(<DemoModeBanner />)
      expect(screen.getByLabelText('Expand details')).toBeInTheDocument()
    })

    it('does not show detail text by default', () => {
      render(<DemoModeBanner />)
      expect(screen.queryByText(/VITE_SUPABASE_URL/)).not.toBeInTheDocument()
    })
  })

  describe('expand/collapse interaction', () => {
    it('shows detail text after clicking expand', () => {
      render(<DemoModeBanner />)
      fireEvent.click(screen.getByLabelText('Expand details'))
      expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
      expect(screen.getByText(/VITE_SUPABASE_ANON_KEY/)).toBeInTheDocument()
    })

    it('changes aria-label to "Collapse details" when expanded', () => {
      render(<DemoModeBanner />)
      fireEvent.click(screen.getByLabelText('Expand details'))
      expect(screen.getByLabelText('Collapse details')).toBeInTheDocument()
    })

    it('hides detail text after collapsing', () => {
      render(<DemoModeBanner />)
      fireEvent.click(screen.getByLabelText('Expand details'))
      expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
      fireEvent.click(screen.getByLabelText('Collapse details'))
      expect(screen.queryByText(/VITE_SUPABASE_URL/)).not.toBeInTheDocument()
    })

    it('mentions .env.local in expanded details', () => {
      render(<DemoModeBanner />)
      fireEvent.click(screen.getByLabelText('Expand details'))
      expect(screen.getByText('.env.local')).toBeInTheDocument()
    })
  })

  describe('"Set up now" navigation', () => {
    it('navigates to settings connections on click', () => {
      render(<DemoModeBanner />)
      fireEvent.click(screen.getByText('Set up now'))
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/settings?section=connections')
    })
  })
})

describe('DemoBadge', () => {
  it('renders "demo" text', () => {
    render(<DemoBadge />)
    expect(screen.getByText('demo')).toBeInTheDocument()
  })

  it('renders as an inline span', () => {
    render(<DemoBadge />)
    expect(screen.getByText('demo').tagName).toBe('SPAN')
  })
})
