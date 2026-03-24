



import { useState, useEffect, useReducer } from 'react'
import { useSearchParams } from 'react-router-dom'
import { openInBrowser } from '@/lib/tauri'

import { api } from '@/lib/api'
import { viewReducer, initialViewState } from './login/shared'
import { MainView } from './login/MainView'
import { EmailForm } from './login/EmailForm'
import { MfaVerifyForm } from './login/MfaVerifyForm'
import { WaitingView } from './login/WaitingView'
import { MfaEnrollView } from './login/MfaEnrollView'

export default function LoginPage() {
  const [viewState, dispatch] = useReducer(viewReducer, initialViewState)
  const { view, mfaFactorId, mfaQr, mfaSecret, availableMethods } = viewState

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

  // On mount, ALWAYS check session — if logged in but MFA not verified, show MFA
  const mfaParam = searchParams.get('mfa')
  useEffect(() => {
    api.get<{
      authenticated: boolean
      mfa_required?: boolean
      mfa_enroll_required?: boolean
      mfa_verified?: boolean
      factor_id?: string
      available_mfa_methods?: Array<'totp' | 'webauthn'>
    }>('/api/auth/session')
      .then(res => {
        if (!res.authenticated) return
        // If MFA already verified, go straight to app
        if (res.mfa_verified) {
          window.location.href = next
          return
        }
        // MFA not verified — show appropriate screen
        if (res.factor_id) {
          dispatch({ type: 'SHOW_MFA', factorId: res.factor_id, availableMethods: res.available_mfa_methods ?? ['totp'] })
        } else if (res.mfa_enroll_required) {
          api.post<{ id: string; qr_code: string; secret: string }>('/api/auth/mfa/enroll')
            .then(data => {
              if (data?.id) {
                dispatch({ type: 'SHOW_MFA_ENROLL', factorId: data.id, qr: data.qr_code, secret: data.secret })
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [mfaParam])

  // Poll for OAuth completion — backend exchanges the code in the callback
  useEffect(() => {
    if (view !== 'waiting') return
    const interval = setInterval(async () => {
      try {
        const res = await api.get<{
          authenticated: boolean
          mfa_required?: boolean
          mfa_enroll_required?: boolean
          factor_id?: string
          available_mfa_methods?: Array<'totp' | 'webauthn'>
        }>('/api/auth/session')
        if (res.authenticated) {
          clearInterval(interval)

          // Check MFA status
          if (res.mfa_required && res.factor_id) {
            dispatch({ type: 'SHOW_MFA', factorId: res.factor_id, availableMethods: res.available_mfa_methods ?? ['totp'] })
            setLoading(false)
            return
          }
          if (res.mfa_enroll_required) {
            const enrollData = await api.post<{ id: string; qr_code: string; secret: string }>('/api/auth/mfa/enroll')
            if (enrollData?.id) {
              dispatch({ type: 'SHOW_MFA_ENROLL', factorId: enrollData.id, qr: enrollData.qr_code, secret: enrollData.secret })
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

    try {
      const redirectParam = !isTauriApp ? `?redirect_to=${encodeURIComponent(window.location.origin)}` : ''
      const data = await api.get<{ url: string }>(`/api/auth/oauth/${provider}${redirectParam}`)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth failed')
      setLoading(false)
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.post<{
        ok: boolean
        error?: string
        mfa_required?: boolean
        mfa_enroll_required?: boolean
        factor_id?: string
        available_mfa_methods?: Array<'totp' | 'webauthn'>
      }>('/api/auth/login', { email, password })

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      // Check MFA status
      if (result.mfa_required && result.factor_id) {
        dispatch({ type: 'SHOW_MFA', factorId: result.factor_id, availableMethods: result.available_mfa_methods ?? ['totp'] })
        setLoading(false)
        return
      }
      if (result.mfa_enroll_required) {
        const enrollData = await api.post<{ id: string; qr_code: string; secret: string }>('/api/auth/mfa/enroll')
        if (enrollData?.id) {
          dispatch({ type: 'SHOW_MFA_ENROLL', factorId: enrollData.id, qr: enrollData.qr_code, secret: enrollData.secret })
          setLoading(false)
          return
        }
      }

      window.location.href = next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const challenge = await api.post<{ id: string }>('/api/auth/mfa/challenge', {
        factor_id: mfaFactorId,
      })

      await api.post('/api/auth/mfa/verify', {
        factor_id: mfaFactorId,
        challenge_id: challenge.id,
        code: mfaCode,
      })

      window.location.href = next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA verification failed')
      setMfaCode('')
      setLoading(false)
    }
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
        background: 'radial-gradient(circle, var(--accent-a10) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-20%',
        right: '15%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, var(--blue-a04) 0%, transparent 70%)',
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
            alt="OpenClaw Manager"
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
            OpenClaw Manager
          </h1>
          <p style={{
            margin: '8px 0 0',
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {view === 'main' && 'Sign in to continue'}
            {view === 'email' && 'Sign in with email'}
            {view === 'mfa' && 'Verify your identity'}
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
            factorId={mfaFactorId}
            availableMethods={availableMethods}
            onMfaCodeChange={setMfaCode}
            onSubmit={handleMfa}
            onBack={async () => {
              await api.post('/api/auth/logout').catch(() => {})
              setMfaCode('')
              setError('')
              dispatch({ type: 'SHOW_MAIN' })
            }}
            onWebAuthnSuccess={() => {
              window.location.href = next
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
