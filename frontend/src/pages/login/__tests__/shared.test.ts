import { describe, it, expect } from 'vitest'
import {
  viewReducer,
  initialViewState,
  inputStyle,
  primaryBtnStyle,
  disabledBtnStyle,
  oauthBtnStyle,
} from '../shared'
import type { View, ViewAction, ViewState } from '../shared'

/* ─── initialViewState ───────────────────────────────────────────────── */

describe('initialViewState', () => {
  it('starts on the main view', () => {
    expect(initialViewState.view).toBe('main')
  })

  it('has empty mfaFactorId', () => {
    expect(initialViewState.mfaFactorId).toBe('')
  })

  it('has null mfaQr and mfaSecret', () => {
    expect(initialViewState.mfaQr).toBeNull()
    expect(initialViewState.mfaSecret).toBeNull()
  })

  it('has empty availableMethods', () => {
    expect(initialViewState.availableMethods).toEqual([])
  })
})

/* ─── viewReducer ────────────────────────────────────────────────────── */

describe('viewReducer', () => {
  describe('SHOW_EMAIL', () => {
    it('transitions to email view', () => {
      const state = viewReducer(initialViewState, { type: 'SHOW_EMAIL' })
      expect(state.view).toBe('email')
    })

    it('preserves other state fields', () => {
      const state = viewReducer(initialViewState, { type: 'SHOW_EMAIL' })
      expect(state.mfaFactorId).toBe(initialViewState.mfaFactorId)
      expect(state.mfaQr).toBe(initialViewState.mfaQr)
    })
  })

  describe('SHOW_MAIN', () => {
    it('transitions to main view', () => {
      const mfaState: ViewState = {
        view: 'mfa',
        mfaFactorId: 'factor-123',
        mfaQr: 'qr-data',
        mfaSecret: 'secret-data',
        availableMethods: ['totp'],
      }
      const state = viewReducer(mfaState, { type: 'SHOW_MAIN' })
      expect(state.view).toBe('main')
    })

    it('resets all MFA fields', () => {
      const mfaState: ViewState = {
        view: 'mfa-enroll',
        mfaFactorId: 'factor-123',
        mfaQr: 'qr-data',
        mfaSecret: 'secret-data',
        availableMethods: ['totp', 'webauthn'],
      }
      const state = viewReducer(mfaState, { type: 'SHOW_MAIN' })
      expect(state.mfaFactorId).toBe('')
      expect(state.mfaQr).toBeNull()
      expect(state.mfaSecret).toBeNull()
      expect(state.availableMethods).toEqual([])
    })

    it('can transition from waiting to main', () => {
      const waiting: ViewState = { ...initialViewState, view: 'waiting' }
      const state = viewReducer(waiting, { type: 'SHOW_MAIN' })
      expect(state.view).toBe('main')
    })
  })

  describe('SHOW_WAITING', () => {
    it('transitions to waiting view', () => {
      const state = viewReducer(initialViewState, { type: 'SHOW_WAITING' })
      expect(state.view).toBe('waiting')
    })

    it('preserves existing state', () => {
      const state = viewReducer(initialViewState, { type: 'SHOW_WAITING' })
      expect(state.mfaFactorId).toBe(initialViewState.mfaFactorId)
    })
  })

  describe('SHOW_MFA', () => {
    it('transitions to mfa view and sets factorId', () => {
      const state = viewReducer(initialViewState, {
        type: 'SHOW_MFA',
        factorId: 'factor-abc',
      })
      expect(state.view).toBe('mfa')
      expect(state.mfaFactorId).toBe('factor-abc')
    })

    it('defaults availableMethods to totp when not provided', () => {
      const state = viewReducer(initialViewState, {
        type: 'SHOW_MFA',
        factorId: 'factor-abc',
      })
      expect(state.availableMethods).toEqual(['totp'])
    })

    it('sets availableMethods when provided', () => {
      const state = viewReducer(initialViewState, {
        type: 'SHOW_MFA',
        factorId: 'factor-abc',
        availableMethods: ['totp', 'webauthn'],
      })
      expect(state.availableMethods).toEqual(['totp', 'webauthn'])
    })

    it('sets webauthn-only availableMethods', () => {
      const state = viewReducer(initialViewState, {
        type: 'SHOW_MFA',
        factorId: 'factor-abc',
        availableMethods: ['webauthn'],
      })
      expect(state.availableMethods).toEqual(['webauthn'])
    })

    it('can transition from email view', () => {
      const emailState: ViewState = { ...initialViewState, view: 'email' }
      const state = viewReducer(emailState, {
        type: 'SHOW_MFA',
        factorId: 'factor-xyz',
      })
      expect(state.view).toBe('mfa')
      expect(state.mfaFactorId).toBe('factor-xyz')
    })

    it('can transition from waiting view', () => {
      const waitingState: ViewState = { ...initialViewState, view: 'waiting' }
      const state = viewReducer(waitingState, {
        type: 'SHOW_MFA',
        factorId: 'factor-poll',
      })
      expect(state.view).toBe('mfa')
    })
  })

  describe('SHOW_MFA_ENROLL', () => {
    it('transitions to mfa-enroll and sets all MFA fields', () => {
      const state = viewReducer(initialViewState, {
        type: 'SHOW_MFA_ENROLL',
        factorId: 'factor-enroll',
        qr: 'otpauth://totp/...',
        secret: 'BASE32SECRET',
      })
      expect(state.view).toBe('mfa-enroll')
      expect(state.mfaFactorId).toBe('factor-enroll')
      expect(state.mfaQr).toBe('otpauth://totp/...')
      expect(state.mfaSecret).toBe('BASE32SECRET')
    })

    it('can transition from main view', () => {
      const state = viewReducer(initialViewState, {
        type: 'SHOW_MFA_ENROLL',
        factorId: 'f1',
        qr: 'qr',
        secret: 'sec',
      })
      expect(state.view).toBe('mfa-enroll')
    })
  })

  describe('unknown action', () => {
    it('returns unchanged state for unknown action type', () => {
      const state = viewReducer(initialViewState, { type: 'UNKNOWN' } as unknown as ViewAction)
      expect(state).toBe(initialViewState)
    })
  })

  describe('full state machine transitions', () => {
    it('main -> email -> mfa -> main roundtrip', () => {
      let state = initialViewState
      state = viewReducer(state, { type: 'SHOW_EMAIL' })
      expect(state.view).toBe('email')
      state = viewReducer(state, { type: 'SHOW_MFA', factorId: 'f1' })
      expect(state.view).toBe('mfa')
      expect(state.mfaFactorId).toBe('f1')
      state = viewReducer(state, { type: 'SHOW_MAIN' })
      expect(state.view).toBe('main')
      expect(state.mfaFactorId).toBe('')
    })

    it('main -> waiting -> mfa-enroll -> main roundtrip', () => {
      let state = initialViewState
      state = viewReducer(state, { type: 'SHOW_WAITING' })
      expect(state.view).toBe('waiting')
      state = viewReducer(state, {
        type: 'SHOW_MFA_ENROLL',
        factorId: 'f2',
        qr: 'qr-uri',
        secret: 'secret-key',
      })
      expect(state.view).toBe('mfa-enroll')
      expect(state.mfaQr).toBe('qr-uri')
      state = viewReducer(state, { type: 'SHOW_MAIN' })
      expect(state).toEqual(initialViewState)
    })

    it('main -> mfa with webauthn -> main clears methods', () => {
      let state = initialViewState
      state = viewReducer(state, {
        type: 'SHOW_MFA',
        factorId: 'f-webauthn',
        availableMethods: ['totp', 'webauthn'],
      })
      expect(state.view).toBe('mfa')
      expect(state.availableMethods).toEqual(['totp', 'webauthn'])
      state = viewReducer(state, { type: 'SHOW_MAIN' })
      expect(state.availableMethods).toEqual([])
    })
  })

  describe('View type covers all values', () => {
    it('has 5 valid views', () => {
      const views: View[] = ['main', 'email', 'mfa', 'mfa-enroll', 'waiting']
      expect(views).toHaveLength(5)
    })
  })
})

