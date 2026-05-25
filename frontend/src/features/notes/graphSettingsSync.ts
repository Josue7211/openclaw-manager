import { api } from '@/lib/api'
import type { GraphGroupMode } from '@/pages/notes/graphData'

export interface NotesGraphSettings {
  graphSearch: string
  focusMatches: boolean
  hideOrphans: boolean
  localGraph: boolean
  groupMode: GraphGroupMode
  updatedAt: number
}

export const NOTES_GRAPH_SETTINGS_SYNC_NOTE_ID = '.clawcontrol/graph-settings.md'

const LOCAL_VAULT_PREFIX = '/api/vault/local'
const GRAPH_SETTINGS_MARKER_START = '<!-- clawcontrol:graph-settings:v1 -->'
const GRAPH_SETTINGS_MARKER_END = '<!-- /clawcontrol:graph-settings:v1 -->'
const VALID_GROUP_MODES = new Set<GraphGroupMode>(['tag', 'folder', 'type', 'none'])

export const DEFAULT_NOTES_GRAPH_SETTINGS: NotesGraphSettings = {
  graphSearch: '',
  focusMatches: false,
  hideOrphans: false,
  localGraph: false,
  groupMode: 'tag',
  updatedAt: 0,
}

export function normalizeNotesGraphSettings(value: unknown): NotesGraphSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const rawGroupMode = record.groupMode
  const groupMode = typeof rawGroupMode === 'string' && VALID_GROUP_MODES.has(rawGroupMode as GraphGroupMode)
    ? rawGroupMode as GraphGroupMode
    : DEFAULT_NOTES_GRAPH_SETTINGS.groupMode
  const updatedAtValue = Number(record.updatedAt)
  return {
    graphSearch: typeof record.graphSearch === 'string' ? record.graphSearch.slice(0, 240) : '',
    focusMatches: record.focusMatches === true,
    hideOrphans: record.hideOrphans === true,
    localGraph: record.localGraph === true,
    groupMode,
    updatedAt: Number.isFinite(updatedAtValue) && updatedAtValue > 0 ? Math.floor(updatedAtValue) : 0,
  }
}

export function mergeNotesGraphSettings(synced: NotesGraphSettings, local: NotesGraphSettings): NotesGraphSettings {
  const normalizedSynced = normalizeNotesGraphSettings(synced)
  const normalizedLocal = normalizeNotesGraphSettings(local)
  return normalizedLocal.updatedAt >= normalizedSynced.updatedAt ? normalizedLocal : normalizedSynced
}

export function notesGraphSettingsEqual(left: NotesGraphSettings, right: NotesGraphSettings): boolean {
  return JSON.stringify(normalizeNotesGraphSettings(left)) === JSON.stringify(normalizeNotesGraphSettings(right))
}

export function serializeNotesGraphSettingsDocument(settings: NotesGraphSettings): string {
  const normalized = normalizeNotesGraphSettings(settings)
  return [
    '# ClawControl graph settings',
    '',
    'This internal note stores synced Notes graph filter and grouping settings.',
    '',
    GRAPH_SETTINGS_MARKER_START,
    '```json',
    JSON.stringify(normalized, null, 2),
    '```',
    GRAPH_SETTINGS_MARKER_END,
    '',
  ].join('\n')
}

export function parseNotesGraphSettingsDocument(content: string): NotesGraphSettings {
  const start = content.indexOf(GRAPH_SETTINGS_MARKER_START)
  const end = content.indexOf(GRAPH_SETTINGS_MARKER_END)
  if (start === -1 || end === -1 || end <= start) return DEFAULT_NOTES_GRAPH_SETTINGS
  const payload = content.slice(start + GRAPH_SETTINGS_MARKER_START.length, end).trim()
  const json = payload.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return normalizeNotesGraphSettings(JSON.parse(json))
  } catch {
    return DEFAULT_NOTES_GRAPH_SETTINGS
  }
}

export async function loadSyncedNotesGraphSettings(): Promise<NotesGraphSettings> {
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_GRAPH_SETTINGS_SYNC_NOTE_ID)}`)
    const payload = result?.data || result || {}
    return parseNotesGraphSettingsDocument(String(payload.content || ''))
  } catch {
    return DEFAULT_NOTES_GRAPH_SETTINGS
  }
}

export async function saveSyncedNotesGraphSettings(settings: NotesGraphSettings): Promise<void> {
  let existing: Record<string, unknown> = {}
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_GRAPH_SETTINGS_SYNC_NOTE_ID)}`)
    existing = result?.data || result || {}
  } catch {
    existing = {}
  }

  const now = Date.now()
  await api.put(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_GRAPH_SETTINGS_SYNC_NOTE_ID)}`, {
    ...existing,
    _id: NOTES_GRAPH_SETTINGS_SYNC_NOTE_ID,
    type: 'note',
    title: 'ClawControl graph settings',
    content: serializeNotesGraphSettingsDocument(settings),
    folder: '.clawcontrol',
    tags: [],
    links: [],
    aliases: [],
    properties: { clawcontrol_internal: 'graph-settings' },
    created_at: typeof existing.created_at === 'number' ? existing.created_at : now,
    updated_at: now,
  })
}
