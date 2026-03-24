import { useState, useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from '@/lib/api'
import { initPreferencesSync } from '@/lib/preferences-sync'
import { isDemoMode } from '@/lib/demo-data'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'mfa_required'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(isDemoMode() ? 'authenticated' : 'loading')
  const location = useLocation()
  const syncInitRef = useRef(false)

  useEffect(() => {
    // In demo mode, skip auth entirely
    if (isDemoMode()) {
      setState('authenticated')
      return
    }

    async function checkAuth() {
      try {
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

        // Hard gate: MFA must be verified before ANY access
        if (res.mfa_required && !res.mfa_verified) {
          setState('mfa_required')
          return
        }
        if (res.mfa_enroll_required) {
          setState('mfa_required')
          return
        }

        setState('authenticated')

        if (!syncInitRef.current) {
          syncInitRef.current = true
          initPreferencesSync()
        }
      } catch {
        // Network error: backend unreachable. In demo mode, allow access.
        // Otherwise, redirect to login page.
        if (isDemoMode()) {
          setState('authenticated')
          return
        }
        setState('unauthenticated')
      }
    }

    checkAuth()
    const interval = setInterval(checkAuth, 30000)
    return () => clearInterval(interval)
  }, [])

  if (state === 'loading') return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100vw',
      background: 'var(--bg-primary, var(--bg-base))',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
        <img src="/logo-128.png" alt="OpenClaw Manager" width={48} height={48} style={{ borderRadius: '12px' }} />
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
    // Redirect to login with MFA flag — login page handles MFA verification
    return <Navigate to={`/login?mfa=verify&next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}
