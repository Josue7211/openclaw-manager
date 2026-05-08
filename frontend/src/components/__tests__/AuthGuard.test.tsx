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
  API_BASE_CHANGED_EVENT: 'backend-api-base-changed',
  AUTH_REQUIRED_EVENT: 'auth-required',
}))
vi.mock('@/lib/demo-data', () => ({
  isDemoMode: vi.fn(() => false),
}))
vi.mock('@/lib/preferences-sync', () => ({
  initPreferencesSync: vi.fn(),
  initHarnessRuntimeConfig: vi.fn(),
  setPreferencesSyncAuthenticated: vi.fn(),
}))
vi.mock('@/lib/generated-module-store', () => ({
  loadGeneratedModules: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import AuthGuard from '../AuthGuard'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { initPreferencesSync, initHarnessRuntimeConfig } from '@/lib/preferences-sync'
import { invoke } from '@tauri-apps/api/core'

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
    vi.mocked(initPreferencesSync).mockResolvedValue(undefined)
    vi.mocked(initHarnessRuntimeConfig).mockResolvedValue(undefined)
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: undefined,
    })
    localStorage.clear()
  })

  it('renders children when isDemoMode() returns true', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/setup/status') return { ok: false } as never
      return { authenticated: true } as never
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('keeps protected content hidden while demo mode is being validated', () => {
    vi.mocked(isDemoMode).mockReturnValue(true)
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))

    renderWithRouter()

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })

  it('clears demo mode and requires login when a real backend is reachable', async () => {
    localStorage.setItem('demo-mode', 'true')
    vi.mocked(isDemoMode).mockReturnValue(true)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/setup/status') return { ok: true } as never
      if (path === '/api/auth/session') return { authenticated: false } as never
      throw new Error(`unexpected path: ${path}`)
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(localStorage.getItem('demo-mode')).toBeNull()
  })

  it('renders children when api.get returns authenticated: true', async () => {
    vi.mocked(api.get).mockResolvedValue({ authenticated: true, user: { id: 'user-1', email: 'user@example.com' } })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
    expect(localStorage.getItem('setup-complete')).toBe('true')
    expect(localStorage.getItem('setup-account-id')).toBe('user-1')
  })

  it('forces setup flow when backend pairing is required but no device key exists', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    localStorage.setItem('setup-complete', 'true')
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/auth/session') return { authenticated: true } as never
      if (path === '/api/setup/status') return { pairing_required: true } as never
      throw new Error(`unexpected path: ${path}`)
    })
    vi.mocked(invoke).mockResolvedValue(null)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
    expect(localStorage.getItem('setup-complete')).toBeNull()
    expect(localStorage.getItem('setup-account-id')).toBeNull()
  })

  it('navigates to /login when api.get returns authenticated: false', async () => {
    vi.mocked(api.get).mockResolvedValue({ authenticated: false })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('locks the shell immediately when a protected API reports auth required', async () => {
    vi.mocked(api.get).mockResolvedValue({ authenticated: true, user: { id: 'user-1', email: 'user@example.com' } })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    window.dispatchEvent(new CustomEvent('auth-required'))

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

  it('clears demo mode and navigates to login when demo validation fails', async () => {
    localStorage.setItem('demo-mode', 'true')
    vi.mocked(isDemoMode).mockReturnValue(true)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/setup/status') throw new Error('Network error')
      throw new Error('Network error')
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(localStorage.getItem('demo-mode')).toBeNull()
  })

  it('does not contain devNoBackend bypass (regression guard)', () => {
    const source = readFileSync(
      resolve(__dirname, '../AuthGuard.tsx'),
      'utf-8',
    )
    expect(source).not.toContain('devNoBackend')
  })
})
