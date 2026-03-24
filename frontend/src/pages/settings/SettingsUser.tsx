import { useState } from 'react'
import { Shield, SignOut } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { isWebAuthnSupported, registerWebAuthnKey } from '@/lib/webauthn'
import type { WebAuthnCreationOptions } from '@/lib/webauthn'
import { Button } from '@/components/ui/Button'
import { row, val, inputStyle, sectionLabel } from './shared'

interface WebAuthnFactor {
  id: string
  name: string
  created_at: string
}

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
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwStatus, setPwStatus] = useState<string | null>(null)
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaStatus, setMfaStatus] = useState<string | null>(null)

  // WebAuthn state
  const [webAuthnKeys, setWebAuthnKeys] = useState<WebAuthnFactor[]>([])
  const [webAuthnLoaded, setWebAuthnLoaded] = useState(false)
  const [webAuthnEnrolling, setWebAuthnEnrolling] = useState(false)
  const [webAuthnKeyName, setWebAuthnKeyName] = useState('')
  const [webAuthnStatus, setWebAuthnStatus] = useState<string | null>(null)
  const webAuthnSupported = isWebAuthnSupported()

  // Load WebAuthn keys on first render
  if (!webAuthnLoaded) {
    setWebAuthnLoaded(true)
    api.get<{ factors?: WebAuthnFactor[] }>('/api/auth/mfa/factors')
      .then(data => {
        const keys = (data.factors ?? []).filter((f: any) => f.type === 'webauthn' && f.status === 'verified')
        setWebAuthnKeys(keys as WebAuthnFactor[])
      })
      .catch(() => {})
  }

  async function handleWebAuthnEnroll() {
    setWebAuthnStatus(null)
    setWebAuthnEnrolling(true)

    try {
      // Step 1: Get creation options from the server
      const enrollData = await api.post<{
        factor_id: string
        creation_options: WebAuthnCreationOptions
      }>('/api/auth/mfa/enroll-webauthn', {
        name: webAuthnKeyName || 'Security Key',
      })

      // Step 2: Prompt the user to register their hardware key
      const attestation = await registerWebAuthnKey(enrollData.creation_options)

      // Step 3: Send the attestation back to the server for verification
      await api.post('/api/auth/mfa/verify', {
        factor_id: enrollData.factor_id,
        credential: attestation,
      })

      // Success — add the key to the list
      setWebAuthnKeys(prev => [...prev, {
        id: enrollData.factor_id,
        name: webAuthnKeyName || 'Security Key',
        created_at: new Date().toISOString(),
      }])
      setWebAuthnKeyName('')
      setWebAuthnEnrolling(false)
      setWebAuthnStatus('Hardware key registered successfully')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setWebAuthnStatus('Error: Registration was cancelled or timed out')
      } else {
        setWebAuthnStatus(`Error: ${err instanceof Error ? err.message : 'Failed to register key'}`)
      }
      setWebAuthnEnrolling(false)
    }
  }

  async function handleWebAuthnRemove(factorId: string) {
    try {
      await api.del(`/api/auth/mfa/unenroll/${factorId}`)
      setWebAuthnKeys(prev => prev.filter(k => k.id !== factorId))
      setWebAuthnStatus('Hardware key removed')
    } catch (err) {
      setWebAuthnStatus(`Error: ${err instanceof Error ? err.message : 'Failed to remove key'}`)
    }
  }

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
            {nameSaved && <span style={{ fontSize: '11px', color: 'var(--secondary)', fontWeight: 500, animation: 'fadeIn 0.15s ease' }}>Saved</span>}
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
            <Button variant="primary" onClick={() => { setUserName(nameInput); setEditingName(false); setNameSaved(true); setTimeout(() => setNameSaved(false), 1500) }} style={{ fontSize: '12px', padding: '8px 16px' }}>Save</Button>
            <Button variant="secondary" onClick={() => setEditingName(false)} style={{ fontSize: '12px', padding: '8px 16px' }}>Cancel</Button>
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
            {avatarSaved && <span style={{ fontSize: '11px', color: 'var(--secondary)', fontWeight: 500, animation: 'fadeIn 0.15s ease' }}>Saved</span>}
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
            <Button variant="primary" onClick={() => { setUserAvatar(avatarInput); setEditingAvatar(false); setAvatarSaved(true); setTimeout(() => setAvatarSaved(false), 1500) }} style={{ fontSize: '12px', padding: '8px 16px' }}>Save</Button>
            <Button variant="secondary" onClick={() => setEditingAvatar(false)} style={{ fontSize: '12px', padding: '8px 16px' }}>Cancel</Button>
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
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" autoComplete="current-password" aria-label="Current password" style={{ ...inputStyle, width: '200px' }} />
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" aria-label="New password" style={{ ...inputStyle, width: '200px' }} />
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm password" autoComplete="new-password" aria-label="Confirm password" style={{ ...inputStyle, width: '200px' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <Button variant="secondary" onClick={() => { setChangingPw(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwStatus(null) }} style={{ fontSize: '12px', padding: '8px 16px' }}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={currentPw.length === 0 || newPw.length < 8 || newPw !== confirmPw}
                  onClick={async () => {
                    setPwStatus(null)
                    try {
                      await api.post('/api/auth/password', { current_password: currentPw, new_password: newPw })
                      setPwStatus('Password updated.'); setChangingPw(false); setCurrentPw(''); setNewPw(''); setConfirmPw('')
                    } catch (err) {
                      setPwStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`)
                    }
                  }}
                  style={{ fontSize: '12px', padding: '8px 16px' }}
                >Save</Button>
              </div>
              {pwStatus && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: pwStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>{pwStatus}</span>}
            </div>
          )}
        </div>
      )}
      <div style={row}>
        <span>Two-factor (TOTP)</span>
        <span style={{ ...val, color: mfaEnabled ? 'var(--secondary)' : 'var(--text-muted)' }}>{mfaEnabled ? 'Enabled' : 'Not set up'}</span>
      </div>
      {!mfaEnabled && !mfaEnrolling && (
        <div style={{ padding: '8px 0' }}>
          <Button variant="primary" onClick={async () => {
            setMfaStatus(null)
            try {
              const data = await api.post<{ id: string; qr_code: string; secret: string }>('/api/auth/mfa/enroll')
              setMfaFactorId(data.id); setMfaQr(data.qr_code); setMfaSecret(data.secret); setMfaEnrolling(true)
            } catch (err) {
              setMfaStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`)
            }
          }} style={{ fontSize: '12px', padding: '8px 16px' }}>Set up authenticator</Button>
          {mfaStatus && <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)', marginLeft: '10px' }}>{mfaStatus}</span>}
        </div>
      )}
      {mfaEnrolling && (
        <div style={{ padding: '16px 0 4px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Scan with your authenticator app:</p>
          {mfaQr && <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', background: 'var(--text-on-color)', borderRadius: '10px', width: 'fit-content' }}><img src={mfaQr} alt="TOTP QR" width={180} height={180} /></div>}
          {mfaSecret && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Key: <span style={{ color: 'var(--text-secondary)', userSelect: 'all' }}>{mfaSecret}</span></div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" autoFocus aria-label="MFA verification code" style={{ ...inputStyle, width: '140px', textAlign: 'center', letterSpacing: '0.15em' }} />
            <Button variant="primary" disabled={mfaCode.length !== 6} onClick={async () => {
              setMfaStatus(null); if (!mfaFactorId) return
              try {
                const ch = await api.post<{ id: string }>('/api/auth/mfa/challenge', { factor_id: mfaFactorId })
                await api.post('/api/auth/mfa/verify', { factor_id: mfaFactorId, challenge_id: ch.id, code: mfaCode })
                setMfaEnabled(true); setMfaEnrolling(false); setMfaQr(null); setMfaSecret(null); setMfaCode(''); setMfaStatus(null)
                if (setupMfaRequired) window.location.href = '/'
              } catch (err) {
                setMfaStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`); setMfaCode('')
              }
            }} style={{ fontSize: '12px', padding: '8px 16px' }}>Verify</Button>
            <Button variant="secondary" onClick={async () => {
              if (mfaFactorId) await api.del(`/api/auth/mfa/unenroll/${mfaFactorId}`).catch(() => {})
              setMfaEnrolling(false); setMfaQr(null); setMfaSecret(null); setMfaCode(''); setMfaFactorId(null); setMfaStatus(null)
            }} style={{ fontSize: '12px', padding: '8px 16px' }}>Cancel</Button>
          </div>
          {mfaStatus && <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>{mfaStatus}</span>}
        </div>
      )}
      {mfaEnabled && !mfaEnrolling && (
        <div style={{ padding: '12px 0 0' }}>
          <Button variant="danger" onClick={async () => {
            try {
              const data = await api.get<{ factors?: Array<{ id: string; status: string; type: string }> }>('/api/auth/mfa/factors')
              const totp = data.factors?.find(f => f.type === 'totp' && f.status === 'verified')
              if (totp) {
                await api.del(`/api/auth/mfa/unenroll/${totp.id}`)
                setMfaEnabled(false)
              }
            } catch { /* silent */ }
          }} style={{ fontSize: '12px', padding: '8px 16px' }}>Remove authenticator</Button>
        </div>
      )}

      {/* ── Hardware Security Keys (WebAuthn/FIDO2) ──────────────── */}
      <div style={{ ...sectionLabel, marginTop: '24px' }}>Hardware Security Keys</div>
      {!webAuthnSupported && (
        <div style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          padding: '8px 0',
          lineHeight: 1.6,
        }}>
          WebAuthn is not supported in this browser. Use a modern browser with FIDO2 support to register hardware keys.
        </div>
      )}

      {webAuthnSupported && (
        <>
          <p style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            margin: '0 0 12px',
            lineHeight: 1.6,
          }}>
            Register a FIDO2 hardware security key (YubiKey, Titan, etc.) as an additional MFA method.
          </p>

          {/* Existing keys list */}
          {webAuthnKeys.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              {webAuthnKeys.map(key => (
                <div key={key.id} style={{
                  ...row,
                  padding: '10px 0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 10-4-4L2 18z" />
                      <circle cx="16.5" cy="7.5" r=".5" fill="var(--accent)" />
                    </svg>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{key.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Added {new Date(key.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => handleWebAuthnRemove(key.id)}
                    aria-label={`Remove hardware key ${key.name}`}
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {webAuthnKeys.length === 0 && !webAuthnEnrolling && (
            <div style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              padding: '8px 0 12px',
            }}>
              No hardware keys registered.
            </div>
          )}

          {/* Enrollment form */}
          {!webAuthnEnrolling ? (
            <div style={{ padding: '4px 0' }}>
              <Button
                variant="primary"
                onClick={() => { setWebAuthnEnrolling(true); setWebAuthnStatus(null) }}
                aria-label="Add hardware security key"
                style={{ fontSize: '12px', padding: '8px 16px' }}
              >
                Add hardware key
              </Button>
            </div>
          ) : (
            <div style={{
              padding: '16px',
              background: 'var(--bg-elevated)',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--accent-a10)',
                  border: '1px solid var(--accent-a20)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 10-4-4L2 18z" />
                    <circle cx="16.5" cy="7.5" r=".5" fill="var(--accent)" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Register a hardware key</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Give it a name, then tap your key when prompted
                  </div>
                </div>
              </div>

              <input
                type="text"
                value={webAuthnKeyName}
                onChange={e => setWebAuthnKeyName(e.target.value)}
                placeholder="Key name (e.g. YubiKey 5C)"
                autoFocus
                aria-label="Hardware key name"
                style={{ ...inputStyle, width: '100%' }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleWebAuthnEnroll()
                  if (e.key === 'Escape') { setWebAuthnEnrolling(false); setWebAuthnKeyName('') }
                }}
              />

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="primary"
                  onClick={handleWebAuthnEnroll}
                  aria-label="Register hardware security key"
                  style={{ fontSize: '12px', padding: '8px 16px' }}
                >
                  Register key
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setWebAuthnEnrolling(false); setWebAuthnKeyName(''); setWebAuthnStatus(null) }}
                  style={{ fontSize: '12px', padding: '8px 16px' }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Status messages */}
          {webAuthnStatus && (
            <div style={{
              marginTop: '8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: webAuthnStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)',
            }}>
              {webAuthnStatus}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <Button
          variant="danger"
          onClick={async () => { await api.post('/api/auth/logout').catch(() => {}); window.location.href = '/login' }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '10px 18px' }}
        >
          <SignOut size={14} />Sign out
        </Button>
      </div>
    </div>
  )
}
