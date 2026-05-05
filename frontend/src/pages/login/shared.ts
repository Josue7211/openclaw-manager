// ── Auth view state machine ──
// Valid states: main, email, mfa, mfa-enroll, waiting, sync-unlock
// Transitions:
//   main       -> email (user clicks "sign in with email")
//   main       -> waiting (OAuth opened in browser)
//   main       -> mfa (OAuth callback requires MFA verify)
//   main       -> mfa-enroll (OAuth callback requires MFA enrollment)
//   email      -> main (user clicks back)
//   email      -> mfa (password login requires MFA verify)
//   email      -> mfa-enroll (password login requires MFA enrollment)
//   waiting    -> main (user cancels or error)
//   waiting    -> mfa (tauri poll exchange requires MFA verify)
//   waiting    -> mfa-enroll (tauri poll exchange requires MFA enrollment)
//   mfa        -> main (user clicks back / signs out)
//   mfa        -> sync-unlock (MFA passed, synced services need local key)
//   waiting    -> sync-unlock (OAuth completed on an existing synced account)
//   mfa-enroll -> main (not reachable directly, but reset via SHOW_MAIN)
//   sync-unlock -> main (user signs out)

export type MfaMethod = 'totp' | 'webauthn'

export type View = 'main' | 'email' | 'mfa' | 'mfa-enroll' | 'waiting' | 'sync-unlock'

export type ViewAction =
  | { type: 'SHOW_EMAIL' }
  | { type: 'SHOW_MAIN' }
  | { type: 'SHOW_WAITING' }
  | { type: 'SHOW_SYNC_UNLOCK' }
  | { type: 'SHOW_MFA'; factorId: string; availableMethods?: MfaMethod[] }
  | { type: 'SHOW_MFA_ENROLL'; factorId: string; qr: string; secret: string }

export interface ViewState {
  view: View
  mfaFactorId: string
  mfaQr: string | null
  mfaSecret: string | null
  /** MFA methods available for this user (e.g. ['totp'], ['webauthn'], or ['totp', 'webauthn']) */
  availableMethods: MfaMethod[]
}

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case 'SHOW_EMAIL':
      return { ...state, view: 'email' }
    case 'SHOW_MAIN':
      return { view: 'main', mfaFactorId: '', mfaQr: null, mfaSecret: null, availableMethods: [] }
    case 'SHOW_WAITING':
      return { ...state, view: 'waiting' }
    case 'SHOW_SYNC_UNLOCK':
      return { ...state, view: 'sync-unlock' }
    case 'SHOW_MFA':
      return { ...state, view: 'mfa', mfaFactorId: action.factorId, availableMethods: action.availableMethods ?? ['totp'] }
    case 'SHOW_MFA_ENROLL':
      return { ...state, view: 'mfa-enroll', mfaFactorId: action.factorId, mfaQr: action.qr, mfaSecret: action.secret }
    default:
      return state
  }
}

export const initialViewState: ViewState = {
  view: 'main',
  mfaFactorId: '',
  mfaQr: null,
  mfaSecret: null,
  availableMethods: [],
}

// ── Shared styles ──

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  fontSize: '13px',
  fontFamily: "'JetBrains Mono', monospace",
  background: 'var(--bg-white-03)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'all 0.2s var(--ease-spring)',
  boxSizing: 'border-box',
}

export const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px',
  fontSize: '13px',
  fontWeight: 600,
  background: 'var(--accent-solid)',
  color: 'var(--text-on-color)',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  transition: 'all 0.2s var(--ease-spring)',
}

export const disabledBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: 'var(--purple-a12)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
}

export const oauthBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px',
  fontSize: '13px',
  fontWeight: 500,
  background: 'var(--bg-white-04)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  transition: 'all 0.2s var(--ease-spring)',
}
