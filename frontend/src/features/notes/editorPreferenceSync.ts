import { api } from '@/lib/api'
import {
  DEFAULT_NOTES_EDITOR_PREFERENCES,
  normalizeNotesEditorPreferences,
  type NotesEditorPreferences,
} from '@/pages/notes/notesPreferences'

export type SyncSafeNotesEditorPreferences = Pick<
  NotesEditorPreferences,
  | 'markdownWidth'
  | 'markdownFontSize'
  | 'spellcheck'
  | 'defaultMode'
  | 'appearanceMode'
  | 'cssSnippetEnabled'
  | 'cssSnippet'
  | 'dailyNoteFolder'
  | 'dailyNoteTitleFormat'
  | 'dailyNoteTemplateId'
  | 'dailyNoteOpenExisting'
  | 'weeklyNoteFolder'
  | 'weeklyNoteTemplateId'
  | 'monthlyNoteFolder'
  | 'monthlyNoteTemplateId'
  | 'writingAssistProvider'
  | 'writingAssistTone'
  | 'writingAssistLength'
>

export interface SyncedNotesEditorPreferences {
  preferences: SyncSafeNotesEditorPreferences
  updatedAt: number
}

export const NOTES_EDITOR_PREFERENCES_SYNC_NOTE_ID = '.clawctrl/editor-preferences.md'

const LOCAL_VAULT_PREFIX = '/api/vault/local'
const EDITOR_PREFERENCES_MARKER_START = '<!-- clawctrl:editor-preferences:v1 -->'
const EDITOR_PREFERENCES_MARKER_END = '<!-- /clawctrl:editor-preferences:v1 -->'

export function syncSafeNotesEditorPreferences(
  preferences: Partial<NotesEditorPreferences> | null | undefined,
): SyncSafeNotesEditorPreferences {
  const normalized = normalizeNotesEditorPreferences(preferences)
  return {
    markdownWidth: normalized.markdownWidth,
    markdownFontSize: normalized.markdownFontSize,
    spellcheck: normalized.spellcheck,
    defaultMode: normalized.defaultMode,
    appearanceMode: normalized.appearanceMode,
    cssSnippetEnabled: normalized.cssSnippetEnabled,
    cssSnippet: normalized.cssSnippet,
    dailyNoteFolder: normalized.dailyNoteFolder,
    dailyNoteTitleFormat: normalized.dailyNoteTitleFormat,
    dailyNoteTemplateId: normalized.dailyNoteTemplateId,
    dailyNoteOpenExisting: normalized.dailyNoteOpenExisting,
    weeklyNoteFolder: normalized.weeklyNoteFolder,
    weeklyNoteTemplateId: normalized.weeklyNoteTemplateId,
    monthlyNoteFolder: normalized.monthlyNoteFolder,
    monthlyNoteTemplateId: normalized.monthlyNoteTemplateId,
    writingAssistProvider: normalized.writingAssistProvider,
    writingAssistTone: normalized.writingAssistTone,
    writingAssistLength: normalized.writingAssistLength,
  }
}

export const DEFAULT_SYNCED_NOTES_EDITOR_PREFERENCES: SyncedNotesEditorPreferences = {
  preferences: syncSafeNotesEditorPreferences(DEFAULT_NOTES_EDITOR_PREFERENCES),
  updatedAt: 0,
}

export function normalizeSyncedNotesEditorPreferences(value: unknown): SyncedNotesEditorPreferences {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const rawPreferences = record.preferences && typeof record.preferences === 'object'
    ? record.preferences as Partial<NotesEditorPreferences>
    : record as Partial<NotesEditorPreferences>
  const updatedAtValue = Number(record.updatedAt)
  return {
    preferences: syncSafeNotesEditorPreferences(rawPreferences),
    updatedAt: Number.isFinite(updatedAtValue) && updatedAtValue > 0 ? Math.floor(updatedAtValue) : 0,
  }
}

export function notesEditorPreferencesToSyncState(
  preferences: Partial<NotesEditorPreferences> | null | undefined,
  updatedAt: number,
): SyncedNotesEditorPreferences {
  return normalizeSyncedNotesEditorPreferences({
    preferences,
    updatedAt,
  })
}

