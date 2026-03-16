import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BackendErrorBanner } from '../BackendErrorBanner'

describe('BackendErrorBanner', () => {
  describe('rendering', () => {
    it('renders the default message when no label is provided', () => {
      render(<BackendErrorBanner />)
      expect(
        screen.getByText(/Backend unreachable/),
      ).toBeInTheDocument()
    })

    it('shows "showing cached data" suffix', () => {
      render(<BackendErrorBanner />)
      expect(
        screen.getByText(/showing cached data/),
      ).toBeInTheDocument()
    })

    it('renders a custom label when provided', () => {
      render(<BackendErrorBanner label="BlueBubbles unreachable" />)
      expect(
        screen.getByText(/BlueBubbles unreachable/),
      ).toBeInTheDocument()
    })

    it('still shows cached data suffix with custom label', () => {
      render(<BackendErrorBanner label="BlueBubbles unreachable" />)
      expect(
        screen.getByText(/showing cached data/),
      ).toBeInTheDocument()
    })

    it('does not show default message when custom label is provided', () => {
      render(<BackendErrorBanner label="OpenClaw unreachable" />)
      expect(
        screen.queryByText(/Backend unreachable/),
      ).not.toBeInTheDocument()
    })
  })

  describe('structure', () => {
    it('renders as a div element', () => {
      const { container } = render(<BackendErrorBanner />)
      const banner = container.firstElementChild
      expect(banner?.tagName).toBe('DIV')
    })

    it('contains an SVG icon (Wifi)', () => {
      const { container } = render(<BackendErrorBanner />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })
})
