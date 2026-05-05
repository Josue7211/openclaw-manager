



import { useState, useEffect, useReducer } from 'react'
import { useSearchParams } from 'react-router-dom'
import { openInBrowser } from '@/lib/tauri'

import { api, CONFIGURED_BACKEND_BASE_CHANGED_EVENT, getConfiguredBackendBase } from '@/lib/api'
import { viewReducer, initialViewState } from './login/shared'
import { MainView } from './login/MainView'
import { EmailForm } from './login/EmailForm'
import { MfaVerifyForm } from './login/MfaVerifyForm'
import { WaitingView } from './login/WaitingView'
import { MfaEnrollView } from './login/MfaEnrollView'
import { SyncUnlockView } from './login/SyncUnlockView'
import {
  claimTrustedDeviceHandoff,
  getAccountSyncStatus,
  hydrateAccountSync,
  requestTrustedDeviceHandoff,
  unlockAccountSync,
  unlockWithRecoveryKey,
} from '@/lib/account-sync'
import { markSetupCompleteForAccount } from '@/lib/wizard-store'

function formatLoginError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message.trim() : ''
  if (!message) return fallback
  if (message === 'Invalid TOTP code entered') return 'That verification code was not accepted. Try the latest code from your authenticator app.'
  if (message.startsWith('API ')) return fallback
  return message
}