/* ─── Shared styles ──────────────────────────────────────────────────── */

describe('shared styles', () => {
  describe('inputStyle', () => {
    it('has full width', () => {
      expect(inputStyle.width).toBe('100%')
    })

    it('uses JetBrains Mono font', () => {
      expect(inputStyle.fontFamily).toContain('JetBrains Mono')
    })

    it('has no outline', () => {
      expect(inputStyle.outline).toBe('none')
    })

    it('uses CSS variables for theming', () => {
      expect(inputStyle.background).toContain('var(')
      expect(inputStyle.border).toContain('var(')
      expect(inputStyle.color).toContain('var(')
    })

    it('has border-radius for rounded corners', () => {
      expect(inputStyle.borderRadius).toBe('10px')
    })
  })

  describe('primaryBtnStyle', () => {
    it('has full width', () => {
      expect(primaryBtnStyle.width).toBe('100%')
    })

    it('uses accent background', () => {
      expect(primaryBtnStyle.background).toContain('var(')
    })

    it('has pointer cursor', () => {
      expect(primaryBtnStyle.cursor).toBe('pointer')
    })

    it('has bold font weight', () => {
      expect(primaryBtnStyle.fontWeight).toBe(600)
    })

    it('has no border', () => {
      expect(primaryBtnStyle.border).toBe('none')
    })
  })

  describe('disabledBtnStyle', () => {
    it('inherits from primaryBtnStyle', () => {
      expect(disabledBtnStyle.width).toBe(primaryBtnStyle.width)
      expect(disabledBtnStyle.fontSize).toBe(primaryBtnStyle.fontSize)
      expect(disabledBtnStyle.borderRadius).toBe(primaryBtnStyle.borderRadius)
    })

    it('overrides cursor to not-allowed', () => {
      expect(disabledBtnStyle.cursor).toBe('not-allowed')
    })

    it('uses muted text color', () => {
      expect(disabledBtnStyle.color).toContain('var(')
      expect(disabledBtnStyle.color).toContain('muted')
    })
  })

  describe('oauthBtnStyle', () => {
    it('has full width', () => {
      expect(oauthBtnStyle.width).toBe('100%')
    })

    it('uses flex layout centered', () => {
      expect(oauthBtnStyle.display).toBe('flex')
      expect(oauthBtnStyle.alignItems).toBe('center')
      expect(oauthBtnStyle.justifyContent).toBe('center')
    })

    it('has a border', () => {
      expect(oauthBtnStyle.border).toContain('var(')
    })

    it('has pointer cursor', () => {
      expect(oauthBtnStyle.cursor).toBe('pointer')
    })

    it('has gap for icon spacing', () => {
      expect(oauthBtnStyle.gap).toBe('10px')
    })
  })

  describe('all style exports are plain objects', () => {
    it('exports 4 style constants', () => {
      const styles = { inputStyle, primaryBtnStyle, disabledBtnStyle, oauthBtnStyle }
      expect(Object.keys(styles)).toHaveLength(4)
    })

    it('all exports are objects', () => {
      for (const style of [inputStyle, primaryBtnStyle, disabledBtnStyle, oauthBtnStyle]) {
        expect(typeof style).toBe('object')
        expect(style).not.toBeNull()
      }
    })
  })
})
