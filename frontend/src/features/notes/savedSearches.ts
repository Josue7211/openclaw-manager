export interface NotesSavedSearch {
  id: string
  label: string
  query: string
  createdAt: number
  updatedAt: number
}

export function normalizeSavedSearches(value: unknown): NotesSavedSearch[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const record = item as Partial<NotesSavedSearch>
      const query = typeof record.query === 'string' ? record.query.trim() : ''
      if (!query) return null
      const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : query
      const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : savedSearchId(query)
      if (seen.has(id)) return null
      seen.add(id)
      const createdAt = safeTimestamp(record.createdAt)
      const updatedAt = safeTimestamp(record.updatedAt) || createdAt
      return { id, label, query, createdAt, updatedAt }
    })
    .filter((item): item is NotesSavedSearch => item !== null)
    .slice(0, 24)
}

export function upsertSavedSearch(
  searches: NotesSavedSearch[],
  input: { label?: string; query: string; now?: number },
): NotesSavedSearch[] {
  const query = input.query.trim()
  if (!query) return normalizeSavedSearches(searches)
  const now = input.now ?? Date.now()
  const label = input.label?.trim() || query
  const id = savedSearchId(query)
  const existing = normalizeSavedSearches(searches).find(search => search.id === id)
  const next: NotesSavedSearch = {
    id,
    label,
    query,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  return [next, ...normalizeSavedSearches(searches).filter(search => search.id !== id)].slice(0, 24)
}

export function removeSavedSearch(searches: NotesSavedSearch[], id: string): NotesSavedSearch[] {
  return normalizeSavedSearches(searches).filter(search => search.id !== id)
}

export function mergeSavedSearches(synced: NotesSavedSearch[], local: NotesSavedSearch[]): NotesSavedSearch[] {
  const byId = new Map<string, NotesSavedSearch>()
  for (const search of [...normalizeSavedSearches(synced), ...normalizeSavedSearches(local)]) {
    const existing = byId.get(search.id)
    if (!existing || search.updatedAt >= existing.updatedAt) {
      byId.set(search.id, search)
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 24)
}

export function savedSearchesEqual(left: NotesSavedSearch[], right: NotesSavedSearch[]): boolean {
  return JSON.stringify(normalizeSavedSearches(left)) === JSON.stringify(normalizeSavedSearches(right))
}

function savedSearchId(query: string): string {
  return `search:${query.trim().toLowerCase()}`
}

function safeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now()
}
