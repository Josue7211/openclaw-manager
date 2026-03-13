

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createAuthClient } from '@/lib/supabase/client'
import { openInBrowser } from '@/lib/tauri'

import { api } from '@/lib/api'

type View = 'main' | 'email' | 'mfa' | 'mfa-enroll' | 'waiting'

export default function LoginPage() {
  const [view, setView] = useState<View>('main')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const rawNext = searchParams.get('next') || '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  const supabase = createAuthClient()

  // On mount, check if user needs MFA (from query param or session)
  const mfaParam = searchParams.get('mfa')
  useEffect(() => {
    if (mfaParam === 'verify') {
      // OAuth user with TOTP enrolled — find the factor and show verify view
      supabase.auth.mfa.listFactors().then(({ data }) => {
        const totp = data?.totp?.find(f => f.status === 'verified')
        if (totp) {
          setMfaFactorId(totp.id)
          setView('mfa')
        }
      })
    } else if (mfaParam === 'enroll') {
      // OAuth user without TOTP — start enrollment
      supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Mission Control',
      }).then(({ data, error }) => {
        if (error || !data) return
        setMfaFactorId(data.id)
        setMfaQr(data.totp.qr_code)
        setMfaSecret(data.totp.secret)
        setView('mfa-enroll')
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
            setView('main')
            setLoading(false)
            return
          }
          // Check MFA
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
            const factors = await supabase.auth.mfa.listFactors()
            const totp = factors.data?.totp?.find(f => f.status === 'verified')
            if (totp) {
              setMfaFactorId(totp.id)
              setLoading(false)
              setView('mfa')
              return
            }
          } else if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
            const { data: enrollData } = await supabase.auth.mfa.enroll({
              factorType: 'totp',
              friendlyName: 'Mission Control',
            })
            if (enrollData) {
              setMfaFactorId(enrollData.id)
              setMfaQr(enrollData.totp.qr_code)
              setMfaSecret(enrollData.totp.secret)
              setLoading(false)
              setView('mfa-enroll')
              return
            }
          }

          window.location.href = next
        }
      } catch { /* ignore fetch errors */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [view])

  const isTauriApp = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

  async function handleOAuth(provider: 'github' | 'google') {
    setError('')
    setLoading(true)

    // Build redirect URL — add tauri=1 flag so the callback stores the code
    // for the WebView to pick up (instead of exchanging server-side).
    const callbackUrl = isTauriApp
      ? `${window.location.origin}/auth/callback?tauri=1&next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
        skipBrowserRedirect: true,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (data.url) {
      if (isTauriApp) {
        // Open in system browser, then poll for tokens
        const opened = await openInBrowser(data.url)
        if (opened) {
          setView('waiting')
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
      // Has TOTP, needs to verify
      const factors = await supabase.auth.mfa.listFactors()
      const totp = factors.data?.totp?.find(f => f.status === 'verified')
      if (totp) {
        setMfaFactorId(totp.id)
        setView('mfa')
        setLoading(false)
        return
      }
    } else if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
      // No TOTP enrolled — start enrollment here
      const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Mission Control',
      })
      if (!enrollErr && enrollData) {
        setMfaFactorId(enrollData.id)
        setMfaQr(enrollData.totp.qr_code)
        setMfaSecret(enrollData.totp.secret)
        setView('mfa-enroll')
        setLoading(false)
        return
      }
    }

    // Success — redirect
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

  // Shared styles
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', monospace",
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
    boxSizing: 'border-box',
  }

  const primaryBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px',
    fontSize: '13px',
    fontWeight: 600,
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
  }

  const disabledBtnStyle: React.CSSProperties = {
    ...primaryBtnStyle,
    background: 'rgba(167, 139, 250, 0.12)',
    color: 'var(--text-muted)',
    cursor: 'not-allowed',
  }

  const oauthBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px',
    fontSize: '13px',
    fontWeight: 500,
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
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
        padding: '40px 32px',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        animation: 'fadeInScale 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '32px',
            marginBottom: '12px',
            filter: 'drop-shadow(0 2px 8px rgba(167, 139, 250, 0.2))',
            animation: 'subtleFloat 3s ease-in-out infinite',
          }}>
            🦬
          </div>
          <h1 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
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
            background: 'rgba(248, 113, 113, 0.08)',
            border: '1px solid rgba(248, 113, 113, 0.15)',
            borderRadius: '8px',
            animation: 'fadeInUp 0.3s ease both',
          }}>
            {error}
          </div>
        )}

        {/* ── Main view: OAuth + email option ── */}
        {view === 'main' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            animation: 'fadeInUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both',
          }}>
            <button
              onClick={() => handleOAuth('github')}
              disabled={loading}
              style={oauthBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.borderColor = 'var(--border-hover)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>

            <button
              onClick={() => handleOAuth('google')}
              disabled={loading}
              style={oauthBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.borderColor = 'var(--border-hover)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.42l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              margin: '4px 0',
            }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}>
                or
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            <button
              onClick={() => { setView('email'); setError('') }}
              style={{
                ...oauthBtnStyle,
                color: 'var(--text-secondary)',
                fontSize: '12px',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.borderColor = 'var(--border-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
              Sign in with email
            </button>
          </div>
        )}

        {/* ── Email + password view ── */}
        {view === 'email' && (
          <form onSubmit={handleEmailLogin} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'fadeInUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              autoComplete="email"
              style={inputStyle}
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={loading || !email || !password ? disabledBtnStyle : primaryBtnStyle}
              onMouseEnter={e => {
                if (!loading && email && password) {
                  e.currentTarget.style.background = 'var(--accent-bright)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(167, 139, 250, 0.3)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = (loading || !email || !password)
                  ? 'rgba(167, 139, 250, 0.12)' : 'var(--accent)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => { setView('main'); setError('') }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              Back to all sign-in options
            </button>
          </form>
        )}

        {/* ── MFA view ── */}
        {view === 'mfa' && (
          <form onSubmit={handleMfa} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'fadeInUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}>
            <div style={{
              textAlign: 'center',
              padding: '8px 0',
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'rgba(167, 139, 250, 0.1)',
                border: '1px solid rgba(167, 139, 250, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 8px',
                fontSize: '22px',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <p style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                margin: 0,
              }}>
                Open your authenticator app and enter the 6-digit code
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              autoComplete="one-time-code"
              style={{
                ...inputStyle,
                textAlign: 'center',
                fontSize: '20px',
                letterSpacing: '0.3em',
                padding: '14px',
              }}
            />
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              style={loading || mfaCode.length !== 6 ? disabledBtnStyle : primaryBtnStyle}
              onMouseEnter={e => {
                if (!loading && mfaCode.length === 6) {
                  e.currentTarget.style.background = 'var(--accent-bright)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(167, 139, 250, 0.3)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = (loading || mfaCode.length !== 6)
                  ? 'rgba(167, 139, 250, 0.12)' : 'var(--accent)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}

        {/* ── Waiting for Tauri OAuth ── */}
        {view === 'waiting' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 0',
            animation: 'fadeInUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              margin: 0,
              textAlign: 'center',
            }}>
              Waiting for you to authorize in the browser...
            </p>
            <button
              onClick={() => { setView('main'); setLoading(false) }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── MFA enrollment view ── */}
        {view === 'mfa-enroll' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            animation: 'fadeInUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}>
            <div style={{
              padding: '10px 14px',
              background: 'rgba(251, 191, 36, 0.08)',
              border: '1px solid rgba(251, 191, 36, 0.2)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#fbbf24',
              textAlign: 'center',
            }}>
              Two-factor authentication is required to continue
            </div>

            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              margin: 0,
              textAlign: 'center',
            }}>
              Scan this QR code with your authenticator app
            </p>

            {mfaQr && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '16px',
                background: '#fff',
                borderRadius: '12px',
                width: 'fit-content',
                margin: '0 auto',
              }}>
                <img src={mfaQr} alt="TOTP QR code" width={180} height={180} />
              </div>
            )}

            {mfaSecret && (
              <div style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontFamily: "'JetBrains Mono', monospace",
                textAlign: 'center',
              }}>
                Manual key: <span style={{ color: 'var(--text-secondary)', userSelect: 'all' }}>{mfaSecret}</span>
              </div>
            )}

            <form onSubmit={async (e) => {
              e.preventDefault()
              setError('')
              setLoading(true)

              const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
                factorId: mfaFactorId,
              })
              if (challengeErr) {
                setError(challengeErr.message)
                setLoading(false)
                return
              }

              const { error: verifyErr } = await supabase.auth.mfa.verify({
                factorId: mfaFactorId,
                challengeId: challenge.id,
                code: mfaCode,
              })
              if (verifyErr) {
                setError(verifyErr.message)
                setMfaCode('')
                setLoading(false)
                return
              }

              window.location.href = next
            }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                autoComplete="one-time-code"
                style={{
                  ...inputStyle,
                  textAlign: 'center',
                  fontSize: '20px',
                  letterSpacing: '0.3em',
                  padding: '14px',
                }}
              />
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                style={loading || mfaCode.length !== 6 ? disabledBtnStyle : primaryBtnStyle}
                onMouseEnter={e => {
                  if (!loading && mfaCode.length === 6) {
                    e.currentTarget.style.background = 'var(--accent-bright)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(167, 139, 250, 0.3)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = (loading || mfaCode.length !== 6)
                    ? 'rgba(167, 139, 250, 0.12)' : 'var(--accent)'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {loading ? 'Verifying...' : 'Verify & continue'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
