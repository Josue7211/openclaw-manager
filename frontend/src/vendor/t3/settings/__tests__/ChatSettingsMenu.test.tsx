import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatSettingsMenu from '../ChatSettingsMenu'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('T3 copied ChatSettingsMenu adapter', () => {
  beforeEach(() => {
    navigate.mockClear()
  })

  it('exposes Settings, Usage, Providers, and Codex LB shortcuts as a popover', () => {
    render(
      <MemoryRouter>
        <ChatSettingsMenu />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }))

    expect(screen.getByRole('menu', { name: 'Settings shortcuts' })).toHaveAttribute('data-t3-settings-account-menu')
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Usage remaining' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Providers' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Codex LB' })).toBeInTheDocument()
  })

  it('navigates through the copied settings menu instead of inline Chat.tsx handlers', () => {
    render(
      <MemoryRouter>
        <ChatSettingsMenu />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Providers' }))

    expect(navigate).toHaveBeenCalledWith('/settings?section=providers')
    expect(screen.queryByRole('menu', { name: 'Settings shortcuts' })).not.toBeInTheDocument()
  })
})
