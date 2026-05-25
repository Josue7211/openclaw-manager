import { describe, expect, it } from 'vitest'
import {
  NOTES_EDITOR_PREFERENCES_SYNC_NOTE_ID,
  applySyncedNotesEditorPreferences,
  mergeSyncedNotesEditorPreferences,
  normalizeSyncedNotesEditorPreferences,
  notesEditorPreferencesToSyncState,
  parseNotesEditorPreferencesDocument,
  serializeNotesEditorPreferencesDocument,
  syncSafeNotesEditorPreferences,
} from '../editorPreferenceSync'
import {
  DEFAULT_NOTES_EDITOR_PREFERENCES,
  type NotesEditorPreferences,
} from '@/pages/notes/notesPreferences'

const localPreferences: NotesEditorPreferences = {
  ...DEFAULT_NOTES_EDITOR_PREFERENCES,
  markdownWidth: 'wide',
  markdownFontSize: 'large',
  spellcheck: false,
  defaultMode: 'split',
  appearanceMode: 'dark',
  cssSnippetEnabled: true,
  cssSnippet: '.cm-content { line-height: 1.6; }',
  dailyNoteFolder: 'Journal/Daily',
  dailyNoteTitleFormat: '[Journal] YYYY-MM-DD',
  dailyNoteTemplateId: 'journal-daily',
  dailyNoteOpenExisting: false,
  weeklyNoteFolder: 'Journal/Weekly',
  weeklyNoteTemplateId: 'weekly-review',
  monthlyNoteFolder: 'Journal/Monthly',
  monthlyNoteTemplateId: 'monthly-review',
  writingAssistProvider: 'local',
  writingAssistTone: 'direct',
  writingAssistLength: 'short',
  remoteCollaborationEnabled: true,
  remoteCollaborationBaseUrl: 'https://collab.example.test',
  remoteCollaborationPairingKey: 'secret-pairing-key-12345',
}

describe('editor preference synced vault document', () => {
  it('uses an internal vault note path for synced editor preferences', () => {
    expect(NOTES_EDITOR_PREFERENCES_SYNC_NOTE_ID).toBe('.clawcontrol/editor-preferences.md')
  })

  it('round-trips sync-safe preferences through the sync document content', () => {
    const state = notesEditorPreferencesToSyncState(localPreferences, 42)
    const content = serializeNotesEditorPreferencesDocument(state)

    expect(content).toContain('clawcontrol:editor-preferences:v1')
    expect(parseNotesEditorPreferencesDocument(content)).toEqual(state)
  })

  it('omits remote collaboration settings from synced preferences', () => {
    const safe = syncSafeNotesEditorPreferences(localPreferences)

    expect(safe).toEqual(expect.objectContaining({
      writingAssistProvider: 'local',
      writingAssistTone: 'direct',
      writingAssistLength: 'short',
    }))
    expect(safe).not.toHaveProperty('remoteCollaborationEnabled')
    expect(safe).not.toHaveProperty('remoteCollaborationBaseUrl')
    expect(safe).not.toHaveProperty('remoteCollaborationPairingKey')
    expect(JSON.stringify(notesEditorPreferencesToSyncState(localPreferences, 10))).not.toContain('secret-pairing-key')
  })

  it('applies synced safe preferences while preserving local remote collaboration settings', () => {
    const synced = notesEditorPreferencesToSyncState({
      ...DEFAULT_NOTES_EDITOR_PREFERENCES,
      markdownWidth: 'narrow',
      appearanceMode: 'light',
      remoteCollaborationEnabled: false,
      remoteCollaborationBaseUrl: 'https://should-not-sync.example.test',
      remoteCollaborationPairingKey: 'should-not-sync',
    }, 20)

    expect(applySyncedNotesEditorPreferences(localPreferences, synced)).toEqual(expect.objectContaining({
      markdownWidth: 'narrow',
      appearanceMode: 'light',
      remoteCollaborationEnabled: true,
      remoteCollaborationBaseUrl: 'https://collab.example.test',
      remoteCollaborationPairingKey: 'secret-pairing-key-12345',
    }))
  })

  it('merges by newest timestamp', () => {
    const synced = notesEditorPreferencesToSyncState({ ...DEFAULT_NOTES_EDITOR_PREFERENCES, markdownWidth: 'narrow' }, 10)
    const local = notesEditorPreferencesToSyncState({ ...DEFAULT_NOTES_EDITOR_PREFERENCES, markdownWidth: 'wide' }, 30)

    expect(mergeSyncedNotesEditorPreferences(synced, local)).toEqual(local)
  })

  it('keeps a synced non-default payload when both sides have no migration timestamp', () => {
    const synced = notesEditorPreferencesToSyncState({ ...DEFAULT_NOTES_EDITOR_PREFERENCES, markdownWidth: 'wide' }, 0)
    const local = notesEditorPreferencesToSyncState(DEFAULT_NOTES_EDITOR_PREFERENCES, 0)

    expect(mergeSyncedNotesEditorPreferences(synced, local)).toEqual(synced)
  })

  it('normalizes malformed synced content to defaults', () => {
    expect(parseNotesEditorPreferencesDocument('')).toEqual(expect.objectContaining({ updatedAt: 0 }))
    expect(parseNotesEditorPreferencesDocument('<!-- clawcontrol:editor-preferences:v1 -->\nnope\n<!-- /clawcontrol:editor-preferences:v1 -->')).toEqual(
      expect.objectContaining({ updatedAt: 0 }),
    )
  })

  it('normalizes legacy flat preference payloads', () => {
    const normalized = normalizeSyncedNotesEditorPreferences({
      markdownWidth: 'wide',
      defaultMode: 'read',
      remoteCollaborationPairingKey: 'do-not-sync',
      updatedAt: 12,
    })

    expect(normalized).toEqual(expect.objectContaining({
      preferences: expect.objectContaining({ markdownWidth: 'wide', defaultMode: 'read' }),
      updatedAt: 12,
    }))
    expect(normalized.preferences).not.toHaveProperty('remoteCollaborationPairingKey')
  })
})