export function applySyncedNotesEditorPreferences(
  base: NotesEditorPreferences,
  synced: SyncedNotesEditorPreferences,
): NotesEditorPreferences {
  const safe = normalizeSyncedNotesEditorPreferences(synced).preferences
  return normalizeNotesEditorPreferences({
    ...base,
    ...safe,
    remoteCollaborationEnabled: base.remoteCollaborationEnabled,
    remoteCollaborationBaseUrl: base.remoteCollaborationBaseUrl,
    remoteCollaborationPairingKey: base.remoteCollaborationPairingKey,
  })
}

export function mergeSyncedNotesEditorPreferences(
  synced: SyncedNotesEditorPreferences,
  local: SyncedNotesEditorPreferences,
): SyncedNotesEditorPreferences {
  const normalizedSynced = normalizeSyncedNotesEditorPreferences(synced)
  const normalizedLocal = normalizeSyncedNotesEditorPreferences(local)
  if (normalizedLocal.updatedAt === normalizedSynced.updatedAt) {
    const defaultPreferences = DEFAULT_SYNCED_NOTES_EDITOR_PREFERENCES.preferences
    const localIsDefault = JSON.stringify(normalizedLocal.preferences) === JSON.stringify(defaultPreferences)
    const syncedIsDefault = JSON.stringify(normalizedSynced.preferences) === JSON.stringify(defaultPreferences)
    if (localIsDefault && !syncedIsDefault) return normalizedSynced
  }
  return normalizedLocal.updatedAt >= normalizedSynced.updatedAt ? normalizedLocal : normalizedSynced
}

export function syncedNotesEditorPreferencesEqual(
  left: SyncedNotesEditorPreferences,
  right: SyncedNotesEditorPreferences,
): boolean {
  return JSON.stringify(normalizeSyncedNotesEditorPreferences(left)) === JSON.stringify(normalizeSyncedNotesEditorPreferences(right))
}

export function serializeNotesEditorPreferencesDocument(state: SyncedNotesEditorPreferences): string {
  const normalized = normalizeSyncedNotesEditorPreferences(state)
  return [
    '# clawctrl editor preferences',
    '',
    'This internal note stores synced Notes editor, assistant, appearance, and periodic-note preferences.',
    '',
    EDITOR_PREFERENCES_MARKER_START,
    '```json',
    JSON.stringify(normalized, null, 2),
    '```',
    EDITOR_PREFERENCES_MARKER_END,
    '',
  ].join('\n')
}

export function parseNotesEditorPreferencesDocument(content: string): SyncedNotesEditorPreferences {
  const start = content.indexOf(EDITOR_PREFERENCES_MARKER_START)
  const end = content.indexOf(EDITOR_PREFERENCES_MARKER_END)
  if (start === -1 || end === -1 || end <= start) return DEFAULT_SYNCED_NOTES_EDITOR_PREFERENCES
  const payload = content.slice(start + EDITOR_PREFERENCES_MARKER_START.length, end).trim()
  const json = payload.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return normalizeSyncedNotesEditorPreferences(JSON.parse(json))
  } catch {
    return DEFAULT_SYNCED_NOTES_EDITOR_PREFERENCES
  }
}

export async function loadSyncedNotesEditorPreferences(): Promise<SyncedNotesEditorPreferences> {
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_EDITOR_PREFERENCES_SYNC_NOTE_ID)}`)
    const payload = result?.data || result || {}
    return parseNotesEditorPreferencesDocument(String(payload.content || ''))
  } catch {
    return DEFAULT_SYNCED_NOTES_EDITOR_PREFERENCES
  }
}

export async function saveSyncedNotesEditorPreferences(state: SyncedNotesEditorPreferences): Promise<void> {
  let existing: Record<string, unknown> = {}
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_EDITOR_PREFERENCES_SYNC_NOTE_ID)}`)
    existing = result?.data || result || {}
  } catch {
    existing = {}
  }

  const now = Date.now()
  await api.put(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_EDITOR_PREFERENCES_SYNC_NOTE_ID)}`, {
    ...existing,
    _id: NOTES_EDITOR_PREFERENCES_SYNC_NOTE_ID,
    type: 'note',
    title: 'clawctrl editor preferences',
    content: serializeNotesEditorPreferencesDocument(state),
    folder: '.clawctrl',
    tags: [],
    links: [],
    aliases: [],
    properties: { clawctrl_internal: 'editor-preferences' },
    created_at: typeof existing.created_at === 'number' ? existing.created_at : now,
    updated_at: now,
  })
}
