import { useState, useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, API_BASE_CHANGED_EVENT, AUTH_REQUIRED_EVENT } from '@/lib/api'
import {
  initHarnessRuntimeConfig,
  initPreferencesSync,
  setPreferencesSyncAuthenticated,
} from '@/lib/preferences-sync'
import { loadGeneratedModules } from '@/lib/generated-module-store'
import { deactivateDemoMode, markSetupCompleteForAccount } from '@/lib/wizard-store'
import { isDemoMode } from '@/lib/demo-data'
import { getAccountSyncStatus, hydrateAccountSync } from '@/lib/account-sync'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'mfa_required' | 'sync_locked'

interface SetupStatusResponse {
  ok?: boolean
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('loading')
  const location = useLocation()
  const syncInitRef = useRef(false)
  const syncHydrateRef = useRef(false)

  useEffect(() => {
    async function checkAuth() {
      try {
        if (isDemoMode()) {
          try {
            const setup = await api.get<SetupStatusResponse>('/api/setup/status')
            if (!setup?.ok) {
              setState('authenticated')
              return
            }
            deactivateDemoMode()
          } catch {
            deactivateDemoMode()
            setState('unauthenticated')
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
          syncInitRef.current = false
          syncHydrateRef.current = false
          setPreferencesSyncAuthenticated(false)
          setState('unauthenticated')
          return
        }

        if (res.mfa_required && !res.mfa_verified) {
          setPreferencesSyncAuthenticated(false)
          setState('mfa_required')
          return
        }
        if (res.mfa_enroll_required) {
          setPreferencesSyncAuthenticated(false)
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

        const sync = await getAccountSyncStatus().catch(() => null)
        if (sync?.has_synced_services) {
          markSetupCompleteForAccount(res.user?.id)
        } else if (!sync || !sync.setup_doctor_required) {
          markSetupCompleteForAccount(res.user?.id)
        }
        if (sync?.requires_unlock) {
          setPreferencesSyncAuthenticated(false)
          setState('sync_locked')
          return
        }
        if (sync?.ready && sync.has_cached_key) {
          if (!syncHydrateRef.current) {
            syncHydrateRef.current = true
            void hydrateAccountSync()
          }
        }
        setPreferencesSyncAuthenticated(true)
        setState('authenticated')

        if (!syncInitRef.current) {
          syncInitRef.current = true
          void initPreferencesSync()
            .then(() => Promise.all([
              initHarnessRuntimeConfig(),
              loadGeneratedModules(),
            ]))
        }
      } catch {
        setPreferencesSyncAuthenticated(false)
        setState('unauthenticated')
      }
    }

    void checkAuth()

    const onBackendChanged = () => {
      syncInitRef.current = false
      syncHydrateRef.current = false
      setPreferencesSyncAuthenticated(false)
      setState('loading')
      void checkAuth()
    }
    const onAuthRequired = () => {
      syncInitRef.current = false
      syncHydrateRef.current = false
      setPreferencesSyncAuthenticated(false)
      setState('unauthenticated')
    }

    window.addEventListener(API_BASE_CHANGED_EVENT, onBackendChanged)
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
    const onFocus = () => {
      void checkAuth()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkAuth()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const interval = setInterval(checkAuth, 60000)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener(API_BASE_CHANGED_EVENT, onBackendChanged)
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
    }
  }, [])

  if (state === 'loading') return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100vw',
      background: 'var(--bg-primary, var(--bg-base))',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
        <img src="/logo-128.png" alt="clawctrl" width={48} height={48} style={{ borderRadius: '12px' }} />
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
  if (state === 'sync_locked') {
    return <Navigate to={`/login?sync=unlock&next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}
