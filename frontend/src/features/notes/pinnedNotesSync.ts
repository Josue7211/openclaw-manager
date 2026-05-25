import { api } from '@/lib/api'

export interface NotesPinnedNotesState {
  pinnedNoteIds: string[]
  updatedAt: number
}

export const NOTES_PINNED_NOTES_SYNC_NOTE_ID = '.clawcontrol/pinned-notes.md'

const LOCAL_VAULT_PREFIX = '/api/vault/local'
const PINNED_NOTES_MARKER_START = '<!-- clawcontrol:pinned-notes:v1 -->'
const PINNED_NOTES_MARKER_END = '<!-- /clawcontrol:pinned-notes:v1 -->'
const MAX_PINNED_NOTES = 64

export function normalizePinnedNoteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(id => id.length > 0 && !id.includes('\0'))
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, MAX_PINNED_NOTES)
}

export function normalizePinnedNotesState(value: unknown): NotesPinnedNotesState {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const updatedAtValue = Number(record.updatedAt)
  return {
    pinnedNoteIds: normalizePinnedNoteIds(record.pinnedNoteIds),
    updatedAt: Number.isFinite(updatedAtValue) && updatedAtValue > 0 ? Math.floor(updatedAtValue) : 0,
  }
}

export function mergePinnedNotesState(synced: NotesPinnedNotesState, local: NotesPinnedNotesState): NotesPinnedNotesState {
  const normalizedSynced = normalizePinnedNotesState(synced)
  const normalizedLocal = normalizePinnedNotesState(local)
  if (normalizedLocal.updatedAt > normalizedSynced.updatedAt) return normalizedLocal
  if (normalizedSynced.updatedAt > normalizedLocal.updatedAt) return normalizedSynced
  return {
    pinnedNoteIds: normalizePinnedNoteIds([...normalizedLocal.pinnedNoteIds, ...normalizedSynced.pinnedNoteIds]),
    updatedAt: normalizedLocal.updatedAt || normalizedSynced.updatedAt,
  }
}

export function pinnedNotesStateEqual(left: NotesPinnedNotesState, right: NotesPinnedNotesState): boolean {
  return JSON.stringify(normalizePinnedNotesState(left)) === JSON.stringify(normalizePinnedNotesState(right))
}

export function serializePinnedNotesDocument(state: NotesPinnedNotesState): string {
  const normalized = normalizePinnedNotesState(state)
  return [
    '# ClawControl pinned notes',
    '',
    'This internal note stores synced Notes pinned-note bookmarks.',
    '',
    PINNED_NOTES_MARKER_START,
    '```json',
    JSON.stringify(normalized, null, 2),
    '```',
    PINNED_NOTES_MARKER_END,
    '',
  ].join('\n')
}

export function parsePinnedNotesDocument(content: string): NotesPinnedNotesState {
  const start = content.indexOf(PINNED_NOTES_MARKER_START)
  const end = content.indexOf(PINNED_NOTES_MARKER_END)
  if (start === -1 || end === -1 || end <= start) return { pinnedNoteIds: [], updatedAt: 0 }
  const payload = content.slice(start + PINNED_NOTES_MARKER_START.length, end).trim()
  const json = payload.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return normalizePinnedNotesState(JSON.parse(json))
  } catch {
    return { pinnedNoteIds: [], updatedAt: 0 }
  }
}

export async function loadSyncedPinnedNotesState(): Promise<NotesPinnedNotesState> {
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_PINNED_NOTES_SYNC_NOTE_ID)}`)
    const payload = result?.data || result || {}
    return parsePinnedNotesDocument(String(payload.content || ''))
  } catch {
    return { pinnedNoteIds: [], updatedAt: 0 }
  }
}

export async function saveSyncedPinnedNotesState(state: NotesPinnedNotesState): Promise<void> {
  let existing: Record<string, unknown> = {}
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_PINNED_NOTES_SYNC_NOTE_ID)}`)
    existing = result?.data || result || {}
  } catch {
    existing = {}
  }

  const now = Date.now()
  await api.put(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_PINNED_NOTES_SYNC_NOTE_ID)}`, {
    ...existing,
    _id: NOTES_PINNED_NOTES_SYNC_NOTE_ID,
    type: 'note',
    title: 'ClawControl pinned notes',
    content: serializePinnedNotesDocument(state),
    folder: '.clawcontrol',
    tags: [],
    links: [],
    aliases: [],
    properties: { clawcontrol_internal: 'pinned-notes' },
    created_at: typeof existing.created_at === 'number' ? existing.created_at : now,
    updated_at: now,
  })
}
