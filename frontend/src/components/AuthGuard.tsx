import { useState, useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { initPreferencesSync } from '@/lib/preferences-sync'
import { isDemoMode } from '@/lib/demo-data'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(isDemoMode() ? 'authenticated' : 'loading')
  const location = useLocation()
  const syncInitRef = useRef(false)

  useEffect(() => {
    // In demo mode, skip auth entirely
    if (isDemoMode() || !supabase) {
      setState('authenticated')
      return
    }

    async function checkAuth() {
      const { data: { session } } = await supabase!.auth.getSession()
      if (!session) {
        setState('unauthenticated')
        return
      }

      // Check if MFA is required but not yet verified
      const { data: aal } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        // Has TOTP enrolled but hasn't verified — sign out the partial session
        await supabase!.auth.signOut()
        setState('unauthenticated')
        return
      }

      setState('authenticated')

      // Sync preferences from Supabase after auth is confirmed
      if (!syncInitRef.current) {
        syncInitRef.current = true
        initPreferencesSync()
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase!.auth.onAuthStateChange(() => {
      checkAuth()
    })

    return () => subscription.unsubscribe()
  }, [])

  if (state === 'loading') return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100vw',
      background: 'var(--bg-primary, #0c0d11)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
        <img src="/logo-128.png" alt="Mission Control" width={48} height={48} style={{ borderRadius: '12px' }} />
        <div style={{
          width: '24px', height: '24px',
          border: '2px solid var(--border, var(--border-hover))',
          borderTopColor: 'var(--accent, #a78bfa)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    </div>
  )
  if (state === 'unauthenticated') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}
