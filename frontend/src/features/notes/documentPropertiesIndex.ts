import { formatDocumentInfoValue } from './documentInfo'
import { inferDocumentPropertyValueKind, type DocumentPropertyValueKind } from './documentPropertyValues'
import type { VaultNote } from './types'

export interface VaultPropertyIndexEntry {
  key: string
  kind: DocumentPropertyValueKind
  noteCount: number
  values: string[]
  notes: Array<{ id: string; title: string; folder: string; value: string }>
}

export function buildVaultPropertyIndex(notes: VaultNote[], query = ''): VaultPropertyIndexEntry[] {
  const normalizedQuery = query.trim().toLowerCase()
  const entries = new Map<string, {
    values: Set<string>
    notes: Map<string, { id: string; title: string; folder: string; value: string }>
    kindCounts: Map<DocumentPropertyValueKind, number>
  }>()

  for (const note of notes) {
    if (note.type !== 'note') continue
    for (const [key, rawValue] of Object.entries(note.properties ?? {})) {
      const value = formatDocumentInfoValue(rawValue)
      const kind = inferDocumentPropertyValueKind(rawValue)
      const entry = entries.get(key) ?? {
        values: new Set<string>(),
        notes: new Map<string, { id: string; title: string; folder: string; value: string }>(),
        kindCounts: new Map<DocumentPropertyValueKind, number>(),
      }
      if (value) entry.values.add(value)
      entry.notes.set(note._id, {
        id: note._id,
        title: note.title || note._id,
        folder: note.folder || 'Vault root',
        value,
      })
      entry.kindCounts.set(kind, (entry.kindCounts.get(kind) ?? 0) + 1)
      entries.set(key, entry)
    }
  }

  return [...entries.entries()]
    .map(([key, entry]) => ({
      key,
      kind: dominantPropertyKind(entry.kindCounts),
      noteCount: entry.notes.size,
      values: [...entry.values].sort((a, b) => a.localeCompare(b)).slice(0, 6),
      notes: [...entry.notes.values()].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 8),
    }))
    .filter(entry => {
      if (!normalizedQuery) return true
      return [
        entry.key,
        entry.kind,
        ...entry.values,
        ...entry.notes.flatMap(note => [note.title, note.folder, note.value]),
      ].some(value => value.toLowerCase().includes(normalizedQuery))
    })
    .sort((a, b) => b.noteCount - a.noteCount || a.key.localeCompare(b.key))
}

function dominantPropertyKind(kindCounts: Map<DocumentPropertyValueKind, number>): DocumentPropertyValueKind {
  let selected: DocumentPropertyValueKind = 'text'
  let selectedCount = -1
  for (const [kind, count] of kindCounts) {
    if (count > selectedCount) {
      selected = kind
      selectedCount = count
    }
  }
  return selected
}
