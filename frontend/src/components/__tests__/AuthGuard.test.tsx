/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')

// Mock modules before importing the component
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}))
vi.mock('@/lib/demo-data', () => ({
  isDemoMode: vi.fn(() => false),
}))
vi.mock('@/lib/preferences-sync', () => ({
  initPreferencesSync: vi.fn(),
}))

import AuthGuard from '../AuthGuard'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'

function renderWithRouter(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/"
          element={
            <AuthGuard>
              <div>Protected Content</div>
            </AuthGuard>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isDemoMode).mockReturnValue(false)
  })

  it('renders children when isDemoMode() returns true', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('renders children when api.get returns authenticated: true', async () => {
    vi.mocked(api.get).mockResolvedValue({ authenticated: true })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('navigates to /login when api.get returns authenticated: false', async () => {
    vi.mocked(api.get).mockResolvedValue({ authenticated: false })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('navigates to /login when api.get throws a network error (non-demo)', async () => {
    vi.mocked(isDemoMode).mockReturnValue(false)
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when api.get throws but isDemoMode() returns true (demo fallback)', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('does not contain devNoBackend bypass (regression guard)', () => {
    const source = readFileSync(
      resolve(__dirname, '../AuthGuard.tsx'),
      'utf-8',
    )
    expect(source).not.toContain('devNoBackend')
  })
})
