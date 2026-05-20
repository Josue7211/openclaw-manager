import { describe, expect, it } from 'vitest'
import {
  createNotesRemoteCollaborationPairingInvite,
  encodeNotesRemoteCollaborationPairingInvite,
  isNotesRemoteCollaborationBaseUrl,
  isNotesRemoteCollaborationPairingKey,
  markdownFontSizePx,
  markdownWidthPx,
  notesRemoteCollaborationSetupStatus,
  normalizeNotesEditorPreferences,
  parseNotesRemoteCollaborationPairingInvite,
} from '../notesPreferences'

describe('notesPreferences', () => {
  it('normalizes local editor preferences', () => {
    expect(normalizeNotesEditorPreferences({
      markdownWidth: 'wide',
      markdownFontSize: 'large',
      spellcheck: false,
      defaultMode: 'split',
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'https://vault.example/api/',
      remoteCollaborationPairingKey: '  pair-key-1234567890  ',
    })).toEqual({
      markdownWidth: 'wide',
      markdownFontSize: 'large',
      spellcheck: false,
      defaultMode: 'split',
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'https://vault.example/api',
      remoteCollaborationPairingKey: 'pair-key-1234567890',
    })

    expect(normalizeNotesEditorPreferences({ markdownWidth: 'huge' as never })).toEqual(expect.objectContaining({
      markdownWidth: 'normal',
      markdownFontSize: 'normal',
      spellcheck: true,
      defaultMode: 'doc',
      remoteCollaborationEnabled: false,
      remoteCollaborationBaseUrl: '',
      remoteCollaborationPairingKey: '',
    }))
  })

  it('keeps remote collaboration explicit and validates provider URLs', () => {
    expect(normalizeNotesEditorPreferences({
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: '  http://127.0.0.1:3010/  ',
    })).toEqual(expect.objectContaining({
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'http://127.0.0.1:3010',
    }))
    expect(isNotesRemoteCollaborationBaseUrl('http://127.0.0.1:3010')).toBe(true)
    expect(isNotesRemoteCollaborationBaseUrl('https://vault.example')).toBe(true)
    expect(isNotesRemoteCollaborationBaseUrl('file:///tmp/vault')).toBe(false)
    expect(isNotesRemoteCollaborationBaseUrl('vault.example')).toBe(false)
  })

  it('requires explicit pairing material for remote collaboration', () => {
    expect(normalizeNotesEditorPreferences({
      remoteCollaborationPairingKey: ' pair key 1234567890 ',
    })).toEqual(expect.objectContaining({
      remoteCollaborationPairingKey: 'pairkey1234567890',
    }))
    expect(isNotesRemoteCollaborationPairingKey('pair-key-1234567890')).toBe(true)
    expect(isNotesRemoteCollaborationPairingKey('short')).toBe(false)
    expect(isNotesRemoteCollaborationPairingKey('unsafe key with spaces')).toBe(false)
  })

  it('classifies remote collaboration setup readiness', () => {
    expect(notesRemoteCollaborationSetupStatus({
      remoteCollaborationEnabled: false,
      remoteCollaborationBaseUrl: '',
      remoteCollaborationPairingKey: '',
    })).toEqual(expect.objectContaining({
      state: 'disabled',
      ready: false,
      detail: expect.stringContaining('Local-first editing is the default'),
    }))
    expect(notesRemoteCollaborationSetupStatus({
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: '',
      remoteCollaborationPairingKey: '',
    })).toEqual(expect.objectContaining({ state: 'missing-provider', ready: false }))
    expect(notesRemoteCollaborationSetupStatus({
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'file:///tmp/vault',
      remoteCollaborationPairingKey: 'pair-key-1234567890',
    })).toEqual(expect.objectContaining({ state: 'invalid-provider', ready: false }))
    expect(notesRemoteCollaborationSetupStatus({
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'https://vault.example',
      remoteCollaborationPairingKey: 'short',
    })).toEqual(expect.objectContaining({ state: 'invalid-key', ready: false }))
    expect(notesRemoteCollaborationSetupStatus({
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'https://vault.example',
      remoteCollaborationPairingKey: 'pair-key-1234567890',
    })).toEqual(expect.objectContaining({
      state: 'ready',
      ready: true,
      detail: expect.stringContaining('local saves stay primary'),
    }))
  })

  it('creates and verifies remote collaboration pairing invites', () => {
    const { invite, encoded } = createNotesRemoteCollaborationPairingInvite({
      providerUrl: 'https://vault.example/',
      pairingKey: 'pair-key-1234567890',
      deviceLabel: 'Laptop',
      now: 10,
    })

    expect(invite).toEqual(expect.objectContaining({
      protocol: 'claw-notes-collab-pairing',
      version: 1,
      providerUrl: 'https://vault.example',
      pairingKey: 'pair-key-1234567890',
      deviceLabel: 'Laptop',
      createdAt: 10,
      verifier: expect.stringMatching(/^[a-f0-9]{8}$/),
    }))
    expect(parseNotesRemoteCollaborationPairingInvite(encoded)).toEqual(invite)
    expect(() => parseNotesRemoteCollaborationPairingInvite(encodeNotesRemoteCollaborationPairingInvite({
      ...invite,
      pairingKey: 'pair-key-0000000000',
    }))).toThrow('verifier')
  })

  it('generates pairing invite keys when one is not already present', () => {
    const { invite } = createNotesRemoteCollaborationPairingInvite({
      providerUrl: 'http://127.0.0.1:3010',
      randomBytes: new Uint8Array(Array.from({ length: 24 }, (_value, index) => index + 1)),
      now: 10,
    })

    expect(invite.pairingKey).toMatch(/^[a-zA-Z0-9_-]{32}$/)
    expect(isNotesRemoteCollaborationPairingKey(invite.pairingKey)).toBe(true)
  })

  it('maps preferences to stable editor dimensions', () => {
    expect(markdownWidthPx('narrow')).toBe(560)
    expect(markdownWidthPx('wide')).toBe(860)
    expect(markdownFontSizePx('small')).toBe(13)
    expect(markdownFontSizePx('large')).toBe(16)
  })
})
