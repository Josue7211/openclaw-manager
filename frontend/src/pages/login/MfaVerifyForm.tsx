import { useState } from 'react'
import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'
import type { MfaMethod } from './shared'
import { isWebAuthnSupported, authenticateWebAuthnKey } from '@/lib/webauthn'
import type { WebAuthnRequestOptions } from '@/lib/webauthn'
import { api } from '@/lib/api'

interface MfaVerifyFormProps {
  mfaCode: string
  loading: boolean
  factorId: string
  availableMethods: MfaMethod[]
  onMfaCodeChange: (val: string) => void
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
  /** Called when WebAuthn verification succeeds */
  onWebAuthnSuccess: () => void
}

export function MfaVerifyForm({
  mfaCode, loading, factorId, availableMethods,
  onMfaCodeChange, onSubmit, onBack, onWebAuthnSuccess,
}: MfaVerifyFormProps) {
  const hasTotp = availableMethods.includes('totp')
  const hasWebAuthn = availableMethods.includes('webauthn') && isWebAuthnSupported()
  const hasBoth = hasTotp && hasWebAuthn

  // Default to webauthn if available, otherwise totp
  const [activeMethod, setActiveMethod] = useState<'totp' | 'webauthn'>(
    hasWebAuthn ? 'webauthn' : 'totp',
  )
  const [webAuthnLoading, setWebAuthnLoading] = useState(false)
  const [webAuthnError, setWebAuthnError] = useState('')

  async function handleWebAuthn() {
    setWebAuthnError('')
    setWebAuthnLoading(true)

    try {
      // Get challenge options from the server
      const options = await api.post<WebAuthnRequestOptions>('/api/auth/mfa/challenge', {
        factor_id: factorId,
      })

      // Prompt the user to tap their hardware key
      const assertion = await authenticateWebAuthnKey(options)

      // Send the assertion to the server for verification
      await api.post('/api/auth/mfa/verify', {
        factor_id: factorId,
        credential: assertion,
      })

      onWebAuthnSuccess()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setWebAuthnError('Authentication was cancelled or timed out')
      } else {
        setWebAuthnError(err instanceof Error ? err.message : 'Hardware key verification failed')
      }
      setWebAuthnLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      animation: 'fadeInUp 0.3s var(--ease-spring) both',
    }}>
      {/* Method toggle — only shown when both TOTP and WebAuthn are available */}
      {hasBoth && (
        <div style={{
          display: 'flex',
          background: 'var(--bg-white-03)',
          borderRadius: '10px',
          padding: '3px',
          border: '1px solid var(--border)',
        }}>
          <button
            type="button"
            onClick={() => setActiveMethod('webauthn')}
            aria-label="Use hardware key"
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '12px',
              fontWeight: activeMethod === 'webauthn' ? 600 : 400,
              background: activeMethod === 'webauthn' ? 'var(--accent-a15)' : 'transparent',
              color: activeMethod === 'webauthn' ? 'var(--accent)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s var(--ease-spring)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 10-4-4L2 18z" />
              <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
            </svg>
            Hardware key
          </button>
          <button
            type="button"
            onClick={() => setActiveMethod('totp')}
            aria-label="Use authenticator app"
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '12px',
              fontWeight: activeMethod === 'totp' ? 600 : 400,
              background: activeMethod === 'totp' ? 'var(--accent-a15)' : 'transparent',
              color: activeMethod === 'totp' ? 'var(--accent)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s var(--ease-spring)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Authenticator
          </button>
        </div>
      )}

      {/* WebAuthn verification */}
      {activeMethod === 'webauthn' && hasWebAuthn && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{
            textAlign: 'center',
            padding: '8px 0',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'var(--accent-a10)',
              border: '1px solid var(--accent-a20)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 8px',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 10-4-4L2 18z" />
                <circle cx="16.5" cy="7.5" r=".5" fill="var(--accent)" />
              </svg>
            </div>
            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              margin: 0,
            }}>
              {webAuthnLoading
                ? 'Waiting for your security key...'
                : 'Verify your identity with a hardware security key'}
            </p>
          </div>

          {webAuthnError && (
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
              {webAuthnError}
            </div>
          )}

          <button
            type="button"
            onClick={handleWebAuthn}
            disabled={webAuthnLoading}
            aria-label="Authenticate with hardware security key"
            style={webAuthnLoading ? disabledBtnStyle : primaryBtnStyle}
            onMouseEnter={e => {
              if (!webAuthnLoading) {
                e.currentTarget.style.background = 'var(--accent-bright)'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 20px var(--accent-a30)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = webAuthnLoading
                ? 'var(--purple-a12)' : 'var(--accent)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {webAuthnLoading ? 'Tap your key...' : 'Use security key'}
          </button>
        </div>
      )}

      {/* TOTP verification (existing flow) */}
      {activeMethod === 'totp' && (
        <form onSubmit={onSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{
            textAlign: 'center',
            padding: '8px 0',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'var(--purple-a10)',
              border: '1px solid var(--purple-a20)',
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
            onChange={e => onMfaCodeChange(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoFocus
            autoComplete="one-time-code"
            aria-label="MFA verification code"
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
                e.currentTarget.style.boxShadow = '0 4px 20px var(--accent-a30)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = (loading || mfaCode.length !== 6)
                ? 'var(--purple-a12)' : 'var(--accent)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="hover-text-secondary"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: '12px',
          cursor: 'pointer',
          padding: '4px',
          transition: 'all 0.15s',
        }}
      >
        Back to all sign-in options
      </button>
    </div>
  )
}
