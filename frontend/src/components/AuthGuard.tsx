import { useState, useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, API_BASE_CHANGED_EVENT } from '@/lib/api'
import { initOpenClawRuntimeConfig, initPreferencesSync } from '@/lib/preferences-sync'
import { deactivateDemoMode, markSetupCompleteForAccount } from '@/lib/wizard-store'
import { isDemoMode } from '@/lib/demo-data'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'mfa_required'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(isDemoMode() ? 'authenticated' : 'loading')
  const location = useLocation()
  const syncInitRef = useRef(false)

  useEffect(() => {
    async function checkAuth() {
      try {
        if (isDemoMode()) {
          try {
            const setup = await api.get<{ ok: boolean }>('/api/setup/status')
            if (!setup?.ok) {
              setState('authenticated')
              return
            }
            deactivateDemoMode()
          } catch {
            setState('authenticated')
            return
          }
        }

        const res = await api.get<{
          authenticated: boolean
          mfa_required?: boolean
          mfa_verified?: boolean
          mfa_enroll_required?: boolean
          user?: { id: string; email: string }
        }>('/api/auth/session')

        if (!res.authenticated) {
          setState('unauthenticated')
          return
        }

        if (res.mfa_required && !res.mfa_verified) {
          setState('mfa_required')
          return
        }
        if (res.mfa_enroll_required) {
          setState('mfa_required')
          return
        }

        if (window.__TAURI_INTERNALS__) {
          try {
            const [{ invoke }, setup] = await Promise.all([
              import('@tauri-apps/api/core'),
              api.get<{ pairing_required?: boolean }>('/api/setup/status'),
            ])
            if (setup?.pairing_required) {
              const deviceKey = await invoke<string | null>('get_secret', { key: 'backend.device-api-key' }).catch(() => null)
              if (!deviceKey?.trim()) {
                localStorage.removeItem('setup-complete')
                setState('authenticated')
                return
              }
            }
          } catch {
            // If setup probing fails, fall through to the regular authenticated state.
          }
        }

        markSetupCompleteForAccount(res.user?.id)
        setState('authenticated')

        if (!syncInitRef.current) {
          syncInitRef.current = true
          void initPreferencesSync().then(() => initOpenClawRuntimeConfig())
        }
      } catch {
        setState('unauthenticated')
      }
    }

    void checkAuth()

    const onBackendChanged = () => {
      syncInitRef.current = false
      setState('loading')
      void checkAuth()
    }

    window.addEventListener(API_BASE_CHANGED_EVENT, onBackendChanged)
    const interval = setInterval(checkAuth, 30000)
    return () => {
      clearInterval(interval)
      window.removeEventListener(API_BASE_CHANGED_EVENT, onBackendChanged)
    }
  }, [])

  if (state === 'loading') return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100vw',
      background: 'var(--bg-primary, var(--bg-base))',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
        <img src="/logo-128.png" alt="ClawControl" width={48} height={48} style={{ borderRadius: '12px' }} />
        <div style={{
          width: '24px', height: '24px',
          border: '2px solid var(--border, var(--border-hover))',
          borderTopColor: 'var(--accent, var(--accent))',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    </div>
  )
  if (state === 'unauthenticated') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (state === 'mfa_required') {
    // Login handles MFA verification after redirect.
    return <Navigate to={`/login?mfa=verify&next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}
