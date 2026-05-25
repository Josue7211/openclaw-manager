import type { VaultNote } from './types'

export interface NotesTagRow {
  tag: string
  label: string
  depth: number
  count: number
  directCount: number
}

export interface NotesTagIndexEntry extends NotesTagRow {
  notes: Array<{ id: string; title: string; folder: string; tags: string[] }>
}

export function buildTagRows(notes: Pick<VaultNote, 'type' | 'tags'>[], limit = 32): NotesTagRow[] {
  const directCounts = new Map<string, number>()
  for (const note of notes) {
    if (note.type !== 'note') continue
    for (const rawTag of note.tags) {
      const tag = normalizeTag(rawTag)
      if (!tag) continue
      directCounts.set(tag, (directCounts.get(tag) ?? 0) + 1)
      const parts = tag.split('/')
      for (let index = 1; index < parts.length; index += 1) {
        const parent = parts.slice(0, index).join('/')
        if (!directCounts.has(parent)) directCounts.set(parent, 0)
      }
    }
  }

  const totalCounts = new Map<string, number>()
  for (const [tag, directCount] of directCounts) {
    totalCounts.set(tag, (totalCounts.get(tag) ?? 0) + directCount)
    const parts = tag.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const parent = parts.slice(0, index).join('/')
      totalCounts.set(parent, (totalCounts.get(parent) ?? 0) + directCount)
    }
  }

  return [...totalCounts.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(tag => {
      const parts = tag.split('/')
      return {
        tag,
        label: parts[parts.length - 1] || tag,
        depth: Math.max(0, parts.length - 1),
        count: totalCounts.get(tag) ?? 0,
        directCount: directCounts.get(tag) ?? 0,
      }
    })
    .slice(0, limit)
}

export function buildTagIndex(notes: VaultNote[], query = '', limit = 128): NotesTagIndexEntry[] {
  const directNotesByTag = new Map<string, Map<string, { id: string; title: string; folder: string; tags: string[] }>>()
  const inheritedNotesByTag = new Map<string, Map<string, { id: string; title: string; folder: string; tags: string[] }>>()

  for (const note of notes) {
    if (note.type !== 'note') continue
    for (const rawTag of note.tags) {
      const tag = normalizeTag(rawTag)
      if (!tag) continue
      const noteEntry = { id: note._id, title: note.title || note._id, folder: note.folder || 'Vault root', tags: [tag] }
      upsertTagNote(directNotesByTag, tag, noteEntry)
      upsertTagNote(inheritedNotesByTag, tag, noteEntry)
      const parts = tag.split('/')
      for (let index = 1; index < parts.length; index += 1) {
        upsertTagNote(inheritedNotesByTag, parts.slice(0, index).join('/'), noteEntry)
      }
    }
  }

  const cleanQuery = query.trim().toLowerCase()
  return buildTagRows(notes, Number.MAX_SAFE_INTEGER)
    .map(row => ({
      ...row,
      notes: [...(inheritedNotesByTag.get(row.tag)?.values() ?? [])]
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 12),
      directCount: directNotesByTag.get(row.tag)?.size ?? 0,
    }))
    .filter(entry => {
      if (!cleanQuery) return true
      return [
        entry.tag,
        entry.label,
        ...entry.notes.flatMap(note => [note.title, note.folder, ...note.tags]),
      ].some(value => value.toLowerCase().includes(cleanQuery))
    })
    .slice(0, limit)
}

function upsertTagNote(
  target: Map<string, Map<string, { id: string; title: string; folder: string; tags: string[] }>>,
  tag: string,
  note: { id: string; title: string; folder: string; tags: string[] },
) {
  const notes = target.get(tag) ?? new Map<string, { id: string; title: string; folder: string; tags: string[] }>()
  const existing = notes.get(note.id)
  notes.set(note.id, existing ? { ...existing, tags: [...new Set([...existing.tags, ...note.tags])] } : note)
  target.set(tag, notes)
}

export function renameTagInContent(content: string, fromTag: string, toTag: string): string {
  const from = normalizeTag(fromTag)
  const to = normalizeTag(toTag)
  if (!from || !to || from === to) return content
  const inlinePattern = new RegExp(`(^|\\s)#${escapeRegExp(from)}(?=$|[\\s.,;:!?\\])}])`, 'g')
  return content
    .replace(inlinePattern, (_match, prefix: string) => `${prefix}#${to}`)
    .replace(
      /^(\s*-\s*)#?([A-Za-z0-9_/-]+)(\s*)$/gm,
      (match, prefix: string, tag: string, suffix: string) =>
        normalizeTag(tag) === from ? `${prefix}${to}${suffix}` : match,
    )
    .replace(
      /^(tags?:\s*\[[^\]]*\])$/gim,
      line => line.replace(new RegExp(`(^|[\\s,\\[])#?${escapeRegExp(from)}(?=\\s|,|\\])`, 'g'), `$1${to}`),
    )
}

