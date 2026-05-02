import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  API_BASE_CHANGED_EVENT: 'backend-api-base-changed',
  getApiBase: vi.fn(() => 'http://127.0.0.1:5000'),
}))

vi.mock('@/lib/tauri', () => ({
  openInBrowser: vi.fn(),
}))

vi.mock('@/lib/webauthn', () => ({
  isWebAuthnSupported: vi.fn(() => false),
  authenticateWebAuthnKey: vi.fn(),
}))

import LoginPage from '../Login'
import { api } from '@/lib/api'
import { openInBrowser } from '@/lib/tauri'

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(openInBrowser).mockResolvedValue(true)
  })

  it('shows a backend retry state when the session probe fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'))

    renderLogin()

    await waitFor(() => {
      expect(screen.getByText('Cannot reach the selected backend right now.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry Backend Check' })).toBeInTheDocument()
    })
  })

  it('shows a product error when OAuth start fails with a raw API status', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get)
      .mockResolvedValueOnce({ authenticated: false })
      .mockRejectedValueOnce(new Error('API 500'))

    renderLogin()

    await user.click(await screen.findByRole('button', { name: 'Continue with GitHub' }))

    await waitFor(() => {
      expect(screen.getByText('Could not start sign-in right now.')).toBeInTheDocument()
    })
  })

  it('shows the normalized MFA invalid-code message', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockResolvedValue({
      authenticated: true,
      factor_id: 'factor-123',
      available_mfa_methods: ['totp'],
    })
    vi.mocked(api.post)
      .mockResolvedValueOnce({ id: 'challenge-123' })
      .mockRejectedValueOnce(new Error('Invalid TOTP code entered'))

    renderLogin('/login?mfa=verify')

    const codeInput = await screen.findByLabelText('MFA verification code')
    await user.type(codeInput, '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      expect(screen.getByText('That verification code was not accepted. Try the latest code from your authenticator app.')).toBeInTheDocument()
    })
  })
})
