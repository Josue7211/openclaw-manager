

import { Settings, Bell, Shield, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createAuthClient } from '@/lib/supabase/client'
import { useQuery, useMutation } from '@tanstack/react-query'

import { API_BASE } from '@/lib/api'

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '20px 24px',
  marginBottom: '16px',
}

const label: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '12px',
}

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '13px',
  color: 'var(--text-primary)',
}

const rowLast: React.CSSProperties = { ...row, borderBottom: 'none' }

const val: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
  fontSize: '12px',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '12px',
  fontFamily: 'monospace',
  color: 'var(--text-primary)',
  width: '260px',
  outline: 'none',
}

const btnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 14px',
  fontSize: '12px',
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'monospace',
}

const btnSecondary: React.CSSProperties = {
  ...btnStyle,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  marginRight: '8px',
}

interface Pref {
  key: string
  value: string
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const setupMfaRequired = searchParams.get('setup_mfa') === '1'
  const [ntfyUrl, setNtfyUrl] = useState('')
  const [ntfyTopic, setNtfyTopic] = useState('mission-control')
  const [ntfyStatus, setNtfyStatus] = useState<string | null>(null)
  const [ntfyTesting, setNtfyTesting] = useState(false)

  // Auth & MFA state
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwStatus, setPwStatus] = useState<string | null>(null)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaStatus, setMfaStatus] = useState<string | null>(null)
  const supabase = createAuthClient()

  // Load prefs via React Query
  useQuery<{ prefs: Pref[] }>({
    queryKey: ['prefs'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/prefs`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    // Apply prefs to local state on success
    meta: { onSettled: true },
    select: (data) => {
      // Side-effect in select: set state from prefs data
      if (data?.prefs) {
        for (const p of data.prefs) {
          if (p.key === 'ntfy_url' && p.value) setNtfyUrl(p.value)
          if (p.key === 'ntfy_topic' && p.value) setNtfyTopic(p.value)
        }
      }
      return data
    },
  })

  // Load user + MFA status (supabase auth - leave as-is)
  useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email ?? null)
        setHasPassword(user.identities?.some(i => i.provider === 'email') ?? false)
      }
      const { data: mfaData } = await supabase.auth.mfa.listFactors()
      if (mfaData?.totp && mfaData.totp.length > 0) {
        const verified = mfaData.totp.some(f => f.status === 'verified')
        setMfaEnabled(verified)
      }
      return { user, mfaData }
    },
  })

  const saveNtfyMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        fetch(`${API_BASE}/api/prefs`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'ntfy_url', value: ntfyUrl }),
        }),
        fetch(`${API_BASE}/api/prefs`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'ntfy_topic', value: ntfyTopic }),
        }),
      ])
    },
    onSuccess: () => setNtfyStatus('Saved.'),
    onError: () => setNtfyStatus('Error saving.'),
  })

  async function testNtfy() {
    setNtfyTesting(true)
    setNtfyStatus(null)
    try {
      const res = await fetch(`${API_BASE}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Mission Control',
          message: 'Test notification from Mission Control',
          priority: 3,
          tags: ['bell'],
        }),
      })
      const json = await res.json()
      setNtfyStatus(json.ok ? 'Notification sent!' : `Error: ${json.error}`)
    } catch (e: unknown) {
      setNtfyStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setNtfyTesting(false)
    }
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Settings size={20} style={{ color: 'var(--text-secondary)' }} />
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Settings</h1>
      </div>

      {/* Agent */}
      <div style={card}>
        <div style={label}>Agent</div>
        <div style={row}><span>Name</span><span style={val}>Bjorn</span></div>
        <div style={row}><span>Model</span><span style={val}>claude-sonnet-4-6</span></div>
        <div style={row}><span>Session key</span><span style={val}>agent:main:main</span></div>
        <div style={rowLast}><span>Emoji</span><span style={{ fontSize: '18px' }}>🦬</span></div>
      </div>

      {/* Gateway */}
      <div style={card}>
        <div style={label}>Gateway</div>
        <div style={row}><span>WebSocket</span><span style={val}>{import.meta.env.VITE_OPENCLAW_WS || 'not configured'}</span></div>
        <div style={row}><span>HTTP</span><span style={val}>{import.meta.env.VITE_OPENCLAW_HTTP || 'not configured'}</span></div>
        <div style={rowLast}><span>Auth</span><span style={val}>password</span></div>
      </div>

      {/* Mission Control */}
      <div style={card}>
        <div style={label}>Mission Control</div>
        <div style={row}><span>Host</span><span style={val}>{window.location.host}</span></div>
        <div style={row}><span>Poll interval</span><span style={val}>2s</span></div>
        <div style={rowLast}><span>Session file</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px' }}>~/.openclaw/agents/main/sessions/</span></div>
      </div>

      {/* User */}
      <div style={card}>
        <div style={label}>User</div>
        <div style={row}><span>Name</span><span style={val}>User</span></div>
        <div style={rowLast}><span>Avatar</span><span style={{ fontSize: '18px' }}>🦍</span></div>
      </div>

      {/* Notifications */}
      <div style={card}>
        <div style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bell size={12} />
          Notifications (ntfy.sh)
        </div>
        <div style={row}>
          <span>NTFY URL</span>
          <input
            style={inputStyle}
            value={ntfyUrl}
            onChange={e => setNtfyUrl(e.target.value)}
            placeholder="http://localhost:2586"
          />
        </div>
        <div style={row}>
          <span>Topic</span>
          <input
            style={inputStyle}
            value={ntfyTopic}
            onChange={e => setNtfyTopic(e.target.value)}
            placeholder="mission-control"
          />
        </div>
        <div style={{ ...rowLast, flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={btnSecondary} onClick={testNtfy} disabled={ntfyTesting}>
              {ntfyTesting ? 'Sending...' : 'Test'}
            </button>
            <button style={btnStyle} onClick={() => { setNtfyStatus(null); saveNtfyMutation.mutate() }} disabled={saveNtfyMutation.isPending}>
              {saveNtfyMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
          {ntfyStatus && (
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: ntfyStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
              {ntfyStatus}
            </span>
          )}
        </div>
      </div>

      {/* MFA required banner */}
      {setupMfaRequired && !mfaEnabled && (
        <div style={{
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid rgba(251, 191, 36, 0.25)',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#fbbf24',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeInUp 0.3s ease both',
        }}>
          <Shield size={16} />
          Two-factor authentication is required. Set up your authenticator app below to continue.
        </div>
      )}

      {/* Account & Security */}
      <div style={card}>
        <div style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Shield size={12} />
          Account &amp; Security
        </div>
        <div style={row}>
          <span>Email</span>
          <span style={val}>{userEmail ?? '—'}</span>
        </div>
        {hasPassword && (
          <div style={row}>
            <span>Password</span>
            {!changingPw ? (
              <button
                style={btnSecondary}
                onClick={() => { setChangingPw(true); setPwStatus(null) }}
              >
                Change
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                <input
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  style={{ ...inputStyle, width: '200px' }}
                />
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  style={{ ...inputStyle, width: '200px' }}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    style={btnSecondary}
                    onClick={() => { setChangingPw(false); setNewPw(''); setConfirmPw(''); setPwStatus(null) }}
                  >
                    Cancel
                  </button>
                  <button
                    style={newPw.length >= 8 && newPw === confirmPw ? btnStyle : { ...btnStyle, opacity: 0.4, cursor: 'not-allowed' }}
                    disabled={newPw.length < 8 || newPw !== confirmPw}
                    onClick={async () => {
                      setPwStatus(null)
                      const { error } = await supabase.auth.updateUser({ password: newPw })
                      if (error) {
                        setPwStatus(`Error: ${error.message}`)
                      } else {
                        setPwStatus('Password updated.')
                        setChangingPw(false)
                        setNewPw('')
                        setConfirmPw('')
                      }
                    }}
                  >
                    Save
                  </button>
                </div>
                {pwStatus && (
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: pwStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                    {pwStatus}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div style={row}>
          <span>Two-factor (TOTP)</span>
          <span style={{
            ...val,
            color: mfaEnabled ? 'var(--green)' : 'var(--text-muted)',
          }}>
            {mfaEnabled ? 'Enabled' : 'Not set up'}
          </span>
        </div>

        {/* TOTP enrollment */}
        {!mfaEnabled && !mfaEnrolling && (
          <div style={{ ...rowLast, flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            <button
              style={btnStyle}
              onClick={async () => {
                setMfaStatus(null)
                const { data, error } = await supabase.auth.mfa.enroll({
                  factorType: 'totp',
                  friendlyName: 'Mission Control',
                })
                if (error) {
                  setMfaStatus(`Error: ${error.message}`)
                  return
                }
                setMfaFactorId(data.id)
                setMfaQr(data.totp.qr_code)
                setMfaSecret(data.totp.secret)
                setMfaEnrolling(true)
              }}
            >
              Set up authenticator
            </button>
            {mfaStatus && (
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                {mfaStatus}
              </span>
            )}
          </div>
        )}

        {mfaEnrolling && (
          <div style={{ padding: '16px 0 4px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              Scan this QR code with your authenticator app (Google Authenticator, 1Password, etc.)
            </p>
            {mfaQr && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '16px',
                background: '#fff',
                borderRadius: '10px',
                width: 'fit-content',
              }}>
                <img src={mfaQr} alt="TOTP QR code" width={180} height={180} />
              </div>
            )}
            {mfaSecret && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Manual key: <span style={{ color: 'var(--text-secondary)', userSelect: 'all' }}>{mfaSecret}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                autoFocus
                style={{ ...inputStyle, width: '140px', textAlign: 'center', letterSpacing: '0.15em' }}
              />
              <button
                style={mfaCode.length === 6 ? btnStyle : { ...btnStyle, opacity: 0.4, cursor: 'not-allowed' }}
                disabled={mfaCode.length !== 6}
                onClick={async () => {
                  setMfaStatus(null)
                  if (!mfaFactorId) return

                  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
                    factorId: mfaFactorId,
                  })
                  if (challengeErr) {
                    setMfaStatus(`Error: ${challengeErr.message}`)
                    return
                  }

                  const { error: verifyErr } = await supabase.auth.mfa.verify({
                    factorId: mfaFactorId,
                    challengeId: challenge.id,
                    code: mfaCode,
                  })
                  if (verifyErr) {
                    setMfaStatus(`Error: ${verifyErr.message}`)
                    setMfaCode('')
                    return
                  }

                  setMfaEnabled(true)
                  setMfaEnrolling(false)
                  setMfaQr(null)
                  setMfaSecret(null)
                  setMfaCode('')
                  setMfaStatus(null)

                  // If forced here for MFA setup, redirect to dashboard
                  if (setupMfaRequired) {
                    window.location.href = '/'
                  }
                }}
              >
                Verify
              </button>
              <button
                style={btnSecondary}
                onClick={async () => {
                  if (mfaFactorId) {
                    await supabase.auth.mfa.unenroll({ factorId: mfaFactorId })
                  }
                  setMfaEnrolling(false)
                  setMfaQr(null)
                  setMfaSecret(null)
                  setMfaCode('')
                  setMfaFactorId(null)
                  setMfaStatus(null)
                }}
              >
                Cancel
              </button>
            </div>
            {mfaStatus && (
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                {mfaStatus}
              </span>
            )}
          </div>
        )}

        {mfaEnabled && !mfaEnrolling && (
          <div style={{ ...rowLast, flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            <button
              style={{ ...btnSecondary, color: 'var(--red)', borderColor: 'rgba(248, 113, 113, 0.3)' }}
              onClick={async () => {
                const { data } = await supabase.auth.mfa.listFactors()
                const totp = data?.totp?.find(f => f.status === 'verified')
                if (totp) {
                  await supabase.auth.mfa.unenroll({ factorId: totp.id })
                  setMfaEnabled(false)
                }
              }}
            >
              Remove authenticator
            </button>
          </div>
        )}
      </div>

      {/* Sign out */}
      <div style={{ marginTop: '8px', marginBottom: '24px' }}>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/login'
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 500,
            background: 'transparent',
            border: '1px solid rgba(248, 113, 113, 0.25)',
            borderRadius: '8px',
            color: 'var(--red)',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(248, 113, 113, 0.08)'
            e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.25)'
          }}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  )
}