export function removeTagFromContent(content: string, tag: string): string {
  const target = normalizeTag(tag)
  if (!target) return content
  const inlinePattern = new RegExp(`(^|\\s)#${escapeRegExp(target)}(?=$|[\\s.,;:!?\\])}])`, 'g')
  return content
    .replace(inlinePattern, (_match, prefix: string) => prefix)
    .replace(
      new RegExp(`^[^\\S\\r\\n]*-[^\\S\\r\\n]*#?${escapeRegExp(target)}[^\\S\\r\\n]*\\n?`, 'gim'),
      '',
    )
    .replace(
      /^(tags?:\s*\[)([^\]]*)(\].*)$/gim,
      (_match, prefix: string, body: string, suffix: string) => {
        const values = body
          .split(',')
          .map(value => value.trim())
          .filter(value => value && normalizeTag(value) !== target)
        return `${prefix}${values.join(', ')}${suffix}`
      },
    )
    .replace(
      /^(tags?:\s*)#?([A-Za-z0-9_/-]+)(\s*)$/gim,
      (match, prefix: string, value: string) => normalizeTag(value) === target ? prefix : match,
    )
}

export function applyTagToContent(content: string, tag: string): string {
  const target = normalizeTag(tag)
  if (!target || contentHasTag(content, target)) return content

  if (!content.startsWith('---\n')) {
    return ['---', 'tags:', `  - ${target}`, '---', '', content].join('\n')
  }

  const end = content.indexOf('\n---', 4)
  if (end === -1) return ['---', 'tags:', `  - ${target}`, '---', '', content].join('\n')

  const block = content.slice(4, end)
  const closeEnd = content.indexOf('\n', end + 1)
  const suffix = closeEnd === -1 ? '' : content.slice(closeEnd + 1)
  const lines = block.split(/\r?\n/)
  const tagLineIndex = lines.findIndex(line => /^tags?:\s*/i.test(line))

  if (tagLineIndex === -1) {
    lines.push('tags:', `  - ${target}`)
    return `---\n${lines.join('\n')}\n---\n${suffix}`
  }

  const line = lines[tagLineIndex]
  const match = line.match(/^(\s*tags?:\s*)(.*)$/i)
  if (!match) return content

  const raw = match[2].trim()
  if (!raw) {
    let insertAt = tagLineIndex + 1
    while (insertAt < lines.length && /^\s*-\s+/.test(lines[insertAt])) insertAt += 1
    lines.splice(insertAt, 0, `  - ${target}`)
  } else {
    const values = raw.replace(/^\[(.*)\]$/, '$1')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
    values.push(target)
    lines[tagLineIndex] = `${match[1]}[${values.join(', ')}]`
  }

  return `---\n${lines.join('\n')}\n---\n${suffix}`
}

export function affectedNotesForTagRename(notes: VaultNote[], fromTag: string): VaultNote[] {
  const from = normalizeTag(fromTag)
  if (!from) return []
  return notes.filter(note => note.type === 'note' && note.tags.some(tag => normalizeTag(tag) === from))
}

function contentHasTag(content: string, tag: string): boolean {
  const inlinePattern = new RegExp(`(^|\\s)#${escapeRegExp(tag)}(?=$|[\\s.,;:!?\\])}])`)
  if (inlinePattern.test(content)) return true

  if (!content.startsWith('---\n')) return false
  const end = content.indexOf('\n---', 4)
  if (end === -1) return false
  const lines = content.slice(4, end).split(/\r?\n/)
  let currentKey: string | null = null
  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (currentKey === 'tags' && listMatch && normalizeTag(listMatch[1]) === tag) return true
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pair) {
      if (!listMatch) currentKey = null
      continue
    }
    currentKey = pair[1].toLowerCase()
    if (currentKey !== 'tags') continue
    const values = pair[2].trim().replace(/^\[(.*)\]$/, '$1')
    if (values.split(',').map(value => normalizeTag(value)).includes(tag)) return true
  }
  return false
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').replace(/^\/+|\/+$/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
