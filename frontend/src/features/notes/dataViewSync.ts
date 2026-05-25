import { api } from '@/lib/api'
import { normalizeVaultDataViewPresets, type VaultDataViewPreset } from './dataMode'

export const VAULT_DATA_VIEW_SYNC_NOTE_ID = '.clawcontrol/data-views.md'

const LOCAL_VAULT_PREFIX = '/api/vault/local'
const DATA_VIEW_MARKER_START = '<!-- clawcontrol:data-views:v1 -->'
const DATA_VIEW_MARKER_END = '<!-- /clawcontrol:data-views:v1 -->'

export function serializeVaultDataViewPresetDocument(presets: VaultDataViewPreset[]): string {
  const normalized = normalizeVaultDataViewPresets(presets)
  return [
    '# ClawControl data views',
    '',
    'This internal note stores synced Notes data-view definitions.',
    '',
    DATA_VIEW_MARKER_START,
    '```json',
    JSON.stringify(normalized, null, 2),
    '```',
    DATA_VIEW_MARKER_END,
    '',
  ].join('\n')
}

export function parseVaultDataViewPresetDocument(content: string): VaultDataViewPreset[] {
  const start = content.indexOf(DATA_VIEW_MARKER_START)
  const end = content.indexOf(DATA_VIEW_MARKER_END)
  if (start === -1 || end === -1 || end <= start) return []
  const payload = content.slice(start + DATA_VIEW_MARKER_START.length, end).trim()
  const json = payload.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return normalizeVaultDataViewPresets(JSON.parse(json))
  } catch {
    return []
  }
}

export async function loadSyncedVaultDataViewPresets(): Promise<VaultDataViewPreset[]> {
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(VAULT_DATA_VIEW_SYNC_NOTE_ID)}`)
    const payload = result?.data || result || {}
    return parseVaultDataViewPresetDocument(String(payload.content || ''))
  } catch {
    return []
  }
}

export async function saveSyncedVaultDataViewPresets(presets: VaultDataViewPreset[]): Promise<void> {
  let existing: Record<string, unknown> = {}
  try {
    const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(VAULT_DATA_VIEW_SYNC_NOTE_ID)}`)
    existing = result?.data || result || {}
  } catch {
    existing = {}
  }

  const now = Date.now()
  await api.put(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(VAULT_DATA_VIEW_SYNC_NOTE_ID)}`, {
    ...existing,
    _id: VAULT_DATA_VIEW_SYNC_NOTE_ID,
    type: 'note',
    title: 'ClawControl data views',
    content: serializeVaultDataViewPresetDocument(presets),
    folder: '.clawcontrol',
    tags: [],
    links: [],
    aliases: [],
    properties: { clawcontrol_internal: 'data-views' },
    created_at: typeof existing.created_at === 'number' ? existing.created_at : now,
    updated_at: now,
  })
}
