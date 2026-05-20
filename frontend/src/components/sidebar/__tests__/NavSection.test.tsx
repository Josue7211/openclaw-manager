import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NavSection from '../NavSection'

vi.mock('@/lib/unread-store', () => ({
  markRead: vi.fn(),
}))

describe('NavSection empty category drop targets', () => {
  it('routes header pointer down for empty categories', () => {
    const onCategoryPointerDown = vi.fn()

    render(
      <MemoryRouter>
        <NavSection
          label="Homelab"
          items={[]}
          pathname="/"
          collapsed={false}
          width={260}
          open={true}
          onToggle={() => {}}
          onHoverItem={() => {}}
          isDragging={false}
          categoryId="homelab"
          onCategoryPointerDown={onCategoryPointerDown}
          dragOverIdx={null}
          dragHref="/homelab"
        />
      </MemoryRouter>,
    )

    const button = screen.getByRole('button', { name: 'Homelab' })
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 })

    expect(onCategoryPointerDown).toHaveBeenCalledWith('homelab', expect.any(Object))
  })

  it('does not render a giant empty drop box for empty categories', () => {
    render(
      <MemoryRouter>
        <NavSection
          label="Homelab"
          items={[]}
          pathname="/"
          collapsed={false}
          width={260}
          open={true}
          onToggle={() => {}}
          onHoverItem={() => {}}
          isDragging={false}
          categoryId="homelab"
          dragOverIdx={0}
          dragHref="/media"
        />
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('empty-category-drop-homelab')).not.toBeInTheDocument()
  })
})
