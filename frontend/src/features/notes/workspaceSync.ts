import { api } from '@/lib/api'
import {
  normalizeVaultDataWorkspaceContext,
  type VaultDataWorkspaceContext,
} from './dataMode'

export type SyncedNotesWorkspaceViewMode = 'editor' | 'graph' | 'data' | 'canvas'

export interface SyncedNotesWorkspaceSnapshot {
  id?: string
  name?: string
  viewMode: SyncedNotesWorkspaceViewMode
  focusMode: boolean
  infoPanelOpen: boolean
  treeWidth: number
  sidePaneWidth?: number
  searchQuery?: string
  expandedFolders?: string[]
  referencesOpen?: boolean
  graphContext?: SyncedNotesGraphWorkspaceContext
  dataContext?: VaultDataWorkspaceContext
  selectedId: string | null
  sidePaneId?: string | null
  tabIds?: string[]
  savedAt: number
}

export interface SyncedNotesGraphWorkspaceContext {
  graphSearch: string
  focusMatches: boolean
  hideOrphans: boolean
  localGraph: boolean
  groupMode: 'tag' | 'folder' | 'type' | 'none'
}

export const NOTES_WORKSPACE_SYNC_NOTE_ID = '.clawctrl/workspaces.md'

const LOCAL_VAULT_PREFIX = '/api/vault/local'
const WORKSPACE_MARKER_START = '<!-- clawctrl:workspaces:v1 -->'
const WORKSPACE_MARKER_END = '<!-- /clawctrl:workspaces:v1 -->'
const VALID_VIEW_MODES = new Set<SyncedNotesWorkspaceViewMode>(['editor', 'graph', 'data', 'canvas'])
const VALID_GRAPH_GROUP_MODES = new Set<SyncedNotesGraphWorkspaceContext['groupMode']>(['tag', 'folder', 'type', 'none'])
const MAX_WORKSPACE_SNAPSHOTS = 24
const MAX_WORKSPACE_TABS = 8
const MAX_WORKSPACE_EXPANDED_FOLDERS = 32

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function cleanNoteId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && !trimmed.includes('\0') ? trimmed.slice(0, 260) : null
}

function normalizeGraphWorkspaceContext(value: unknown): SyncedNotesGraphWorkspaceContext | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const rawGroupMode = raw.groupMode
  const groupMode = typeof rawGroupMode === 'string' && VALID_GRAPH_GROUP_MODES.has(rawGroupMode as SyncedNotesGraphWorkspaceContext['groupMode'])
    ? rawGroupMode as SyncedNotesGraphWorkspaceContext['groupMode']
    : 'tag'
  return {
    graphSearch: cleanString(raw.graphSearch, 240) ?? '',
    focusMatches: raw.focusMatches === true,
    hideOrphans: raw.hideOrphans === true,
    localGraph: raw.localGraph === true,
    groupMode,
  }
}

function workspaceSnapshotKey(snapshot: SyncedNotesWorkspaceSnapshot): string {
  return snapshot.id || `${snapshot.viewMode}:${snapshot.savedAt}:${snapshot.selectedId ?? 'no-note'}`
}

function normalizeWorkspaceSnapshot(value: unknown): SyncedNotesWorkspaceSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const rawViewMode = raw.viewMode
  const viewMode = typeof rawViewMode === 'string' && VALID_VIEW_MODES.has(rawViewMode as SyncedNotesWorkspaceViewMode)
    ? rawViewMode as SyncedNotesWorkspaceViewMode
    : null
  if (!viewMode) return null

  const savedAtValue = Number(raw.savedAt)
  const savedAt = Number.isFinite(savedAtValue) && savedAtValue > 0 ? Math.floor(savedAtValue) : Date.now()
  const selectedId = cleanNoteId(raw.selectedId)
  const sidePaneId = cleanNoteId(raw.sidePaneId)
  const tabIds = Array.isArray(raw.tabIds)
    ? raw.tabIds
        .map(cleanNoteId)
        .filter((id): id is string => !!id)
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .slice(0, MAX_WORKSPACE_TABS)
    : []
  const expandedFolders = Array.isArray(raw.expandedFolders)
    ? raw.expandedFolders
        .map(cleanNoteId)
        .filter((path): path is string => !!path)
        .filter((path, index, paths) => paths.indexOf(path) === index)
        .slice(0, MAX_WORKSPACE_EXPANDED_FOLDERS)
    : []
  const id = cleanString(raw.id, 320) || `${viewMode}:${savedAt}:${selectedId ?? 'no-note'}`
  const name = cleanString(raw.name, 96)
  const searchQuery = cleanString(raw.searchQuery, 180)
  const graphContext = normalizeGraphWorkspaceContext(raw.graphContext)
  const dataContext = raw.dataContext && typeof raw.dataContext === 'object'
    ? normalizeVaultDataWorkspaceContext(raw.dataContext)
    : undefined
  const treeWidthValue = Number(raw.treeWidth)
  const treeWidth = Number.isFinite(treeWidthValue) ? Math.max(160, Math.min(360, Math.round(treeWidthValue))) : 220
  const sidePaneWidthValue = Number(raw.sidePaneWidth)
  const sidePaneWidth = Number.isFinite(sidePaneWidthValue)
    ? Math.max(300, Math.min(720, Math.round(sidePaneWidthValue)))
    : undefined

  return {
    id,
    name,
    viewMode,
    focusMode: raw.focusMode === true,
    infoPanelOpen: raw.infoPanelOpen === true,
    treeWidth,
    ...(sidePaneWidth ? { sidePaneWidth } : {}),
    ...(searchQuery ? { searchQuery } : {}),
    ...(expandedFolders.length ? { expandedFolders } : {}),
    referencesOpen: raw.referencesOpen === true,
    ...(graphContext ? { graphContext } : {}),
    ...(dataContext ? { dataContext } : {}),
    selectedId,
    sidePaneId,
    tabIds,
    savedAt,
  }
}