export default function LoginPage() {
  const isTauriApp = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
  const [viewState, dispatch] = useReducer(viewReducer, initialViewState)
  const { view, mfaFactorId, mfaQr, mfaSecret, availableMethods } = viewState

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [syncPassword, setSyncPassword] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [handoffRequestId, setHandoffRequestId] = useState('')
  const [handoffCode, setHandoffCode] = useState('')
  const [handoffStatus, setHandoffStatus] = useState('')
  const [handoffLoading, setHandoffLoading] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionProbeFailed, setSessionProbeFailed] = useState(false)
  const [backendBase, setBackendBase] = useState(getConfiguredBackendBase())
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

  async function finishAuthenticatedSession() {
    try {
      const sync = await getAccountSyncStatus()
      if (sync.has_synced_services) {
        markSetupCompleteForAccount()
      }
      if (sync.requires_unlock) {
        dispatch({ type: 'SHOW_SYNC_UNLOCK' })
        setLoading(false)
        return
      }
      if (sync.ready && sync.has_cached_key) {
        await hydrateAccountSync().catch(() => sync)
      }
    } catch {
      // Auth already succeeded; do not strand the user on a transient sync probe.
    }
    window.location.href = next
  }

  async function checkSession() {
    try {
      const res = await api.get<{
        authenticated: boolean
        mfa_required?: boolean
        mfa_enroll_required?: boolean
        mfa_verified?: boolean
        factor_id?: string
        available_mfa_methods?: Array<'totp' | 'webauthn'>
      }>('/api/auth/session')

      setSessionProbeFailed(false)

      if (!res.authenticated) return
      if (res.mfa_verified) {
        await finishAuthenticatedSession()
        return
      }
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
    } catch {
      setSessionProbeFailed(true)
    }
  }

  // On mount, ALWAYS check session — if logged in but MFA not verified, show MFA
  const mfaParam = searchParams.get('mfa')
  useEffect(() => {
    void checkSession()
  }, [mfaParam, next])

  useEffect(() => {
    const onBackendChanged = () => {
      setBackendBase(getConfiguredBackendBase())
      setSessionProbeFailed(false)
      setError('')
      void checkSession()
    }

    window.addEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
    return () => window.removeEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
  }, [next])

  useEffect(() => {
    if (!sessionProbeFailed) return
    const timeout = setTimeout(() => {
      void checkSession()
    }, 5000)
    return () => clearTimeout(timeout)
  }, [sessionProbeFailed, next])

  useEffect(() => {
    if (view !== 'sync-unlock' || !handoffRequestId) return

    const interval = setInterval(async () => {
      try {
        const result = await claimTrustedDeviceHandoff(handoffRequestId)
        if (result.claimed && result.sync?.ready) {
          markSetupCompleteForAccount()
          window.location.href = next
          return
        }
        if (result.status === 'pending') {
          setHandoffStatus('Waiting for approval from an unlocked device.')
        } else if (result.status === 'approved') {
          setHandoffStatus('Approval received. Unlocking this Mac...')
        } else {
          setHandoffStatus(`Request is ${result.status}.`)
        }
      } catch {
        setHandoffStatus('Still waiting for approval.')
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [view, handoffRequestId, next])

  // Poll for OAuth completion — backend exchanges the code in the callback
  useEffect(() => {
    if (view !== 'waiting') return
    const interval = setInterval(async () => {
      try {
        if (isTauriApp) {
          const tauriSession = await api.get<{ code: string | null; exchange_error?: string | null }>('/api/auth/tauri-session')
          if (tauriSession.exchange_error) {
            clearInterval(interval)
            setError(`Desktop sign-in failed: ${tauriSession.exchange_error}`)
            dispatch({ type: 'SHOW_MAIN' })
            setLoading(false)
            return
          }
          if (tauriSession.code) {
            await new Promise(resolve => setTimeout(resolve, 150))
          }
        }
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

          await finishAuthenticatedSession()
        }
      } catch { /* ignore fetch errors */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [view, next, isTauriApp])

  async function handleOAuth(provider: 'github' | 'google') {
    setError('')
    setLoading(true)

    try {
      const redirectParam = !isTauriApp ? `?redirect_to=${encodeURIComponent(window.location.origin)}` : ''
      const data = await api.get<{ url: string }>(`/api/auth/oauth/${provider}${redirectParam}`)
      setSessionProbeFailed(false)
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
      setError(formatLoginError(err, 'Could not start sign-in right now.'))
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
      setSessionProbeFailed(false)

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

      await finishAuthenticatedSession()
    } catch (err) {
      setError(formatLoginError(err, 'Sign-in failed. Check your details and try again.'))
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

      await finishAuthenticatedSession()
    } catch (err) {
      setError(formatLoginError(err, 'Could not verify that code right now.'))
      setMfaCode('')
      setLoading(false)
    }
  }

  async function handleSyncUnlock(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const sync = await unlockAccountSync(syncPassword)
      if (sync.ready) {
        markSetupCompleteForAccount()
        window.location.href = next
        return
      }
      setError('Synced services are still locked on this Mac.')
      setLoading(false)
    } catch (err) {
      setError(formatLoginError(err, 'Could not unlock synced services.'))
      setSyncPassword('')
      setLoading(false)
    }
  }

  async function handleRecoveryUnlock(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await unlockWithRecoveryKey(recoveryKey)
      if (result.sync.ready) {
        markSetupCompleteForAccount()
        window.location.href = next
        return
      }
      setError('Recovery key unlocked, but synced services are still unavailable.')
      setLoading(false)
    } catch (err) {
      setError(formatLoginError(err, 'Could not unlock with that recovery key.'))
      setRecoveryKey('')
      setLoading(false)
    }
  }

  async function handleHandoffRequest() {
    setError('')
    setHandoffLoading(true)
    setHandoffStatus('')

    try {
      const request = await requestTrustedDeviceHandoff()
      setHandoffRequestId(request.request_id)
      setHandoffCode(request.code)
      setHandoffStatus('Waiting for approval from an unlocked device.')
    } catch (err) {
      setError(formatLoginError(err, 'Could not create a trusted-device request.'))
    } finally {
      setHandoffLoading(false)
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
            alt="ClawControl"
            width={64}
            height={64}
            style={{
              display: 'block',
              margin: '0 auto 14px',
              filter: 'drop-shadow(0 2px 8px var(--accent-a30))',
              animation: 'subtleFloat 3s ease-in-out infinite',
            }}
          />
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: '12px',
            maxWidth: '100%',
          }}>
            <span>Backend</span>
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {backendBase}
            </span>
          </div>
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
            ClawControl
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
            {view === 'sync-unlock' && 'Unlock synced services'}
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

        {sessionProbeFailed && !error && (
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            padding: '10px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <span>Cannot reach the selected backend right now.</span>
            <button
              type="button"
              onClick={() => { void checkSession() }}
              style={{
                alignSelf: 'center',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Retry Backend Check
            </button>
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
              void finishAuthenticatedSession()
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

        {view === 'sync-unlock' && (
          <SyncUnlockView
            password={syncPassword}
            recoveryKey={recoveryKey}
            loading={loading}
            handoffCode={handoffCode}
            handoffLoading={handoffLoading}
            handoffStatus={handoffStatus}
            onPasswordChange={setSyncPassword}
            onRecoveryKeyChange={setRecoveryKey}
            onSubmit={handleSyncUnlock}
            onRecoverySubmit={handleRecoveryUnlock}
            onRequestHandoff={handleHandoffRequest}
            onSignOut={async () => {
              await api.post('/api/auth/logout').catch(() => {})
              setSyncPassword('')
              setRecoveryKey('')
              setHandoffRequestId('')
              setHandoffCode('')
              setHandoffStatus('')
              setError('')
              dispatch({ type: 'SHOW_MAIN' })
              setLoading(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
