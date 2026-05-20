import type { VaultNote } from './types'

type SearchFilter = {
  key: string
  value: string
}

interface ParsedSearch {
  text: string
  filters: SearchFilter[]
}

const FILTER_KEYS = new Set([
  'after',
  'before',
  'content',
  'deleted',
  'folder',
  'kind',
  'path',
  'prop',
  'property',
  'tag',
  'title',
  'trash',
  'type',
  'updated-after',
  'updated-before',
])

export function parseNoteSearchQuery(query: string): ParsedSearch {
  const filters: SearchFilter[] = []
  const textParts: string[] = []
  const tokenRe = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(query)) !== null) {
    const token = (match[1] ?? match[2] ?? '').trim()
    const colon = token.indexOf(':')
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase()
      const value = token.slice(colon + 1).trim()
      if (FILTER_KEYS.has(key) && value) {
        filters.push({ key, value })
        continue
      }
    }
    if (token) textParts.push(token)
  }

  return { text: textParts.join(' ').trim(), filters }
}

export function noteSearchText(query: string): string {
  return parseNoteSearchQuery(query).text
}

export function matchesNoteSearch(note: VaultNote, query: string): boolean {
  const parsed = parseNoteSearchQuery(query)
  const text = parsed.text.toLowerCase()
  if (text && !matchesFreeText(note, text)) return false
  return parsed.filters.every(filter => matchesFilter(note, filter))
}

export function matchesNoteSearchFilters(note: VaultNote, query: string): boolean {
  const parsed = parseNoteSearchQuery(query)
  return parsed.filters.every(filter => matchesFilter(note, filter))
}

function matchesFreeText(note: VaultNote, text: string): boolean {
  const tagText = text.replace(/^#/, '')
  return (
    note.title.toLowerCase().includes(text) ||
    note.aliases?.some(alias => alias.toLowerCase().includes(text)) === true ||
    note.content.toLowerCase().includes(text) ||
    note.folder.toLowerCase().includes(text) ||
    note.tags.some(tag => tag.toLowerCase().includes(tagText)) ||
    propertyText(note).includes(text)
  )
}

function matchesFilter(note: VaultNote, filter: SearchFilter): boolean {
  const value = filter.value.toLowerCase().replace(/^#/, '')
  switch (filter.key) {
    case 'tag':
      return note.tags.some(tag => tag.toLowerCase().includes(value))
    case 'path':
    case 'folder':
      return note._id.toLowerCase().includes(value) || note.folder.toLowerCase().includes(value)
    case 'content':
      return note.content.toLowerCase().includes(value)
    case 'title':
      return (
        note.title.toLowerCase().includes(value) ||
        note.aliases?.some(alias => alias.toLowerCase().includes(value)) === true
      )
    case 'prop':
    case 'property':
      return matchesProperty(note, filter.value)
    case 'type':
    case 'kind':
      return note.type === value || (value === 'image' && note.type === 'attachment')
    case 'trash':
    case 'deleted':
      return matchesBoolean(isTrashed(note), value)
    case 'before':
    case 'updated-before':
      return matchesDate(note.updated_at, filter.value, (updated, target) => updated <= target)
    case 'after':
    case 'updated-after':
      return matchesDate(note.updated_at, filter.value, (updated, target) => updated >= target)
    default:
      return true
  }
}

function propertyText(note: VaultNote): string {
  return Object.entries(note.properties ?? {})
    .flatMap(([key, raw]) => [key, ...(Array.isArray(raw) ? raw : [raw])])
    .join(' ')
    .toLowerCase()
}

function matchesProperty(note: VaultNote, rawValue: string): boolean {
  const [rawKey, ...rawNeedleParts] = rawValue.split('=')
  const key = rawKey.trim().toLowerCase()
  const needle = rawNeedleParts.join('=').trim().toLowerCase()
  if (!key) return true

  for (const [propKey, raw] of Object.entries(note.properties ?? {})) {
    if (!propKey.toLowerCase().includes(key)) continue
    if (!needle) return true
    const values = Array.isArray(raw) ? raw : [raw]
    if (values.some(value => value.toLowerCase().includes(needle))) return true
  }
  return false
}

function isTrashed(note: VaultNote): boolean {
  return Boolean(note.trashed_at) || note.folder === 'Trash' || note.folder.startsWith('Trash/')
}

function matchesBoolean(actual: boolean, value: string): boolean {
  if (['1', 'true', 'yes', 'y'].includes(value)) return actual
  if (['0', 'false', 'no', 'n'].includes(value)) return !actual
  return actual
}

function matchesDate(updatedAt: number, value: string, compare: (updated: number, target: number) => boolean): boolean {
  const target = Date.parse(value)
  if (!Number.isFinite(target)) return true
  return compare(updatedAt, target)
}