export function normalizeNotesWorkspaceSnapshots(snapshots: unknown): SyncedNotesWorkspaceSnapshot[] {
  if (!Array.isArray(snapshots)) return []
  const byKey = new Map<string, SyncedNotesWorkspaceSnapshot>()
  for (const rawSnapshot of snapshots) {
    const snapshot = normalizeWorkspaceSnapshot(rawSnapshot)
    if (!snapshot) continue
    const key = workspaceSnapshotKey(snapshot)
    const existing = byKey.get(key)
    if (!existing || snapshot.savedAt >= existing.savedAt) {
      byKey.set(key, snapshot)
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_WORKSPACE_SNAPSHOTS)
}

export function mergeNotesWorkspaceSnapshots(
  synced: SyncedNotesWorkspaceSnapshot[],
  local: SyncedNotesWorkspaceSnapshot[],
): SyncedNotesWorkspaceSnapshot[] {
  return normalizeNotesWorkspaceSnapshots([...synced, ...local])
}

export function notesWorkspaceSnapshotsEqual(
  left: SyncedNotesWorkspaceSnapshot[],
  right: SyncedNotesWorkspaceSnapshot[],
): boolean {
  return JSON.stringify(normalizeNotesWorkspaceSnapshots(left)) === JSON.stringify(normalizeNotesWorkspaceSnapshots(right))
}

export function serializeNotesWorkspaceDocument(snapshots: SyncedNotesWorkspaceSnapshot[]): string {
  const normalized = normalizeNotesWorkspaceSnapshots(snapshots)
  return [
    '# clawctrl workspaces',
    '',
    'This internal note stores synced Notes workspace layout presets.',
    '',
    WORKSPACE_MARKER_START,
    '```json',
    JSON.stringify(normalized, null, 2),
    '```',
    WORKSPACE_MARKER_END,
    '',
  ].join('\n')
}

export function parseNotesWorkspaceDocument(content: string): SyncedNotesWorkspaceSnapshot[] {
  const start = content.indexOf(WORKSPACE_MARKER_START)
  const end = content.indexOf(WORKSPACE_MARKER_END)
  if (start === -1 || end === -1 || end <= start) return []
  const payload = content.slice(start + WORKSPACE_MARKER_START.length, end).trim()
  const json = payload.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return normalizeNotesWorkspaceSnapshots(JSON.parse(json))
  } catch {
    return []
  }
}

export async function loadSyncedNotesWorkspaceSnapshots(): Promise<SyncedNotesWorkspaceSnapshot[]> {
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_WORKSPACE_SYNC_NOTE_ID)}`)
    const payload = result?.data || result || {}
    return parseNotesWorkspaceDocument(String(payload.content || ''))
  } catch {
    return []
  }
}

export async function saveSyncedNotesWorkspaceSnapshots(snapshots: SyncedNotesWorkspaceSnapshot[]): Promise<void> {
  let existing: Record<string, unknown> = {}
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_WORKSPACE_SYNC_NOTE_ID)}`)
    existing = result?.data || result || {}
  } catch {
    existing = {}
  }

  const now = Date.now()
  await api.put(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(NOTES_WORKSPACE_SYNC_NOTE_ID)}`, {
    ...existing,
    _id: NOTES_WORKSPACE_SYNC_NOTE_ID,
    type: 'note',
    title: 'clawctrl workspaces',
    content: serializeNotesWorkspaceDocument(snapshots),
    folder: '.clawctrl',
    tags: [],
    links: [],
    aliases: [],
    properties: { clawctrl_internal: 'workspaces' },
    created_at: typeof existing.created_at === 'number' ? existing.created_at : now,
    updated_at: now,
  })
}
