import { useState } from 'react'
import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'
import { supabase as _supabase } from '@/lib/supabase/client'

const supabase = _supabase!

interface MfaEnrollViewProps {
  mfaFactorId: string
  mfaQr: string | null
  mfaSecret: string | null
  next: string
}

export function MfaEnrollView({ mfaFactorId, mfaQr, mfaSecret, next }: MfaEnrollViewProps) {
  const [mfaCode, setMfaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      animation: 'fadeInUp 0.3s var(--ease-spring) both',
    }}>
      <div style={{
        padding: '10px 14px',
        background: 'rgba(251, 191, 36, 0.08)',
        border: '1px solid rgba(251, 191, 36, 0.2)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--warning)',
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
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(167, 139, 250, 0.3)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = (loading || mfaCode.length !== 6)
              ? 'var(--purple-a12)' : 'var(--accent)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          {loading ? 'Verifying...' : 'Verify & continue'}
        </button>
      </form>
    </div>
  )
}
