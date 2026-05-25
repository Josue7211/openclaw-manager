import { describe, expect, it } from 'vitest'
import {
  buildDailyNoteTitle,
  buildPeriodicNoteTitle,
  createNotesRemoteCollaborationPairingInvite,
  dailyNoteDateFromInput,
  dailyNoteDateInputValue,
  dailyNoteDateWithOffset,
  encodeNotesRemoteCollaborationPairingInvite,
  isNotesRemoteCollaborationBaseUrl,
  isNotesRemoteCollaborationPairingKey,
  markdownFontSizePx,
  markdownWidthPx,
  notesRemoteCollaborationSetupStatus,
  notesCssSnippetText,
  normalizeNotesEditorPreferences,
  periodicNoteFolder,
  periodicNoteTemplateId,
  parseNotesRemoteCollaborationPairingInvite,
} from '../notesPreferences'

describe('notesPreferences', () => {
  it('normalizes local editor preferences', () => {
    expect(normalizeNotesEditorPreferences({
      markdownWidth: 'wide',
      markdownFontSize: 'large',
      spellcheck: false,
      defaultMode: 'split',
      appearanceMode: 'light',
      cssSnippetEnabled: true,
      cssSnippet: '  .tiptap-note-body { font-size: 15px; } <style>.bad {}</style> ',
      dailyNoteFolder: ' /Journal/Daily// ',
      dailyNoteTitleFormat: 'YYYY-MM-DD dddd',
      dailyNoteTemplateId: 'vault:Templates/Daily.md',
      dailyNoteOpenExisting: false,
      weeklyNoteFolder: ' /Journal/Weekly// ',
      weeklyNoteTemplateId: 'vault:Templates/Weekly.md',
      monthlyNoteFolder: ' /Journal/Monthly// ',
      monthlyNoteTemplateId: 'vault:Templates/Monthly.md',
      writingAssistProvider: 'local',
      writingAssistTone: 'friendly',
      writingAssistLength: 'short',
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'https://vault.example/api/',
      remoteCollaborationPairingKey: '  pair-key-1234567890  ',
    })).toEqual({
      markdownWidth: 'wide',
      markdownFontSize: 'large',
      spellcheck: false,
      defaultMode: 'split',
      appearanceMode: 'light',
      cssSnippetEnabled: true,
      cssSnippet: '.tiptap-note-body { font-size: 15px; } .bad {}',
      dailyNoteFolder: 'Journal/Daily',
      dailyNoteTitleFormat: 'YYYY-MM-DD dddd',
      dailyNoteTemplateId: 'vault:Templates/Daily.md',
      dailyNoteOpenExisting: false,
      weeklyNoteFolder: 'Journal/Weekly',
      weeklyNoteTemplateId: 'vault:Templates/Weekly.md',
      monthlyNoteFolder: 'Journal/Monthly',
      monthlyNoteTemplateId: 'vault:Templates/Monthly.md',
      writingAssistProvider: 'local',
      writingAssistTone: 'friendly',
      writingAssistLength: 'short',
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'https://vault.example/api',
      remoteCollaborationPairingKey: 'pair-key-1234567890',
    })

    expect(normalizeNotesEditorPreferences({ markdownWidth: 'huge' as never })).toEqual(expect.objectContaining({
      markdownWidth: 'normal',
      markdownFontSize: 'normal',
      spellcheck: true,
      defaultMode: 'doc',
      appearanceMode: 'system',
      cssSnippetEnabled: false,
      cssSnippet: '',
      dailyNoteFolder: 'Daily',
      dailyNoteTitleFormat: '[Daily] YYYY-MM-DD',
      dailyNoteTemplateId: 'daily',
      dailyNoteOpenExisting: true,
      weeklyNoteFolder: 'Weekly',
      weeklyNoteTemplateId: 'weekly',
      monthlyNoteFolder: 'Monthly',
      monthlyNoteTemplateId: 'monthly',
      writingAssistProvider: 'local',
      writingAssistTone: 'neutral',
      writingAssistLength: 'standard',
      remoteCollaborationEnabled: false,
      remoteCollaborationBaseUrl: '',
      remoteCollaborationPairingKey: '',
    }))
  })

  it('scopes enabled CSS snippets to the notes vault surface', () => {
    expect(notesCssSnippetText({
      cssSnippetEnabled: true,
      cssSnippet: '.tiptap-note-body { font-size: 15px; }',
    })).toBe('@scope ([data-notes-vault-scope="true"]) {\n.tiptap-note-body { font-size: 15px; }\n}')
    expect(notesCssSnippetText({
      cssSnippetEnabled: false,
      cssSnippet: '.tiptap-note-body { font-size: 15px; }',
    })).toBe('')
    expect(notesCssSnippetText({
      cssSnippetEnabled: true,
      cssSnippet: '<style>.bad { color: red; }</style>',
    })).toBe('@scope ([data-notes-vault-scope="true"]) {\n.bad { color: red; }\n}')
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

  it('builds daily note titles from configurable date formats', () => {
    const now = new Date(2026, 4, 20, 9, 5, 7)

    expect(buildDailyNoteTitle({ dailyNoteTitleFormat: 'YYYY-MM-DD dddd' }, now)).toBe('2026-05-20 Wednesday')
    expect(buildDailyNoteTitle({ dailyNoteTitleFormat: '  ' }, now)).toBe('Daily 2026-05-20')
    expect(buildDailyNoteTitle({ dailyNoteTitleFormat: '[Journal] YYYY/MM/DD' }, now)).toBe('Journal 2026/05/20')
  })

  it('builds weekly and monthly periodic note titles', () => {
    const now = new Date(2026, 0, 1, 9, 5, 7)

    expect(buildPeriodicNoteTitle('weekly', { dailyNoteTitleFormat: '[Daily] YYYY-MM-DD' }, now)).toBe('Weekly 2026-W01')
    expect(buildPeriodicNoteTitle('monthly', { dailyNoteTitleFormat: '[Daily] YYYY-MM-DD' }, now)).toBe('Monthly 2026-01')
    expect(periodicNoteFolder('weekly', { dailyNoteFolder: 'Daily', weeklyNoteFolder: 'Journal/Weeks', monthlyNoteFolder: 'Monthly' })).toBe('Journal/Weeks')
    expect(periodicNoteFolder('monthly', { dailyNoteFolder: 'Daily', weeklyNoteFolder: 'Weekly', monthlyNoteFolder: 'Journal/Months' })).toBe('Journal/Months')
    expect(periodicNoteTemplateId('weekly', { dailyNoteTemplateId: 'daily', weeklyNoteTemplateId: 'vault:Weekly', monthlyNoteTemplateId: 'monthly' })).toBe('vault:Weekly')
    expect(periodicNoteTemplateId('monthly', { dailyNoteTemplateId: 'daily', weeklyNoteTemplateId: 'weekly', monthlyNoteTemplateId: 'vault:Monthly' })).toBe('vault:Monthly')
  })

  it('navigates daily note dates by local calendar day', () => {
    const now = new Date(2026, 0, 1, 9, 5, 7, 11)

    expect(buildDailyNoteTitle({ dailyNoteTitleFormat: '[Daily] YYYY-MM-DD' }, dailyNoteDateWithOffset(now, -1))).toBe('Daily 2025-12-31')
    expect(buildDailyNoteTitle({ dailyNoteTitleFormat: '[Daily] YYYY-MM-DD' }, dailyNoteDateWithOffset(now, 1))).toBe('Daily 2026-01-02')
    expect(dailyNoteDateWithOffset(now, 1).getHours()).toBe(9)
  })

  it('round-trips daily note date picker values as local dates', () => {
    const now = new Date(2026, 4, 20, 9, 5, 7, 11)

    expect(dailyNoteDateInputValue(now)).toBe('2026-05-20')
    expect(buildDailyNoteTitle(
      { dailyNoteTitleFormat: '[Daily] YYYY-MM-DD HH:mm' },
      dailyNoteDateFromInput('2026-02-03', now)!,
    )).toBe('Daily 2026-02-03 09:05')
    expect(dailyNoteDateFromInput('2026-02-31', now)).toBeNull()
    expect(dailyNoteDateFromInput('not-a-date', now)).toBeNull()
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
