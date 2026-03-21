import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImageGallery from '../ImageGallery'

// Mock Lightbox since it uses createPortal
vi.mock('@/components/Lightbox', () => ({
  __esModule: true,
  default: ({ data, onClose }: { data: { src: string }; onClose: () => void }) => (
    <div data-testid="lightbox" onClick={onClose}>
      <img src={data.src} alt="lightbox" />
    </div>
  ),
}))

const baseProps = {
  widgetId: 'test-gallery',
  isEditMode: false,
  size: { w: 4, h: 3 },
}

const sampleImages = [
  { src: 'https://example.com/a.jpg', alt: 'Photo A' },
  { src: 'https://example.com/b.jpg', alt: 'Photo B' },
  { src: 'https://example.com/c.jpg' },
]

describe('ImageGallery', () => {
  it('renders img elements from config.images array', () => {
    render(<ImageGallery {...baseProps} config={{ images: sampleImages }} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs.length).toBe(3)
  })

  it('shows EmptyState when images is empty', () => {
    render(<ImageGallery {...baseProps} config={{ images: [] }} />)
    expect(screen.getByText('No images')).toBeTruthy()
  })

  it('shows EmptyState when images is missing', () => {
    render(<ImageGallery {...baseProps} config={{}} />)
    expect(screen.getByText('No images')).toBeTruthy()
  })

  it('grid has correct column count from config', () => {
    const { container } = render(
      <ImageGallery {...baseProps} config={{ images: sampleImages, columns: 4 }} />,
    )
    const grid = container.firstElementChild as HTMLElement
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)')
  })

  it('clicking image opens lightbox', async () => {
    render(<ImageGallery {...baseProps} config={{ images: sampleImages }} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    await waitFor(() => {
      expect(screen.getByTestId('lightbox')).toBeTruthy()
    })
  })

  it('images have alt text', () => {
    render(<ImageGallery {...baseProps} config={{ images: sampleImages }} />)
    expect(screen.getByAltText('Photo A')).toBeTruthy()
    expect(screen.getByAltText('Photo B')).toBeTruthy()
    expect(screen.getByAltText('Gallery image')).toBeTruthy()
  })

  it('image buttons are accessible (button element)', () => {
    render(<ImageGallery {...baseProps} config={{ images: sampleImages }} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(3)
    expect(buttons[0].tagName).toBe('BUTTON')
  })
})
