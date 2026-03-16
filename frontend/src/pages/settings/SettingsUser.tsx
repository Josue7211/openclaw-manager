import { useState } from 'react'
import { Shield, LogOut } from 'lucide-react'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { row, rowLast, val, inputStyle, btnStyle, btnSecondary, sectionLabel } from './shared'

interface SettingsUserProps {
  userName: string
  setUserName: (v: string) => void
  userAvatar: string
  setUserAvatar: (v: string) => void
  userEmail: string | null
  hasPassword: boolean
  mfaEnabled: boolean
  setMfaEnabled: (v: boolean) => void
  setupMfaRequired: boolean
}

export default function SettingsUser({
  userName, setUserName, userAvatar, setUserAvatar,
  userEmail, hasPassword, mfaEnabled, setMfaEnabled, setupMfaRequired,
}: SettingsUserProps) {
  const [editingName, setEditingName] = useState(false)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [nameInput, setNameInput] = useState(userName)
  const [avatarInput, setAvatarInput] = useState(userAvatar)
  const [nameSaved, setNameSaved] = useState(false)
  const [avatarSaved, setAvatarSaved] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwStatus, setPwStatus] = useState<string | null>(null)
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaStatus, setMfaStatus] = useState<string | null>(null)

  return (
    <div>
      <div style={sectionLabel}>User Profile</div>
      <div style={row}>
        <span>Name</span>
        {!editingName ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => { setNameInput(userName); setEditingName(true) }} style={{ ...val, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {userName} <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>edit</span>
            </button>
            {nameSaved && <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500, animation: 'fadeIn 0.15s ease' }}>Saved</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} autoFocus
              aria-label="Display name"
              style={{ ...inputStyle, width: '160px' }}
              onKeyDown={e => {
                if (e.key === 'Enter') { setUserName(nameInput); setEditingName(false); setNameSaved(true); setTimeout(() => setNameSaved(false), 1500) }
                if (e.key === 'Escape') setEditingName(false)
              }}
            />
            <button style={btnStyle} onClick={() => { setUserName(nameInput); setEditingName(false); setNameSaved(true); setTimeout(() => setNameSaved(false), 1500) }}>Save</button>
            <button style={btnSecondary} onClick={() => setEditingName(false)}>Cancel</button>
          </div>
        )}
      </div>
      <div style={row}>
        <span>Avatar</span>
        {!editingAvatar ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => { setAvatarInput(userAvatar); setEditingAvatar(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '24px' }}>
              {userAvatar} <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>edit</span>
            </button>
            {avatarSaved && <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500, animation: 'fadeIn 0.15s ease' }}>Saved</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input value={avatarInput} onChange={e => setAvatarInput(e.target.value)} autoFocus
              aria-label="Avatar emoji"
              style={{ ...inputStyle, width: '80px', fontSize: '20px', textAlign: 'center' }}
              onKeyDown={e => {
                if (e.key === 'Enter') { setUserAvatar(avatarInput); setEditingAvatar(false); setAvatarSaved(true); setTimeout(() => setAvatarSaved(false), 1500) }
                if (e.key === 'Escape') setEditingAvatar(false)
              }}
            />
            <button style={btnStyle} onClick={() => { setUserAvatar(avatarInput); setEditingAvatar(false); setAvatarSaved(true); setTimeout(() => setAvatarSaved(false), 1500) }}>Save</button>
            <button style={btnSecondary} onClick={() => setEditingAvatar(false)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Account & Security — merged from security section */}
      <div style={{ ...sectionLabel, marginTop: '24px' }}>Account & Security</div>
      {isDemoMode() && (<div style={{ background: 'var(--warning-a08)', border: '1px solid var(--warning-a25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: 'var(--warning)' }}>Account & security features are unavailable in demo mode.</div>)}
      {setupMfaRequired && !mfaEnabled && (
        <div style={{
          background: 'var(--warning-a08)', border: '1px solid var(--warning-a25)',
          borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px',
          color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <Shield size={16} />
          Two-factor authentication is required. Set up your authenticator below.
        </div>
      )}
      <div style={row}><span>Email</span><span style={val}>{userEmail ?? '\u2014'}</span></div>
      {hasPassword && (
        <div style={row}>
          <span>Password</span>
          {!changingPw ? (
            <button style={btnSecondary} onClick={() => { setChangingPw(true); setPwStatus(null) }}>Change</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" aria-label="New password" style={{ ...inputStyle, width: '200px' }} />
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm password" autoComplete="new-password" aria-label="Confirm password" style={{ ...inputStyle, width: '200px' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={btnSecondary} onClick={() => { setChangingPw(false); setNewPw(''); setConfirmPw(''); setPwStatus(null) }}>Cancel</button>
                <button
                  style={newPw.length >= 8 && newPw === confirmPw ? btnStyle : { ...btnStyle, opacity: 0.4, cursor: 'not-allowed' }}
                  disabled={newPw.length < 8 || newPw !== confirmPw}
                  onClick={async () => {
                    setPwStatus(null)
                    try {
                      await api.post('/api/auth/password', { new_password: newPw })
                      setPwStatus('Password updated.'); setChangingPw(false); setNewPw(''); setConfirmPw('')
                    } catch (err) {
                      setPwStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`)
                    }
                  }}
                >Save</button>
              </div>
              {pwStatus && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: pwStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{pwStatus}</span>}
            </div>
          )}
        </div>
      )}
      <div style={row}>
        <span>Two-factor (TOTP)</span>
        <span style={{ ...val, color: mfaEnabled ? 'var(--green)' : 'var(--text-muted)' }}>{mfaEnabled ? 'Enabled' : 'Not set up'}</span>
      </div>
      {!mfaEnabled && !mfaEnrolling && (
        <div style={{ padding: '8px 0' }}>
          <button style={btnStyle} onClick={async () => {
            setMfaStatus(null)
            try {
              const data = await api.post<{ id: string; qr_code: string; secret: string }>('/api/auth/mfa/enroll')
              setMfaFactorId(data.id); setMfaQr(data.qr_code); setMfaSecret(data.secret); setMfaEnrolling(true)
            } catch (err) {
              setMfaStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`)
            }
          }}>Set up authenticator</button>
          {mfaStatus && <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)', marginLeft: '10px' }}>{mfaStatus}</span>}
        </div>
      )}
      {mfaEnrolling && (
        <div style={{ padding: '16px 0 4px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Scan with your authenticator app:</p>
          {mfaQr && <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', background: '#fff', borderRadius: '10px', width: 'fit-content' }}><img src={mfaQr} alt="TOTP QR" width={180} height={180} /></div>}
          {mfaSecret && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Key: <span style={{ color: 'var(--text-secondary)', userSelect: 'all' }}>{mfaSecret}</span></div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" autoFocus aria-label="MFA verification code" style={{ ...inputStyle, width: '140px', textAlign: 'center', letterSpacing: '0.15em' }} />
            <button style={mfaCode.length === 6 ? btnStyle : { ...btnStyle, opacity: 0.4, cursor: 'not-allowed' }} disabled={mfaCode.length !== 6} onClick={async () => {
              setMfaStatus(null); if (!mfaFactorId) return
              try {
                const ch = await api.post<{ id: string }>('/api/auth/mfa/challenge', { factor_id: mfaFactorId })
                await api.post('/api/auth/mfa/verify', { factor_id: mfaFactorId, challenge_id: ch.id, code: mfaCode })
                setMfaEnabled(true); setMfaEnrolling(false); setMfaQr(null); setMfaSecret(null); setMfaCode(''); setMfaStatus(null)
                if (setupMfaRequired) window.location.href = '/'
              } catch (err) {
                setMfaStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`); setMfaCode('')
              }
            }}>Verify</button>
            <button style={btnSecondary} onClick={async () => {
              if (mfaFactorId) await api.post('/api/auth/mfa/unenroll', { factor_id: mfaFactorId }).catch(() => {})
              setMfaEnrolling(false); setMfaQr(null); setMfaSecret(null); setMfaCode(''); setMfaFactorId(null); setMfaStatus(null)
            }}>Cancel</button>
          </div>
          {mfaStatus && <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{mfaStatus}</span>}
        </div>
      )}
      {mfaEnabled && !mfaEnrolling && (
        <div style={{ padding: '12px 0 0' }}>
          <button style={{ ...btnSecondary, color: 'var(--red)', borderColor: 'rgba(248, 113, 113, 0.3)' }} onClick={async () => {
            try {
              const data = await api.get<{ factors?: Array<{ id: string; status: string; type: string }> }>('/api/auth/mfa/factors')
              const totp = data.factors?.find(f => f.type === 'totp' && f.status === 'verified')
              if (totp) {
                await api.post('/api/auth/mfa/unenroll', { factor_id: totp.id })
                setMfaEnabled(false)
              }
            } catch { /* silent */ }
          }}>Remove authenticator</button>
        </div>
      )}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={async () => { await api.post('/api/auth/logout').catch(() => {}); window.location.href = '/login' }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: 500,
            background: 'transparent', border: '1px solid rgba(248, 113, 113, 0.25)', borderRadius: '8px',
            color: 'var(--red)', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-a08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={14} />Sign out
        </button>
      </div>
    </div>
  )
}
