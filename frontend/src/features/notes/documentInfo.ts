import { documentStats, type DocumentStats } from './documentStats'
import { inferDocumentPropertyValueKind, type DocumentPropertyValueKind } from './documentPropertyValues'
import type { VaultNote } from './types'

export interface DocumentInfo {
  id: string
  title: string
  folder: string
  fullPath: string
  type: VaultNote['type']
  tags: string[]
  aliases: string[]
  properties: Array<{ key: string; value: string; kind: DocumentPropertyValueKind }>
  createdAt: number
  updatedAt: number
  trashedAt: number | null
  stats: DocumentStats | null
}

export function buildDocumentInfo(note: VaultNote): DocumentInfo {
  return {
    id: note._id,
    title: note.title || 'Untitled',
    folder: note.folder || 'Vault root',
    fullPath: note.folder ? `${note.folder}/${note.title || 'Untitled'}` : note.title || note._id,
    type: note.type,
    tags: note.tags ?? [],
    aliases: note.aliases ?? [],
    properties: Object.entries(note.properties ?? {}).map(([key, value]) => ({
      key,
      value: formatDocumentInfoValue(value),
      kind: inferDocumentPropertyValueKind(value),
    })),
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    trashedAt: note.trashed_at ?? null,
    stats: note.type === 'note' ? documentStats(note.content) : null,
  }
}

export function formatDocumentInfoValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value
}
