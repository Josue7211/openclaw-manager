import { api } from '@/lib/api'
import { normalizeSavedSearches, type NotesSavedSearch } from './savedSearches'

export const NOTES_SAVED_SEARCH_SYNC_NOTE_ID = '.clawcontrol/saved-searches.md'

const LOCAL_VAULT_PREFIX = '/api/vault/local'
const SAVED_SEARCH_MARKER_START = '<!-- clawcontrol:saved-searches:v1 -->'
const SAVED_SEARCH_MARKER_END = '<!-- /clawcontrol:saved-searches:v1 -->'

export function serializeNotesSavedSearchDocument(searches: NotesSavedSearch[]): string {
  const normalized = normalizeSavedSearches(searches)
  return [
    '# ClawControl saved searches',
    '',
    'This internal note stores synced Notes saved-search definitions.',
    '',
    SAVED_SEARCH_MARKER_START,
    '```json',
    JSON.stringify(normalized, null, 2),
    '```',
    SAVED_SEARCH_MARKER_END,
    '',
  ].join('\n')
}

export function parseNotesSavedSearchDocument(content: string): NotesSavedSearch[] {
  const start = content.indexOf(SAVED_SEARCH_MARKER_START)
  const end = content.indexOf(SAVED_SEARCH_MARKER_END)
  if (start === -1 || end === -1 || end <= start) return []
  const payload = content.slice(start + SAVED_SEARCH_MARKER_START.length, end).trim()
  const json = payload.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return normalizeSavedSearches(JSON.parse(json))
  } catch {
    return []
  }
}

export async function loadSyncedNotesSavedSearches(): Promise<NotesSavedSearch[]> {
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_SAVED_SEARCH_SYNC_NOTE_ID)}`)
    const payload = result?.data || result || {}
    return parseNotesSavedSearchDocument(String(payload.content || ''))
  } catch {
    return []
  }
}

export async function saveSyncedNotesSavedSearches(searches: NotesSavedSearch[]): Promise<void> {
  let existing: Record<string, unknown> = {}
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_SAVED_SEARCH_SYNC_NOTE_ID)}`)
    existing = result?.data || result || {}
  } catch {
    existing = {}
  }

  const now = Date.now()
  await api.put(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_SAVED_SEARCH_SYNC_NOTE_ID)}`, {
    ...existing,
    _id: NOTES_SAVED_SEARCH_SYNC_NOTE_ID,
    type: 'note',
    title: 'ClawControl saved searches',
    content: serializeNotesSavedSearchDocument(searches),
    folder: '.clawcontrol',
    tags: [],
    links: [],
    aliases: [],
    properties: { clawcontrol_internal: 'saved-searches' },
    created_at: typeof existing.created_at === 'number' ? existing.created_at : now,
    updated_at: now,
  })
}
