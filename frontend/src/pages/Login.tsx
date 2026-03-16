


import { useState, useEffect, useReducer } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase as _supabase } from '@/lib/supabase/client'
import { openInBrowser } from '@/lib/tauri'

// Login page requires Supabase — not reachable in demo mode (AuthGuard skips auth)
const supabase = _supabase!

import { api } from '@/lib/api'
import { viewReducer, initialViewState } from './login/shared'
import { MainView } from './login/MainView'
import { EmailForm } from './login/EmailForm'
import { MfaVerifyForm } from './login/MfaVerifyForm'
import { WaitingView } from './login/WaitingView'
import { MfaEnrollView } from './login/MfaEnrollView'

export default function LoginPage() {
  const [viewState, dispatch] = useReducer(viewReducer, initialViewState)
  const { view, mfaFactorId, mfaQr, mfaSecret } = viewState

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const rawNext = searchParams.get('next') || '/'
  let next = '/'
  try {
    const resolved = new URL(rawNext, window.location.origin)
    // Only allow same-origin redirects
    if (resolved.origin === window.location.origin) {
      next = resolved.pathname + resolved.search
    }
  } catch {
    // Invalid URL — keep default '/'
  }

  // On mount, check if user needs MFA (from query param or session)
  const mfaParam = searchParams.get('mfa')
  useEffect(() => {
    if (mfaParam === 'verify') {
      // OAuth user with TOTP enrolled — find the factor and show verify view
      supabase.auth.mfa.listFactors().then(({ data }) => {
        const totp = data?.totp?.find(f => f.status === 'verified')
        if (totp) {
          dispatch({ type: 'SHOW_MFA', factorId: totp.id })
        }
      })
    } else if (mfaParam === 'enroll') {
      // OAuth user without TOTP — start enrollment
      supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Mission Control',
      }).then(({ data, error }) => {
        if (error || !data) return
        dispatch({ type: 'SHOW_MFA_ENROLL', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      })
    }
  }, [mfaParam])

  // Poll for Tauri OAuth code handoff — exchange happens here in the WebView
  // because the PKCE code_verifier is stored in the WebView's cookies.
  useEffect(() => {
    if (view !== 'waiting') return
    const interval = setInterval(async () => {
      try {
        const { code } = await api.get<{ code?: string }>(`/api/auth/tauri-session?t=${Date.now()}`)
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('[tauri-poll] exchange failed:', exchangeError.message)
            setError(exchangeError.message)
            dispatch({ type: 'SHOW_MAIN' })
            setLoading(false)
            return
          }
          // Check MFA
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
            const factors = await supabase.auth.mfa.listFactors()
            const totp = factors.data?.totp?.find(f => f.status === 'verified')
            if (totp) {
              dispatch({ type: 'SHOW_MFA', factorId: totp.id })
              setLoading(false)
              return
            }
          } else if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
            const { data: enrollData } = await supabase.auth.mfa.enroll({
              factorType: 'totp',
              friendlyName: 'Mission Control',
            })
            if (enrollData) {
              dispatch({ type: 'SHOW_MFA_ENROLL', factorId: enrollData.id, qr: enrollData.totp.qr_code, secret: enrollData.totp.secret })
              setLoading(false)
              return
            }
          }

          window.location.href = next
        }
      } catch { /* ignore fetch errors */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [view, next])

  const isTauriApp = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

  async function handleOAuth(provider: 'github' | 'google') {
    setError('')
    setLoading(true)

    let nonce: string | undefined
    let callbackUrl: string
    if (isTauriApp) {
      try {
        const res = await api.get<{ nonce: string }>('/api/auth/nonce')
        nonce = res.nonce
      } catch {
        // Fall through without nonce — backend will log a warning but allow it
      }
      callbackUrl = `http://127.0.0.1:3000/api/auth/callback`
    } else {
      callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
        skipBrowserRedirect: true,
        ...(nonce ? { queryParams: { state: nonce } } : {}),
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (data.url) {
      if (isTauriApp) {
        const opened = await openInBrowser(data.url)
        if (opened) {
          dispatch({ type: 'SHOW_WAITING' })
        } else {
          setError('Could not open browser. Please try again.')
          setLoading(false)
        }
      } else {
        window.location.href = data.url
      }
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Check MFA status
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
      const factors = await supabase.auth.mfa.listFactors()
      const totp = factors.data?.totp?.find(f => f.status === 'verified')
      if (totp) {
        dispatch({ type: 'SHOW_MFA', factorId: totp.id })
        setLoading(false)
        return
      }
    } else if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
      const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Mission Control',
      })
      if (!enrollErr && enrollData) {
        dispatch({ type: 'SHOW_MFA_ENROLL', factorId: enrollData.id, qr: enrollData.totp.qr_code, secret: enrollData.totp.secret })
        setLoading(false)
        return
      }
    }

    window.location.href = next
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: mfaFactorId,
    })

    if (challengeError) {
      setError(challengeError.message)
      setLoading(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code: mfaCode,
    })

    if (verifyError) {
      setError(verifyError.message)
      setMfaCode('')
      setLoading(false)
      return
    }

    window.location.href = next
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        top: '-30%',
        left: '20%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(167, 139, 250, 0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-20%',
        right: '15%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(129, 140, 248, 0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: '380px',
        padding: '24px 32px 40px',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        animation: 'fadeInScale 0.5s var(--ease-spring) both',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <img
            src="/logo-128.png"
            alt="Mission Control"
            width={64}
            height={64}
            style={{
              display: 'block',
              margin: '0 auto 14px',
              filter: 'drop-shadow(0 2px 8px var(--accent-a30))',
              animation: 'subtleFloat 3s ease-in-out infinite',
            }}
          />
          <h1 style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            fontFamily: "'Bitcount Prop Double', monospace",
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            transform: 'scaleY(1.3)',
          }}>
            Mission Control
          </h1>
          <p style={{
            margin: '8px 0 0',
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {view === 'main' && 'Sign in to continue'}
            {view === 'email' && 'Sign in with email'}
            {view === 'mfa' && 'Enter authenticator code'}
            {view === 'mfa-enroll' && 'Set up two-factor authentication'}
            {view === 'waiting' && 'Complete sign-in in your browser'}
          </p>
        </div>

        {error && (
          <div style={{
            fontSize: '12px',
            color: 'var(--red)',
            textAlign: 'center',
            padding: '8px 12px',
            background: 'var(--red-a08)',
            border: '1px solid var(--red-a15)',
            borderRadius: '8px',
            animation: 'fadeInUp 0.3s ease both',
          }}>
            {error}
          </div>
        )}

        {view === 'main' && (
          <MainView
            loading={loading}
            onOAuth={handleOAuth}
            onShowEmail={() => { dispatch({ type: 'SHOW_EMAIL' }); setError('') }}
          />
        )}

        {view === 'email' && (
          <EmailForm
            email={email}
            password={password}
            loading={loading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleEmailLogin}
            onBack={() => { dispatch({ type: 'SHOW_MAIN' }); setError('') }}
          />
        )}

        {view === 'mfa' && (
          <MfaVerifyForm
            mfaCode={mfaCode}
            loading={loading}
            onMfaCodeChange={setMfaCode}
            onSubmit={handleMfa}
            onBack={async () => {
              await supabase.auth.signOut()
              setMfaCode('')
              setError('')
              dispatch({ type: 'SHOW_MAIN' })
            }}
          />
        )}

        {view === 'waiting' && (
          <WaitingView
            onCancel={() => { dispatch({ type: 'SHOW_MAIN' }); setLoading(false) }}
          />
        )}

        {view === 'mfa-enroll' && (
          <MfaEnrollView
            mfaFactorId={mfaFactorId}
            mfaQr={mfaQr}
            mfaSecret={mfaSecret}
            next={next}
          />
        )}
      </div>
    </div>
  )
}
